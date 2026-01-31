# Geeto

> The Next-Gen Git Flow Automation CLI

[![npm version](https://badge.fury.io/js/%40geeto%2Fcore.svg)](https://badge.fury.io/js/%40geeto%2Fcore)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![GitHub issues](https://img.shields.io/github/issues/rust142/geeto)](https://github.com/rust142/geeto/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/rust142/geeto)](https://github.com/rust142/geeto/pulls)
[![GitHub contributors](https://img.shields.io/github/contributors/rust142/geeto)](https://github.com/rust142/geeto/graphs/contributors)
[![GitHub last commit](https://img.shields.io/github/last-commit/rust142/geeto)](https://github.com/rust142/geeto/commits/main)
[![npm downloads](https://img.shields.io/npm/dm/@geeto/core)](https://www.npmjs.com/package/@geeto)

## Features

A production-ready command-line tool for automating Git workflows with intelligent branch naming, Trello integration, and checkpoint recovery.

- **Multiple AI Providers**
  Supports Google Gemini, GitHub Copilot, and OpenRouter.

- **Provider & Model Switching**
  Change AI provider or model directly from branch/commit accept menus and instantly regenerate suggestions.

- **Model Sync & Custom Lists**: Reset model configurations to factory defaults for Gemini, OpenRouter, and Copilot providers. Customize model selection menus by editing `.geeto/*-model.json` files or use the Settings menu to reset models.

- **Smart Branch History Detection**
  Automatically detects branch separators from history (e.g. `dev/feature-name` or `dev#feature-name`) and reuses the most consistent format.

- **Trello Integration**
  Automatically link branches to Trello cards.

- **Smart Commits**
  AI-generated Conventional Commit messages.

- **Checkpoint Recovery**
  Resume interrupted workflows from any step, with compact staged-files preview and detection of externally staged files.

- **AI Retry & Fallback**: Automatically retry generation using a different AI model or provider on failure.

- **Connection Retry**: Automatically retry when AI requests fail due to connection or network errors.

- **Auto Merge**: Automatically merge completed branches into `development` or any configured target branch.

- **Auto Squash & Cleanup**: Automatically squash commits, preserve a clean history graph, and delete merged branches.

- **Cross-Platform Support**
  Works on macOS, Linux, and Windows.

## Installation

```bash
npm install -g geeto
# or
bun install -g geeto
```

### One-line installer (recommended for contributors)

You can use the provided `tools/install.sh` to install dependencies, setup Husky hooks, and (optionally) ensure the `request ai review` label is created.

- Using curl:

```bash
curl -fsSL https://raw.githubusercontent.com/rust142/geeto/main/tools/install.sh | sh -s --
```

- Using wget:

```bash
wget -qO- https://raw.githubusercontent.com/rust142/geeto/main/tools/install.sh | sh -s --
```

Add `--no-label` to skip label creation when running the installer:

```bash
curl -fsSL https://raw.githubusercontent.com/rust142/geeto/main/tools/install.sh | sh -s -- --no-label
```

**Note**: Geeto v0.0.1-beta.0 is currently in beta. For the latest stable release, check the [GitHub releases](https://github.com/rust142/geeto/releases).

## Quick Start

### 1. Choose AI Provider

#### OpenRouter

If you plan to use OpenRouter, configure Geeto with a project-local `.geeto/openrouter.toml` file containing your API key:

```toml
# .geeto/openrouter.toml
openrouter_api_key = "YOUR_API_KEY"
```

#### Gemini API

If you plan to use Google's Gemini API, configure Geeto with a project-local `.geeto/gemini.toml` file containing your API key:

```toml
# .geeto/gemini.toml
gemini_api_key = "YOUR_API_KEY"
```

#### GitHub Copilot

Geeto automatically installs and configures the GitHub Copilot CLI during first use. The setup process:

1. **Automatically installs GitHub CLI** if not present (using the best method for your platform)
2. **Handles authentication** through GitHub CLI's OAuth flow
3. **Installs Copilot CLI** and verifies the installation
4. **Sets up model configurations** automatically

No manual installation or authentication steps are required - Geeto handles everything interactively during the first run.

### 3. Run Geeto

```bash
geeto
```

## Usage

### Main Workflow

Geeto guides you through a 6-step Git automation process:

1. **Stage Changes** - Select files to commit
2. **Create Branch** - AI-powered branch naming
3. **Commit** - Generate commit messages
4. **Push** - Push to remote repository
5. **Merge** - Merge to target branch
6. **Cleanup** - Remove temporary branches

### AI model selection

Model labels in selection menus were simplified to make choices easier to scan; pricing details are intentionally omitted from the interactive menus. Check provider docs for current rates if cost is a concern.

## Roadmap

### Phase 1 (Current)

- ✅ Basic Git workflow automation
- ✅ AI-powered branch naming
- ✅ Multiple AI provider support (Gemini, GitHub Copilot, OpenRouter)
- ✅ Trello integration
- ✅ Checkpoint recovery
- ✅ State file migration to `.geeto/` directory
- ✅ Intelligent rate limit management
- ✅ Cross-platform builds (Linux, macOS, Windows)
- ✅ Simplified Copilot CLI setup with automatic GitHub CLI installation

### Future Development

Geeto is focused on core Git workflow automation. Future enhancements will be driven by community feedback and real user needs.

Have a feature idea? [Open an issue](https://github.com/rust142/geeto/issues) or submit a pull request!

```bash
# Clone repository
git clone https://github.com/rust142/geeto.git
cd geeto

# Install dependencies
bun install

# Build project
bun run build

# Run tests (when available)
bun run test
```

## Requirements

- **Node.js**: >= 18.0.0
- **Bun**: >= 1.0.0 (optional, recommended for development)
- **Git**: >= 2.0
- **Operating System**: macOS, Linux, or Windows

## Development

### Quick Setup

```bash
# Clone repository
git clone https://github.com/rust142/geeto.git
cd geeto

# Install dependencies
bun install

# Build project
bun run build

# Run development version
bun run dev
```

### Available Scripts

| Command                   | Description                      |
| ------------------------- | -------------------------------- |
| `bun run build`           | Compile TypeScript to JavaScript |
| `bun run dev`             | Run development version with Bun |
| `bun run start`           | Run compiled version             |
| `bun run lint`            | Run ESLint code linting          |
| `bun run lint:fix`        | Auto-fix ESLint issues           |
| `bun run format`          | Format code with Prettier        |
| `bun run typecheck`       | Run TypeScript type checking     |
| `bun run geeto:build:all` | Build binaries for all platforms |
| `bun run release:beta`    | Create beta release              |

### Quality Assurance

Geeto maintains high code quality standards with:

- **ESLint**: Code linting and style enforcement
- **Prettier**: Automated code formatting
- **TypeScript**: Static type checking
- **Husky**: Pre-commit hooks for quality gates
- **Commitlint**: Conventional commit message validation
- **Markdownlint**: Documentation formatting

### Cross-Platform Binaries

Pre-built executables are available for:

- **Linux** (`geeto-linux`)
- **macOS** (`geeto-mac`)
- **Windows** (`geeto-windows.exe`)

Build all platforms with: `bun run geeto:build:all`

### CI/CD Pipeline

Geeto uses GitHub Actions for automated quality assurance:

- **Quality Checks**: Linting, formatting, and type checking
- **Security Scanning**: Snyk vulnerability scanning and CodeQL analysis
- **Cross-Platform Testing**: Tests on Node.js 18.x and 20.x
- **Commit Validation**: Conventional commit message linting
- **Auto-labeling**: Automatic PR labeling based on commit types

### Dependency Management

- **Dependabot**: Automated dependency updates (weekly)
- **Audit**: Regular security audits with `bun audit`
- **Lockfiles**: Both `bun.lock` and `yarn.lock` for compatibility

## Contributing

For contribution guidelines and templates, please see the CONTRIBUTING.md file in this repository: [CONTRIBUTING.md](CONTRIBUTING.md)

## Community & Support

- **Documentation**: [Contributing Guide](CONTRIBUTING.md)
- **Bug Reports**: [GitHub Issues](https://github.com/rust142/geeto/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/rust142/geeto/discussions)
- **Discussions**: [GitHub Discussions](https://github.com/rust142/geeto/discussions)
- **Security**: [Security Policy](SECURITY.md)
- **Code of Conduct**: [Code of Conduct](CODE_OF_CONDUCT.md)

### Getting Help

If you need help or have questions:

1. Check the [documentation](CONTRIBUTING.md)
2. Search existing [issues](https://github.com/rust142/geeto/issues) and [discussions](https://github.com/rust142/geeto/discussions)
3. Create a new [issue](https://github.com/rust142/geeto/issues/new/choose) or [discussion](https://github.com/rust142/geeto/discussions/new)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [OpenRouter](https://openrouter.ai/) for AI model access
- [Trello](https://trello.com/) for task management integration
- [Google Gemini](https://ai.google.dev/) for AI capabilities
