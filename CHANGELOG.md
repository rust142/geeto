# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0](https://github.com/rust142/geeto/compare/v1.1.0...v2.0.0) (2026-02-01)

### Bug Fixes

- **actions:** normalize ai_assessments parsing and use env vars ([bfe138e](https://github.com/rust142/geeto/commit/bfe138ee7f6580ddfd69d5751a01d58a3a053580))
- **commit:** write commit message to temp file and use git -F ([7469b91](https://github.com/rust142/geeto/commit/7469b918c3a279d83f2485bb79b505277c0949fc))
- **dangerfile:** resolve Danger API from injected globals or require ([34915a3](https://github.com/rust142/geeto/commit/34915a323c4904ebc2ea70e7b8edd44bec980a97))
- **errors:** normalize catch typing and add AI retry option ([613f250](https://github.com/rust142/geeto/commit/613f250466c288d363abc08b3ccbe92fc1e4e75c))
- **workflow:** make issue detection resilient to missing context/octokit ([f661cee](https://github.com/rust142/geeto/commit/f661cee7d12183e268755dfd1361bf25501501fb))
- **workflows:** use supress_labels key in auto-add-ai-label-on-open.yml ([7cbefbe](https://github.com/rust142/geeto/commit/7cbefbefdc22cfece13863fc20cd9d8608d18936))

### Features

- **actions:** auto-detect category labels on new issues ([ba60f7a](https://github.com/rust142/geeto/commit/ba60f7a512a53c535b4f6469fd860c6d399e4cbd))
- **lint:** add cspell spellcheck and interactive ignore tooling ([27413a2](https://github.com/rust142/geeto/commit/27413a2d4df74974a1b188c5129a10eb562a2d49))
- **workflows:** add 'copilot' label on comment and security heuristic ([33ce89b](https://github.com/rust142/geeto/commit/33ce89bde63d02199fc908d499d9362b59085407))
- **workflows:** add AI reply-on-second-comment workflow and refine heuristics ([db40935](https://github.com/rust142/geeto/commit/db40935c705688943c148c009ed20ef590204246))
- **workflows:** consolidate AI assessments and normalize labels ([059129f](https://github.com/rust142/geeto/commit/059129f8542fc975e34ab030ee7c7372876f24b2))
- **workflows:** limit AI reply to issue author and exclude collaborators ([c041682](https://github.com/rust142/geeto/commit/c041682cffecde2c05f5a2893c3465576d60c4dd))
- **workflows:** post consolidated AI assessment comment on issue open ([b544455](https://github.com/rust142/geeto/commit/b544455dd92ee95c6ce3910c7b29d9c2e0e64260))

## [1.1.0](https://github.com/rust142/geeto/compare/v1.1.0-beta.0...v1.1.0) (2026-01-29)

### Bug Fixes

- **branch:** improve working branch resolution ([7ad767d](https://github.com/rust142/geeto/commit/7ad767d4f0a405fb6937664874eda6b619488dc3))
- **main:** use current branch for push operation ([d153aaa](https://github.com/rust142/geeto/commit/d153aaa630559464e51d97ec8793850ccbc9fb9b))
- **workflow:** reset state if branch changes ([cea3573](https://github.com/rust142/geeto/commit/cea35735286c561bf8796230c309d58f713c7e71))
- **workflows:** add blank line before push to separate output ([ba4c18d](https://github.com/rust142/geeto/commit/ba4c18d0e2221a39b3c799f1a8d6185a1efb4f39))
- **workflows:** make git push robust and avoid interleaved output ([da0a61a](https://github.com/rust142/geeto/commit/da0a61a49c5eddf8170b6942062608ba2afba7c0))
- **workflows:** move blank line after progress update before git push ([9a860c2](https://github.com/rust142/geeto/commit/9a860c285af8239650e1612b5da46dd139625a41))
- **workflows:** remove explicit default from push confirmation prompts ([842243e](https://github.com/rust142/geeto/commit/842243e8bf3856901b65daf8cd5eaad210a3f430))
- **workflows:** remove explicit false default from confirm calls ([0f896d2](https://github.com/rust142/geeto/commit/0f896d27d413b6feb5c5648dd9a41f3e4745e0e0))

### Features

- **branch:** delete remote branch after local deletion ([11718ff](https://github.com/rust142/geeto/commit/11718ff655a39dd725eb2c7c4559bf5d51db99ed))
- **merge:** add merge strategy selection ([c2d567e](https://github.com/rust142/geeto/commit/c2d567e7ae150f58bcb5c5424e20bbe039d7734c))
- **setup:** add interactive setup for Copilot, ([1328f26](https://github.com/rust142/geeto/commit/1328f26f57191962a2fbb25c4c0c5991ec39dcf0))
- **workflow:** enhance merge and branch management ([71a14cc](https://github.com/rust142/geeto/commit/71a14ccdc895c2393097b426c03d85fbf5b2fe57))
- **workflows:** add pre-merge push check and force option ([8af0e4c](https://github.com/rust142/geeto/commit/8af0e4c3abd2a29b002be4c2401fbb6b6e5173f9))
- **workflows:** add push progress bar and refine commit/push/cleanup ([4aa6759](https://github.com/rust142/geeto/commit/4aa6759e0e6fcf00b9f1928700fd2bc4d394089a))
- **workflows:** show git push progress and remote URL ([8b17d53](https://github.com/rust142/geeto/commit/8b17d53614622cee00d353accc28b0b17aa7c825))

### Bug Fixes

- add --ci flag to release scripts for non-interactive mode ([f5ccb72](https://github.com/rust142/geeto/commit/f5ccb72140e8f9dde46ec50fa59c1ffb866b73fc))
- disable npm publish for GitHub-only releases ([3914830](https://github.com/rust142/geeto/commit/3914830ccab81ebbb5b53b7804e8429a56813a96))
- remove invalid releaseNotes config ([027eb9f](https://github.com/rust142/geeto/commit/027eb9f3cb0cfde2bb9cddb78defc5eaf744d3c5))

### Features

- initial commit ([f268e9c](https://github.com/rust142/geeto/commit/f268e9c638bf587816450a600962ff3cb4f6d888))

## [Unreleased]

### Added

- Initial release of Geeto CLI
- AI-powered branch naming with multiple providers (Gemini, GitHub Copilot, OpenRouter)
- Trello integration for project management
- Checkpoint recovery system for interrupted workflows
- Cross-platform builds (Linux, macOS, Windows)
- Comprehensive linting and code quality standards
- Conventional commit enforcement
- Automated release management
- GitHub Actions CI/CD pipeline
- Branch protection and naming conventions

### Technical Improvements

- TypeScript strict mode configuration
- ESLint zero-warning policy
- Prettier code formatting
- Husky pre-commit hooks
- Commitlint for conventional commits
- Security scanning and vulnerability checks
- CodeQL security analysis
- Dependabot automated dependency updates

### Documentation

- Comprehensive README with installation and usage guides
- Contributing guidelines with development standards
- Code of Conduct for community standards
- Security policy for vulnerability reporting
- Issue and PR templates for structured feedback
