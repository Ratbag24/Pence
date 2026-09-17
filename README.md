# Pence

**Budgeting for hourly and shift workers.** Log your shifts, check your payslip is right, and see exactly when you'll hit your savings goal.

- 🌐 Web / PWA: https://ratbag24.github.io/Pence/
- 🤖 Android and 🍎 iOS apps: built from this repo with Capacitor (see below)
- 🔒 No accounts, no servers, no tracking — everything stays on the device

## How it's built

The whole app is one file, `docs/index.html` (HTML + CSS + vanilla JS, no build step). Chart.js is vendored in `docs/vendor/` so the native apps work offline.

| Path | What |
|---|---|
| `docs/` | The web app — GitHub Pages serves this folder |
| `docs/tax.js` | The UK tax engine, shared by the app and the page generator |
| `docs/rates/` | Generated "£X an hour after tax" landing pages (SEO → app) |
| `android/`, `ios/` | Native Capacitor projects (committed, as Capacitor recommends) |
| `assets/` | Source icon + splash used to generate every native icon size |
| `store/` | Store listing copy and generated screenshots |
| `scripts/` | End-to-end test, screenshot and rate-page generators (Playwright / Node) |
| `.github/workflows/build-apps.yml` | Builds the Android `.aab`/`.apk` and iOS `.ipa` |

```bash
npm install
npm run test:e2e      # drives the app in headless Chromium, checks the tax maths
npm run screenshots   # regenerates store/screenshots/ (raw + captioned)
npm run build:rates   # regenerates docs/rates/, sitemap.xml and robots.txt
npm run sync          # copies docs/ into android/ and ios/ (run after changing the web app)
```

## Releasing to the stores

Everything below happens in **GitHub Actions** — you don't need Android Studio or a Mac. Tag a version and download the packages from the workflow run.

```bash
git tag v2.0.0
git push origin v2.0.0
```

Or open **Actions → Build apps → Run workflow**. Each run uploads three artifacts:

| Artifact | Contents | Use it for |
|---|---|---|
| `android-debug-apk` | `app-debug.apk` | Install on your own phone to test (no signing needed) |
| `android-release` | `app-release.aab` + `.apk` | Upload the `.aab` to Google Play |
| `ios-archive` | `.xcarchive` (+ `.ipa` when signing secrets are set) | Upload the `.ipa` to App Store Connect |

Every run also publishes the same files to a **GitHub Release** for plain download links: a version tag gets its own release, and a manual run refreshes the rolling **[latest-build](https://github.com/Ratbag24/Pence/releases/tag/latest-build)** pre-release — so the newest APK is always at `https://github.com/Ratbag24/Pence/releases/latest-build` for installing on a phone.

Without any secrets the workflow still runs; the Android release is unsigned and iOS produces an unsigned archive. To get store-ready packages, add the secrets below under **Settings → Secrets and variables → Actions**.

### One-time setup: Google Play

1. Create a [Google Play Console](https://play.google.com/console) account (£20 one-off).
2. Create a signing keystore (keep it forever — you can't update the app without it):
   ```bash
   keytool -genkeypair -v -keystore pence-release.keystore -alias pence \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
3. Add these repository secrets:

   | Secret | Value |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | `base64 -i pence-release.keystore` (one line) |
   | `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
   | `ANDROID_KEY_ALIAS` | `pence` |
   | `ANDROID_KEY_PASSWORD` | the key password |

4. In Play Console create the app (**Pence**, package `app.getpence.pence`), then upload `app-release.aab` under *Testing → Internal testing* first, then *Production*.
5. Fill in the listing from [`store/listing.md`](store/listing.md) and upload screenshots from `store/screenshots/android/`.

**Optional — automatic upload:** create a service account with *Release manager* access in Play Console, download its JSON key and add it as `PLAY_SERVICE_ACCOUNT_JSON`. Every tag then lands on the Internal testing track by itself.

### One-time setup: App Store

1. Join the [Apple Developer Program](https://developer.apple.com/programs/) (£79/year).
2. In [App Store Connect](https://appstoreconnect.apple.com) create the app with bundle ID `app.getpence.pence`.
3. In *Certificates, Identifiers & Profiles* create:
   - an **Apple Distribution** certificate → export it from Keychain as a `.p12` with a password (needs a Mac once; or use a friend's / a cloud Mac)
   - an **App Store** provisioning profile for `app.getpence.pence` → download the `.mobileprovision`
4. Add these secrets:

   | Secret | Value |
   |---|---|
   | `IOS_CERT_P12_BASE64` | `base64 -i distribution.p12` |
   | `IOS_CERT_PASSWORD` | the `.p12` password |
   | `IOS_PROFILE_BASE64` | `base64 -i Pence_App_Store.mobileprovision` |
   | `APPLE_TEAM_ID` | your 10-character Team ID (top-right of the developer site) |

5. Run the workflow, download `ios-archive`, and upload the `.ipa` with the **Transporter** app (Mac) — or set up automatic upload:

**Optional — automatic TestFlight upload:** in App Store Connect → *Users and Access → Integrations → App Store Connect API* create a key with *App Manager* access. Add `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_KEY_P8_BASE64` (`base64 -i AuthKey_XXXX.p8`). Every tag then goes straight to TestFlight.

### Bumping the version

Before each release update all three (they should match):

- `package.json` → `"version"`
- `android/app/build.gradle` → `versionCode` (+1 every upload) and `versionName`
- `ios/App/App.xcodeproj/project.pbxproj` → `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` (+1 every upload)

…and `APP_VERSION` near the top of `docs/index.html` so Settings shows the right number.

## Tax figures

`TAX_YEAR` at the top of `docs/tax.js` holds every rate and threshold in one place. Income Tax and NI thresholds are frozen until April 2028; student-loan thresholds change each April — update them from gov.uk, bump the `label`, and run `npm run build:rates` so the landing pages match.

## Licence

© CodedForge. All rights reserved.
