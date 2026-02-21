# Releases

## v0.6.1 — February 22, 2026

### What's New?

#### New Features

- Added new Git commands and updated project information.

---

## v0.6.0 — February 22, 2026

### What's New?

#### New Features

- An interactive reword workflow to make editing commit messages easier.
- A new scramble progress indicator that shows multi-step progress more clearly.
- Support for steps that count up and for multi-counter or progress-based step inputs.
- Workflows can include added steps and run git checks without blocking the process.
- A new --alias option and a workflow to create shell aliases for quick access.
- A dry-run mode to preview actions, a revert command to undo changes, and AI-assisted flows for creating PRs and issues.
- Workflows now run git commands asynchronously and use smoother spinners for a better experience.

#### Bug Fixes

- Fixed terminal display so lines are restored correctly and local branches are not deleted accidentally.
- Ensured a blank line appears before the progress bar when logs are suppressed to keep output readable.

#### Other Improvements

- Replaced older spinners and progress bars with the ScrambleProgress indicator for clearer multi-step feedback.
- Removed redundant or empty console output and adjusted console spacing for cleaner logs.
- Small workflow and spacing tweaks to improve the overall user experience

---

## v0.5.0 — February 21, 2026

### What's New?

#### New Features

- Added interactive Git workflows to the CLI so you can abort operations, pull or fetch updates, clean up old branches, and check repository status.

---

## v0.4.4 — February 21, 2026

### What's New?

#### New Features

- Shows changed files and their status before you stage them

---

## v0.4.3 — February 21, 2026

### What's New?

#### New Features

- Added an update script to make keeping the app up to date easier.

#### Other Improvements

- Improved the installation and uninstallation documentation to make setup and removal clearer.

---

## v0.4.2 — February 20, 2026

### What's New?

#### New Features

- Improved the interactive setup experience and installer scripts to make installation smoother.

#### Other Improvements

- Improved Homebrew publishing reliability by using a secure token for cloning the tap repository.

---

## v0.4.1 — February 20, 2026

### What's New?

#### Other Improvements

- Updated the contributing guidelines, security policy, code of conduct, and license to clarify repository rules and expectations.

---

## v0.4.0 — February 20, 2026

### What's New?

#### New Features

- Added a repository settings workflow and new provider APIs for generating text.
- Added tag recovery and safer tag pushes to make releases more resilient.
- Built-in AI-generated release notes with support for saved AI provider and model, and automatic publishing of GitHub Releases when available.
- Added syncing of GitHub Releases for existing tags.
- Added branch base validation and a configurable list of allowed base branches.
- Added a Homebrew formula and tooling to build and publish binaries.
- Added a progress bar for git push during releases.

#### Bug Fixes

- Fixed tag sorting so releases use the correct creation order.
- Improved push error messages and ensure workflows exit on fatal errors.
- Suppressed noisy Node.js experimental warnings from the Copilot subprocess.

#### Other Improvements

- Updated and reorganized release and packaging workflows, including generated version constants and normalized binary paths.
- Trimmed and tidied CHANGELOG and RELEASE.MD to remove outdated history.
- Moved Homebrew formula updates to the tap repository and updated the formula version.
- Added a Bahasa entry to the custom spelling dictionary.
- Minor UI text formatting fix to add a blank line after the saved AI config message.

---

## v0.3.11 — February 20, 2026

### What's New?

#### New Features

- Synchronizes GitHub Releases for existing tags so release pages are created for previously tagged versions.

---

## v0.3.10 — February 20, 2026

### What's New?

#### New Features

- Release notes are now standardized and a GitHub Release will be published automatically when available

---

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
