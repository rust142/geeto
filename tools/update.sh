#!/usr/bin/env bash

set -e

# Require bash
if [ -z "$BASH_VERSION" ]; then
  echo "This updater requires bash. Run with: curl -fsSL https://raw.githubusercontent.com/rust142/geeto/main/tools/update.sh | bash"
  exit 1
fi

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

# ─── Globals ──────────────────────────────────────────────────────────
LOGFILE="/tmp/geeto-update-$(date +%Y%m%d-%H%M%S).log"
touch "$LOGFILE"
CLEANUP_TMP=""
TOTAL_STEPS=5

# ─── Helper: spinner for a background process ────────────────────────
step_spinner() {
  local pid=$1
  local step_num=$2
  local message=$3
  local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  local i=0

  printf "\r  ${BLUE}[${spin:0:1}]${NC} ${DIM}[%d/%d]${NC} %s" "$step_num" "$TOTAL_STEPS" "$message" >&2
  while kill -0 "$pid" 2>/dev/null; do
    i=$(( (i+1) % 10 ))
    printf "\r  ${BLUE}[${spin:$i:1}]${NC} ${DIM}[%d/%d]${NC} %s" "$step_num" "$TOTAL_STEPS" "$message" >&2
    sleep 0.08
  done
  wait "$pid"
  local exit_code=$?
  if [ "$exit_code" -eq 0 ]; then
    printf "\r  ${GREEN}[✓]${NC} ${DIM}[%d/%d]${NC} %s                    \n" "$step_num" "$TOTAL_STEPS" "$message" >&2
  else
    printf "\r  ${RED}[✗]${NC} ${DIM}[%d/%d]${NC} %s                    \n" "$step_num" "$TOTAL_STEPS" "$message" >&2
  fi
  return $exit_code
}

step_ok() {
  local step_num=$1
  local message=$2
  printf "  ${GREEN}[✓]${NC} ${DIM}[%d/%d]${NC} %s\n" "$step_num" "$TOTAL_STEPS" "$message"
}

step_fail() {
  local step_num=$1
  local message=$2
  printf "  ${RED}[✗]${NC} ${DIM}[%d/%d]${NC} %s\n" "$step_num" "$TOTAL_STEPS" "$message"
}

# ─── Banner ───────────────────────────────────────────────────────────
show_banner() {
  echo ""
  echo -e "${CYAN}${BOLD}  ┌─────────────────────────────────────┐${NC}"
  echo -e "${CYAN}${BOLD}  │                                     │${NC}"
  echo -e "${CYAN}${BOLD}  │        ${GREEN}🔄 Geeto Updater${CYAN}            │${NC}"
  echo -e "${CYAN}${BOLD}  │    ${NC}${DIM}AI-powered Git workflow CLI${CYAN}${BOLD}      │${NC}"
  echo -e "${CYAN}${BOLD}  │                                     │${NC}"
  echo -e "${CYAN}${BOLD}  └─────────────────────────────────────┘${NC}"
  echo ""
}

# ─── Detect OS & Architecture ─────────────────────────────────────────
OS="unknown"
ARCH="$(uname -m)"

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
  OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
  OS="mac"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
  OS="windows"
fi

# ─── Main updater ────────────────────────────────────────────────────
main() {
  show_banner

  echo -e "  ${GRAY}Platform: ${OS} (${ARCH})${NC}"
  echo -e "  ${GRAY}Log file: ${LOGFILE}${NC}"
  echo ""

  # ── Step 1: Check current installation ──────────────────────────
  local current_version="not installed"
  local install_method="source"

  if ! command -v geeto &>/dev/null; then
    step_fail 1 "Checking current installation — Geeto not found"
    echo ""
    echo -e "  ${YELLOW}Geeto is not installed yet. Use the installer instead:${NC}"
    echo -e "  ${BLUE}curl -fsSL https://raw.githubusercontent.com/rust142/geeto/main/tools/install.sh | bash${NC}"
    echo ""
    exit 1
  fi

  current_version=$(geeto --version 2>/dev/null || echo "unknown")

  # Detect install method
  if command -v brew &>/dev/null && brew list geeto &>/dev/null 2>&1; then
    install_method="homebrew"
    step_ok 1 "Current: ${current_version} (Homebrew)"
    echo ""
    echo -e "  ${YELLOW}Homebrew installation detected. Use brew to update:${NC}"
    echo -e "  ${BLUE}brew upgrade geeto${NC}"
    echo ""
    exit 0
  fi

  if command -v npm &>/dev/null && npm list -g geeto &>/dev/null 2>&1; then
    install_method="npm"
    step_ok 1 "Current: ${current_version} (npm)"
    echo ""
    echo -e "  ${YELLOW}npm installation detected. Use npm to update:${NC}"
    echo -e "  ${BLUE}npm update -g geeto${NC}"
    echo ""
    exit 0
  fi

  step_ok 1 "Current: ${current_version}"

  # Check dependencies
  if ! command -v bun &>/dev/null; then
    step_fail 1 "Bun is required to build from source"
    echo -e "  ${YELLOW}Install Bun: ${BLUE}curl -fsSL https://bun.sh/install | bash${NC}"
    exit 1
  fi

  if ! command -v git &>/dev/null; then
    step_fail 1 "Git is required"
    exit 1
  fi

  # ── Step 2: Fetch latest source ─────────────────────────────────
  CLEANUP_TMP="$(mktemp -d)"

  git clone --depth 1 https://github.com/rust142/geeto.git "$CLEANUP_TMP" >>"$LOGFILE" 2>&1 &
  local clone_pid=$!
  step_spinner $clone_pid 2 "Fetching latest source" || {
    step_fail 2 "Fetching latest source"
    echo -e "  ${RED}Failed to clone. Check network or see ${LOGFILE}${NC}"
    cleanup_and_exit 1
  }

  cd "$CLEANUP_TMP" || cleanup_and_exit 1

  # Get the new version from package.json
  local new_version
  new_version=$(grep -oP '"version":\s*"\K[^"]+' package.json 2>/dev/null || echo "unknown")

  # ── Step 3: Build ───────────────────────────────────────────────
  bun install >>"$LOGFILE" 2>&1 &
  local install_pid=$!
  step_spinner $install_pid 3 "Installing packages" || {
    step_fail 3 "Installing packages"
    echo -e "  ${RED}Failed. See ${LOGFILE}${NC}"
    cleanup_and_exit 1
  }

  bun run build >>"$LOGFILE" 2>&1 &
  local build_pid=$!
  step_spinner $build_pid 4 "Building" || {
    step_fail 4 "Building"
    echo -e "  ${RED}Build failed. See ${LOGFILE}${NC}"
    cleanup_and_exit 1
  }

  # ── Step 4: Compile binary ──────────────────────────────────────
  local binary_name="geeto"
  local build_target=""

  if [ "$OS" == "linux" ]; then
    if [ "$ARCH" == "aarch64" ] || [ "$ARCH" == "arm64" ]; then
      build_target="geeto:build:linux:arm64"
      binary_name="geeto-linux-arm64"
    else
      build_target="geeto:build:linux"
      binary_name="geeto-linux"
    fi
  elif [ "$OS" == "mac" ]; then
    if [ "$ARCH" == "arm64" ]; then
      build_target="geeto:build:mac:arm64"
      binary_name="geeto-mac-arm64"
    else
      build_target="geeto:build:mac"
      binary_name="geeto-mac"
    fi
  elif [ "$OS" == "windows" ]; then
    build_target="geeto:build:windows"
    binary_name="geeto-windows.exe"
  else
    step_fail 4 "Unsupported OS: ${OS}"
    cleanup_and_exit 1
  fi

  bun run "$build_target" >>"$LOGFILE" 2>&1 &
  local compile_pid=$!
  step_spinner $compile_pid 4 "Compiling binary (${OS}/${ARCH})" || {
    step_fail 4 "Compiling binary"
    echo -e "  ${RED}Compilation failed. See ${LOGFILE}${NC}"
    cleanup_and_exit 1
  }

  # ── Step 5: Replace binary ──────────────────────────────────────
  if [ "$OS" == "windows" ]; then
    local win_dir="$USERPROFILE/.geeto/bin"
    mkdir -p "$win_dir"
    cp "$binary_name" "$win_dir/geeto.exe" >>"$LOGFILE" 2>&1 || {
      step_fail 5 "Replacing binary"
      cleanup_and_exit 1
    }
    step_ok 5 "Replaced binary"
  else
    local install_dir="/usr/local/bin"
    if [ -w "$install_dir" ]; then
      cp "$binary_name" "$install_dir/geeto" >>"$LOGFILE" 2>&1
      chmod +x "$install_dir/geeto" >>"$LOGFILE" 2>&1 || true
    elif sudo -n true 2>/dev/null; then
      sudo cp "$binary_name" "$install_dir/geeto" >>"$LOGFILE" 2>&1
      sudo chmod +x "$install_dir/geeto" >>"$LOGFILE" 2>&1 || true
    else
      echo ""
      echo -e "  ${YELLOW}Replacing binary requires sudo.${NC}"
      sudo cp "$binary_name" "$install_dir/geeto" >>"$LOGFILE" 2>&1 || {
        step_fail 5 "Replacing binary"
        cleanup_and_exit 1
      }
      sudo chmod +x "$install_dir/geeto" >>"$LOGFILE" 2>&1 || true
    fi
    step_ok 5 "Replaced binary"
  fi

  # ── Cleanup ─────────────────────────────────────────────────────
  cleanup_tmp

  # ── Done ────────────────────────────────────────────────────────
  echo ""
  echo -e "  ${GREEN}${BOLD}✨ Geeto updated successfully!${NC}"
  echo ""
  echo -e "  ${GRAY}${current_version} → ${new_version}${NC}"

  # Verify
  if command -v geeto &>/dev/null; then
    local verified_version
    verified_version=$(geeto --version 2>/dev/null || echo "")
    if [ -n "$verified_version" ]; then
      echo -e "  ${GRAY}Verified: ${verified_version}${NC}"
    fi
  fi

  echo ""
}

# ─── Cleanup helpers ─────────────────────────────────────────────────
cleanup_tmp() {
  if [ -n "${CLEANUP_TMP:-}" ] && [ -d "${CLEANUP_TMP}" ]; then
    rm -rf "${CLEANUP_TMP}" >>"$LOGFILE" 2>&1 || true
  fi
}

cleanup_and_exit() {
  cleanup_tmp
  exit "${1:-1}"
}

# ─── Run ──────────────────────────────────────────────────────────────
main
