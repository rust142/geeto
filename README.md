# Geeto

> AI-Powered Git Workflow Automation

[![Support Palestine](https://raw.githubusercontent.com/Safouene1/support-palestine-banner/master/banner-support.svg)](https://kitabisa.com/campaign/celenganwargapalestina)

[![StandWithPalestine badge](https://raw.githubusercontent.com/Safouene1/support-palestine-banner/master/StandWithPalestine.svg)](https://s.id/standwithpalestine)
[![npm version](https://badge.fury.io/js/geeto.svg)](https://badge.fury.io/js/geeto)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Streamline your Git workflow with intelligent branch naming, commit messages, and Trello integration—powered by AI (Gemini, GitHub Copilot, OpenRouter).

## Features

- **Multiple AI Providers** - Gemini, GitHub Copilot, OpenRouter
- **Smart Branch Naming** - AI-generated branch names from diffs or Trello cards
- **Conventional Commits** - Auto-generated commit messages following best practices
- **Trello Integration** - Link branches to Trello cards, generate task lists for AI agents
- **Checkpoint Recovery** - Resume interrupted workflows from any step
- **Cross-Platform** - macOS, Linux, Windows

## Installation

### NPM/Bun

```bash
npm install -g geeto
# or
bun install -g geeto
```

### From Source

```bash
curl -fsSL https://raw.githubusercontent.com/rust142/geeto/main/tools/install.sh | bash -s -- --no-label
```

**Requirements:** Node.js ≥ 18, Bun ≥ 1.0, Git ≥ 2.0

## Uninstallation

### NPM/Bun

```bash
npm uninstall -g geeto
# or
bun remove -g geeto
```

### From Source

```bash
curl -fsSL https://raw.githubusercontent.com/rust142/geeto/main/tools/uninstall.sh | bash
```

## Quick Start

### 1. Run

```bash
geeto
```

On first run, Geeto will automatically guide you through AI provider setup:

- **Gemini** - Enter your API key (get one at [Google AI Studio](https://makersuite.google.com/app/apikey))
- **OpenRouter** - Enter your API key (get one at [OpenRouter](https://openrouter.ai/keys))
- **GitHub Copilot** - Auto-configured (requires [GitHub CLI](https://cli.github.com/))

All configurations are saved locally in `.geeto/` directory.

### 2. Follow the Workflow

Geeto guides you through 6 steps:

1. **Stage** - Select files to commit
2. **Branch** - AI-generated branch name
3. **Commit** - AI-generated commit message
4. **Push** - Push to remote
5. **Merge** - Merge to target branch
6. **Cleanup** - Delete merged branches

### CLI Flags

```bash
geeto --stage          # Start from stage step
geeto --branch         # Start from branch creation
geeto --commit         # Start from commit step
geeto --push           # Start from push step
geeto --merge          # Start from merge step
geeto --cleanup        # Branch cleanup workflow
geeto --trello         # Trello integration menu
geeto --settings       # Configure AI providers
```

### Trello Integration

Generate task instruction files for AI agents:

```bash
geeto --trello-generate
```

Creates `.github/instructions/tasks.instructions.md` (VSCode) or editor-specific paths with:

- Step-by-step task list from Trello
- AI agent instructions (execute one task at a time)
- Backend/Frontend best practices

## Development

```bash
# Setup
git clone https://github.com/rust142/geeto.git
cd geeto
bun install

# Build
bun run build

# Development mode
bun run dev

# Lint & Type Check
bun run check:fast
bun run check:full
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a branch: `dev#your-feature`
3. Make your changes
4. Run tests: `bun run check:fast && bun run check:full`
5. Submit a Pull Request to `develop` branch

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Support

If you find Geeto helpful, consider supporting the project:

- ☕ [Buy me a coffee on Saweria](https://saweria.co/rust142)
- ⭐ Star this repository
- 🐛 Report bugs and suggest features
- 📢 Share with others

## License

This project is licensed under the MIT License.
