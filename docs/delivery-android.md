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

