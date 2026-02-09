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
echo -e "${BLUE}║     Geeto Uninstall Script            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Detected OS: ${OS} (${ARCH})${NC}"
echo ""

FOUND=false

if [ "$OS" == "windows" ]; then
    # Windows uninstallation
    INSTALL_DIR="$USERPROFILE/.geeto/bin"
    BINARY_PATH="$INSTALL_DIR/geeto.exe"

    if [ -f "$BINARY_PATH" ]; then
        echo -e "${BLUE}→ Removing geeto binary...${NC}"
        rm -f "$BINARY_PATH"
        echo -e "${GREEN}✓ Removed ${BINARY_PATH}${NC}"
        FOUND=true

        # Remove directory if empty
        if [ -d "$INSTALL_DIR" ] && [ ! "$(ls -A $INSTALL_DIR)" ]; then
            rmdir "$INSTALL_DIR"
            echo -e "${GREEN}✓ Removed empty directory ${INSTALL_DIR}${NC}"
        fi

        # Remove parent .geeto directory if empty
        PARENT_DIR="$USERPROFILE/.geeto"
        if [ -d "$PARENT_DIR" ] && [ ! "$(ls -A $PARENT_DIR)" ]; then
            rmdir "$PARENT_DIR"
            echo -e "${GREEN}✓ Removed empty directory ${PARENT_DIR}${NC}"
        fi

        echo ""
        echo -e "${YELLOW}Note: You may need to manually remove from PATH:${NC}"
        echo -e "${BLUE}  %USERPROFILE%\\.geeto\\bin${NC}"
    else
        echo -e "${RED}✗ Geeto binary not found at ${BINARY_PATH}${NC}"
    fi
else
    # Unix-like uninstallation (Linux/Mac)
    INSTALL_DIR="/usr/local/bin"
    BINARY_PATH="$INSTALL_DIR/geeto"

    if [ -f "$BINARY_PATH" ]; then
        echo -e "${BLUE}→ Removing geeto binary...${NC}"

        if [ -w "$INSTALL_DIR" ]; then
            rm -f "$BINARY_PATH"
            echo -e "${GREEN}✓ Removed ${BINARY_PATH}${NC}"
        else
            echo -e "${YELLOW}Need sudo permission to remove from ${INSTALL_DIR}${NC}"
            sudo rm -f "$BINARY_PATH"
            echo -e "${GREEN}✓ Removed ${BINARY_PATH}${NC}"
        fi
        FOUND=true
    else
        echo -e "${RED}✗ Geeto binary not found at ${BINARY_PATH}${NC}"
    fi
fi

echo ""

if [ "$FOUND" = true ]; then
    echo -e "${GREEN}════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Uninstallation successful! 👋${NC}"
    echo -e "${GREEN}════════════════════════════════════════${NC}"
else
    echo -e "${YELLOW}════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  Geeto was not found on this system${NC}"
    echo -e "${YELLOW}════════════════════════════════════════${NC}"
    exit 1
fi
