# Axzen Website Updates

This file tracks the main feature updates added to the Axzen e-commerce application so future work is easy to understand.

## June 19, 2026

### Customer App
- Added customer cart flow with `Add to cart` and `Proceed to checkout`.
- Added phone OTP login gate for checkout.
- Added delivery address update during checkout.
- Added seller-wise Cash on Delivery availability check.
- Added online payment fallback flow:
  - Uses Razorpay checkout when credentials are configured.
  - Uses mock/test paid transaction when Razorpay credentials are missing.
- Prevented online unpaid orders from being placed.
- COD orders are allowed only when seller has COD enabled.
- Customer order creates seller order automatically after successful COD/online flow.
- Customer logo and favicon updates were added earlier.

### Seller Registration
- Added strict seller registration page and route.
- Added OTP-first seller registration flow.
- Added seller KYC, pickup, bank, PAN/GST/Aadhaar fields.
- Added file validation and safe upload handling.
- Seller registrations stay pending until admin approval.
- Repeated seller registration now shows controlled status instead of duplicate error.
- Seller login is blocked from product panel until approval and KYC approval.

### Seller Portal
- Redesigned seller portal with a modern admin-style UI.
- Added seller product workspace with:
  - Product search.
  - Add product form.
  - Category dropdown with `Other`.
  - Product image upload.
  - Cloudinary image storage.
  - Product cards similar to customer product display.
- Added Cloudinary support so seller product images are visible to admin and customers after approval.
- Added seller payment settings for COD and online payment enable/disable.
- Added seller order notification sound when new orders arrive.
- Simplified seller default page:
  - Seller login opens Orders page first.
  - Sidebar hidden in normal seller mode.
  - Top menu bar with Axzen logo, Orders title, customer site, and profile button.
- Added owner mode:
  - `Login as owner` opens OTP verification.
  - After OTP, full Seller Workspace opens with left sidebar.
  - Owner mode restores Dashboard, Products, Orders, Shipments, Payments, Inventory, Returns, Employees, Profile, Support.
- Removed sidebar intro text such as `Seller dashboard`, `Seller Workspace`, and description text.
- Improved seller orders page responsiveness for desktop monitors, tablets, and phones.

### Seller Orders & Logistics
- Built professional Seller Orders page.
- Added seller-only order access.
- Added order tabs:
  - New
  - Accepted
  - Packed
  - Shipped
  - Delivered
  - Cancelled
  - Returned
- Added search and filters:
  - Order ID/customer/product search.
  - Date filter.
  - Payment status filter.
  - Order status filter.
- Added table columns:
  - Order ID
  - Date
  - Customer
  - Product
  - Qty
  - Payment Status
  - Order Status
  - Shipment Status
  - Actions
- Hid seller-facing amount/payment totals and payout values from the seller orders table.
- Seller can see payment status only.
- Added order details drawer with:
  - Customer details.
  - Product details.
  - Payment method/status.
  - Shipment details.
  - Tracking link.
  - Cancel reason.
  - Return reason.
  - Refund schedule.
  - Order timeline.
- Added order actions:
  - Accept.
  - Cancel with reason.
  - Pack Order.
  - Track Shipment/Pickup.
  - View delivery/return details.
- `Pack Order` now changes shipment status to `Waiting for pickup agent`.
- Orders move to `Shipped` only after shipment status update from Shiprocket-style sync/webhook.
- COD delivered orders update payment status to paid.
- Returned orders support return reason and refund schedule.
- Online returned orders are scheduled for refund within one day.

### Backend Order APIs
- Added seller order APIs:
  - `GET /api/seller/orders`
  - `POST /api/seller/orders/:id/accept`
  - `POST /api/seller/orders/:id/reject`
  - `POST /api/seller/orders/:id/pack`
  - `POST /api/seller/orders/:id/pack-and-ship`
  - `POST /api/seller/orders/:id/sync-shipment`
- Added Shiprocket status webhook:
  - `POST /api/orders/shiprocket/status`
- Added order fields:
  - AWB number.
  - Courier name.
  - Tracking URL.
  - Shipment status.
  - Timeline.
  - Cancel reason.
  - Return reason.
  - Refund status.
  - Refund due date.
- Added mock Shiprocket shipment support when real Shiprocket credentials are not configured.

### Admin Panel
- Improved admin UI and role access.
- Fixed admin role access issues for reports/employees and other sections.
- Added Employee panel with roles:
  - Super Admin
  - Operations Manager
  - Seller Executive
  - Product Executive
  - Order Executive
  - Support Executive
  - Finance Executive
  - Shipping Executive
- Added employee list and edit option for Super Admin.
- Added admin seller management improvements:
  - Pending sellers.
  - Seller details drawer.
  - Seller profile details.
  - Sales/earnings/order readiness summaries.
  - Seller licenses/documents section.
- Added customer detail drawer and invoice preview drawer behavior.

### Reports & Analytics
- Built professional Admin Reports page layout.
- Added report types:
  - Sales
  - Sellers
  - Products
  - Payments
  - Shipments
  - Returns
  - Customers
- Added summary cards, filters, charts, tables, detail drawer, empty/loading states, and exports.
- Added role-based report access:
  - Super Admin/Admin can access reports.
  - Finance can access payment reports.
  - Support cannot access reports.
- Added finance/payment/commission reporting calculations.

### Payments & Commission
- Added order commission calculation system.
- Commission calculates only on product total, not delivery charge.
- Supports percentage and fixed commission.
- Added seller payout calculation.
- Added delivery charge handling separately.
- Added payment status and payout status fields.
- Added admin payment/commission report page and payout status update logic.
- Added refund adjustment logic for cancelled/returned orders.

### Invoices & Labels
- Added printable invoices for customer/admin.
- Seller does not see customer invoice.
- Seller sees order payout/shipment workflow instead.
- Added delivery label printing support.
- Invoice includes Axzen logo and order/customer/seller details.

### Branding & UI
- Added favicon using bag icon.
- Updated customer page logo.
- Added admin sidebar logo updates.
- Improved modern Apple-style UI across pages.
- Improved layouts for desktop monitors, tablets, and phones.
- Removed extra/duplicate branding text in several seller/admin/customer areas.

## Notes For Future Work
- Configure real Razorpay credentials in environment for production payments:
  - `RAZORPAY_KEY_ID`
  - `RAZORPAY_KEY_SECRET`
- Configure real Shiprocket credentials when shipment integration is ready:
  - `SHIPROCKET_EMAIL`
  - `SHIPROCKET_PASSWORD`
  - Optional `SHIPROCKET_TOKEN`
  - Optional `SHIPROCKET_PICKUP_LOCATION`
- Current fallback behavior supports mock/test payment and mock/test shipment so the application workflow can be tested end-to-end.
