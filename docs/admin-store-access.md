# Admin-created stores and seller sign-in

Admin or superadmin with Sellers permission: open Sellers → Add store. Enter the store name, owner name and mobile. Category, email and pickup details are optional. Choose Mobile OTP only or Mobile OTP + password. Initial passwords must be 10–128 characters. The form never returns or stores passwords in the browser after successful creation.

New stores remain inactive and pending KYC/approval. Creation does not accept agreements for the seller or activate payments/payouts. Existing review/Approve controls activate a reviewed store. Duplicate seller phones are rejected without replacing an existing account. Creation of the User, Seller and audit event is transactional.

Seller sign-in supports phone + password and Firebase mobile OTP. Existing registration passwords continue to work and are upgraded to the new salted scrypt format on successful password login. Five wrong passwords lock password access for 15 minutes across server instances; OTP remains available. Staff/admin authentication remains phone OTP only.

Seller Profile → Store login password changes the password using the current password, or a Firebase OTP authentication less than ten minutes old. Forgot password redirects to OTP login. Saving a password invalidates older application sessions. For an admin-created pending store, complete registration/KYC using the same owner phone before approval.

The Axzen logo is outlined vector artwork in assets/brand, navy #102A43 with a red #EF3340 dot. Website headers, footer, seller/admin portals, favicon, customer APK launcher/splash, invoices and labels use it. Seller-owned store logos are unchanged. Native APK version: 0.3-beta. Native customer OTP still requires Firebase Android configuration.
