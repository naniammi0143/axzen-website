# Axzen Delivery Partner app

Package `in.axzen.delivery`, version `0.1-beta`, Android 7+ (API 24), target API 36.

The delivery app is separate from the customer app. A superadmin creates a
`Delivery Partner` employee with the partner's verified phone number, username,
and password. The partner can use the username/password immediately, or use OTP
when Firebase Phone Authentication is configured for this app. Shipping
operations assign a packed order from the Delivery dashboard. The partner then
sees only assigned tasks and can record pickup, out-for-delivery, delivered, or
returned status in sequence.

The app shows the delivery address, customer call and map actions, item count,
tracking reference, and the exact COD amount to collect. Delivery evidence does
not mark COD as paid; finance reconciliation remains a separate privileged
operation.

## Firebase setup

Register a new Android app with package `in.axzen.delivery` in the existing
`axzen-infotech` Firebase project. Enable Phone authentication and add the
debug/release SHA-1 and SHA-256 fingerprints. Download its `google-services.json`.
The customer app file for `in.axzen.shop` cannot be reused.

## Build

Use Node 22+, Java 21, Android SDK 36, and build tools 36.0.0.

```powershell
$env:AXZEN_DELIVERY_FIREBASE_CONFIG='C:\secure\delivery-google-services.json'
npm run delivery:android:prepare
cd delivery-native\android
.\gradlew.bat assembleDebug lintDebug
```

Without the Android Firebase file, the generated debug build uses the Firebase
web phone-auth fallback, which may not work reliably inside an Android WebView.
Username/password login remains available. A release distributed to delivery
partners should use the matching native Firebase configuration and should be
device-tested before operations rely on OTP.

The web version is available at `/delivery` and uses the same assigned-task API.

## APK-free UI updates

The installed app checks the Axzen API for an active, Superadmin-approved web
release at startup. To prepare a package:

```powershell
npm run delivery:update-package -- --version=0.2.0 --notes=Route-screen-update
```

This creates `release-output/Axzen-Delivery-Update-0.2.0.zip`. In the Admin
Panel open **Delivery App Updates**, select the ZIP, and choose **Validate and
Publish**. The server accepts only `delivery-update.json`, `app.js`, and
`app.css`, limits compressed and uncompressed sizes, records an audit entry,
and publishes a SHA-256 digest. Devices verify that digest before running the
release, cache the last verified release for offline startup, and fall back to
the app bundled in the APK if an update cannot start. Previous versions remain
available for immediate rollback from the same Superadmin screen.

Native plugin changes, Android permissions, Firebase configuration, package
name changes, and Capacitor dependency upgrades still require a new APK. The
ZIP mechanism is for delivery UI and web-logic updates.

