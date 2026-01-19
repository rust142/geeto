# Geeto

> **Git Flow Automation CLI** with AI-powered branch naming and Trello integration

[![npm version](https://badge.fury.io/js/%40geeto%2Fcore.svg)](https://badge.fury.io/js/%40geeto%2Fcore)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![codecov](https://codecov.io/gh/geeto/core/branch/main/graph/badge.svg)](https://codecov.io/gh/geeto/core)
[![GitHub issues](https://img.shields.io/github/issues/geeto/core)](https://github.com/geeto/core/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/geeto/core)](https://github.com/geeto/core/pulls)
[![GitHub contributors](https://img.shields.io/github/contributors/geeto/core)](https://github.com/geeto/core/graphs/contributors)
[![GitHub last commit](https://img.shields.io/github/last-commit/geeto/core)](https://github.com/geeto/core/commits/main)
[![npm downloads](https://img.shields.io/npm/dm/@geeto/core)](https://www.npmjs.com/package/@geeto/core)

A production-ready command-line tool for automating Git workflows with intelligent branch naming, Trello integration, and checkpoint recovery.

## Features

- **Multiple AI Providers**: Google Gemini, GitHub Copilot, or OpenRouter
- **Trello Integration**: Link branches to Trello cards automatically
- **Checkpoint Recovery**: Resume interrupted workflows from any step
- **Smart Commits**: AI-generated conventional commit messages
- **Beautiful CLI**: Fun ASCII art with intuitive navigation
- **Cross-Platform**: Works on macOS, Linux, and Windows

## Installation

```bash
npm install -g @geeto/core
# or
bun install -g @geeto/core
```

## Quick Start

### 1. Choose AI Provider

#### OpenRouter (Cheapest - Recommended)

```bash
# Sign up at https://openrouter.ai/
geeto
# Navigate: Settings → OpenRouter Setup
```

#### Gemini API (Free with limits)

```bash
go install github.com/tfkhdyt/geminicommit@latest
geminicommit config key set YOUR_API_KEY
```

#### GitHub Copilot (Requires subscription)

```bash
curl -fsSL https://gh.io/copilot-install | bash
github-copilot-cli auth
```

### 2. Run Geeto

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

### AI Model Pricing

| Provider | Model | Input Cost | Output Cost | Notes |
| ---------- | ------- | ------------ | ------------- | -------- |
| OpenRouter | Olmo 3.1 32B | $0.20/M | $0.60/M | Cheapest |
| OpenRouter | MiniMax M2.1 | $0.27/M | $1.12/M | Balanced |
| Copilot | Claude Haiku | ~$0.10/M | ~$0.30/M | Fastest |
| Gemini | Free API | Rate limited | Rate limited | No cost |

*Pricing information is approximate and subject to change. Check provider documentation for current rates.*

## Roadmap

### Phase 1 (Current)

- ✅ Basic Git workflow automation
- ✅ AI-powered branch naming
- ✅ Multiple AI provider support (Gemini, GitHub Copilot, OpenRouter)
- ✅ Trello integration
- ✅ Checkpoint recovery
- ✅ Cross-platform builds (Linux, macOS, Windows)
- ✅ Comprehensive linting and type checking
- ✅ Professional code quality standards

### Future Development

Geeto is focused on core Git workflow automation. Future enhancements will be driven by community feedback and real user needs.

Have a feature idea? [Open an issue](https://github.com/geeto/core/issues) or submit a pull request!

```bash
# Clone repository
git clone https://github.com/geeto/core.git
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
- **Bun**: >= 1.0.0 (optional)
- **Git**: >= 2.0

## Contributing

We welcome contributions! Geeto is an ambitious project with lots of exciting features planned. Here's how you can help:

### Ways to Contribute

1. **Bug Reports** - Found a bug? [Open an issue](https://github.com/geeto/core/issues)
2. **Feature Requests** - Have ideas? Check our roadmap above or suggest new features
3. **Code Contributions** - Help implement features from our roadmap
4. **Documentation** - Improve docs, tutorials, or examples
5. **Testing** - Help test new features and report issues

### Commit Conventions

This project uses [Conventional Commits](https://conventionalcommits.org/) for consistent commit messages. Please follow the format:

```text
type(scope): description
```

Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### Development Setup

```bash
# Clone repository
git clone https://github.com/geeto/core.git
cd geeto

# Install dependencies
bun install

# Build project
bun run build

# Run linting
bun run lint

# Run type checking
bun run typecheck
```

### Releases

Geeto uses [release-it](https://github.com/release-it/release-it) for automated versioning and publishing.

```bash
# Interactive release (recommended)
bun run release

# Direct release types
bun run release:patch    # 1.0.0 -> 1.0.1
bun run release:minor    # 1.0.0 -> 1.1.0
bun run release:major    # 1.0.0 -> 2.0.0
```

Release-it automatically:

- Updates version numbers
- Generates changelogs
- Creates GitHub releases
- Publishes to NPM
- Builds cross-platform binaries

### Feature Implementation Priority

Looking to contribute code? Here are some areas that could use improvement:

- **Bug fixes** - Help stabilize existing features
- **Documentation** - Improve docs and examples
- **Testing** - Add comprehensive test coverage
- **Performance** - Optimize CLI responsiveness
- **UI/UX** - Enhance the user interface
- **AI Integration** - Add support for new AI providers
- **Platform Support** - Improve cross-platform compatibility

See our [Contributing Guide](CONTRIBUTING.md) for detailed instructions.

## Community & Support

- **Documentation**: [Contributing Guide](CONTRIBUTING.md)
- **Bug Reports**: [GitHub Issues](https://github.com/geeto/core/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/geeto/core/discussions)
- **Discussions**: [GitHub Discussions](https://github.com/geeto/core/discussions)
- **Security**: [Security Policy](SECURITY.md)
- **Code of Conduct**: [Code of Conduct](CODE_OF_CONDUCT.md)

### Getting Help

If you need help or have questions:

1. Check the [documentation](CONTRIBUTING.md)
2. Search existing [issues](https://github.com/geeto/core/issues) and [discussions](https://github.com/geeto/core/discussions)
3. Create a new [issue](https://github.com/geeto/core/issues/new/choose) or [discussion](https://github.com/geeto/core/discussions/new)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [OpenRouter](https://openrouter.ai/) for AI model access
- [Trello](https://trello.com/) for task management integration
- [Google Gemini](https://ai.google.dev/) for AI capabilities
