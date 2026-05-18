# App Store Deployment

## Strategy

Two-phase plan:

1. **Google Play (now)** — Trusted Web Activity (TWA) via Bubblewrap. Zero app code changes. Ships the live `journal-manna.web.app` PWA as a Play Store app. Content updates deploy instantly via `firebase deploy` — no Play Store resubmission.
2. **iOS App Store (later)** — Capacitor wrapper. Separate doc / phase when ready.

---

## Google Play via TWA

### What TWA is

TWA wraps the hosted PWA in a minimal Android shell. Chrome renders everything — no separate web engine bundled, no code duplication. The Android app is just a launcher that opens `journal-manna.web.app` full-screen. Digital Asset Links verifies you own both the app and the domain, removing all browser chrome.

### Prerequisites

| Item                          | Status                | Action                                                 |
| ----------------------------- | --------------------- | ------------------------------------------------------ |
| Google Play Developer Account | ?                     | Pay $25 one-time at play.google.com/console            |
| Node.js 18+                   | ✅                    | —                                                      |
| Java JDK 17+                  | ?                     | `java -version` — install from adoptium.net if missing |
| Android SDK / Build Tools     | ?                     | Install Android Studio or SDK tools only               |
| Bubblewrap CLI                | ✅ install step below | —                                                      |
| PWA passes Lighthouse         | ✅                    | Has manifest + SW + HTTPS                              |
| 192×192 and 512×512 icons     | ✅                    | `public/icons/web-app-manifest-*.png`                  |

---

### Step 1 — Verify PWA readiness

```bash
# Run Lighthouse against production URL
# Chrome DevTools → Lighthouse → PWA audit → journal-manna.web.app
# Must pass: "Installable" criteria (manifest, service worker, HTTPS)
```

Current manifest in `vite.config.ts` already has:

- `display: 'standalone'`
- `start_url: '/'`
- 192×192 and 512×512 icons
- `theme_color` and `background_color`

Should pass. Confirm before proceeding.

---

### Step 2 — Install Bubblewrap

```bash
npm i -g @bubblewrap/cli
```

First run will prompt to install Android SDK and JDK if paths are not set. Follow the prompts — Bubblewrap downloads what it needs.

---

### Step 3 — Initialise the TWA project

Create a new directory outside the journal repo:

```bash
mkdir ~/twa-quiet-dwelling && cd ~/twa-quiet-dwelling
bubblewrap init --manifest=https://journal-manna.web.app/manifest.webmanifest
```

Bubblewrap reads the live manifest and prompts for confirmation of each value. Use these answers:

| Prompt            | Value                                                              |
| ----------------- | ------------------------------------------------------------------ |
| Application name  | `Quiet Dwelling`                                                   |
| Short name        | `Quiet Dwelling`                                                   |
| Package ID        | `com.thequietdwelling.twa`                                         |
| Start URL         | `/`                                                                |
| Display mode      | `standalone`                                                       |
| Theme color       | `#e3dfd1`                                                          |
| Background color  | `#faf9f7`                                                          |
| Icon URL (192)    | `https://journal-manna.web.app/icons/web-app-manifest-192x192.png` |
| Icon URL (512)    | `https://journal-manna.web.app/icons/web-app-manifest-512x512.png` |
| Maskable icon     | `https://journal-manna.web.app/icons/web-app-manifest-512x512.png` |
| Signing key path  | `./release.keystore` (Bubblewrap creates it)                       |
| Signing key alias | `release`                                                          |

This generates `twa-manifest.json` and an Android project in `~/twa-quiet-dwelling/`.

---

### Step 4 — Build the release APK/AAB

```bash
bubblewrap build
```

Produces:

- `app-release-signed.apk` — for direct device install / testing
- `app-release-bundle.aab` — for Play Store upload (required for new apps)

**Keep the keystore file safe.** Back up `release.keystore` + note the password. Losing it means you cannot update the app.

---

### Step 5 — Test on device before Digital Asset Links

```bash
# Install APK on connected Android device
bubblewrap install
```

At this point the app launches as a **Custom Tab** (browser chrome visible) — that is expected. Digital Asset Links verification (Step 6) removes the browser chrome.

Check:

- App opens `journal-manna.web.app` correctly
- Auth works
- Navigation works
- Looks acceptable even in Custom Tab mode

---

### Step 6 — Digital Asset Links (removes browser chrome)

This is the critical verification step. Without it the app shows as a browser tab, not a full-screen standalone app.

#### 6a — Get your keystore SHA-256 fingerprint

```bash
keytool -list -v -keystore ~/twa-quiet-dwelling/release.keystore -alias release
```

Copy the `SHA256:` fingerprint (format: `AA:BB:CC:...`).

#### 6b — Create the asset links file

In the journal repo, create `public/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.thequietdwelling.twa",
      "sha256_cert_fingerprints": ["YOUR_KEYSTORE_SHA256_HERE"]
    }
  }
]
```

**Important:** After uploading to Play Store with Play App Signing enabled (required for new apps), Google generates a second signing key. You must add Google's SHA-256 alongside yours:

1. Upload to Play Console → your app → Setup → App integrity
2. Copy the SHA-256 fingerprint shown there
3. Add it as a second entry in the `sha256_cert_fingerprints` array:

```json
"sha256_cert_fingerprints": [
  "YOUR_LOCAL_KEYSTORE_SHA256",
  "GOOGLE_PLAY_SIGNING_SHA256"
]
```

Then redeploy.

#### 6c — Update `firebase.json` to serve the file with correct headers

Add a `headers` block to `firebase.json`:

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "headers": [
      {
        "source": "/.well-known/assetlinks.json",
        "headers": [{ "key": "Content-Type", "value": "application/json" }]
      }
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

Note: Vite copies everything in `public/` to `dist/` at build time. The `**.well-known/assetlinks.json**` file will be in `dist/.well-known/assetlinks.json` and Firebase Hosting serves static files before applying rewrite rules — no additional config needed beyond the header above.

#### 6d — Deploy and verify

```bash
npm run build
firebase deploy --only hosting
```

Verify the file is reachable:

```bash
curl https://journal-manna.web.app/.well-known/assetlinks.json
```

Verify with Google's tool:

```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://journal-manna.web.app&relation=delegate_permission/common.handle_all_urls
```

Should return your package name and fingerprint.

---

### Step 7 — Rebuild TWA with verified asset links

After deploying `assetlinks.json`, rebuild so the app contains the correct fingerprint reference:

```bash
cd ~/twa-quiet-dwelling
bubblewrap build
```

Reinstall on device — the app should now launch **without** browser chrome (full standalone).

---

### Step 8 — Play Store submission

#### 8a — Create the app

1. Go to [play.google.com/console](https://play.google.com/console)
2. Create app → App name: **Quiet Dwelling**
3. Default language: English
4. App / game: App
5. Free / paid: Free
6. Accept policies

#### 8b — Store listing

Navigate to: Store presence → Main store listing

| Field                          | Value                                                                 |
| ------------------------------ | --------------------------------------------------------------------- |
| App name                       | `Quiet Dwelling`                                                      |
| Short description (≤80 chars)  | `A quiet place to reflect, pray, and journal`                         |
| Full description (≤4000 chars) | See below                                                             |
| App icon (512×512 PNG)         | Use `web-app-manifest-512x512.png` — may need no-transparency version |
| Feature graphic (1024×500 PNG) | Create a simple branded banner                                        |
| Screenshots                    | Minimum 2 phone screenshots (1080×1920 or 1080×2400)                  |

Full description draft:

```
Quiet Dwelling is a local-first journalling app designed for quiet, intentional writing.

Write daily entries with a distraction-free rich text editor. Track your mood over time with visual insights. Add scripture references directly to your entries. Set daily reminders to build a consistent journalling habit.

Your entries stay on your device and, if you enable sync, in your own Google Drive.

Features:
• Distraction-free editor with bold and italic formatting
• Daily mood tracking with mood history and trends
• Scripture reference lookup and tagging
• Full-text search across all entries
• Daily reminder notifications
• Works offline
```

#### 8c — Content rating

Policy → App content → Content rating → Complete questionnaire

- Category: Lifestyle / Productivity
- No violence, no user-generated public content, no location sharing → should receive Everyone rating

#### 8d — Privacy policy

Required. Host a privacy policy page. Minimum content: what data is collected (journal text, email, mood), how it is stored (Firebase/Google Cloud), user rights (delete account).

If you don't have one: draft quickly and host at `journal-manna.web.app/privacy` — add a static route or just a hosted HTML file.

#### 8e — Upload the AAB

Release → Testing → Internal testing → Create new release

- Upload `app-release-bundle.aab`
- Add release notes
- Review and roll out to internal testing

Add yourself + testers as internal testers. Install via the internal testing link. Confirm the app runs without browser chrome (validates asset links are working with Play's signing key).

#### 8f — Production release

Release → Production → Create new release

- Copy from internal testing release
- Set rollout percentage (start at 20% or 100%)
- Submit for review

**Review timeline:** 1–7 days for new apps. Usually 2–3 days.

---

### Step 9 — Post-launch

#### Updating the app

For content/feature changes: just deploy to Firebase Hosting. No Play Store action needed.

```bash
npm run build && firebase deploy --only hosting
```

For changes to app metadata (icons, package config, version): rebuild with Bubblewrap and upload new AAB.

#### Monitoring

- Play Console → Android vitals for crash rates and ANRs
- Play Console → Ratings and reviews
- Firebase Hosting → Usage for web traffic

---

### Troubleshooting

| Problem                         | Cause                                        | Fix                                                                                             |
| ------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| App shows browser chrome        | Asset links not verified                     | Check `curl` of `assetlinks.json`, verify SHA256 matches Play Console's key                     |
| App crashes on launch           | Incompatible Chrome version                  | Requires Chrome 72+ — affects <1% of Android market                                             |
| `bubblewrap build` fails        | Missing JDK or SDK                           | Run `bubblewrap doctor` to diagnose                                                             |
| Auth redirect broken            | Firebase `__/auth/` path caught by something | Already handled — `workbox.navigateFallbackDenylist` in `vite.config.ts` excludes `/__/auth/.*` |
| Lighthouse installability fails | Manifest not served from production          | Deploy to hosting first, then test against live URL not localhost                               |

---

### File checklist

```
journal repo:
  public/
    .well-known/
      assetlinks.json          ← create in Step 6b, update in Step 6b after Play Console
  firebase.json                ← update headers in Step 6c

twa-quiet-dwelling/ (outside repo):
  twa-manifest.json
  release.keystore             ← BACK THIS UP
  app-release-signed.apk
  app-release-bundle.aab       ← upload to Play Console
```

---

### Estimated timeline

| Day  | Work                                                                                                |
| ---- | --------------------------------------------------------------------------------------------------- |
| 1    | Pay for Play Dev account, install Bubblewrap, `bubblewrap init`, first build, test on device        |
| 1    | Create `assetlinks.json`, update `firebase.json`, deploy, verify with curl                          |
| 1–2  | Rebuild TWA, confirm standalone launch on device, create Play Console app                           |
| 2    | Write store listing, screenshots, privacy policy, upload AAB to internal testing                    |
| 2–3  | Add Play App Signing SHA256 to `assetlinks.json`, redeploy, confirm internal testers see standalone |
| 3    | Submit to production review                                                                         |
| 5–10 | App live on Play Store                                                                              |
