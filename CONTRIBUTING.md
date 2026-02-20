# Contributing to Geeto

Thank you for your interest in contributing to Geeto! This guide covers everything you need to get started.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- [Git](https://git-scm.com) ≥ 2.0
- [GitHub CLI](https://cli.github.com) (for GitHub features)

## Setup

```bash
git clone https://github.com/rust142/geeto.git
cd geeto
bun install
bun run build
```

## Development Workflow

1. Fork the repository and clone your fork
2. Create a branch following the naming convention (see below)
3. Make changes with clear, focused commits
4. Test locally: `bun run dev`
5. Run checks: `bun run check:fast && bun run check:full`
6. Submit a PR to the `main` branch

## Branch Naming

All branches must use the `dev#<description>` format:

- Lowercase only, hyphens for spaces
- 3-5 words maximum, descriptive and clear

| Example                      | Status                 |
| ---------------------------- | ---------------------- |
| `dev#add-trello-integration` | Good                   |
| `dev#fix-commit-generation`  | Good                   |
| `feature/trello`             | Bad (wrong prefix)     |
| `fix-bug`                    | Bad (no prefix, vague) |

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>: <description>

[optional body]
```

| Type        | Description                               |
| ----------- | ----------------------------------------- |
| `feat:`     | New feature                               |
| `fix:`      | Bug fix                                   |
| `docs:`     | Documentation changes                     |
| `refactor:` | Code refactoring                          |
| `test:`     | Adding or updating tests                  |
| `chore:`    | Build, tooling, or config changes         |
| `perf:`     | Performance improvements                  |
| `style:`    | Code style (formatting, semicolons, etc.) |

## Code Standards

### TypeScript

- Strict type safety — no `any` unless absolutely necessary
- Export interfaces and types properly
- Use meaningful, descriptive variable names
- Follow existing patterns in similar files

### Style

- Run `bun run format` before committing
- Follow existing code patterns exactly
- Keep functions focused and small
- Add JSDoc comments for public functions

### Linting

```bash
bun run check:fast     # Quick lint (ESLint + Prettier)
bun run check:full     # Full typecheck + lint + spell check
bun run typecheck      # TypeScript type checking only
bun run lint           # ESLint only
bun run format         # Format with Prettier
```

## Pull Request Guidelines

1. **One feature per PR** — keep PRs focused and reviewable
2. **Update documentation** if your changes affect user-facing behavior
3. **Pass all checks** — CI must be green before merging
4. **Respond to feedback** promptly

## Project Structure

```text
src/
├── api/          # AI provider SDKs (Gemini, Copilot, OpenRouter) & Trello API
├── cli/          # Interactive CLI components (select menu, input, prompts)
├── core/         # Setup flows, constants, menu definitions
├── types/        # TypeScript interfaces and type definitions
├── utils/        # Utilities (git commands, config, logging, colors, exec)
└── workflows/    # Main workflow logic (commit, branch, release, merge, etc.)
```

| Directory    | Key Files                                                              |
| ------------ | ---------------------------------------------------------------------- |
| `api/`       | `gemini-sdk.ts`, `copilot-sdk.ts`, `openrouter-sdk.ts`, `trello.ts`    |
| `cli/`       | `input.ts` (prompts), `menu.ts` (select menus)                         |
| `core/`      | `setup.ts` (provider setup), `constants.ts`                            |
| `utils/`     | `git.ts`, `git-ai.ts`, `config.ts`, `state.ts`, `exec.ts`              |
| `workflows/` | `commit.ts`, `branch.ts`, `release.ts`, `merge.ts`, `repo-settings.ts` |

## Adding a New AI Provider

1. Create `src/api/<provider>-sdk.ts` with the SDK implementation
2. Create `src/api/<provider>.ts` as a wrapper with standard exports
3. Add provider to `src/utils/git-ai.ts` (model selection, text generation)
4. Add setup flow in `src/core/<provider>-setup.ts`
5. Register in `src/core/setup.ts` and `src/index.ts`

## Adding a New Command

1. Create workflow in `src/workflows/<command>.ts`
2. Register flag in `src/index.ts` (short + long form)
3. Add to help text in `src/index.ts`
4. Update README.md CLI Reference table

## Need Help?

- [Open an issue](https://github.com/rust142/geeto/issues)
- Check [existing issues](https://github.com/rust142/geeto/issues?q=is%3Aissue)
- Read the [README](README.md)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
