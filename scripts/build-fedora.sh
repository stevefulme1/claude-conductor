#!/usr/bin/env bash
set -euo pipefail

echo "=== Claude Conductor — Fedora RPM Build ==="

# Check for required tools
for cmd in cargo node npm rpmbuild; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "Error: $cmd not found. Install it first."
        case "$cmd" in
            cargo)
                echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
                ;;
            node|npm)
                echo "  sudo dnf install nodejs npm"
                ;;
            rpmbuild)
                echo "  sudo dnf install rpm-build"
                ;;
        esac
        exit 1
    fi
done

# Install system deps if missing
DEPS="webkit2gtk4.1-devel gtk3-devel libappindicator-gtk3-devel openssl-devel"
MISSING=""
for dep in $DEPS; do
    if ! rpm -q "$dep" &>/dev/null; then
        MISSING="$MISSING $dep"
    fi
done
if [ -n "$MISSING" ]; then
    echo "Installing missing system dependencies:$MISSING"
    sudo dnf install -y $MISSING
fi

# Build
cd "$(dirname "$0")/.."
npm ci
npx tauri build --bundles rpm

echo ""
echo "=== Build complete ==="
ls -lh src-tauri/target/release/bundle/rpm/*.rpm
echo ""
echo "Install with: sudo dnf install src-tauri/target/release/bundle/rpm/*.rpm"
