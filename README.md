# Geeto

> AI-Powered Git Workflow Automation

[![Support Palestine](https://raw.githubusercontent.com/Safouene1/support-palestine-banner/master/banner-support.svg)](https://kitabisa.com/campaign/celenganwargapalestina)

[![StandWithPalestine badge](https://raw.githubusercontent.com/Safouene1/support-palestine-banner/master/StandWithPalestine.svg)](https://s.id/standwithpalestine)
[![npm version](https://badge.fury.io/js/geeto.svg)](https://badge.fury.io/js/geeto)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Streamline your Git workflow with intelligent branch naming, commit messages, and Trello integration—powered by AI (Gemini, GitHub Copilot, OpenRouter).

## Features

- **Multiple AI Providers** — Gemini, GitHub Copilot, OpenRouter
- **Smart Branch Naming** — AI-generated branch names from diffs or Trello cards
- **Conventional Commits** — Auto-generated commit messages following best practices
- **Inline Editor** — Built-in terminal editor with syntax highlighting (no vim needed)
- **Release Manager** — Semver bumping, CHANGELOG.md, RELEASE.MD, and tagging
- **Trello Integration** — Link branches to Trello cards, generate task lists for AI agents
- **Git Tools** — Branch cleanup, switcher, compare, cherry-pick, stash, amend, undo, stats, history
- **GitHub Integration** — Create Pull Requests and Issues from the terminal
- **Checkpoint Recovery** — Resume interrupted workflows from any step
- **Cross-Platform** — macOS, Linux, Windows

## Installation

### Homebrew (macOS / Linux)

```bash
brew tap rust142/geeto
brew install geeto
```

### APT (Debian / Ubuntu)

```bash
# Download .deb from latest release
curl -fsSL "https://github.com/rust142/geeto/releases/latest/download/geeto_$(curl -s https://api.github.com/repos/rust142/geeto/releases/latest | grep tag_name | cut -d '"' -f4 | tr -d v)_amd64.deb" -o geeto.deb
sudo dpkg -i geeto.deb
rm geeto.deb
```

### NPM / Bun

```bash
npm install -g geeto
# or
bun install -g geeto
```

### Binary (manual)

Download the binary for your platform from [Releases](https://github.com/rust142/geeto/releases/latest):

| Platform    | Binary              |
| ----------- | ------------------- |
| macOS x64   | `geeto-mac`         |
| macOS ARM   | `geeto-mac-arm64`   |
| Linux x64   | `geeto-linux`       |
| Linux ARM   | `geeto-linux-arm64` |
| Windows x64 | `geeto-windows.exe` |

```bash
# Example: Linux x64
curl -fsSL https://github.com/rust142/geeto/releases/latest/download/geeto-linux -o geeto
chmod +x geeto
sudo mv geeto /usr/local/bin/
```

### From Source

```bash
curl -fsSL https://raw.githubusercontent.com/rust142/geeto/main/tools/install.sh | bash -s -- --no-label
```

**Requirements:** Git ≥ 2.0

## Uninstallation

```bash
# Homebrew
brew uninstall geeto && brew untap rust142/geeto

# APT / Debian
sudo dpkg -r geeto

# NPM / Bun
npm uninstall -g geeto   # or: bun remove -g geeto

# Binary (manual)
sudo rm /usr/local/bin/geeto

# From source
curl -fsSL https://raw.githubusercontent.com/rust142/geeto/main/tools/uninstall.sh | bash
```

## Quick Start

### 1. Run

```bash
geeto
```

[![Geeto Demo](https://github.com/rust142/geeto/raw/main/images/demo.png)](https://asciinema.org/a/788604)

[see demo](https://asciinema.org/a/788604)

On first run, Geeto will automatically guide you through AI provider setup:

- **Gemini** — Enter your API key (get one at [Google AI Studio](https://makersuite.google.com/app/apikey))
- **OpenRouter** — Enter your API key (get one at [OpenRouter](https://openrouter.ai/keys))
- **GitHub Copilot** — Auto-configured (requires [GitHub CLI](https://cli.github.com/))

All configurations are saved locally in `.geeto/` directory.

### 2. Follow the Workflow

Geeto guides you through 6 steps:

1. **Stage** — Select files to commit
2. **Branch** — AI-generated branch name
3. **Commit** — AI-generated commit message
4. **Push** — Push to remote with progress bar
5. **Merge** — Merge to target branch
6. **Cleanup** — Delete merged branches

## CLI Reference

### Workflow

```bash
geeto                  # Full workflow (stage → branch → commit → push → merge → cleanup)
geeto -s,  --stage     # Stage files interactively
geeto -sa, -as         # Stage all changes automatically
geeto -c,  --commit    # Create a commit with AI message
geeto -b,  --branch    # Create a branch with AI name
geeto -p,  --push      # Push current branch to remote
geeto -m,  --merge     # Merge branches interactively
```

### Git Tools

```bash
geeto -cl,  --cleanup      # Clean up local & remote branches
geeto -sw,  --switch       # Switch branches with fuzzy search
geeto -cmp, --compare      # Compare current branch with another
geeto -cp,  --cherry-pick  # Cherry-pick from another branch
geeto -lg,  --log          # View commit history with timeline
geeto -sh,  --stash        # Manage stashes interactively
geeto -am,  --amend        # Amend the last commit
geeto -u,   --undo         # Undo the last git action safely
geeto -st,  --stats        # Repository statistics dashboard
```

### GitHub

```bash
geeto -pr, --pr    # Create a Pull Request
geeto -i,  --issue # Create an Issue
geeto -t,  --tag   # Release & tag manager with semver
```

### Trello

```bash
geeto -tr, --trello          # Open Trello menu
geeto -tl, --trello-list     # List boards and lists
geeto -tg, --trello-generate # Generate tasks from Trello
```

### Settings

```bash
geeto --setup-gemini       # Configure Gemini AI
geeto --setup-openrouter   # Configure OpenRouter AI
geeto --setup-github       # Configure GitHub token
geeto --setup-trello       # Configure Trello integration
geeto --change-model       # Switch AI provider / model
geeto --sync-models        # Fetch latest model list
geeto --separator          # Set branch name separator
```

### Editor & Options

```bash
geeto <file>       # Open file in inline editor with syntax highlighting
geeto -f, --fresh  # Start fresh (ignore checkpoint)
geeto -r, --resume # Resume from last checkpoint
geeto -v, --version
geeto -h, --help
```

### Trello Integration

Generate task instruction files for AI agents:

```bash
geeto --trello-generate
```

Creates `.github/instructions/tasks.instructions.md` with:

- Step-by-step task list from Trello cards
- AI agent instructions (execute one task at a time, wait for confirmation)
- Backend/Frontend implementation checklists

## Development

```bash
# Setup
git clone https://github.com/rust142/geeto.git
cd geeto
bun install

# Build
bun run build

# Development mode (run from source)
bun run dev

# Lint & Type Check
bun run check:fast    # Quick lint
bun run check:full    # Full typecheck + lint
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a branch: `dev#your-feature`
3. Make your changes
4. Run checks: `bun run check:fast && bun run check:full`
5. Submit a Pull Request to `develop` branch

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Support

If you find Geeto helpful, consider supporting the project:

- ☕ [Buy me a coffee on Saweria](https://saweria.co/rust142)
- ⭐ Star this repository
- 🐛 Report bugs and suggest features
- 📢 Share with others

## License

MIT — see [LICENSE](LICENSE) for details.
