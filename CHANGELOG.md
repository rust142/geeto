# Changelog

## [0.3.8](https://github.com/rust142/geeto/compare/v0.3.7...v0.3.8) (2026-02-20)

### Features

* feat(release): add AI-generated release notes via providers ([41d3e0b](https://github.com/rust142/geeto/commit/41d3e0b))

### Other Changes

* chore(release): v0.3.8 ([ad07150](https://github.com/rust142/geeto/commit/ad07150))
* chore(cspell): add Bahasa to custom dictionary ([4d557b0](https://github.com/rust142/geeto/commit/4d557b0))

## [0.3.7](https://github.com/rust142/geeto/compare/v0.3.6...v0.3.7) (2026-02-20)

### Other Changes

* chore(release): v0.3.7 ([20b2133](https://github.com/rust142/geeto/commit/20b2133))
* chore(release): add generated VERSION constant and update release workflow ([f2f70ef](https://github.com/rust142/geeto/commit/f2f70ef))
* docs(release): trim RELEASE.MD history and remove outdated Homebrew/workflow notes ([0d31bf6](https://github.com/rust142/geeto/commit/0d31bf6))

## [0.3.6](https://github.com/rust142/geeto/compare/v0.3.5...v0.3.6) (2026-02-20)

### Features

* feat(branch): add allowedBases config and branch base validation ([c6460cf](https://github.com/rust142/geeto/commit/c6460cf))

### Bug Fixes

* fix(workflows): improve push error messages and exit on fatal error ([05f8b64](https://github.com/rust142/geeto/commit/05f8b64))

### Other Changes

* chore(release): v0.3.6 ([1371edc](https://github.com/rust142/geeto/commit/1371edc))
* Merge branch 'main' of github.com:rust142/geeto ([1abbb50](https://github.com/rust142/geeto/commit/1abbb50))
* chore(brew): move Homebrew formula updates to tap repo ([238635a](https://github.com/rust142/geeto/commit/238635a))

## [0.3.5](https://github.com/rust142/geeto/compare/v0.3.4...v0.3.5) (2026-02-20)

### Features

* feat(brew): add Homebrew formula and update CI/.gitignore ([e3f80e7](https://github.com/rust142/geeto/commit/e3f80e7))

### Bug Fixes

* fix(copilot-sdk): suppress Node.js experimental warnings from copilot subprocess ([645ae75](https://github.com/rust142/geeto/commit/645ae75))

### Other Changes

* chore(release): v0.3.5 ([b76e443](https://github.com/rust142/geeto/commit/b76e443))
* ci(publish-binaries): add workflow_dispatch tag input and use RELEASE_TAG ([176b383](https://github.com/rust142/geeto/commit/176b383))

## [0.3.4](https://github.com/rust142/geeto/compare/v0.3.3...v0.3.4) (2026-02-20)

### Other Changes

* chore(release): v0.3.4 ([e58ab05](https://github.com/rust142/geeto/commit/e58ab05))
* ci(publish-binaries): generate Homebrew formula using env vars and heredoc ([97efaa9](https://github.com/rust142/geeto/commit/97efaa9))
* ci(release): remove GitHub Actions release workflow ([69a3706](https://github.com/rust142/geeto/commit/69a3706))

## [0.3.3](https://github.com/rust142/geeto/compare/v0.3.2...v0.3.3) (2026-02-20)

### Other Changes

* chore(release): v0.3.3 ([0172211](https://github.com/rust142/geeto/commit/0172211))
* docs(release): trim RELEASE.MD release history ([6cacdbb](https://github.com/rust142/geeto/commit/6cacdbb))
* chore(package.json): normalize geeto bin path ([5f5d347](https://github.com/rust142/geeto/commit/5f5d347))

## [0.3.2](https://github.com/rust142/geeto/compare/v0.3.1...v0.3.2) (2026-02-20)

### Features

* feat(release): add build & publish binaries workflow and packaging ([c8cdba2](https://github.com/rust142/geeto/commit/c8cdba2))

### Other Changes

* chore(release): v0.3.2 ([e7498c5](https://github.com/rust142/geeto/commit/e7498c5))

## [0.3.1](https://github.com/rust142/geeto/compare/v0.3.0...v0.3.1) (2026-02-19)

### Features

* feat(release): add progress bar for git push in release workflow ([bb0afe4](https://github.com/rust142/geeto/commit/bb0afe4))

### Other Changes

* chore(release): v0.3.1 ([2be2863](https://github.com/rust142/geeto/commit/2be2863))
* chore: release v0.1.1 ([152c99c](https://github.com/rust142/geeto/commit/152c99c))
* chore: release v0.1.0 ([e841ee6](https://github.com/rust142/geeto/commit/e841ee6))

## [0.3.0](https://github.com/rust142/geeto/compare/v0.1.1...v0.3.0) (2026-02-19)

### Features

* feat(cli): add inline terminal editor for editing files and commits ([9192e84](https://github.com/rust142/geeto/commit/9192e84))
* feat(display): add boxed UI, file status badges, and step progress ([58413a0](https://github.com/rust142/geeto/commit/58413a0))
* feat(cli): add short flag aliases and improve help output ([73dcb62](https://github.com/rust142/geeto/commit/73dcb62))
* feat(release): add release/tag manager workflow and --tag CLI flag ([1bbee32](https://github.com/rust142/geeto/commit/1bbee32))
* feat(undo): add interactive undo last action workflow ([8394003](https://github.com/rust142/geeto/commit/8394003))
* feat(cli): add --stats command and repository statistics dashboard ([c57c641](https://github.com/rust142/geeto/commit/c57c641))
* feat(amend): add interactive commit amend workflow ([0eb6b15](https://github.com/rust142/geeto/commit/0eb6b15))
* feat(stash): add interactive stash manager ([d831b0c](https://github.com/rust142/geeto/commit/d831b0c))
* feat(history): add interactive commit history viewer ([482baa4](https://github.com/rust142/geeto/commit/482baa4))
* feat(github): add interactive PR and Issue workflows ([38edaf5](https://github.com/rust142/geeto/commit/38edaf5))
* feat(cli): add interactive cherry-pick workflow ([ee94690](https://github.com/rust142/geeto/commit/ee94690))
* feat(workflows): add interactive branch compare command ([84d2bc5](https://github.com/rust142/geeto/commit/84d2bc5))
* feat(cli): add interactive branch switcher and improve menu rendering ([31991e0](https://github.com/rust142/geeto/commit/31991e0))
* feat(config): add custom protected branches ([b8f62a6](https://github.com/rust142/geeto/commit/b8f62a6))
* feat(workflows): include branch age and sort branches by staleness ([162c19c](https://github.com/rust142/geeto/commit/162c19c))
* feat(cli): improve multiSelect rendering and add commit selection in security gate ([464b30a](https://github.com/rust142/geeto/commit/464b30a))
* feat(cli): add range selection and clickable branch links ([03af60c](https://github.com/rust142/geeto/commit/03af60c))
* feat(trello): add checklist support and multi-select card selection ([1c3ba79](https://github.com/rust142/geeto/commit/1c3ba79))
* feat(workflows): add Security & Quality Gate workflow ([296aca9](https://github.com/rust142/geeto/commit/296aca9))
* feat(cli): add searchable select menu and structured UI helpers ([687ff52](https://github.com/rust142/geeto/commit/687ff52))
* feat(install): add uninstall script and enhance installer ([d06e1c9](https://github.com/rust142/geeto/commit/d06e1c9))
* feat(workflows): improve checkpoint flow and staged-files preview ([3b5006b](https://github.com/rust142/geeto/commit/3b5006b))
* feat(trello): include card descriptions in API, types, and menu ([4f70889](https://github.com/rust142/geeto/commit/4f70889))
* feat(ai): improve Copilot install flow and AI error handling ([1de855f](https://github.com/rust142/geeto/commit/1de855f))
* feat(workflows): add AI-agent safety instructions and numbered tasks to Trello export ([c6a2b13](https://github.com/rust142/geeto/commit/c6a2b13))
* feat(workflows): add AI English translation and context-aware safeCheckout ([c23f91f](https://github.com/rust142/geeto/commit/c23f91f))
* feat(workflows): pass geminiModel to correction helper ([ed11277](https://github.com/rust142/geeto/commit/ed11277))
* feat(branch-helpers): prompt and persist AI provider and model for title-ai ([e5dd294](https://github.com/rust142/geeto/commit/e5dd294))
* feat(trello): generate tasks.instructions.md from Trello lists ([8362a84](https://github.com/rust142/geeto/commit/8362a84))
* feat(trello): add Trello menu, CLI flags and list command ([07044e7](https://github.com/rust142/geeto/commit/07044e7))
* feat(branch): offer to stage changes when no staged files ([1ac151c](https://github.com/rust142/geeto/commit/1ac151c))
* feat(cleanup): add interactive branch cleanup workflow ([9bfeb63](https://github.com/rust142/geeto/commit/9bfeb63))
* feat(git): add safe git error handling and integrate into workflows ([beed78c](https://github.com/rust142/geeto/commit/beed78c))
* feat(cli): add --stage-all option to auto-stage changes ([b8ea7c3](https://github.com/rust142/geeto/commit/b8ea7c3))
* feat(cli): improve UX and AI provider robustness ([985ab4a](https://github.com/rust142/geeto/commit/985ab4a))
* feat(workflows): display push progress and remote URL before push ([9c818dd](https://github.com/rust142/geeto/commit/9c818dd))
* feat(exec): add execAsync and integrate into push flow ([da54630](https://github.com/rust142/geeto/commit/da54630))
* feat(workflows): add 'copilot' label on comment and security heuristic ([33ce89b](https://github.com/rust142/geeto/commit/33ce89b))
* feat(workflows): limit AI reply to issue author and exclude collaborators ([c041682](https://github.com/rust142/geeto/commit/c041682))
* feat(workflows): add AI reply-on-second-comment workflow and refine heuristics ([db40935](https://github.com/rust142/geeto/commit/db40935))
* feat(workflows): post consolidated AI assessment comment on issue open ([b544455](https://github.com/rust142/geeto/commit/b544455))
* feat(workflows): consolidate AI assessments and normalize labels ([059129f](https://github.com/rust142/geeto/commit/059129f))
* feat(actions): auto-detect category labels on new issues ([ba60f7a](https://github.com/rust142/geeto/commit/ba60f7a))
* feat(lint): add cspell spellcheck and interactive ignore tooling ([27413a2](https://github.com/rust142/geeto/commit/27413a2))
* feat(workflows): add pre-merge push check and force option ([8af0e4c](https://github.com/rust142/geeto/commit/8af0e4c))
* feat(workflows): add push progress bar and refine commit/push/cleanup ([4aa6759](https://github.com/rust142/geeto/commit/4aa6759))
* feat(workflows): show git push progress and remote URL ([8b17d53](https://github.com/rust142/geeto/commit/8b17d53))
* feat: haha kalem ([68a3215](https://github.com/rust142/geeto/commit/68a3215))
* feat: update major ([ac1f0ca](https://github.com/rust142/geeto/commit/ac1f0ca))
* feat(setup): add interactive setup for Copilot, ([1328f26](https://github.com/rust142/geeto/commit/1328f26))
* feat(merge): add merge strategy selection ([c2d567e](https://github.com/rust142/geeto/commit/c2d567e))
* feat(workflow): enhance merge and branch management ([71a14cc](https://github.com/rust142/geeto/commit/71a14cc))
* feat(branch): delete remote branch after local deletion ([11718ff](https://github.com/rust142/geeto/commit/11718ff))
* feat: initial commit ([f268e9c](https://github.com/rust142/geeto/commit/f268e9c))

### Bug Fixes

* fix(git): pass true to exec and silence push/branch logs ([1e82045](https://github.com/rust142/geeto/commit/1e82045))
* fix(workflows): pass true flag to exec when deleting local branches ([a5562d8](https://github.com/rust142/geeto/commit/a5562d8))
* fix(workflows): avoid logging 'Unknown' step when resuming workflow ([b4a4a6c](https://github.com/rust142/geeto/commit/b4a4a6c))
* fix(api): force newline before error/warn logs to separate from spinner ([7a2cf46](https://github.com/rust142/geeto/commit/7a2cf46))
* fix(workflows): ensure spinner/newline separation and refine staged preview ([efa35ce](https://github.com/rust142/geeto/commit/efa35ce))
* fix(workflows): improve interactive cleanup force-delete flow and errors ([7bb6d99](https://github.com/rust142/geeto/commit/7bb6d99))
* fix(workflows): preserve AI provider state after cleanup and add Trello agent tip ([90e0fff](https://github.com/rust142/geeto/commit/90e0fff))
* fix(git): treat branch creation as safe for checkout and improve cleanup messages ([e7576a1](https://github.com/rust142/geeto/commit/e7576a1))
* fix(workflows): initialize progress bar at start of push ([7b01a3a](https://github.com/rust142/geeto/commit/7b01a3a))
* fix(main-steps): remove redundant progress updates and improve development creation ([34ab22d](https://github.com/rust142/geeto/commit/34ab22d))
* fix(workflows): increase progress bar granularity for git pushes ([20f37f4](https://github.com/rust142/geeto/commit/20f37f4))
* fix(workflows): add newline after progress updates to avoid output interleaving ([cbc52a5](https://github.com/rust142/geeto/commit/cbc52a5))
* fix(exec): stop silencing git push and command checks ([08b0e32](https://github.com/rust142/geeto/commit/08b0e32))
* fix(workflows): add main and master to protected branches ([52448b5](https://github.com/rust142/geeto/commit/52448b5))
* fix(workflows): exclude current and feature branches from merge targets ([c5d9b54](https://github.com/rust142/geeto/commit/c5d9b54))
* fix(cspell): improve spellcheck scripts, use bun in lint-staged, clean pre-push ([a113a2c](https://github.com/rust142/geeto/commit/a113a2c))
* fix(dangerfile): resolve Danger API from injected globals or require ([34915a3](https://github.com/rust142/geeto/commit/34915a3))
* fix(workflows): use supress_labels key in auto-add-ai-label-on-open.yml ([7cbefbe](https://github.com/rust142/geeto/commit/7cbefbe))
* fix(actions): normalize ai_assessments parsing and use env vars ([bfe138e](https://github.com/rust142/geeto/commit/bfe138e))
* fix(workflow): make issue detection resilient to missing context/octokit ([f661cee](https://github.com/rust142/geeto/commit/f661cee))
* fix(commit): write commit message to temp file and use git -F ([7469b91](https://github.com/rust142/geeto/commit/7469b91))
* fix(errors): normalize catch typing and add AI retry option ([613f250](https://github.com/rust142/geeto/commit/613f250))
* fix(workflows): make git push robust and avoid interleaved output ([da0a61a](https://github.com/rust142/geeto/commit/da0a61a))
* fix(workflows): move blank line after progress update before git push ([9a860c2](https://github.com/rust142/geeto/commit/9a860c2))
* fix(workflows): add blank line before push to separate output ([ba4c18d](https://github.com/rust142/geeto/commit/ba4c18d))
* fix(workflows): remove explicit false default from confirm calls ([0f896d2](https://github.com/rust142/geeto/commit/0f896d2))
* fix(workflows): remove explicit default from push confirmation prompts ([842243e](https://github.com/rust142/geeto/commit/842243e))
* fix(main): use current branch for push operation ([d153aaa](https://github.com/rust142/geeto/commit/d153aaa))
* fix(branch): improve working branch resolution ([7ad767d](https://github.com/rust142/geeto/commit/7ad767d))
* fix(workflow): reset state if branch changes ([cea3573](https://github.com/rust142/geeto/commit/cea3573))
* fix: remove invalid releaseNotes config ([027eb9f](https://github.com/rust142/geeto/commit/027eb9f))
* fix: add --ci flag to release scripts for non-interactive mode ([f5ccb72](https://github.com/rust142/geeto/commit/f5ccb72))
* fix: disable npm publish for GitHub-only releases ([3914830](https://github.com/rust142/geeto/commit/3914830))

### Other Changes

* chore(release): v0.3.0 ([94b7715](https://github.com/rust142/geeto/commit/94b7715))
* chore(release): add --no-verify to release commit and use H2 changelog header ([1ba0a34](https://github.com/rust142/geeto/commit/1ba0a34))
* chore(workflows): remove interactive UI tips and noisy logs ([27698d5](https://github.com/rust142/geeto/commit/27698d5))
* refactor(workflows): remove noisy AI provider logs and streamline README quick start ([e438abc](https://github.com/rust142/geeto/commit/e438abc))
* docs(repo): overhaul CONTRIBUTING and README; add install.sh ([11ff50d](https://github.com/rust142/geeto/commit/11ff50d))
* docs(workflows/trello-menu): add implementation checklists for backend and frontend ([a4100f5](https://github.com/rust142/geeto/commit/a4100f5))
* refactor(core): extract Copilot utilities and add shared helpers ([c4ef184](https://github.com/rust142/geeto/commit/c4ef184))
* refactor(trello-menu): use log.step for Trello lists header ([43a4f73](https://github.com/rust142/geeto/commit/43a4f73))
* refactor: code structure for improved readability and maintainability ([4a08758](https://github.com/rust142/geeto/commit/4a08758))
* style(prettier): normalize plugins array and add trailing comma ([78416ee](https://github.com/rust142/geeto/commit/78416ee))
* refactor(workflows): remove redundant progressBar.update(0) calls ([bd9799a](https://github.com/rust142/geeto/commit/bd9799a))
* style(workflows): normalize console spacing around prompts and push progress ([d819ec0](https://github.com/rust142/geeto/commit/d819ec0))
* ci: switch quality-checks to Bun-only (avoid Node 18 runtime) ([4e9e076](https://github.com/rust142/geeto/commit/4e9e076))
* chore: release v2.0.0 ([3941650](https://github.com/rust142/geeto/commit/3941650))
* chore(deps): upgrade dependencies and migrate to flat ESLint config ([1739ad0](https://github.com/rust142/geeto/commit/1739ad0))
* ci(release): use GH_TOKEN for GitHub CLI auth in release workflow ([d22a2e6](https://github.com/rust142/geeto/commit/d22a2e6))
* ci(release): authenticate GitHub CLI and fix PR listing ([36cf96f](https://github.com/rust142/geeto/commit/36cf96f))
* ci(danger): restrict workflow to pull_request and remove ESM dangerfile ([4d8eb18](https://github.com/rust142/geeto/commit/4d8eb18))
* ci(danger): add push trigger for main and develop ([c5597f0](https://github.com/rust142/geeto/commit/c5597f0))
* refactor(dangerfile): convert to CommonJS loader and simplify commitlint imports ([7de5bf4](https://github.com/rust142/geeto/commit/7de5bf4))
* refactor(danger): avoid top-level await for commitlint imports ([dd6c028](https://github.com/rust142/geeto/commit/dd6c028))
* style(dangerfile): remove trailing blank lines ([58abcc2](https://github.com/rust142/geeto/commit/58abcc2))
* chore(danger): migrate dangerfile to ESM with CJS wrapper ([ae233a7](https://github.com/rust142/geeto/commit/ae233a7))
* ci(danger): switch Danger workflow to Bun ([187eef9](https://github.com/rust142/geeto/commit/187eef9))
* chore(ci): migrate Danger workflow from Bun to Node/npm ([b1d1fb2](https://github.com/rust142/geeto/commit/b1d1fb2))
* ci(danger): switch Danger workflow to Bun ([d545041](https://github.com/rust142/geeto/commit/d545041))
* ci(commitlint): remove --stdin flag from commitlint workflow commands ([6f26d5b](https://github.com/rust142/geeto/commit/6f26d5b))
* ci(commitlint): lint commits via stdin and fetch SHAs for CI ([8e6b21a](https://github.com/rust142/geeto/commit/8e6b21a))
* refactor(workflows): consolidate copilot AI labeling and assessment workflow ([c1f01a9](https://github.com/rust142/geeto/commit/c1f01a9))
* ci(workflows): trigger AI assessment workflow for newly opened issues ([26b16bd](https://github.com/rust142/geeto/commit/26b16bd))
* ci(workflows): extract AI assessment to dedicated 'copilot' workflow ([6eb7d39](https://github.com/rust142/geeto/commit/6eb7d39))
* ci(actions): remove AI issue assessment workflow ([accf156](https://github.com/rust142/geeto/commit/accf156))
* chore(workflows): remove ai-reply-on-comment workflow ([a118353](https://github.com/rust142/geeto/commit/a118353))
* ci(actions): remove 'copilot' label step and fix assessments check ([15a8a90](https://github.com/rust142/geeto/commit/15a8a90))
* ci(workflows): add step to label issues with 'copilot' ([e7c369b](https://github.com/rust142/geeto/commit/e7c369b))
* chore(workflows): simplify AI issue workflows and heuristics ([3024d70](https://github.com/rust142/geeto/commit/3024d70))
* chore(workflows): rename 'tool' label to 'executable' and expand question regex ([e32cdf5](https://github.com/rust142/geeto/commit/e32cdf5))
* ci(ai-reply): comment out collaborator permission check in AI reply workflow ([0b0a825](https://github.com/rust142/geeto/commit/0b0a825))
* ci(workflows): add labels for SDKs, providers, security, and needs-info ([7817925](https://github.com/rust142/geeto/commit/7817925))
* ci(workflows): trigger AI reply on user's third comment and improve question regex ([3799d32](https://github.com/rust142/geeto/commit/3799d32))
* docs(prompts): remove requirement to append religious quote from issue-review prompt ([f99de51](https://github.com/rust142/geeto/commit/f99de51))
* docs(prompts): add off-topic handling to issue-review prompt ([4abb017](https://github.com/rust142/geeto/commit/4abb017))
* docs(prompts): require actual Mahfudzat/Hadith/Al‑Qur'an quote in issue-review prompt ([a34af90](https://github.com/rust142/geeto/commit/a34af90))
* docs(prompts): add presentation and tone guidance to issue-review prompt ([a4706bd](https://github.com/rust142/geeto/commit/a4706bd))
* docs(prompts): enhance issue-review prompt with tone and presentation guidance ([fd2081d](https://github.com/rust142/geeto/commit/fd2081d))
* chore(workflows): simplify automated AI assessment message formatting ([95de384](https://github.com/rust142/geeto/commit/95de384))
* chore(prompts): add repo context to issue-review prompt and simplify workflow ([ab32857](https://github.com/rust142/geeto/commit/ab32857))
* ci(workflows): add AI assessment, auto-label, and CodeQL workflows ([d408348](https://github.com/rust142/geeto/commit/d408348))
* chore(workflows): remove AI assessment, auto-label, and CodeQL workflows ([d1ce11b](https://github.com/rust142/geeto/commit/d1ce11b))
* ci(workflows): remove AI assessment comment posting step ([23a7138](https://github.com/rust142/geeto/commit/23a7138))
* ci(workflows): simplify automated AI assessment comment generation ([6b95268](https://github.com/rust142/geeto/commit/6b95268))
* ci(workflows): localize and deduplicate AI assessment comments ([1038bdb](https://github.com/rust142/geeto/commit/1038bdb))
* ci(actions): refine label-to-prompt mapping and enable suppress_labels ([eab00e6](https://github.com/rust142/geeto/commit/eab00e6))
* chore(ci): simplify AI label workflow and remove normalization steps ([6021565](https://github.com/rust142/geeto/commit/6021565))
* ci(workflows): rename ai_review_label to copilot and update mapping ([3d8e74d](https://github.com/rust142/geeto/commit/3d8e74d))
* ci(ai-assessment): Trigger ai-assessment job on 'copilot' label ([4ca5dea](https://github.com/rust142/geeto/commit/4ca5dea))
* ci(workflows): rename 'review' label to 'copilot' ([cacee8d](https://github.com/rust142/geeto/commit/cacee8d))
* ci(workflows): standardize AI review label to 'review' ([b2c7690](https://github.com/rust142/geeto/commit/b2c7690))
* chore(workflows): add AI labels and unify issue review prompt ([d2d0713](https://github.com/rust142/geeto/commit/d2d0713))
* ci(workflows): log issue labels and add 'request ai review' mapping ([60b7c39](https://github.com/rust142/geeto/commit/60b7c39))
* ci(actions): add checkout step to auto-add-ai-label workflow ([16e45aa](https://github.com/rust142/geeto/commit/16e45aa))
* ci(workflows): validate prompts directory and mapped prompt file ([4b29fba](https://github.com/rust142/geeto/commit/4b29fba))
* ci(workflow): validate prepared inputs before AI assessment ([491de1b](https://github.com/rust142/geeto/commit/491de1b))
* Set outputs for issue number and body ([e6b7fe3](https://github.com/rust142/geeto/commit/e6b7fe3))
* ci(workflows): make issue number retrieval more robust ([e07bc25](https://github.com/rust142/geeto/commit/e07bc25))
* style(ci): add blank line in auto-add-ai-label-on-open workflow ([c46dd6f](https://github.com/rust142/geeto/commit/c46dd6f))
* chore(workflows): add manual dispatch and issue prep for AI review ([d97777a](https://github.com/rust142/geeto/commit/d97777a))
* ci(workflows): run AI assessment for newly opened issues ([d6ad485](https://github.com/rust142/geeto/commit/d6ad485))
* chore(ci): add auto-label workflow and one-line installer ([7ce56b6](https://github.com/rust142/geeto/commit/7ce56b6))
* chore(cspell): add typecheck and dangerfile to word list ([302d172](https://github.com/rust142/geeto/commit/302d172))
* ci(workflows): split monolithic CI into modular workflows and add Danger ([d2c4640](https://github.com/rust142/geeto/commit/d2c4640))
* chore(typecheck): add wrapper to avoid file-arg tsc runs in lint-staged ([ce8256b](https://github.com/rust142/geeto/commit/ce8256b))
* chore(husky): remove husky bootstrap from pre-commit ([37d2335](https://github.com/rust142/geeto/commit/37d2335))
* chore: add lint-staged + pre-commit husky hook ([f7e2a09](https://github.com/rust142/geeto/commit/f7e2a09))
* chore(ci): add pre-push checks and Husky pre-push hook ([a043501](https://github.com/rust142/geeto/commit/a043501))
* chore: release v1.1.0 ([6f5b7be](https://github.com/rust142/geeto/commit/6f5b7be))
* ci(workflows): add Node 20 step, upload CodeQL logs, and bump deps ([2ac3c7e](https://github.com/rust142/geeto/commit/2ac3c7e))
* ci(workflows): build and upload release binaries ([ccd86bf](https://github.com/rust142/geeto/commit/ccd86bf))
* ci(workflows): rename ARM artifacts to -arm64 in CI workflow ([eb95927](https://github.com/rust142/geeto/commit/eb95927))
* docs(changelog): add Keep a Changelog intro and normalize formatting ([717ab0d](https://github.com/rust142/geeto/commit/717ab0d))
* style(eslint): disable unicorn/no-nested-ternary and simplify ternary ([c1a701a](https://github.com/rust142/geeto/commit/c1a701a))
* chore: update eslint ([b22fe11](https://github.com/rust142/geeto/commit/b22fe11))
* style(workflows): remove stray commented console.log from push prompt ([e485143](https://github.com/rust142/geeto/commit/e485143))
* style(workflows): add blank line before confirm prompts ([e88a78a](https://github.com/rust142/geeto/commit/e88a78a))
* style(workflows): add blank line before push confirmation prompt ([d9ed5ec](https://github.com/rust142/geeto/commit/d9ed5ec))
* refactor(workflow): remove conditional merge skip ([4dcf59d](https://github.com/rust142/geeto/commit/4dcf59d))
* style(commit): standardize commit success messages ([20c86f1](https://github.com/rust142/geeto/commit/20c86f1))
* chore(husky): remove boilerplate from commit-msg hook ([0f99f8a](https://github.com/rust142/geeto/commit/0f99f8a))
* chore: release v1.1.0-beta.0 ([11f677b](https://github.com/rust142/geeto/commit/11f677b))

## [0.1.1](https://github.com/rust142/geeto/compare/v0.1.0...v0.1.1) (2026-02-16)

### Bug Fixes

* fix(logging): remove hard-coded version from banner ([2665c3c](https://github.com/rust142/geeto/commit/2665c3c))

### Other Changes

* chore: release v0.1.1 ([152c99c](https://github.com/rust142/geeto/commit/152c99c))
* docs(readme): move demo image and add demo link ([d674ace](https://github.com/rust142/geeto/commit/d674ace))
* docs(readme): add demo badge and demo image, remove duplicate section ([22ad151](https://github.com/rust142/geeto/commit/22ad151))
* docs(readme): replace asciicast badge with GitHub-hosted demo image ([75a6a9b](https://github.com/rust142/geeto/commit/75a6a9b))
* docs(readme): add Demo section with asciinema demo ([a5ecc42](https://github.com/rust142/geeto/commit/a5ecc42))

## 0.1.0 (2026-02-16)

### Features

* feat(cli): print package.json version instead of hardcoded value ([c3dd440](https://github.com/rust142/geeto/commit/c3dd440))
* feat: initial commit ([ba98b72](https://github.com/rust142/geeto/commit/ba98b72))

### Other Changes

* chore: release v0.1.0 ([e841ee6](https://github.com/rust142/geeto/commit/e841ee6))
* chore: release v0.1.0-beta.3 ([9c97d0f](https://github.com/rust142/geeto/commit/9c97d0f))
* chore(package): remove bin from published files ([a8fb8d2](https://github.com/rust142/geeto/commit/a8fb8d2))
* chore(package): include bin and package.json, add pinst scripts, regen lock ([36474d1](https://github.com/rust142/geeto/commit/36474d1))
* chore: release v0.1.0-beta.2 ([ba32d4c](https://github.com/rust142/geeto/commit/ba32d4c))
* docs(readme): add Support Palestine badges and update npm badge ([978e753](https://github.com/rust142/geeto/commit/978e753))
* chore: release v0.1.0-beta.1 ([2a8d4f2](https://github.com/rust142/geeto/commit/2a8d4f2))
* chore(package): update package description ([b69a1fc](https://github.com/rust142/geeto/commit/b69a1fc))
* chore(package): rename package to geeto and update install instructions ([68a2077](https://github.com/rust142/geeto/commit/68a2077))
* chore: release v0.1.0-beta.0 ([ee73663](https://github.com/rust142/geeto/commit/ee73663))
* chore(lint): ignore generated CHANGELOG.md ([ac167de](https://github.com/rust142/geeto/commit/ac167de))
* chore(lint): move lint-staged config into .lintstagedrc ([a610acf](https://github.com/rust142/geeto/commit/a610acf))
* chore(release): disable npm publish in release-it config ([08767e3](https://github.com/rust142/geeto/commit/08767e3))

