// dangerfile.js (CommonJS)
// Converted from ESM to use require() so Danger's require() loader can evaluate it

function tryRequire(moduleName) {
  try {
    return require(moduleName)
  } catch (e) {
    return null
  }
}

// Resolve Danger API from multiple possible sources:
// 1. Global injected symbols (when runner provides them)
// 2. require('danger') when available in node_modules
function resolveDangerApi() {
  // If Danger globals are injected, use them
  if (typeof danger !== 'undefined' || typeof message !== 'undefined') {
    return {
      danger: typeof danger !== 'undefined' ? danger : undefined,
      fail: typeof fail !== 'undefined' ? fail : undefined,
      markdown: typeof markdown !== 'undefined' ? markdown : undefined,
      message: typeof message !== 'undefined' ? message : undefined,
      warn: typeof warn !== 'undefined' ? warn : undefined,
    }
  }

  // Otherwise try to require the package from node_modules
  const dangerModule = tryRequire('danger')
  if (dangerModule) {
    // Module may export functions directly or as named exports
    const d = dangerModule.danger || dangerModule.default || dangerModule
    return {
      danger: d.danger || d,
      fail: d.fail || dangerModule.fail,
      markdown: d.markdown || dangerModule.markdown,
      message: d.message || dangerModule.message,
      warn: d.warn || dangerModule.warn,
    }
  }

  throw new Error(
    'Could not obtain Danger API. Ensure Danger is available in the runner or installed in devDependencies.'
  )
}

const { danger, fail, markdown, message, warn } = resolveDangerApi()

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
