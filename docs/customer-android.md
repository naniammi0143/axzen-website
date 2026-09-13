# Axzen customer Android app

Package `in.axzen.customer`, version `0.2-beta`, Android 7+ (API 24), target API 36.
This Capacitor app bundles the customer UI in the APK. It does not launch the
whole storefront in a browser tab. Native sharing and Android back/lifecycle
handling complement categories, product search, stores, favourites, saved cart,
checkout, order history/tracking, addresses and verified purchase reviews.
The existing Axzen navy/orange colors remain. Delivery promises are determined
by actual seller/courier configuration, not invented ten-minute estimates.

## Build

Use Node 22+, Java 21, Android SDK 36 and build tools 36.0.0.

```sh
npm ci
npm run android:prepare
cd android
./gradlew assembleDebug lintDebug
```

The generated `android/` directory is reproducible and ignored. Customize its
generation in `scripts/build-customer-app.cjs`. Do not overwrite source changes
inside generated directories. The CI workflow creates a signed debug APK,
checksum, signing certificate fingerprints and a manifest/build info report.
Release signing and Play Store submission are separate owner-managed steps.

## Native phone OTP

Register `in.axzen.customer` in the existing `axzen-infotech` Firebase project.
Enable Phone authentication and register the actual signing SHA-1/SHA-256
fingerprints from the build's signature report. Supply the downloaded Android
`google-services.json` via `AXZEN_ANDROID_FIREBASE_CONFIG` locally or the GitHub
Actions secret `AXZEN_ANDROID_FIREBASE_JSON`. Do not substitute the web app ID.
This follows the [Capacitor Firebase authentication plugin](https://capawesome.io/docs/sdks/capacitor/firebase/authentication/).

Without Android Firebase configuration the app still builds and opens the
customer interface, but native phone sign-in is unavailable and clearly reports
that limitation. The build info states whether native phone login is configured.
No test OTP, fabricated token or default account is embedded. The API always
verifies the Firebase token and issues the normal customer session.

## Live dependencies and validation limits

The live API is `https://www.axzen.in`. Its production JWT secret must meet the
existing 32-character minimum before catalog/login/checkout work. App assets
can open offline; live stock, orders and payment need connectivity. Guest cart
and favourites persist locally. Stock/prices are revalidated before ordering.
Device OTP, gateway/UPI return and courier flows require end-to-end testing with
proper service configuration before calling the build production-ready.

## Admin and superadmin access

The portal is `https://admin.axzen.in`. Both roles use an active registered staff
phone number and a fresh Firebase OTP. There is no shared admin password or
default superadmin credential. Staff creation/editing now describes the actual
OTP flow instead of asking for an unused password. Existing password hashes
are not exposed or reset. Only a superadmin can assign staff roles.

The owner must identify which phone belongs to the superadmin and which belongs
to the admin before accounts can be provisioned or their access verified. A phone
number alone is never treated as proof of phone possession; login requires OTP.
