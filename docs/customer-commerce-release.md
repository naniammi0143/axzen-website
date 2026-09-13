# Customer storefront and commerce release

This branch replaces the customer storefront while retaining Axzen navy `#102A43`, orange `#FF5733`, the existing logo and Inter font. Seller and administration portals retain their existing entry points.

## Customer journey

Home → category/search/filter → product → cart grouped by store → sign-in → delivery address → payment review → order details/tracking.

- Desktop has a searchable header, category navigation and four-column product grid. Small screens use two-column cards, safe-area spacing and Home / Shop / Stores / Cart / Account navigation.
- Product cards use catalog prices, available stock and actual review counts. Unreviewed products say “New”; fractional stars use the actual average. Known seeded demo-seller products are excluded from the public catalog.
- Each store has its own checkout. Buying one product or checking out one store retains unrelated cart items. Unavailable products remain visible in the cart with an explanation.
- Wishlist supports guests and signed-in accounts. Profile and up to ten delivery addresses are stored per authenticated customer. OTP remains Firebase phone authentication.
- Offer collections are populated from administrator-configured festival offers. Product and checkout discounts share the same calculation. Category names are deduplicated without modifying seller data.
- Failed requests show retry states. API responses are not cached, and HTML/scripts revalidate to reduce stale customer pages.

## API contract for web and Android

Send `Authorization: Bearer <customer JWT>` on private requests. Never send an admin/seller JWT to the customer client. All money values below are integer paise.

| Request                            | Purpose / input                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/customer/catalog`        | Approved, active seller products and payment settings                                                                         |
| `POST /api/auth/phone-login`       | `{role:"customer", firebaseToken}` from verified Firebase phone sign-in                                                       |
| `GET /api/customer/me`             | Current profile and saved addresses                                                                                           |
| `PUT /api/customer/me`             | `name` and/or `addresses`; server validates and scopes to the authenticated user                                              |
| `GET`, `POST /api/cart`            | Read/replace items using `productId` and integer `quantity` from 1–10                                                         |
| `GET`, `POST /api/wishlist`        | Read/replace product IDs                                                                                                      |
| `POST /api/orders/quote`           | `{items:[{productId,quantity}], paymentMethod:"cod" or "razorpay"}`; returns authoritative quote                              |
| `POST /api/orders/razorpay/order`  | Same items, full `shippingAddress`, `expectedTotalPaise`; creates immutable checkout snapshot                                 |
| `POST /api/customer/orders`        | COD: items, address, method, UUID `idempotencyKey`, expected total. Online: method and the three Razorpay verification fields |
| `GET /api/orders/payment-reviews`  | Customer-owned captured payments that require reconciliation                                                                  |
| `POST /api/orders/:orderId/cancel` | Cancel before packing/shipping; idempotent stock restoration                                                                  |
| `GET /api/orders/:orderId/invoice` | Owner-authorized invoice HTML                                                                                                 |

Address keys: `fullName`, `phone`, `address`, `city`, `state`, `pincode`; saved addresses optionally have `label` (Home/Work/Other).

Razorpay fields: `razorpayOrderId`, `razorpayPaymentId`, `razorpaySignature`. The server verifies the provider payment's captured status, INR currency, exact amount, checkout ownership and signature. Items/address from a payment confirmation cannot replace the stored checkout snapshot. Repeated confirmation returns the existing order.

The server controls delivery fees (`DELIVERY_CHARGE_PAISE`, default 4000), discounts and commissions. COD does not incur the online payment fee. Mixed-store requests are rejected; checkout one store at a time. Stock, order, payment, delivery, settlement and purchased-cart removal are in one MongoDB transaction.

## Native Android integration status

No ecommerce Android project, application ID, signing configuration or APK was present in the accessible ecommerce repository. The separate Axzen POS/canteen application is a different product. No APK was built, installed or device-tested in this change.

`npm run mobile:prepare` produces `mobile-www/` containing only customer public web assets. Integrate it as the **existing** native application's web directory; do not invent a replacement application ID or signing key. Optional Capacitor App lifecycle hooks handle resume, back and Axzen product/store links when the host application exposes that plugin. Native bundled pages use the production HTTPS customer API; regular web/preview pages use same-origin API requests.

Before an Android release, connect the existing project's native Firebase phone-auth implementation to this customer session flow, verify Firebase app signing fingerprints and authorized domains, and use the project's supported Razorpay Android integration. The current web OTP/Razorpay dialogs must not be assumed to work inside every WebView. Validate Android back navigation, deep links, session expiry, payment return/retry, offline recovery and invoice opening on devices. Asset preparation is **not** an APK build.

## Operational changes and release gates

1. Use MongoDB Atlas or another replica set; standalone MongoDB cannot run the checkout/cancellation transactions. Run the integration suite before merging. New unique sparse Order indexes (`checkoutKey`, `razorpayPaymentId`) and CheckoutSession's unique `providerOrderId` index must be built successfully before accepting payments. Preserve existing indexes; do not run `syncIndexes()` at request/startup time.
2. Production requires an explicitly configured JWT signing secret of at least 32 characters. Keep existing staff provisioning: phone login can no longer create an administrator by requesting an admin role. Blocked users' old tokens stop working. Only superadmin can manage staff access.
3. Set real Razorpay credentials and validate using the provider's test environment before enabling live payments. Mock payments are rejected. A captured payment followed by a stock/write failure enters `needs_review`, visible in customer Orders and the admin payment report. Finance must reconcile with Razorpay before fulfillment/refund. Automatic payment-webhook reconciliation and provider refund execution are not implemented here; do not announce a refund as completed without provider confirmation.
4. Cancellation restores stock once before shipment. Online cancellations request a refund; they do not fabricate a completed refund. Payouts require a delivered, paid order with no pending refund.
5. Configure Shiprocket credentials and `SHIPROCKET_WEBHOOK_SECRET`. Missing credentials fail explicitly. Shipment registration includes **all** order items and customer delivery charges; a shipment ID is not an AWB. Packing leaves the order packed until courier events confirm dispatch. Registered shipment IDs are retained for retries. Courier assignment/pickup and each seller's registered pickup location must be verified in Shiprocket before release. A timeout or ambiguous booking response requires provider reconciliation before retrying, to avoid duplicate bookings. There is no complete automatic seller pickup-onboarding/AWB/pickup orchestration in this branch.
6. New seller KYC files are stored in private MongoDB GridFS and downloaded only via authorized admin routes. Files previously saved in temporary server storage may require re-upload; they cannot be recovered from nonexistent local files. Include GridFS in database backup/retention procedures.
7. Production no longer runs demo seeding/index resets on every cold start. Demo seeding is available only outside production with `SEED_DEMO=true`.
8. Review Vercel preview at `/` and `/preview.html` (320, 390, 430, 768 px) before publishing. `/seller` and `/admin` retain their portals. Recheck existing Android versions: legacy clients that send mock payment/client-calculated delivery fields or COD without a request ID need the updated contract before switching the backend.

## Verification in the editing environment

- 21 money, request-validation, public-file protection and customer DOM interaction tests passed.
- Customer DOM tests exercise real application code with an isolated fixture API: search, category normalization, no invented reviews, fractional stars, HTML escaping, stock limits, store-grouped cart, wishlist, network retry and sign-in/checkout transitions.
- The MongoDB integration suite was attempted, but the MongoDB process exits with code 100 (`open: Operation not permitted`) in the editing environment before tests run. This is an unverified gate, not a passing suite.
- A GitHub Actions workflow is prepared for syntax checks, the full test suite with a disposable replica set, and mobile asset preparation. The results above describe local verification; consult the pull request for subsequent CI and preview results. A branch push does not publish changes to the live website.
- Real OTP, provider payments/refunds, Shiprocket pickup/delivery and an Android APK are not validated by fixture tests.
