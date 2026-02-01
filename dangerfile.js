// dangerfile.js (CommonJS)
// Converted from ESM to use require() so Danger's require() loader can evaluate it

function tryRequire(moduleName) {
  try {
    return require(moduleName)
  } catch (e) {
    return null
  }
}

const dangerModule = tryRequire('danger')
if (!dangerModule) {
  // If `danger` isn't available via require, throw so the runner can report the problem.
  throw new Error('Could not require("danger"). Ensure `danger` is installed in devDependencies.')
}

const { danger, fail, markdown, message, warn } = dangerModule

message('Danger is enabled for this repo. Hi! 🛡️')

const pr = (danger.github && danger.github.pr) || {}
const modified = (danger.git && danger.git.modified_files) || []

// Warn when there's no CHANGELOG change (unless PR is trivial)
const isTrivial = String((pr.title || '') + (pr.body || '')).includes('#trivial')
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
;(function runCommitlint() {
  const commitlintMod = tryRequire('danger-plugin-conventional-commitlint')
  const configMod = tryRequire('@commitlint/config-conventional')

  if (!commitlintMod || !configMod) {
    warn(
      '`danger-plugin-conventional-commitlint` not installed or failed — commit message linting skipped.'
    )
    return
  }

  const commitlint = commitlintMod.default || commitlintMod
  const configConventional = configMod.default || configMod
  const options = { severity: 'warn' }

  try {
    // Some plugins return a promise, others may be synchronous
    const result = commitlint(configConventional.rules, options)
    if (result && typeof result.then === 'function') {
      result.catch(() => {
        warn('`danger-plugin-conventional-commitlint` failed during execution.')
      })
    }
  } catch (e) {
    warn('`danger-plugin-conventional-commitlint` failed during execution.')
  }
})()

// Add a friendly note
markdown('**Tip:** Run `bun run danger:local` to test Danger locally before pushing.')
