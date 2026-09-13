# Store profiles and seller fulfilment

This change keeps Axzen's navy `#102A43` and orange `#FF5733` and connects the
customer, seller and operations interfaces to persisted marketplace records.

## Customer store

Each store opens at `https://www.axzen.in/?seller=<seller-id>` with a cover,
round profile photo, bio, real follower/product counts, verified seller badge,
product grid, store search/category/sort, best sellers, reviews and About tabs.
Share uses the device share sheet, then clipboard, then a selectable link and
WhatsApp link. Best sellers count units in delivered orders. Empty data has an
explicit empty state; there are no seeded review cards or invented sales badges.

Reviews require a delivered order owned by the signed-in customer, containing
the selected product. One review per customer/product can be updated. Public
reviews expose only the customer's first name, never their ID/contact/order.
Published reviews determine product rating averages; seller replies are public.
Admin moderation hides/restores reviews with a mandatory reason and audit event.
A hidden review cannot be republished through the customer edit endpoint.

## Seller workspace

Verified seller login opens the workspace. Profile edits include logo, cover,
short bio, story, public contact details, Instagram link, dispatch note and return
information. These edits cannot change approval, KYC, bank or payment status.
Reviews has a reply form. Shipments and Returns contain real order cards.
Dashboard metrics are queried from seller products/orders, not sample numbers.

Fulfilment: placed/pending → accepted → packed → shipped → out for delivery →
delivered. Seller acceptance is explicit; GET requests no longer auto-accept.
Packing succeeds independently of shipping-provider configuration. The courier
request requires actual packed dimensions and weight. A persisted booking state
prevents concurrent/uncertain retries from creating duplicate shipments.
Cancelled orders cannot be revived; financial and delivery changes are atomic
where local database transactions can apply. Packing prevents ordinary customer
or seller cancellation; support coordinates post-packing exceptions/returns.

Seller screens show all order items, tracking, timeline, invoices, labels,
returns and refund follow-up. Polling preserves filters and keeps the last data
visible if refresh fails.

## Operations and superadmin

Customer storefront controls edit headline, intro, CTA, category order, featured
stores, section visibility, support email and existing festival offers. These
changes appear on the next customer refresh. Superadmin has all controls; other
staff see sections granted by their persisted permissions. Employee permission
changes remain superadmin-only.

Order operations may accept, pack or cancel with a reason. Delivery-permitted
staff record actual courier/AWB/tracking data and confirmed delivery progress,
with an audit reason and valid next-state checks. They cannot use these controls
to mark payments/refunds paid/processed. A courier delivery scan does not prove
COD collection; provider settlement reconciliation remains separate.

## Hosting and courier requirements

The previous production release fails startup when JWT_SECRET is missing/shorter
than 32 characters. This feature branch does not weaken that requirement and is
not a production recovery. The owner must save a valid production secret in
Vercel and redeploy before the live APIs can be exercised. Preview needs its own
secret. Do not promote a preview connected to production data for fixture tests.

Courier booking uses the existing Shiprocket order registration adapter. Each
seller must have its **own already registered pickup location** entered by admin
in Seller storefront controls (`shippingPickupLocation`). There is no fallback
to another seller's/global pickup address. Platform Shiprocket credentials and
webhook secret are needed. Courier/AWB assignment and pickup scheduling are
handled by operations in Shiprocket and recorded in Axzen; this change does not
claim those provider steps are automatic. Unknown booking outcomes require
provider reconciliation before any retry. No production courier, OTP, payment,
refund or device transaction has been submitted for testing.

## API additions

- `GET /api/sellers/public/:sellerId/profile`
- `GET /api/sellers/public/:sellerId/customer-reviews?page=1`
- `PUT /api/orders/:id/review` (customer's delivered order; body productId,
  integer rating 1–5, title, body)
- `PUT /api/sellers/me/store` (seller; storeDetails whitelist)
- `GET /api/sellers/me/reviews`
- `PUT /api/sellers/me/reviews/:id/reply`
- `GET /api/admin/reviews` and `PATCH /api/admin/reviews/:id`
- `PATCH /api/admin/orders/:id/shipment` (delivery permission, reason required)

Schema additions are optional/defaulted. Reviews have a unique customer/product
index. Transactions require MongoDB replica-set support, as checkout already did.

## Validation

Run `npm run check`, `npm test`, and `npm run mobile:prepare`. The suite includes
store/share/review DOM flows, admin permissions/content forms, fulfilment errors,
delivered-purchase ownership, review moderation and role-safe courier transitions.
The GitHub commerce workflow runs the database tests with a MongoDB replica set.
The Android preview APK built separately opens the live web storefront; it does
not need a new binary for these web UI changes.
