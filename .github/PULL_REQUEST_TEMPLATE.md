<!-- PR template generated from CONTRIBUTING.md. Modify as needed. -->

# Title

Use Conventional Commits style for the PR title (recommended):

```text
<type>(<scope>): <short description>
```

Example: `feat(api): add OpenRouter fallback handler`

---

## Description

Please include a summary of the change and which issue is fixed. Also include relevant motivation and context.

- What does this change do?
- Why is this change needed?
- Any notable implementation details?

If this is a large change, consider splitting into smaller PRs.

## Related issue

Fixes: #ISSUE_NUMBER (if applicable)

## Checklist (required)

Please check the items that apply before requesting review:

- [ ] The branch name follows the project's convention (e.g. `dev/...`)
- [ ] The PR title follows Conventional Commits
- [ ] Linting passes locally: `bun run lint`
- [ ] Type checking passes: `bun run typecheck`
- [ ] Build succeeds: `bun run build`
- [ ] Tests added/updated for new behavior (if applicable)
- [ ] Updated changelog or release notes (if applicable)
- [ ] I have linked related issues and provided a clear description
- [ ] Screenshots, recordings, or example outputs are included for UI/UX changes
- [ ] No secrets or credentials are committed in this PR

## How to test

Provide clear instructions for how reviewers can reproduce and verify the changes locally (commands, env vars, fixtures):

```bash
# example
bun install
bun run build
bun run typecheck
# run tests
bun test
```

## Security & Private Data

If this PR addresses a security vulnerability, do NOT include exploit details here. Follow the repository's `SECURITY.md` instructions for private disclosure.

## Additional notes

Add any other context for the reviewer (migration steps, configuration changes, limitations, backwards-incompatible changes).

---

Terima kasih telah mengirimkan PR — kami akan meninjaunya sesegera mungkin.
