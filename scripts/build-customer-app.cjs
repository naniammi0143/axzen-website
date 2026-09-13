const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
process.chdir(root);
function run(...args) { cp.execFileSync(process.execPath, args, { stdio: 'inherit' }); }
async function build() {
  run('scripts/prepare-mobile.cjs');
  await require('esbuild').build({
    entryPoints: ['customer/native-entry.js'], bundle: true, format: 'esm', target: 'chrome109',
    outfile: 'mobile-www/customer/app.js', external: ['https://*'], minify: true
  });
  const config = JSON.parse(fs.readFileSync('capacitor.config.json', 'utf8'));
  const firebasePath = process.env.AXZEN_ANDROID_FIREBASE_CONFIG;
  if (firebasePath) {
    const data = JSON.parse(fs.readFileSync(firebasePath, 'utf8'));
    if (data.project_info?.project_id !== 'axzen-infotech' || !data.client?.some(c => c.client_info?.android_client_info?.package_name === config.appId)) {
      throw new Error('Firebase config must match axzen-infotech / in.axzen.customer.');
    }
    config.includePlugins.push('@capacitor-firebase/authentication');
  }
  // Keep the checked-in default unchanged after generating the local project.
  const original = fs.readFileSync('capacitor.config.json');
  try {
    fs.writeFileSync('capacitor.config.json', JSON.stringify(config, null, 2));
    if (!fs.existsSync('android')) run('node_modules/@capacitor/cli/bin/capacitor', 'add', 'android');
    if (firebasePath) fs.copyFileSync(firebasePath, 'android/app/google-services.json');
    else fs.rmSync('android/app/google-services.json', { force: true });
    run('node_modules/@capacitor/cli/bin/capacitor', 'sync', 'android');
  } finally { fs.writeFileSync('capacitor.config.json', original); }
  const manifestPath = 'android/app/src/main/AndroidManifest.xml';
  let manifest = fs.readFileSync(manifestPath, 'utf8')
    .replace('android:allowBackup="true"', 'android:allowBackup="false"')
    .replace('android:icon="@mipmap/ic_launcher"', 'android:icon="@drawable/ic_axzen"')
    .replace('android:roundIcon="@mipmap/ic_launcher_round"', 'android:roundIcon="@drawable/ic_axzen"');
  fs.writeFileSync(manifestPath, manifest);
  fs.copyFileSync('native/ic_axzen.xml', 'android/app/src/main/res/drawable/ic_axzen.xml');
  fs.writeFileSync('android/app/src/main/res/values/colors.xml', '<resources><color name="colorPrimary">#102A43</color><color name="colorPrimaryDark">#102A43</color><color name="colorAccent">#FF5733</color></resources>');
  const stylesPath = 'android/app/src/main/res/values/styles.xml';
  fs.writeFileSync(stylesPath, fs.readFileSync(stylesPath, 'utf8').replace('<item name="android:background">@drawable/splash</item>', '<item name="windowSplashScreenBackground">#102A43</item><item name="windowSplashScreenAnimatedIcon">@drawable/ic_axzen</item>'));
  const gradlePath = 'android/app/build.gradle';
  fs.writeFileSync(gradlePath, fs.readFileSync(gradlePath, 'utf8')
    .replace(/versionCode \d+/, 'versionCode 2').replace(/versionName "[^"]+"/, 'versionName "0.2-beta"'));
  fs.writeFileSync('android/axzen-build-info.json', JSON.stringify({ appId: config.appId, nativePhoneLogin: !!firebasePath, api: 'https://www.axzen.in' }, null, 2));
  console.log('Android customer project ready. Native phone login configured:', !!firebasePath);
}
build().catch(error => { console.error(error.message); process.exitCode = 1; });
