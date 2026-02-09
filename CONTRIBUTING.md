# Contributing to Geeto

Thank you for contributing to Geeto! This guide will help you get started quickly.

## Prerequisites

- Node.js ≥ 18.0
- Bun ≥ 1.0
- Git ≥ 2.0

## Setup

```bash
git clone https://github.com/rust142/geeto.git
cd geeto
bun install
bun run build
```

## Development Workflow

1. **Create branch** following naming convention (see below)
2. **Make changes** with clear, focused commits
3. **Test locally** - `bun run dev`
4. **Run checks** - `bun run check:fast && bun run check:full`
5. **Submit PR** to `develop` branch

## Branch Naming

All branches must use: `dev#<description>`

**Format:**

- Lowercase only
- Hyphens for spaces
- 3-5 words maximum
- Descriptive and clear

**Examples:**

✅ Good:

- `dev#add-trello-integration`
- `dev#fix-commit-message-generation`
- `dev#update-readme`

❌ Bad:

- `feature/trello` (wrong prefix)
- `fix-bug` (no prefix, vague)
- `dev#this-is-a-very-long-branch-name` (too long)

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>: <description>

[optional body]
```

**Types:**

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code refactoring
- `test:` Tests
- `chore:` Build/tooling

**Examples:**

```text
feat: add OpenRouter provider support

fix: handle API timeout errors gracefully

docs: update installation instructions
```

## Code Standards

### TypeScript

- Strict type safety - no `any` unless absolutely necessary
- Export interfaces and types
- Use meaningful variable names

### Style

- Run `bun run format` before committing
- Follow existing code patterns
- Keep functions focused and small

## Testing

```bash
# Type checking
bun run typecheck

# Linting
bun run lint

# Full check
bun run check:fast
bun run check:full
```

## Pull Request Guidelines

1. **Target `develop` branch** - Both `main` and `develop` are protected
2. **One feature per PR** - Keep PRs focused
3. **Update documentation** if needed
4. **Pass all checks** - CI must be green
5. **Respond to feedback** promptly

### PR Template

```markdown
## Description

Brief description of changes

## Type

- [ ] Feature
- [ ] Bug fix
- [ ] Documentation
- [ ] Refactor

## Checklist

- [ ] Code follows style guidelines
- [ ] Tests pass locally
- [ ] Documentation updated (if needed)
```

## Project Structure

```text
src/
├── api/          # Trello, AI provider integrations
├── cli/          # Interactive CLI components
├── core/         # Setup, constants
├── types/        # TypeScript interfaces
├── utils/        # Utilities (git, config, logging)
└── workflows/    # Main workflow logic
```

## Need Help?

- [Open an issue](https://github.com/rust142/geeto/issues)
- Check [existing issues](https://github.com/rust142/geeto/issues)
- Read the [README](README.md)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
