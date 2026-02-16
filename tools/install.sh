#!/usr/bin/env bash

set -e

# Require bash (fail fast if run under /bin/sh)
if [ -z "$BASH_VERSION" ]; then
  echo "This installer requires bash. Run with: curl -fsSL https://raw.githubusercontent.com/rust142/geeto/main/tools/install.sh | bash -s -- --no-label"
  exit 1
fi

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

# No CLI flags — run installer with interactive loading spinners
USE_LOCAL=0

# Helper function to show loading spinner
show_spinner() {
  local pid=$1
  local message=$2
  local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  local i=0

  echo -n -e "${BLUE}[•••]${NC} ${message}"
  while kill -0 "$pid" 2>/dev/null; do
    i=$(( (i+1) % 10 ))
    echo -n -e "\r${BLUE}[${spin:$i:1}]${NC} ${message}"
    sleep 0.1
  done
  wait "$pid"
  local exit_code=$?
  echo -e "\r${GREEN}[✓]${NC} ${message}                    "
  return $exit_code
}
run_install() {
  # Start spinner immediately so user sees feedback right away
  LOGFILE="/tmp/geeto-install-$(date +%Y%m%d-%H%M%S).log"
  touch "$LOGFILE"

  DONE=0
  overall_spinner() {
      local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
      local i=0
      # print initial frame immediately so spinner appears without delay
      printf "\r${BLUE}[${spin:0:1}]${NC} Installing geeto for ${OS}..." >&2
      while [ "$DONE" -eq 0 ]; do
          i=$(( (i+1) % 10 ))
          printf "\r${BLUE}[${spin:$i:1}]${NC} Installing geeto for ${OS}..." >&2
          sleep 0.12
      done
      printf "\r" >&2
  }

  overall_spinner &
  spinner_pid=$!

  # Decide where to build from. Default: clone geeto to a temp dir to avoid modifying user's project.
  if [ -f "package.json" ] && [ "$USE_LOCAL" -eq 0 ]; then
    # If package.json exists in CWD, check whether it's actually the geeto repo
    pkg_name=$(grep -E '"name"\s*:' package.json 2>/dev/null | head -n1 | sed -E 's/.*"name"\s*:\s*"([^\"]+)".*/\1/') || pkg_name=""

    TMPDIR="$(mktemp -d)"
    git clone --depth 1 https://github.com/rust142/geeto.git "$TMPDIR" >>"$LOGFILE" 2>&1 || { kill "$spinner_pid" 2>/dev/null || true; wait "$spinner_pid" 2>/dev/null || true; printf "\r\033[K"; echo -e "${RED}Failed to clone repository. See ${LOGFILE}${NC}"; exit 1; }
    cd "$TMPDIR" || exit 1
    CLEANUP_TMP=1

  elif [ -f "package.json" ] && [ "$USE_LOCAL" -eq 1 ]; then
    echo -e "${YELLOW}Building from current directory...${NC}"
  else
    TMPDIR="$(mktemp -d)"
    git clone --depth 1 https://github.com/rust142/geeto.git "$TMPDIR" >>"$LOGFILE" 2>&1 || { kill "$spinner_pid" 2>/dev/null || true; wait "$spinner_pid" 2>/dev/null || true; printf "\r\033[K"; echo -e "${RED}Failed to clone repository. See ${LOGFILE}${NC}"; exit 1; }
    cd "$TMPDIR" || exit 1
    CLEANUP_TMP=1
  fi

    # Step 1: dependencies
    if [ ! -d "node_modules" ]; then
        if bun install >>"$LOGFILE" 2>&1; then
            : # dependencies installed (silent)
        else
            kill "$spinner_pid" 2>/dev/null || true; wait "$spinner_pid" 2>/dev/null || true
            echo -e "\n${RED}Failed to install dependencies. See ${LOGFILE}${NC}"
            exit 1
        fi
    else
        : # already present (silent)
    fi

    # Step 2: Build TypeScript
    if bun run build >>"$LOGFILE" 2>&1; then
        : # TypeScript built (silent)
    else
        kill "$spinner_pid" 2>/dev/null || true; wait "$spinner_pid" 2>/dev/null || true
        echo -e "\n${RED}TypeScript build failed. See ${LOGFILE}${NC}"
        exit 1
    fi

    # Step 3: Build binary
    BINARY_NAME="geeto"
    if [ "$OS" == "linux" ]; then
            if [ "$ARCH" == "aarch64" ] || [ "$ARCH" == "arm64" ]; then
                    if bun run geeto:build:linux:arm64 >>"$LOGFILE" 2>&1; then
                        BINARY_NAME="geeto-linux-arm64"
                    else
                        kill "$spinner_pid" 2>/dev/null || true; wait "$spinner_pid" 2>/dev/null || true
                        echo -e "\n${RED}Binary build failed. See ${LOGFILE}${NC}"
                        exit 1
                    fi
            else
                    if bun run geeto:build:linux >>"$LOGFILE" 2>&1; then
                        BINARY_NAME="geeto-linux"
                    else
                        kill "$spinner_pid" 2>/dev/null || true; wait "$spinner_pid" 2>/dev/null || true
                        echo -e "\n${RED}Binary build failed. See ${LOGFILE}${NC}"
                        exit 1
                    fi
            fi
    elif [ "$OS" == "mac" ]; then
            if [ "$ARCH" == "arm64" ]; then
                    if bun run geeto:build:mac:arm64 >>"$LOGFILE" 2>&1; then
                        BINARY_NAME="geeto-mac-arm64"
                    else
                        kill "$spinner_pid" 2>/dev/null || true; wait "$spinner_pid" 2>/dev/null || true
                        echo -e "\n${RED}Binary build failed. See ${LOGFILE}${NC}"
                        exit 1
                    fi
            else
                    if bun run geeto:build:mac >>"$LOGFILE" 2>&1; then
                        BINARY_NAME="geeto-mac"
                    else
                        kill "$spinner_pid" 2>/dev/null || true; wait "$spinner_pid" 2>/dev/null || true
                        echo -e "\n${RED}Binary build failed. See ${LOGFILE}${NC}"
                        exit 1
                    fi
            fi
    elif [ "$OS" == "windows" ]; then
              if bun run geeto:build:windows >>"$LOGFILE" 2>&1; then
                        BINARY_NAME="geeto-windows.exe"
                    else
                        kill "$spinner_pid" 2>/dev/null || true; wait "$spinner_pid" 2>/dev/null || true
                        echo -e "\n${RED}Binary build failed. See ${LOGFILE}${NC}"
                        exit 1
                    fi
    fi

    # Continue with install/cleanup silently (spinner remains)

  # Install binary (silent — spinner shows overall progress)
  if [ "$OS" == "windows" ]; then
      INSTALL_DIR="$USERPROFILE/.geeto/bin"
      mkdir -p "$INSTALL_DIR"
    cp "$BINARY_NAME" "$INSTALL_DIR/geeto.exe" >>"$LOGFILE" 2>&1 || { kill "$spinner_pid" 2>/dev/null || true; wait "$spinner_pid" 2>/dev/null || true; echo -e "\n${RED}Failed to install binary. See ${LOGFILE}${NC}"; exit 1; }
      echo ""
      echo -e "${YELLOW}Add to PATH manually:${NC}"
      echo -e "${BLUE}  setx PATH \"%PATH%;%USERPROFILE%\\.geeto\\bin\"${NC}"
      echo ""
  else
      INSTALL_DIR="/usr/local/bin"
      if [ -w "$INSTALL_DIR" ]; then
          cp "$BINARY_NAME" "$INSTALL_DIR/geeto" >>"$LOGFILE" 2>&1 || { kill "$spinner_pid" 2>/dev/null || true; wait "$spinner_pid" 2>/dev/null || true; echo -e "\n${RED}Failed to copy binary. See ${LOGFILE}${NC}"; exit 1; }
          chmod +x "$INSTALL_DIR/geeto" >>"$LOGFILE" 2>&1 || true
      else
          # Check if sudo is cached (won't prompt for password)
          if sudo -n true 2>/dev/null; then
              # Sudo cached — install silently without stopping spinner
              if sudo cp "$BINARY_NAME" "$INSTALL_DIR/geeto" >>"$LOGFILE" 2>&1; then
                  sudo chmod +x "$INSTALL_DIR/geeto" >>"$LOGFILE" 2>&1 || true
              else
                  kill "$spinner_pid" 2>/dev/null || true
                  wait "$spinner_pid" 2>/dev/null || true
                  printf "\r\033[K"
                  echo -e "\n${RED}Failed to install binary with sudo. See ${LOGFILE}${NC}"
                  exit 1
              fi
          else
              # Sudo not cached — stop spinner and show prompt message
              kill "$spinner_pid" 2>/dev/null || true
              wait "$spinner_pid" 2>/dev/null || true
              printf "\r\033[K"
              echo -e "${YELLOW}Installing to ${INSTALL_DIR} requires sudo; you may be prompted for your password.${NC}"
              if sudo cp "$BINARY_NAME" "$INSTALL_DIR/geeto" >>"$LOGFILE" 2>&1; then
                  sudo chmod +x "$INSTALL_DIR/geeto" >>"$LOGFILE" 2>&1 || true
              else
                  echo -e "\n${RED}Failed to install binary with sudo. See ${LOGFILE}${NC}"
                  exit 1
              fi
          fi
      fi
  fi

  # Cleanup temporary clone if we used one (silent)
  if [ -n "${CLEANUP_TMP:-}" ] && [ -n "${TMPDIR:-}" ] && [ -d "${TMPDIR}" ]; then
    rm -rf "${TMPDIR}" >>"$LOGFILE" 2>&1 || true
  fi

    # Stop overall spinner and show final status
    kill "$spinner_pid" 2>/dev/null || true
    wait "$spinner_pid" 2>/dev/null || true
    # clear spinner line
    printf "\r\033[K"
    echo -e "${GREEN}[✓] Installed geeto for ${OS}${NC}"
    exit 0
}

# Run installation with interactive spinners
run_install
