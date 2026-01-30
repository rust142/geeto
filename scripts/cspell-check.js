#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const CWD = process.cwd()
const CSPELL_BIN = path.join(CWD, 'node_modules', '.bin', 'cspell')

const res = spawnSync('node', [CSPELL_BIN, '--no-progress', '--no-color', CWD], {
  stdio: 'inherit',
})

if (res.status !== 0) {
  console.error('\nCSpell found unknown words. Launching interactive helper to resolve them...')

  // write cspell output to a temp file for helper to consume
  const os = await import('node:os')
  const fs = await import('node:fs')
  const tmpFile = path.join(os.tmpdir(), `cspell-output-${Date.now()}.txt`)
  try {
    fs.writeFileSync(tmpFile, res.stdout ?? '', 'utf8')
  } catch (err) {
    console.error('Failed to write temporary cspell output file:', err)
    process.exit(1)
  }

  // If not a TTY, instruct user to run interactive manually and fail
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('\nInteractive mode is not available in this environment (non-TTY).')
    console.error('Run the interactive helper locally to resolve them:')
    console.error('  bun run cspell:interactive')
    console.error('Or:')
    console.error(`  node scripts/cspell-ignore.js ${tmpFile}`)
    try {
      fs.unlinkSync(tmpFile)
    } catch {}
    process.exit(1)
  }

  const helper = spawnSync('node', [path.join(CWD, 'scripts', 'cspell-ignore.js'), tmpFile], {
    stdio: 'inherit',
  })

  try {
    fs.unlinkSync(tmpFile)
  } catch {}

  if (helper.status !== 0) {
    console.error('\nInteractive helper failed or was cancelled.')
    process.exit(helper.status ?? 1)
  }

  // Re-run cspell after interactive fixes
  const retry = spawnSync('node', [CSPELL_BIN, '--no-progress', '--no-color', CWD], {
    stdio: 'inherit',
  })

  if (retry.status !== 0) {
    console.error(
      '\nCSpell still found unknown words after interactive fix. Please resolve and try again.'
    )
    process.exit(retry.status ?? 1)
  }

  console.log('\nCSpell passed after interactive fixes.')
  process.exit(0)
}

console.log('\nCSpell passed.')
process.exit(0)
