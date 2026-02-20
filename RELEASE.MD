# Releases

## v0.3.9 — February 20, 2026

> Previous version: v0.3.8

### What's New?

#### New Features

- Remember and automatically use your saved AI provider and model settings during releases.

#### Other Improvements

- Add a blank line after the saved AI configuration message for readability.
- Clean up the changelog and RELEASE.MD for clearer release notes.

---

## v0.3.8 — February 20, 2026

> Previous version: v0.3.7

### What's New?

#### New Features

- Releases can now generate release notes automatically using supported AI providers.

#### Bug Fixes

- Release workflow now sorts Git tags by creation date so releases are produced in the correct chronological order.

#### Other Improvements

- Spell checker now recognizes Bahasa (Indonesian) by adding it to the custom dictionary.

---

## v0.3.7 — February 20, 2026

> Previous version: v0.3.6

### What's New?

#### Other Improvements

- Add generated VERSION constant for compiled binary compatibility.
- Update release workflow to sync version constant automatically.

---

## v0.3.6 — February 20, 2026

> Previous version: v0.3.5

### What's New?

#### New Features

- Add `allowedBases` config and branch base validation for stricter branch workflows.

#### Bug Fixes

- Improve push error messages and exit cleanly on fatal errors instead of showing stack traces.

#### Other Improvements

- Move Homebrew formula updates to a separate tap repository.

---

## v0.3.5 — February 20, 2026

> Previous version: v0.3.4

### What's New?

#### New Features

- Add Homebrew formula and update CI for easy `brew install geeto`.

#### Bug Fixes

- Suppress noisy Node.js experimental warnings from the Copilot subprocess.

---

## v0.3.4 — February 20, 2026

> Previous version: v0.3.3

### What's New?

#### Other Improvements

- Generate Homebrew formula using CI environment variables.
- Remove old GitHub Actions release workflow in favor of the new tag-based flow.

---

## v0.3.3 — February 20, 2026

> Previous version: v0.3.2

### What's New?

#### Other Improvements

- Trim RELEASE.MD release history for cleaner output.
- Normalize the geeto binary path in package.json.

---

## v0.3.2 — February 20, 2026

> Previous version: v0.3.1

### What's New?

#### New Features

- Add build and publish binaries workflow — geeto can now be installed as a standalone binary.

---

## v0.3.1 — February 19, 2026

> Previous version: v0.3.0

### What's New?

#### New Features

- Show a progress bar during `git push` in the release workflow.

---

## v0.3.0 — February 19, 2026

> Previous version: v0.1.1

### What's New?

#### New Features

- Add inline terminal editor for editing files and commit messages inside the CLI.
- Add boxed UI, file status badges, and step progress indicators for a clearer interface.
- Add interactive workflows: undo last action, commit amend, stash manager, commit history viewer, cherry-pick, branch compare, and branch cleanup.
- Add release/tag manager and `--tag` CLI flag for releasing.
- Add repository statistics dashboard via `--stats`.
- Add Trello integration: menu, checklist support, multi-select card selection, and task instruction export.
- Add searchable and multi-select menus, range selection, clickable branch links, and short flag aliases.
- Add uninstall script and improved installer.
- Add Security & Quality Gate workflow.
- Add `--stage-all` option to auto-stage changes.
- Add push progress and remote URL display.
- Add custom protected branches and sort branches by staleness.

#### Bug Fixes

- Fix spinner and progress bar output so logs and progress do not interleave.
- Treat newly created branches as safe for checkout and improve branch cleanup messages.
- Fix various workflow logging issues (avoid 'Unknown' step, remove hard-coded version in banner, preserve provider state after cleanup).
- Ensure git commands run with correct flags so push/branch logs behave properly.
- Improve git push robustness and avoid interleaved output.

#### Other Improvements

- Improve AI-related flows: Copilot install flow, provider/model prompts, provider state persistence, English translation, and safety instructions.
- Improve UX and menu rendering, including better multiSelect rendering and commit selection.
- Overhaul README and CONTRIBUTING, add Demo section with images and install.sh.
- Add lint-staged, Husky pre-commit/pre-push hooks, and cspell spellcheck.
- Migrate to flat ESLint config and upgrade dependencies.
- Split monolithic CI into modular workflows and add Danger.

---

## v0.1.1 — February 16, 2026

> Previous version: v0.1.0

### What's New?

#### Bug Fixes

- Remove hard-coded version from banner, now reads from package.json.

#### Other Improvements

- Add Demo section with asciinema demo and demo badge to README.

---

## v0.1.0 — February 16, 2026

> Initial release

### What's New?

#### New Features

- Print package.json version instead of hardcoded value.
- Initial commit — first working version of geeto CLI.

---

*This document was automatically generated by [Geeto CLI](https://github.com/rust142/geeto)*
