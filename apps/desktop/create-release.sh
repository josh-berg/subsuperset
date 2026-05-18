#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DESKTOP_PKG="$REPO_ROOT/apps/desktop/package.json"
RELEASE_DIR="$REPO_ROOT/apps/desktop/release"

# ── Read current version ──────────────────────────────────────────────────────
CURRENT=$(node -p "require('$DESKTOP_PKG').version")
echo ""
echo "Current version: $CURRENT"
echo ""

# ── Ask for bump type ─────────────────────────────────────────────────────────
echo "Bump type:"
echo "  1) patch"
echo "  2) minor"
echo "  3) major"
echo ""
read -r -p "Choose [1/2/3]: " choice

case "$choice" in
  1|patch)  BUMP="patch" ;;
  2|minor)  BUMP="minor" ;;
  3|major)  BUMP="major" ;;
  *)
    echo "Invalid choice. Exiting."
    exit 1
    ;;
esac

# ── Calculate new version ─────────────────────────────────────────────────────
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
case "$BUMP" in
  patch) PATCH=$((PATCH + 1)) ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
esac
NEW_VERSION="$MAJOR.$MINOR.$PATCH"

echo ""
echo "Bumping $CURRENT → $NEW_VERSION ($BUMP)"
echo ""

# ── Update package.json ───────────────────────────────────────────────────────
# Use node so we don't mangle the JSON formatting
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('$DESKTOP_PKG', 'utf8'));
  pkg.version = '$NEW_VERSION';
  fs.writeFileSync('$DESKTOP_PKG', JSON.stringify(pkg, null, '\t') + '\n');
"

echo "Updated apps/desktop/package.json → $NEW_VERSION"
echo ""

# ── Build ─────────────────────────────────────────────────────────────────────
echo "Running bun run build..."
echo ""
cd "$REPO_ROOT"
bun run build

# ── Open release folder in Finder ────────────────────────────────────────────
echo ""
echo "Opening release folder..."
open "$RELEASE_DIR"

echo ""
echo "✓ Released $NEW_VERSION"
