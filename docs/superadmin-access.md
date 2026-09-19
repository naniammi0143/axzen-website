# First company owner

Admin portal: https://admin.axzen.in/admin.html

The Password tab accepts a provisioned username or staff mobile number. Mobile
OTP remains available for existing staff with registered phones. No universal
password or credentials are shipped in source code, the website or the APK.

## Provision the first superadmin

1. Run `node scripts/generate-superadmin-setup.cjs /absolute/private/path/owner-setup.json`
   outside the repository. It generates username `axzen.owner`, a random temporary
   password and an expiring setup value. Keep this file private; do not commit it.
2. In the Vercel project, add a **Production** secret environment variable named
   `AXZEN_SUPERADMIN_SETUP`. Paste the file's `environmentValue` string as its
   value (the JSON object itself, without surrounding string quotes).
3. Save and redeploy the production application so it receives the variable.
4. The next production API start creates the active superadmin and its
   full-permission staff profile in one database transaction. Open the admin
   portal's Password tab and sign in with the generated username and temporary
   password within 72 hours of generation.
5. Choose a new private password of 14–128 characters. The initial 10-minute
   session can only change the password; company controls are inaccessible until
   this completes. The old session is invalidated on password change.
6. Remove the setup environment variable and redeploy after activation. Securely
   delete the temporary setup file; keep only the new password in your password
   manager.

The portal includes Sellers (store approval and creation), Products, Orders,
Payments, Customers, Customer storefront, Employees, Reports and Audit Logs.
The superadmin has full permissions. Other staff retain their assigned access.

## Safety and recovery

- Bootstrap is disabled without valid, unexpired private server configuration.
- Bootstrap refuses to run if any superadmin exists or its permanent consumed
  marker exists. Replaying configuration or redeploying cannot reset an owner.
- Five failed password attempts lock the account for 15 minutes; the login
  endpoints also enforce a request rate limit. Blocked accounts cannot sign in.
- Passwords are hashed with scrypt; hashes and password attempts are not exposed
  in session responses. Password changes invalidate earlier account sessions.
- This setup is not an existing-account password reset mechanism. If an owner
  already exists, use its credentials or registered phone OTP. Recovery without
  either requires an authorized database operator after ownership verification.
- Production account activation is complete only after the private environment
  value is configured and the first login succeeds. A deployed login form alone
  does not create a production account.
