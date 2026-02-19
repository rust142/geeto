#!/usr/bin/env bash

# Build .deb package for Geeto CLI
# Usage: ./scripts/build-deb.sh [version] [arch]
# Example: ./scripts/build-deb.sh 0.3.0 amd64

set -euo pipefail

VERSION="${1:-$(node -p "require('./package.json').version")}"
ARCH="${2:-amd64}"
PKG_NAME="geeto"
PKG_DIR="dist/${PKG_NAME}_${VERSION}_${ARCH}"

echo "Building ${PKG_NAME} v${VERSION} for ${ARCH}..."

# Determine binary name
if [[ "$ARCH" == "amd64" ]]; then
  BINARY="geeto-linux"
elif [[ "$ARCH" == "arm64" ]]; then
  BINARY="geeto-linux-arm64"
else
  echo "Unsupported architecture: $ARCH"
  exit 1
fi

# Check binary exists
if [[ ! -f "$BINARY" ]]; then
  echo "Binary not found: $BINARY"
  echo "Run 'bun run geeto:build:linux' first"
  exit 1
fi

# Clean previous build
rm -rf "$PKG_DIR"
mkdir -p "$PKG_DIR/DEBIAN"
mkdir -p "$PKG_DIR/usr/local/bin"

# Copy binary
cp "$BINARY" "$PKG_DIR/usr/local/bin/geeto"
chmod 755 "$PKG_DIR/usr/local/bin/geeto"

# Create control file
cat > "$PKG_DIR/DEBIAN/control" << EOF
Package: ${PKG_NAME}
Version: ${VERSION}
Section: devel
Priority: optional
Architecture: ${ARCH}
Depends: git (>= 2.0)
Maintainer: Agung Maulana Malik <amdev142@gmail.com>
Homepage: https://github.com/rust142/geeto
Description: AI-powered Git workflow automation CLI
 Streamline your Git workflow with intelligent branch naming,
 commit messages, and Trello integration — powered by AI
 (Gemini, GitHub Copilot, OpenRouter).
EOF

# Build .deb
mkdir -p dist
dpkg-deb --build "$PKG_DIR"

echo ""
echo "✓ Built: dist/${PKG_NAME}_${VERSION}_${ARCH}.deb"
echo ""
echo "Install with: sudo dpkg -i dist/${PKG_NAME}_${VERSION}_${ARCH}.deb"
