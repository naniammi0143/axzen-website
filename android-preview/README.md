# Axzen Android preview

This is a **new test application**, package `in.axzen.store.preview`, version
`0.1-preview`. It opens `https://www.axzen.in/` in an Android Custom Tab with
Axzen's navy/orange branding. It is not an update to an existing native app.
The device browser handles the website, cookies, authentication and payments.
The browser toolbar remains visible. Internet access and an enabled browser
are required. The app requests no device permissions and contains no API keys.

Build with JDK 17 and Android SDK 35:

```sh
cd android-preview
./gradlew assembleDebug lintDebug
```

The GitHub Actions **Android preview APK** workflow produces the installable,
debug-signed APK, SHA-256 checksum, package metadata, signature verification and
lint report. Each fresh CI debug key can differ: uninstall an older preview if
Android reports a signature conflict. Never use this debug build for Play Store
submission or as a signing-key replacement for an existing application.

This preview reflects the currently deployed website, including any live errors.
Building and linting do not verify device login, checkout or real payment flows.
Before wider distribution, verify those flows on an Android device and provide
the existing application's source/package/signing setup if an update is needed.

Architecture: [Android Custom Tabs](https://developer.android.com/develop/ui/views/layout/webapps/overview-of-android-custom-tabs).
Build compatibility: [AGP 8.9](https://developer.android.com/build/releases/agp-8-9-0-release-notes).
