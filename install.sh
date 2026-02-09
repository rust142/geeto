#!/usr/bin/env bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Detect OS
OS="unknown"
ARCH="$(uname -m)"

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="mac"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    OS="windows"
fi

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Geeto Installation Script         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Detected OS: ${OS} (${ARCH})${NC}"
echo ""

# Check if bun is installed
if ! command -v bun &> /dev/null; then
    echo -e "${RED}✗ Bun is not installed${NC}"
    echo -e "${YELLOW}  Please install Bun from: https://bun.sh${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Bun found${NC}"

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo -e "${RED}✗ Git is not installed${NC}"
    echo -e "${YELLOW}  Please install Git from: https://git-scm.com${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Git found${NC}"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}→ Installing dependencies...${NC}"
    bun install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
    echo ""
fi

# Build TypeScript
echo -e "${BLUE}→ Building TypeScript...${NC}"
bun run build
echo -e "${GREEN}✓ TypeScript compiled${NC}"
echo ""

# Build binary based on OS
echo -e "${BLUE}→ Building binary for ${OS}...${NC}"

BINARY_NAME="geeto"
if [ "$OS" == "linux" ]; then
    if [ "$ARCH" == "aarch64" ] || [ "$ARCH" == "arm64" ]; then
        bun run geeto:build:linux:arm64
        BINARY_NAME="geeto-linux-arm64"
    else
        bun run geeto:build:linux
        BINARY_NAME="geeto-linux"
    fi
elif [ "$OS" == "mac" ]; then
    if [ "$ARCH" == "arm64" ]; then
        bun run geeto:build:mac:arm64
        BINARY_NAME="geeto-mac-arm64"
    else
        bun run geeto:build:mac
        BINARY_NAME="geeto-mac"
    fi
elif [ "$OS" == "windows" ]; then
    bun run geeto:build:windows
    BINARY_NAME="geeto-windows.exe"
fi

echo -e "${GREEN}✓ Binary built: ${BINARY_NAME}${NC}"
echo ""

# Install binary
if [ "$OS" == "windows" ]; then
    # Windows installation
    INSTALL_DIR="$USERPROFILE/.geeto/bin"
    mkdir -p "$INSTALL_DIR"
    cp "$BINARY_NAME" "$INSTALL_DIR/geeto.exe"

    echo -e "${YELLOW}Windows installation complete!${NC}"
    echo -e "${YELLOW}Add to PATH manually:${NC}"
    echo -e "${BLUE}  setx PATH \"%PATH%;%USERPROFILE%\\.geeto\\bin\"${NC}"
    echo ""
    echo -e "${GREEN}Run 'geeto' after restarting your terminal${NC}"
else
    # Unix-like installation (Linux/Mac)
    INSTALL_DIR="/usr/local/bin"

    if [ -w "$INSTALL_DIR" ]; then
        cp "$BINARY_NAME" "$INSTALL_DIR/geeto"
        chmod +x "$INSTALL_DIR/geeto"
        echo -e "${GREEN}✓ Installed to ${INSTALL_DIR}/geeto${NC}"
    else
        echo -e "${YELLOW}Need sudo permission to install to ${INSTALL_DIR}${NC}"
        sudo cp "$BINARY_NAME" "$INSTALL_DIR/geeto"
        sudo chmod +x "$INSTALL_DIR/geeto"
        echo -e "${GREEN}✓ Installed to ${INSTALL_DIR}/geeto${NC}"
    fi

    echo ""
    echo -e "${GREEN}Installation complete! Run:${NC}"
    echo -e "${BLUE}  geeto${NC}"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  Installation successful! 🎉${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
