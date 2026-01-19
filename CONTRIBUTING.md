# Contributing Guide

Thank you for wanting to contribute to @geeto/core!
This guide helps you set up the development environment and create high-quality contributions.

## Prerequisites

- Node.js >= 18.0.0
- Bun >= 1.0.0
- Git >= 2.0
- Go >= 1.16 (for geminicommit integration)

## Project Status

Geeto is a production-ready Git workflow automation CLI with the following current features:

- ✅ Multiple AI provider support (Gemini, GitHub Copilot, OpenRouter)
- ✅ Trello integration for task management
- ✅ Intelligent branch naming with AI
- ✅ Checkpoint recovery system
- ✅ Cross-platform builds (Linux, macOS, Windows)
- ✅ Comprehensive linting and type checking (ESLint + TypeScript)
- ✅ Professional code quality standards (0 ESLint warnings)

## Setup Development Environment

```bash
# 1. Clone repository
git clone https://github.com/geeto/core.git
cd geeto

# 2. Install dependencies
bun install

# 3. Build project
bun run build

# 4. Verify setup
bun run typecheck
bun run lint
```

## Branch Naming Convention

All branches must follow a consistent naming convention to maintain project organization.

### Branch Prefixes

Use the following prefix for all development work:

- **`dev#`** - All development branches (features, fixes, refactoring, etc.)
  - `dev#user-authentication`
  - `dev#trello-integration`
  - `dev#login-validation-error`
  - `dev#update-readme-installation`
  - `dev#extract-validation-helpers`
  - `dev#update-dependencies`
  - `dev#add-github-actions-workflow`
  - `dev#add-unit-tests-for-utils`

### Branch Naming Rules

1. **Always use lowercase** - No uppercase letters
2. **Use hyphens for separation** - Replace spaces with hyphens
3. **Be descriptive** - Clearly indicate what the branch does
4. **Keep it concise** - Aim for 3-5 words maximum
5. **Start with dev#** - All branches begin with `dev#`

### Examples

```bash
# ✅ Good branch names
git checkout -b dev#add-openrouter-support
git checkout -b dev#handle-api-timeout-errors
git checkout -b dev#update-contribution-guidelines
git checkout -b dev#extract-common-validation
git checkout -b dev#update-typescript-config
git checkout -b dev#add-dependabot-automation
git checkout -b dev#add-e2e-test-suite

# ❌ Bad branch names
git checkout -b feature/add-openrouter-support    # Wrong prefix
git checkout -b fix-bug                          # Wrong prefix, too vague
git checkout -b my-awesome-feature               # No prefix
git checkout -b dev#this-is-a-very-long-branch-name-that-describes-what-this-branch-does-in-excruciating-detail  # Too long
```

### PR Requirements

When creating a Pull Request:

1. **Branch must follow naming convention** - PRs from incorrectly named branches will be rejected
2. **PR title should match commit convention** - Use conventional commit format
3. **Target branch** - Always target `develop` branch (both `main` and `develop` are protected)
4. **Clean commit history** - Squash commits if needed, ensure logical commit progression

## Project Structure

```text
src/
├── types/           # TypeScript interfaces
├── utils/           # Reusable utilities
├── api/             # External API integrations
├── cli/             # User interaction
└── core/            # Core logic

lib/                 # Compiled output (auto-generated)
```

## Development Workflow

### 1. Make Changes

Edit files dalam `src/` directory:

```bash
# Watch mode - auto-compiles on changes
bun run dev
```

### 2. Type Check

Ensure no TypeScript errors:

```bash
bun run typecheck
```

### 3. Build

Compile to JavaScript:

```bash
bun run build
```

### 4. Clean

Remove build artifacts:

```bash
bun run clean
```

## Code Style Guidelines

### TypeScript

- Use strict TypeScript mode (already configured)
- Use type-only imports: `import type { X } from '@/...'`
- Add JSDoc comments for public APIs
- Use meaningful variable names

```typescript
// ✅ Good
import type { GeetoState } from '../types'

/**
 * Get current git branch name
 * @returns Branch name string
 */
export const getCurrentBranch = (): string => {
  return execSilent('git branch --show-current')
}

// ❌ Bad
import { GeetoState } from '../types'
const gb = execSilent('git branch --show-current')
```

### File Organization

- Keep files focused and single-responsibility
- Export everything via index.ts
- Group related exports
- Add file-level JSDoc comments

```typescript
// Good file structure
// src/utils/git.ts

/**
 * Git command utilities
 */

import { execSilent } from './exec'

/** Get current branch name */
export const getCurrentBranch = (): string => { ... }

/** Check if branch exists */
export const branchExists = (branch: string): boolean => { ... }
```

## Adding New Features

### 1. Create New Module

Create in appropriate folder:

```bash
# New utility
src/utils/newfeature.ts

# New API integration
src/api/newapi.ts

# New CLI component
src/cli/newcomponent.ts
```

### 2. Export from Index

Add export to corresponding index.ts:

```typescript
// src/utils/index.ts
export * from './newfeature'
```

### 3. Add JSDoc Comments

```typescript
/**
 * My new function description
 * @param param1 - First parameter
 * @returns Description of return value
 */
export const myNewFunction = (param1: string): boolean => {
  // implementation
}
```

### 4. Update README

Add documentation for new feature in README.md

### 5. Test Locally

```bash
bun run build
bun run typecheck
```

## Module Responsibilities

| Module | Should Have          | Shouldn't Have       |
|--------|----------------------|----------------------|
| types  | Interfaces, types    | Logic, side effects  |
| utils  | Helpers, simple logic| API calls, UI        |
| api    | API integrations     | UI, state management |
| cli    | Input/output         | Business logic       |
| core   | Setup, constants     | Complex logic        |

## Common Patterns

### Logging

```typescript
import { log } from '../utils/logging'

log.info('Information')
log.success('Success!')
log.warn('Warning')
log.error('Error')
```

### Error Handling

```typescript
try {
  const result = execSilent('command')
  log.success('Done')
} catch (error) {
  log.error(`Failed: ${(error as Error).message}`)
  throw error
}
```

### Configuration

```typescript
import { getTrelloConfig, saveBranchStrategyConfig } from '../utils/config'

const config = getTrelloConfig()
if (config.apiKey) {
  // Use config
}
```

## Quality Standards

This project maintains high code quality standards:

- **Zero ESLint warnings** - All code passes strict linting rules
- **TypeScript strict mode** - Full type safety enabled
- **Comprehensive testing** - When test infrastructure is added
- **Cross-platform compatibility** - Works on Linux, macOS, and Windows
- **Security-first approach** - Secure API handling and input validation

## Conventional Commits

This project uses [Conventional Commits](https://conventionalcommits.org/) to ensure consistent commit messages. All commits must follow the conventional commit format:

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code (white-space, formatting, etc)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `build`: Changes that affect the build system or external dependencies
- `ci`: Changes to our CI configuration files and scripts
- `chore`: Other changes that don't modify src or test files

### Commit Examples

```text
feat: add support for OpenRouter AI provider
fix: resolve TypeScript compilation error in git utils
docs: update README with new installation instructions
style: format code with prettier
refactor: extract helper function for AI provider display
perf: optimize branch name generation algorithm
test: add unit tests for git utilities
build: update TypeScript to version 5.0
ci: add GitHub Actions workflow for CI/CD
chore: update dependencies to latest versions
```

### Commit Message Validation

Commits are automatically validated using [commitlint](https://commitlint.js.org/) with husky git hooks. Invalid commit messages will be rejected.

### Code Quality Checks

All code quality checks run automatically in our CI pipeline on every push and pull request. Before submitting PRs, you can run these checks locally:

```bash
bun run lint        # No ESLint warnings
bun run typecheck   # TypeScript compilation passes
bun run build       # Clean build
bun run format      # Code formatting
```

#### CI Pipeline Checks

Our GitHub Actions CI runs the following automated checks:

- **Quality Checks**: ESLint, TypeScript, formatting, and build across multiple Node.js versions
- **Commit Message Validation**: Conventional commits validation on PRs
- **Security Scanning**: Dependency vulnerability checks
- **Cross-platform Testing**: Builds for Linux, macOS, and Windows
- **Automated Releases**: release-it integration for version management

All checks must pass before a PR can be merged.

## CI/CD Pipeline

This project uses GitHub Actions for continuous integration and deployment. The pipeline includes:

### Workflows

1. **CI Workflow** (`.github/workflows/ci.yml`)
   - Runs on pushes to `main`, `develop`, `development` branches
   - Runs on all pull requests
   - Multi-version Node.js testing (18.x, 20.x)
   - Quality checks, security scanning, and automated releases

2. **Dependabot** (`.github/dependabot.yml`)
   - Weekly dependency updates
   - Automated PRs for security updates
   - Separate handling for npm and GitHub Actions

### Branch Protection Rules

The `main` branch has the following protections:

- Requires PR reviews
- Requires status checks to pass
- Requires branches to be up to date
- Includes administrators in restrictions

### Automated Release Process

Automated releases are handled by release-it:

- Conventional commits generate changelogs
- Version bumping follows semantic versioning
- GitHub releases created automatically
- NPM publishing with proper access controls

## Security

- Use `type` imports for types only
- Handle errors gracefully
- Validate inputs when needed
- Use secure API calls (HTTPS)
- Don't commit secrets

## Performance Considerations

- Minimize file I/O
- Cache expensive operations
- Use efficient algorithms
- Avoid deep recursion

## Documentation

When adding features:

1. **JSDoc Comments** - In code
2. **README.md** - Quick examples

## Testing (Future)

When test infrastructure is added:

```bash
bun test
bun test --watch
bun test --coverage
```

## Publishing

Geeto uses [release-it](https://github.com/release-it/release-it) for automated versioning and publishing.

### Release Process

### Release Prerequisites

- Ensure you have NPM publish access to `@geeto/core`
- GitHub repository access with write permissions
- All changes committed and pushed

### Release Commands

```bash
# Patch release (1.0.0 -> 1.0.1)
bun run release:patch

# Minor release (1.0.0 -> 1.1.0)
bun run release:minor

# Major release (1.0.0 -> 2.0.0)
bun run release:major

# Pre-release (beta/alpha)
bun run release:beta
bun run release:alpha

# Interactive release (recommended)
bun run release
```

### What release-it does automatically

1. **Version Bumping**: Updates version in `package.json`
2. **Changelog Generation**: Creates/updates `CHANGELOG.md` with conventional commits
3. **Git Operations**: Creates commit and git tag
4. **GitHub Release**: Creates GitHub release with release notes
5. **NPM Publishing**: Publishes package to npm registry
6. **Cross-platform Builds**: Generates binaries for Linux, macOS, and Windows

### Release Configuration

The release process is configured in `.release-it.json` and includes:

- Pre-release checks (linting, type checking, building)
- Conventional changelog generation
- GitHub release creation
- NPM publishing with public access

## Project Achievements

Recent improvements include:

- **ESLint Integration**: Zero-warning codebase with strict linting rules
- **Type Safety**: Full TypeScript strict mode compliance
- **Cross-Platform**: Native binaries for Linux, macOS, and Windows
- **AI Integration**: Support for Gemini, GitHub Copilot, and OpenRouter
- **Trello Integration**: Seamless task management workflow
- **Code Quality**: Professional standards with comprehensive tooling

## Future Goals

- Add comprehensive test suite
- Implement CI/CD pipeline
- Expand AI provider support
- Add more Git workflow automations
- Improve performance and user experience

## Code Review Process

- Maintainer reviews PR
- TypeScript checks must pass
- Code must follow style guide
- Documentation must be complete
- All checks must pass

## License

All contributions are under MIT license.

---

Thank you for contributing! 🙏
