# Building and signing the Android APK locally

This produces a standalone `app-release.apk` that runs with no Expo Go, no laptop, no
development server and no internet. No EAS account is needed. Commands are for Windows
PowerShell, run from the project folder unless stated otherwise.

## 1. One-time setup

1. **JDK 17.** Expo's environment guide installs it with Chocolatey:
   `choco install -y microsoft-openjdk17`. Then set the user environment variable
   `JAVA_HOME` to the folder it installed (for example
   `C:\Program Files\Microsoft\jdk-17.x.x-hotspot`; check the actual name).
2. **Android Studio** from <https://developer.android.com/studio>, Standard install. In
   *Settings > Languages & Frameworks > Android SDK* install **Android SDK Platform 36** and
   at least one **Android SDK Build-Tools**.
3. Set the user environment variable `ANDROID_HOME` to `%LOCALAPPDATA%\Android\Sdk` and add
   `%LOCALAPPDATA%\Android\Sdk\platform-tools` to your user `Path`.
4. Open a **new** terminal and check: `java -version` shows 17, and `adb --version` works.

Reference: <https://docs.expo.dev/get-started/set-up-your-environment/?platform=android&device=physical&mode=development-build&buildEnv=local>

## 2. Create your upload key (once, then keep it forever)

Every APK you install must be signed with the **same key** as the one already on the phone.
If the key changes, Android refuses the update, and the only way forward is to uninstall the
app, which **deletes all scoring data on the phone**. So:

- Create the key once and reuse it for every build.
- Keep it **outside** the project folder and back it up (with its passwords) somewhere safe.
- Never commit it. `.gitignore` already ignores `*.keystore` and `*.jks`.

```powershell
mkdir D:\keys
keytool -genkeypair -v -storetype PKCS12 -keystore D:\keys\cricket-scorer-upload.keystore -alias cricket-scorer -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` comes with the JDK. It asks for a password and your name details.

## 3. Tell Gradle where the key is (once)

Create or edit `%USERPROFILE%\.gradle\gradle.properties`. This is your user Gradle file, not
the project's, so the passwords never enter the project. Use forward slashes in the path:

```properties
CRICKET_UPLOAD_STORE_FILE=D:/keys/cricket-scorer-upload.keystore
CRICKET_UPLOAD_STORE_PASSWORD=your-keystore-password
CRICKET_UPLOAD_KEY_ALIAS=cricket-scorer
CRICKET_UPLOAD_KEY_PASSWORD=your-keystore-password
```

(With a PKCS12 keystore, the key password is the same as the keystore password.)

`plugins/withReleaseSigning.js` makes release builds use these values. If they are missing,
the release build **stops with an error** rather than producing an APK signed with the
shared debug key.

## 4. Build the APK

```powershell
npx tsc --noEmit
npx expo lint
npx jest
npx expo prebuild --platform android --clean
cd android
.\gradlew.bat assembleRelease
cd ..
```

- `prebuild --clean` regenerates the `android/` folder from `app.json` and the config
  plugins. Never edit `android/` by hand; it is regenerated and not committed.
- The first build downloads Gradle and dependencies, so it needs internet and can take 10+ minutes.
- Output: `android\app\build\outputs\apk\release\app-release.apk`

The default APK contains code for all four CPU types. For a smaller APK that still runs on
practically every phone from the last ten years:

```powershell
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

## 5. Check the signature

```powershell
& "$env:ANDROID_HOME\build-tools\<version>\apksigner.bat" verify --print-certs android\app\build\outputs\apk\release\app-release.apk
keytool -list -v -keystore D:\keys\cricket-scorer-upload.keystore
```

The `SHA-256` certificate digest printed by both must match. If the APK shows
`CN=Android Debug`, it is debug-signed; do not install it on a phone with real data.

## 6. Install on the phone

- With USB debugging: `adb install -r android\app\build\outputs\apk\release\app-release.apk`
  (`-r` keeps the existing data when updating).
- Without a cable: copy the APK to the phone, open it, and allow "Install unknown apps" for
  the file manager when asked.

**Before replacing a development build:** a build from `npx expo run:android` is signed with
the debug key, so the release APK cannot install over it. Uninstalling deletes its data, so
create a backup first (Settings > Backup and restore) and restore it after installing.
Data in Expo Go is separate again and is not visible to the APK.

## 7. Releasing an update

1. In `app.json`, increase `android.versionCode` by 1 (Android requires it to go up) and
   update `version` (the name users see, e.g. `1.0.1`).
2. Repeat step 4 with the **same** key, then install with `adb install -r` or by opening the APK.
3. Make a backup on the phone before installing, just in case.

## Notes

- The release build bundles the JavaScript and all assets inside the APK; it never contacts
  a development server.
- The `INTERNET` permission comes from the Expo template (used by development tools). The app
  itself makes no network requests.
- For the Play Store you would build an AAB (`.\gradlew.bat bundleRelease`) and enrol in Play
  App Signing. That is outside this project's scope.
