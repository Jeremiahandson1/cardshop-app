# Card Shop Mobile — EAS Build & Distribute

Native iOS + Android builds via Expo Application Services (EAS). No local Xcode / Android Studio required — builds run in Expo's cloud.

## One-time setup

```bash
# From the cardshop-app directory
cd "C:/ALL TWOMIAH PRODUCTS/CardShop/cardshop-app"

# Install the CLI (can also use npx eas-cli ...)
npm install -g eas-cli

# Log in to your Expo account
eas login

# Link this project — already linked via app.json projectId, but verify:
eas whoami
```

The `app.json` already has `expo.extra.eas.projectId` set, so no `eas init` needed.

## Build profiles (defined in `eas.json`)

| Profile | Distribution | API URL | Use for |
|---|---|---|---|
| `development` | internal | `http://localhost:5000` | local dev with Expo Dev Client on your phone/simulator |
| `preview` | internal | `https://cardshop-api.onrender.com` | FB group pilot, TestFlight, internal APK sharing |
| `production` | store | same | App Store + Play Store |

## Building

### For the FB group pilot (Android APK, free)

```bash
eas build --profile preview --platform android
```

EAS queues the build. You'll get a URL when it's done (usually 10–20 min). Download the `.apk`, share the link in your FB group. People tap → install → run. No Play Store account needed.

### For iOS TestFlight

```bash
eas build --profile preview --platform ios
```

First run prompts you to either:
- Log into Apple Developer ($99/yr required) — EAS then auto-generates certificates
- Provide existing credentials

Output is an `.ipa`. Push to TestFlight with:

```bash
eas submit --profile production --platform ios
```

(You'll need to fill `ascAppId` and `appleTeamId` in `eas.json` first — grab them from App Store Connect.)

### For both at once

```bash
eas build --profile preview --platform all
```

### For production stores

```bash
eas build --profile production --platform all
eas submit --profile production --platform all
```

## Free tier limits

- **30 builds/month** on the free plan (shared across iOS + Android)
- Builds queue if you're over — they still run, just slower

A preview APK costs one slot. An iOS build costs one slot. Budget accordingly — don't rebuild for every tweak.

## When the API URL changes

The `EXPO_PUBLIC_API_URL` is baked in at build time. If Render gives you a different URL than `https://cardshop-api.onrender.com`:

1. Update the `env.EXPO_PUBLIC_API_URL` in `eas.json` for the relevant profile
2. Commit + rebuild

## Updating the app without a new build (OTA)

Not wired yet. To enable:

```bash
npx expo install expo-updates
eas update:configure
```

Then `eas update --branch preview` pushes JS-only changes to existing installs without a new native build. Useful for text/layout tweaks; useless for native dep changes. Not required for the pilot.

## Troubleshooting

**"This app requires the developer to enable it" on iOS TestFlight**
TestFlight only shares with people on the internal testers list. Add testers in App Store Connect → TestFlight → Internal Testing.

**Android APK won't install — "app not installed"**
Usually a signature mismatch with a previous install. Uninstall the old version first.

**Build fails with "Could not find com.twomiah.cardshop"**
Bundle identifier in `app.json` must match what's registered in Apple Developer / Play Console. Check `expo.ios.bundleIdentifier` and `expo.android.package`.

**Camera / NFC / location permissions missing**
All configured in `app.json` `infoPlist` (iOS) and `permissions` (Android). If you see runtime prompts not firing, the plugins list in `app.json` is the likely fix.
