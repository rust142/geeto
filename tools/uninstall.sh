#!/usr/bin/env bash

set -e

# ─── Colors ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ─── Parse flags ──────────────────────────────────────────────────────
PURGE=false
FORCE=false

for arg in "$@"; do
  case "$arg" in
    --purge)  PURGE=true ;;
    --force)  FORCE=true ;;
    --help|-h)
      echo "Usage: uninstall.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --force   Skip confirmation prompt"
      echo "  --purge   Also remove config directory (~/.geeto/)"
      echo "  --help    Show this help message"
      exit 0
      ;;
  esac
done

# ─── Detect OS ────────────────────────────────────────────────────────
OS="unknown"
ARCH="$(uname -m)"

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
  OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
  OS="mac"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
  OS="windows"
fi

# ─── Banner ───────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}  ┌─────────────────────────────────────┐${NC}"
echo -e "${CYAN}${BOLD}  │                                     │${NC}"
echo -e "${CYAN}${BOLD}  │       ${RED}🗑  Geeto Uninstaller${CYAN}         │${NC}"
echo -e "${CYAN}${BOLD}  │    ${NC}${DIM}AI-powered Git workflow CLI${CYAN}${BOLD}      │${NC}"
echo -e "${CYAN}${BOLD}  │                                     │${NC}"
echo -e "${CYAN}${BOLD}  └─────────────────────────────────────┘${NC}"
echo ""
echo -e "  ${GRAY}Platform: ${OS} (${ARCH})${NC}"
echo ""

# ─── Locate binary ───────────────────────────────────────────────────
BINARY_PATH=""
INSTALL_METHOD="binary"
CONFIG_DIR=""

if [ "$OS" == "windows" ]; then
  BINARY_PATH="$USERPROFILE/.geeto/bin/geeto.exe"
  CONFIG_DIR="$USERPROFILE/.geeto"
else
  BINARY_PATH="/usr/local/bin/geeto"
  CONFIG_DIR="$HOME/.geeto"

  # Check if installed via Homebrew
  if command -v brew &>/dev/null; then
    if brew list geeto &>/dev/null 2>&1; then
      INSTALL_METHOD="homebrew"
    fi
  fi
fi

# ─── Check if installed ──────────────────────────────────────────────
if [ ! -f "$BINARY_PATH" ] && [ "$INSTALL_METHOD" != "homebrew" ]; then
  echo -e "  ${YELLOW}Geeto is not installed on this system.${NC}"
  echo -e "  ${GRAY}Expected binary at: ${BINARY_PATH}${NC}"
  echo ""
  exit 1
fi

# ─── Show what will be removed ────────────────────────────────────────
echo -e "  ${BOLD}The following will be removed:${NC}"
echo ""

if [ "$INSTALL_METHOD" == "homebrew" ]; then
  echo -e "  ${BLUE}→${NC} Homebrew package: geeto"
elif [ -f "$BINARY_PATH" ]; then
  echo -e "  ${BLUE}→${NC} Binary: ${BINARY_PATH}"
fi

if [ "$PURGE" = true ] && [ -d "$CONFIG_DIR" ]; then
  echo -e "  ${BLUE}→${NC} Config: ${CONFIG_DIR}/"
fi

echo ""

# ─── Confirmation ─────────────────────────────────────────────────────
if [ "$FORCE" = false ]; then
  read -rp "  Are you sure you want to uninstall geeto? [y/N] " answer
  case "$answer" in
    [yY]|[yY][eE][sS]) ;;
    *)
      echo ""
      echo -e "  ${GRAY}Uninstall cancelled.${NC}"
      echo ""
      exit 0
      ;;
  esac
  echo ""
fi

# ─── Uninstall ────────────────────────────────────────────────────────
if [ "$INSTALL_METHOD" == "homebrew" ]; then
  echo -e "  ${BLUE}[•]${NC} Uninstalling via Homebrew..."
  if brew uninstall geeto 2>/dev/null; then
    echo -e "  ${GREEN}[✓]${NC} Uninstalled via Homebrew"
  else
    echo -e "  ${RED}[✗]${NC} Failed to uninstall via Homebrew"
    exit 1
  fi
elif [ "$OS" == "windows" ]; then
  echo -e "  ${BLUE}[•]${NC} Removing binary..."
  rm -f "$BINARY_PATH"
  echo -e "  ${GREEN}[✓]${NC} Removed ${BINARY_PATH}"

  # Remove bin directory if empty
  local_bin="$USERPROFILE/.geeto/bin"
  if [ -d "$local_bin" ] && [ -z "$(ls -A "$local_bin" 2>/dev/null)" ]; then
    rmdir "$local_bin" 2>/dev/null || true
    echo -e "  ${GREEN}[✓]${NC} Removed empty directory ${local_bin}"
  fi

  echo ""
  echo -e "  ${YELLOW}⚠ You may need to manually remove from PATH:${NC}"
  echo -e "  ${BLUE}%USERPROFILE%\\.geeto\\bin${NC}"
else
  echo -e "  ${BLUE}[•]${NC} Removing binary..."
  if [ -w "$(dirname "$BINARY_PATH")" ]; then
    rm -f "$BINARY_PATH"
  else
    sudo rm -f "$BINARY_PATH"
  fi
  echo -e "  ${GREEN}[✓]${NC} Removed ${BINARY_PATH}"
fi

# ─── Purge config ────────────────────────────────────────────────────
if [ "$PURGE" = true ] && [ -d "$CONFIG_DIR" ]; then
  echo -e "  ${BLUE}[•]${NC} Removing config directory..."
  rm -rf "$CONFIG_DIR"
  echo -e "  ${GREEN}[✓]${NC} Removed ${CONFIG_DIR}/"
elif [ "$PURGE" = false ] && [ -d "$CONFIG_DIR" ]; then
  echo ""
  echo -e "  ${GRAY}Config directory preserved: ${CONFIG_DIR}/${NC}"
  echo -e "  ${GRAY}Use --purge to also remove config files.${NC}"
fi

# ─── Done ─────────────────────────────────────────────────────────────
echo ""
echo -e "  ${GREEN}${BOLD}✓ Geeto has been uninstalled.${NC}"
echo ""
