#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const CWD = process.cwd()
const CSPELL_BIN = path.join(CWD, 'node_modules', '.bin', 'cspell')

const res = spawnSync('node', [CSPELL_BIN, '--no-progress', '--no-color', CWD], {
  stdio: 'inherit',
})

if (res.status !== 0) {
  console.error('\nCSpell found unknown words. To resolve:')
  console.error('  1) Run the interactive helper to review and whitelist or ignore words:')
  console.error('       bun run cspell:interactive')
  console.error('  2) After resolving, re-run this check.')
  process.exit(res.status ?? 1)
}

console.log('\nCSpell passed.')
process.exit(0)
