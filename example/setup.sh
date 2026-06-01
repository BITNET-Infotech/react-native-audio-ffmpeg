#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup.sh — Bootstrap the react-native-audio-ffmpeg example app
#
# Run this ONCE from the `example/` directory:
#   cd example && bash setup.sh
#
# What it does:
#   1. Scaffolds a fresh RN 0.85 app (android/ + ios/ native folders)
#   2. Copies our custom src/ files back in
#   3. Installs all JS dependencies (including the local library + CLI)
#   4. Runs pod install on iOS
#   5. Prints next steps
# ─────────────────────────────────────────────────────────────────────────────
set -e

APP_NAME="AudioFFmpegExample"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "════════════════════════════════════════════════════════"
echo "  react-native-audio-ffmpeg — Example App Setup"
echo "════════════════════════════════════════════════════════"
echo ""

# ── 1. Check we're in the right place ────────────────────────────────────────
if [[ ! -f "$SCRIPT_DIR/package.json" ]]; then
  echo "❌ Run this script from the example/ directory."
  exit 1
fi

# ── 2. Skip scaffold if native folders already exist ──────────────────────────
if [[ -d "$SCRIPT_DIR/android" && -d "$SCRIPT_DIR/ios" ]]; then
  echo "✔ android/ and ios/ already present — skipping scaffold."
else
  # Scaffold native project into a temp dir
  TMPDIR_SCAFFOLD=$(mktemp -d)
  echo "▶ Scaffolding React Native $APP_NAME …"
  cd "$TMPDIR_SCAFFOLD"
  npx --yes @react-native-community/cli@latest init "$APP_NAME" \
    --version 0.85.3 \
    --skip-install \
    2>&1 | grep -v "^$" | tail -10

  # Copy native folders into example/
  echo "▶ Copying android/ and ios/ into example/ …"
  cp -r "$TMPDIR_SCAFFOLD/$APP_NAME/android" "$SCRIPT_DIR/android"
  cp -r "$TMPDIR_SCAFFOLD/$APP_NAME/ios"     "$SCRIPT_DIR/ios"
  rm -rf "$TMPDIR_SCAFFOLD"
fi

# ── 3. Patch android/gradle.properties — enable New Architecture ──────────────
echo "▶ Enabling New Architecture (newArchEnabled=true) …"
GRADLE_PROPS="$SCRIPT_DIR/android/gradle.properties"
if grep -q "newArchEnabled=false" "$GRADLE_PROPS" 2>/dev/null; then
  sed -i '' 's/newArchEnabled=false/newArchEnabled=true/' "$GRADLE_PROPS"
elif ! grep -q "newArchEnabled" "$GRADLE_PROPS" 2>/dev/null; then
  echo "newArchEnabled=true" >> "$GRADLE_PROPS"
fi

# ── 4. Install JS dependencies (includes @react-native-community/cli) ─────────
echo "▶ Installing JS dependencies …"
cd "$SCRIPT_DIR"
yarn install

# ── 5. Pod install (iOS) ───────────────────────────────────────────────────────
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo "▶ Running pod install …"
  cd "$SCRIPT_DIR/ios"
  RCT_NEW_ARCH_ENABLED=1 pod install --repo-update
  cd "$SCRIPT_DIR"
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✅ Setup complete!"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  Android:  yarn android"
echo "  iOS:      yarn ios"
echo "  Metro:    yarn start"
echo ""
echo "  The library is linked from: ../ (local file: dependency)"
echo "  Any edit you make in ../src/ is hot-reloaded automatically."
echo ""
