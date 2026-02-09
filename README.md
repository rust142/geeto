# Geeto

> AI-Powered Git Workflow Automation

[![npm version](https://badge.fury.io/js/%40geeto%2Fcore.svg)](https://badge.fury.io/js/%40geeto%2Fcore)
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
npm install -g @geeto/core
# or
bun install -g @geeto/core
```

### From Source

```bash
curl -fsSL https://raw.githubusercontent.com/rust142/geeto/main/tools/install.sh | sh -s -- --no-label
```

**Requirements:** Node.js ≥ 18, Bun ≥ 1.0, Git ≥ 2.0

## Uninstallation

### NPM/Bun

```bash
npm uninstall -g @geeto/core
# or
bun remove -g @geeto/core
```

### From Source

```bash
curl -fsSL https://raw.githubusercontent.com/rust142/geeto/main/tools/uninstall.sh | sh
```

## Quick Start

### 1. Configure AI Provider

Choose one:

**Gemini** - Create `.geeto/gemini.toml`:

```toml
gemini_api_key = "YOUR_API_KEY"
```

**OpenRouter** - Create `.geeto/openrouter.toml`:

```toml
openrouter_api_key = "YOUR_API_KEY"
```

**GitHub Copilot** - Auto-configured on first run (requires GitHub CLI)

### 2. Run

```bash
geeto
```

## Usage

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

## License

MIT © [Agung Maulana Malik](https://github.com/rust142)

## Links

- [Issues](https://github.com/rust142/geeto/issues)
- [Pull Requests](https://github.com/rust142/geeto/pulls)
- [NPM Package](https://www.npmjs.com/package/@geeto/core)
