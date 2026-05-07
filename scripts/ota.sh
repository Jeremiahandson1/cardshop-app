#!/bin/bash
# Dual-push OTA helper. Pushes an EAS Update to both production
# and preview branches at runtime version 1.0.1.
#
# Why both? We have two build profiles installed in the wild:
#   - production channel (App Store + future Android Play)
#   - preview channel    (current Android sideload APKs)
# Pushing only to one silently misses half the install base.
#
# Usage:
#   ./scripts/ota.sh "feat: marketplace listing offer flow"
#   ./scripts/ota.sh   # interactive prompt for message

set -e

MSG="$1"
if [ -z "$MSG" ]; then
  read -r -p 'Update message: ' MSG
fi
if [ -z "$MSG" ]; then
  echo 'Aborted: empty message.'
  exit 1
fi

echo "==> Publishing to production..."
eas update --branch=production --environment=production --message="$MSG"

echo
echo "==> Publishing to preview..."
eas update --branch=preview --environment=preview --message="$MSG"

echo
echo "✓ Both channels updated."
