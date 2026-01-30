// dangerfile.js
// Basic Danger rules for the repo
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
try {
  const { default: commitlint } = await import('danger-plugin-conventional-commitlint')
  const { default: configConventional } = await import('@commitlint/config-conventional')

  const options = { severity: 'warn' }
  await commitlint(configConventional.rules, options)
} catch (e) {
  warn(
    '`danger-plugin-conventional-commitlint` not installed or failed — commit message linting skipped.'
  )
}

// Add a friendly note
markdown('**Tip:** Run `npm run danger:local` to test Danger locally before pushing.')
