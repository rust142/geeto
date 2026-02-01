// dangerfile.esm.mjs
// Original ESM Danger rules (moved from dangerfile.js)
import { danger, fail, markdown, message, warn } from 'danger'

message('Danger is enabled for this repo. Hi! 🛡️')

const pr = danger.github?.pr || {}
const modified = danger.git.modified_files || []

// Warn when there's no CHANGELOG change (unless PR is trivial)
const isTrivial = (pr.title + (pr.body || '')).includes('#trivial')
if (!modified.includes('CHANGELOG.md') && !isTrivial) {
  warn('Please add a `CHANGELOG.md` entry for your changes.')
}

// Warn on large PRs
const changes = (pr.additions || 0) + (pr.deletions || 0)
if (changes > 500) {
  warn('This PR is large (>500 changes). Consider splitting it into smaller PRs.')
}

// Example: encourage tests when source files are added/modified
// const hasSrcChanges = modified.some((f) => f.startsWith('src/') && f.endsWith('.ts'));
// const hasTests = modified.some((f) => f.includes('__tests__') || f.endsWith('.spec.ts') || f.endsWith('.test.ts'));
// if (hasSrcChanges && !hasTests) {
//   warn('Source files changed without adding/updating tests.');
// }

// Run conventional commitlint plugin (optional)
// Use promise chaining instead of top-level await to avoid creating an ESM graph with TLA
Promise.all([
  import('danger-plugin-conventional-commitlint').catch((e) => ({ error: e })),
  import('@commitlint/config-conventional').catch((e) => ({ error: e })),
])
  .then(([commitlintMod, configMod]) => {
    if (commitlintMod?.error || configMod?.error) {
      throw new Error('commitlint imports failed')
    }

    const commitlint = commitlintMod.default
    const configConventional = configMod.default
    const options = { severity: 'warn' }
    return commitlint(configConventional.rules, options)
  })
  .catch(() => {
    warn(
      '`danger-plugin-conventional-commitlint` not installed or failed — commit message linting skipped.'
    )
  })

// Add a friendly note
markdown('**Tip:** Run `bun run danger:local` to test Danger locally before pushing.')
