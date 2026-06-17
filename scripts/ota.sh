#!/bin/bash
# Dual-runtime, dual-channel OTA helper.
#
# Publishes an EAS Update to BOTH branches (production + preview) for
# EVERY runtime version we have live builds on. This matters because:
#
#   1. Two channels are in the wild:
#        - production channel (App Store + Play)
#        - preview channel    (Android sideload APKs)
#      Pushing to only one silently misses half the install base.
#
#   2. Builds auto-increment the app version (eas.json appVersionSource
#      "remote"), and runtimeVersion.policy is "appVersion" — so each
#      platform's installed build can be on a DIFFERENT runtime. As of
#      2026-06: Android builds = 1.0.1, the iOS App Store build = 1.0.2.
#      An update only loads on a build whose runtime EXACTLY matches, so
#      a 1.0.1-only push never reaches the 1.0.2 iOS app. We were stuck
#      shipping to 1.0.1 alone for weeks — iOS got nothing. Publish to
#      every runtime below to cover all builds.
#
# Keep RUNTIMES in sync with live builds:  eas build:list
#
# How it targets a runtime: `eas update` derives the runtime from
# app.json, and `eas update --runtime-version` does not exist. So we
# temporarily set an EXPLICIT runtimeVersion string in app.json (used
# verbatim, unaffected by the appVersion policy / remote version),
# publish, then restore the original app.json. A trap restores it even
# if a publish fails midway.
#
# Usage:
#   ./scripts/ota.sh "feat: marketplace listing offer flow"
#   ./scripts/ota.sh   # interactive prompt for message

set -e

# Runtime versions with live builds. Add new ones here after a build.
RUNTIMES=("1.0.1" "1.0.2")

# (branch environment) pairs to publish each runtime to.
BRANCHES=("production production" "preview preview")

APP_JSON="app.json"

MSG="$1"
if [ -z "$MSG" ]; then
  read -r -p 'Update message: ' MSG
fi
if [ -z "$MSG" ]; then
  echo 'Aborted: empty message.'
  exit 1
fi

if [ ! -f "$APP_JSON" ]; then
  echo "Aborted: $APP_JSON not found (run from the cardshop-app root)."
  exit 1
fi

# Back up app.json and guarantee restore on ANY exit (success, error, ^C).
cp "$APP_JSON" "$APP_JSON.otabak"
restore_app_json() {
  if [ -f "$APP_JSON.otabak" ]; then
    mv -f "$APP_JSON.otabak" "$APP_JSON"
    echo "↩  restored original $APP_JSON"
  fi
}
trap restore_app_json EXIT

set_runtime() {
  # Pin an explicit runtimeVersion string so EAS publishes to exactly
  # this runtime regardless of the appVersion policy / remote version.
  node -e "
    const fs = require('fs');
    const p = '$APP_JSON';
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    j.expo.runtimeVersion = '$1';
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  "
}

for RT in "${RUNTIMES[@]}"; do
  echo
  echo "############ Runtime $RT ############"
  set_runtime "$RT"
  for PAIR in "${BRANCHES[@]}"; do
    # shellcheck disable=SC2086
    set -- $PAIR
    BRANCH="$1"; ENVIRONMENT="$2"
    echo
    echo "==> [rt $RT] Publishing to $BRANCH..."
    eas update --branch="$BRANCH" --environment="$ENVIRONMENT" --message="$MSG"
  done
done

# Explicit restore (trap also covers this) before we report success.
restore_app_json
trap - EXIT

echo
echo "✓ Published to runtimes: ${RUNTIMES[*]}  ×  branches: production, preview."
