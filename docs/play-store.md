# Google Play release checklist

Riplika is an anonymous, random video-chat app with user-generated content. That
means the store listing, declarations and moderation story matter as much as the
build. Complete every item below before promoting a release to production.

## 1. Backend and legal pages

- [ ] Deploy the backend at a permanent HTTPS domain (`https://chat.example.com`).
      WebSockets must work through the proxy (`wss://`).
- [ ] Set `VITE_API_ORIGIN` to that domain for every Android release build.
- [ ] Add `TRUST_PROXY=1` if the app runs behind a trusted reverse proxy.
- [ ] Publish a privacy policy at a public URL and enter it in Play Console.
      A draft template is in [`docs/privacy-policy.md`](privacy-policy.md) — fill
      in the placeholders, have it reviewed, then publish it (for example with
      GitHub Pages served from `/docs`).
- [ ] Publish terms of service / community guidelines and link them in the app.
      A draft template is in [`docs/terms.md`](terms.md).
- [ ] Provide a support email that is monitored.

The policy should cover: camera and microphone access, peer-to-peer media, chat
messages, anonymous identifiers, reports and blocks, retention, cookies/local
storage, security, children's privacy (18+ only), and user rights/contact.

## 2. Build the release

```bash
export JAVA_HOME=/path/to/jdk-21
VITE_API_ORIGIN=https://chat.example.com npm run android:bundle
```

- [ ] Verify the AAB is signed with the upload key.
- [ ] Confirm `versionCode` was increased for every upload (`android/app/build.gradle`).
- [ ] Keep `android/keystore/riplika-upload.jks` and `android/keystore.properties`
      backed up in a password manager or encrypted vault. Never commit them.
- [ ] Enable **Play App Signing** so Google holds the app signing key.
- [ ] Test the exact AAB through an internal-testing track before production.

Useful checks:

```bash
# Signature and certificate
apksigner verify --print-certs path/to/app-release.aab

# Package, version and SDK levels of an APK
aapt dump badging android/app/build/outputs/apk/release/app-release.apk | head
```

`apksigner` and `aapt` live in `build-tools/36.0.0` under your Android SDK.

## 3. Play Console setup

1. Create the app with package name **`com.riplika.app`**, default language, and
   the correct app/game category.
2. Complete **App content**:
   - Privacy policy URL
   - Ads: declare whether the app contains ads (currently no)
   - App access: the app has no login, so explain that all features are reachable
     without credentials
   - Content rating questionnaire: answer honestly about UGC, mature content,
     profanity, and user interaction. Anonymous video chat with strangers will
     likely receive a mature/18+ rating.
   - Target audience: 18+ only; do not opt in to child-directed design.
   - News app: no
   - Data safety: declare camera, microphone, messages, app activity, and
     diagnostics accurately. Live media is not recorded by the server, but it is
     transmitted off the device; reports and blocks are stored. Review each
     question against the current Play definitions.
   - Government apps: no
   - Financial features: no
   - Health: no
3. Add the **store listing**:
   - App name: `Riplika — Random Video Chat` (max 30 characters)
   - Short description (max 80 characters)
   - Full description (max 4000 characters)
   - App icon: 512 × 512 PNG, 32-bit, no transparency
     (`assets/play/icon-512.png` is ready)
   - Feature graphic: 1024 × 500 PNG/JPEG
     (`assets/play/feature-graphic-1024x500.png` is ready)
   - Phone screenshots: 2–8 images, 16:9 or 9:16, minimum 320 px
   - Optional tablet screenshots if you support tablets
4. Complete **Store settings** and choose the countries/regions to publish in.

## 4. User-generated content requirements

Play requires apps with UGC to provide:

- [x] In-app reporting of users/messages (`Report` in the chat room)
- [x] Blocking a user so the pair is never matched again
- [x] A moderation dashboard with report review
- [ ] Published community guidelines / terms
- [ ] A documented moderation and escalation process
- [ ] A timely response process for reports and legal requests
- [ ] Age gate and clear 18+ messaging (currently a self-attested checkbox)

Random video chat carries a high risk of sexual or abusive content. Do not rely
on the profanity filter alone. Add human review, escalation, and a way to suspend
abusive users before scaling the app.

## 5. Testing tracks

1. Upload the AAB to **Internal testing** and add your own account as a tester.
2. Install from the Play link on a physical device.
3. Verify:
   - [ ] Camera and microphone permission prompts
   - [ ] Front/back camera and mute/camera-off controls
   - [ ] Matching, Next, Stop, text chat
   - [ ] Reporting and blocking
   - [ ] Demo partner after an empty queue
   - [ ] Behaviour on Wi-Fi, mobile data, and after backgrounding
   - [ ] No crash when permission is denied
4. Promote to **Closed testing** if Google requires it for your account type
   (new personal accounts may need a closed test with a minimum number of testers
   for a set period before production access). Check the current requirement in
   Play Console.
5. Roll out to production with a staged percentage and monitor reports/crashes.

## 6. Release monitoring

- [ ] Play Console crash/ANR reports and Android vitals
- [ ] Backend logs, moderation reports, and rate-limit events
- [ ] Uptime and TLS certificate expiry
- [ ] Backups of `data/riplika.sqlite`
- [ ] A rollback plan: keep the previous AAB and backend image available

## Versioning

`android/app/build.gradle` contains `versionCode` and `versionName`. Increment
`versionCode` for every Play upload; `versionName` is the user-visible version.

```gradle
versionCode 1
versionName "1.0"
```
