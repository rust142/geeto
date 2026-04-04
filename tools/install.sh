#!/usr/bin/env bash

set -e

# Require bash (fail fast if run under /bin/sh)
if [ -z "$BASH_VERSION" ]; then
  echo "This installer requires bash. Run with: curl -fsSL https://raw.githubusercontent.com/rust142/geeto/main/tools/install.sh | bash"
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
LOGFILE="/tmp/geeto-install-$(date +%Y%m%d-%H%M%S).log"
touch "$LOGFILE"
CLEANUP_TMP=""
TOTAL_STEPS=6

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

# ─── Helper: print step status ───────────────────────────────────────
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
  echo -e "${CYAN}${BOLD}  │         ${GREEN}⚡ Geeto Installer${CYAN}          │${NC}"
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

# ─── Main installer ──────────────────────────────────────────────────
main() {
  show_banner

  echo -e "  ${GRAY}Platform: ${OS} (${ARCH})${NC}"
  echo -e "  ${GRAY}Log file: ${LOGFILE}${NC}"
  echo ""

  # Check if already installed
  if command -v geeto &>/dev/null; then
    local current_version
    current_version=$(geeto --version 2>/dev/null || echo "unknown")
    echo -e "  ${YELLOW}⚡ Geeto is already installed (${current_version})${NC}"
    echo -e "  ${GRAY}Cleaning up old installation...${NC}"

    # Remove old binaries from common locations
    local old_paths=(
      "/usr/local/bin/geeto"
      "/usr/bin/geeto"
      "$HOME/.bun/bin/geeto"
      "$HOME/.local/bin/geeto"
      "$HOME/.geeto/bin/geeto"
      "$HOME/.geeto/bin/geeto.exe"
    )

    # Also check npm/bun global prefix
    if command -v npm &>/dev/null; then
      local npm_bin
      npm_bin="$(npm prefix -g 2>/dev/null || true)/bin/geeto"
      [ -n "$npm_bin" ] && old_paths+=("$npm_bin")
    fi

    for old_path in "${old_paths[@]}"; do
      if [ -f "$old_path" ] || [ -L "$old_path" ]; then
        if [ -w "$(dirname "$old_path")" ]; then
          rm -f "$old_path" >>"$LOGFILE" 2>&1 || true
        else
          sudo rm -f "$old_path" >>"$LOGFILE" 2>&1 || true
        fi
        echo -e "  ${GRAY}  removed: ${old_path}${NC}"
      fi
    done

    # Clear shell hash table so 'geeto' resolves to new path
    hash -r 2>/dev/null || true

    echo -e "  ${GRAY}Reinstalling / upgrading...${NC}"
    echo ""
  fi

  # ── Step 1: Check dependencies ──────────────────────────────────
  if ! command -v bun &>/dev/null; then
    step_fail 1 "Checking dependencies — Bun not found"
    echo ""
    echo -e "  ${RED}Bun is required to build Geeto.${NC}"
    echo -e "  ${YELLOW}Install Bun: ${BLUE}curl -fsSL https://bun.sh/install | bash${NC}"
    echo ""
    exit 1
  fi

  if ! command -v git &>/dev/null; then
    step_fail 1 "Checking dependencies — Git not found"
    echo ""
    echo -e "  ${RED}Git is required to clone the repository.${NC}"
    echo -e "  ${YELLOW}Install Git: ${BLUE}https://git-scm.com${NC}"
    echo ""
    exit 1
  fi

  step_ok 1 "Checking dependencies (bun, git)"

  # ── Step 2: Clone repository ────────────────────────────────────
  CLEANUP_TMP="$(mktemp -d)"

  git clone --depth 1 https://github.com/rust142/geeto.git "$CLEANUP_TMP" >>"$LOGFILE" 2>&1 &
  local clone_pid=$!
  step_spinner $clone_pid 2 "Cloning repository" || {
    step_fail 2 "Cloning repository"
    echo -e "  ${RED}Failed to clone. Check network or see ${LOGFILE}${NC}"
    cleanup_and_exit 1
  }

  cd "$CLEANUP_TMP" || cleanup_and_exit 1

  # ── Step 3: Install packages ────────────────────────────────────
  bun install >>"$LOGFILE" 2>&1 &
  local install_pid=$!
  step_spinner $install_pid 3 "Installing packages" || {
    step_fail 3 "Installing packages"
    echo -e "  ${RED}Failed to install dependencies. See ${LOGFILE}${NC}"
    cleanup_and_exit 1
  }

  # ── Step 4: Build TypeScript ────────────────────────────────────
  bun run build >>"$LOGFILE" 2>&1 &
  local build_pid=$!
  step_spinner $build_pid 4 "Building TypeScript" || {
    step_fail 4 "Building TypeScript"
    echo -e "  ${RED}TypeScript build failed. See ${LOGFILE}${NC}"
    cleanup_and_exit 1
  }

  # ── Step 5: Compile platform binary ─────────────────────────────
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
    step_fail 5 "Unsupported OS: ${OS}"
    cleanup_and_exit 1
  fi

  bun run "$build_target" >>"$LOGFILE" 2>&1 &
  local compile_pid=$!
  step_spinner $compile_pid 5 "Compiling binary (${OS}/${ARCH})" || {
    step_fail 5 "Compiling binary"
    echo -e "  ${RED}Binary compilation failed. See ${LOGFILE}${NC}"
    cleanup_and_exit 1
  }

  # ── Step 6: Install to PATH ─────────────────────────────────────
  if [ "$OS" == "windows" ]; then
    local win_dir="$USERPROFILE/.geeto/bin"
    mkdir -p "$win_dir"
    cp "$binary_name" "$win_dir/geeto.exe" >>"$LOGFILE" 2>&1 || {
      step_fail 6 "Installing to PATH"
      echo -e "  ${RED}Failed to copy binary. See ${LOGFILE}${NC}"
      cleanup_and_exit 1
    }
    step_ok 6 "Installing to PATH"
    echo ""
    echo -e "  ${YELLOW}⚠ Add to PATH manually:${NC}"
    echo -e "  ${BLUE}setx PATH \"%PATH%;%USERPROFILE%\\.geeto\\bin\"${NC}"
  else
    local install_dir="/usr/local/bin"
    install_binary "$binary_name" "$install_dir"
    step_ok 6 "Installing to ${install_dir}"
  fi

  # ── Cleanup ─────────────────────────────────────────────────────
  cleanup_tmp

  # ── Done ────────────────────────────────────────────────────────
  # Clear shell hash table so new binary is found immediately
  hash -r 2>/dev/null || true

  echo ""
  echo -e "  ${GREEN}${BOLD}✨ Geeto installed successfully!${NC}"
  echo ""

  # Post-install verification
  if command -v geeto &>/dev/null; then
    local installed_version
    installed_version=$(geeto --version 2>/dev/null || echo "")
    if [ -n "$installed_version" ]; then
      echo -e "  ${GRAY}Version: ${installed_version}${NC}"
    fi
    echo -e "  ${GRAY}Run ${BOLD}geeto${NC}${GRAY} to get started${NC}"
  else
    echo -e "  ${YELLOW}Note: You may need to restart your terminal for 'geeto' to be available.${NC}"
  fi

  echo ""
}

# ─── Helper: install binary with sudo handling ───────────────────────
install_binary() {
  local src=$1
  local dest_dir=$2

  if [ -w "$dest_dir" ]; then
    cp "$src" "$dest_dir/geeto" >>"$LOGFILE" 2>&1 || {
      step_fail 6 "Installing to ${dest_dir}"
      echo -e "  ${RED}Failed to copy binary. See ${LOGFILE}${NC}"
      cleanup_and_exit 1
    }
    chmod +x "$dest_dir/geeto" >>"$LOGFILE" 2>&1 || true
  else
    # Check if sudo is cached (non-interactive)
    if sudo -n true 2>/dev/null; then
      sudo cp "$src" "$dest_dir/geeto" >>"$LOGFILE" 2>&1 || {
        step_fail 6 "Installing to ${dest_dir}"
        echo -e "  ${RED}Failed to install with sudo. See ${LOGFILE}${NC}"
        cleanup_and_exit 1
      }
      sudo chmod +x "$dest_dir/geeto" >>"$LOGFILE" 2>&1 || true
    else
      # Need password — inform user
      echo ""
      echo -e "  ${YELLOW}Installing to ${dest_dir} requires sudo.${NC}"
      if sudo cp "$src" "$dest_dir/geeto" >>"$LOGFILE" 2>&1; then
        sudo chmod +x "$dest_dir/geeto" >>"$LOGFILE" 2>&1 || true
      else
        step_fail 6 "Installing to ${dest_dir}"
        echo -e "  ${RED}Failed to install with sudo. See ${LOGFILE}${NC}"
        cleanup_and_exit 1
      fi
    fi
  fi
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
