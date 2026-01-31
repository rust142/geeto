#!/usr/bin/env sh
set -euo pipefail

info() { printf '\033[1;34m%s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$1"; }
err() { printf '\033[1;31m%s\033[0m\n' "$1"; exit 1; }

info "Starting tools/install.sh"

# Install dependencies with Bun if available, otherwise npm
if command -v bun >/dev/null 2>&1; then
  info "Using Bun to install dependencies"
  bun install
elif command -v npm >/dev/null 2>&1; then
  info "Using npm to install dependencies"
  npm ci
else
  err "Neither 'bun' nor 'npm' found. Please install Node (or Bun) and retry."
fi

# Run project prepare script (install husky hooks etc.)
info "Running project 'prepare' script to install git hooks"
if command -v bun >/dev/null 2>&1; then
  bun run prepare || (npm run prepare || true)
else
  npm run prepare || true
fi

# Function: ensure label using GitHub CLI (optional)
ensure_label() {
  LABEL='review'
  COLOR='6f42c1'
  DESC='Trigger AI Issue Assessment action'

  info "Ensuring label '$LABEL' exists (if gh CLI available)"

  if ! command -v gh >/dev/null 2>&1; then
    warn "gh CLI not found; skipping label creation. Install GitHub CLI to enable this step."
    return 0
  fi

  # Try to derive repo in owner/repo format
  REPO=${GITHUB_REPOSITORY:-}
  if [ -z "$REPO" ]; then
    REMOTE_URL=$(git config --get remote.origin.url || true)
    if [ -n "$REMOTE_URL" ]; then
      REPO=$(printf '%s\n' "$REMOTE_URL" | sed -E 's#.*[:/](.+)/(.+)(\.git)?#\1/\2#')
    fi
  fi

  if [ -n "$REPO" ]; then
    # Create label (if it exists, the API returns 422; ignore failures)
    gh api "repos/$REPO/labels" -f name="$LABEL" -f color="$COLOR" -f description="$DESC" >/dev/null 2>&1 || true
    info "Label ensured for $REPO"
  else
    warn "Could not determine repo automatically; attempting to create label in current gh context"
    gh api "repos/$(gh repo view --json nameWithOwner -q '.nameWithOwner')/labels" -f name="$LABEL" -f color="$COLOR" -f description="$DESC" >/dev/null 2>&1 || true
    info "Label ensured in gh current repo context"
  fi
}

# Default behavior: ensure label unless --no-label passed
if [ "${1:-}" = "--no-label" ]; then
  info "Skipping label creation (--no-label)"
else
  ensure_label
fi

info "Install script completed. Run 'sh tools/install.sh' or 'npm run tools:install'"
