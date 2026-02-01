#!/usr/bin/env node
/* eslint-disable security/detect-object-injection */
/* eslint-disable security/detect-non-literal-fs-filename */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

const CWD = process.cwd()
const CSPELL_BIN = path.join(CWD, 'node_modules', '.bin', 'cspell')

function runCspell() {
  const result = spawnSync('node', [CSPELL_BIN, '--no-progress', '--no-color', CWD], {
    encoding: 'utf8',
    stdio: 'pipe',
  })
  return result.stdout || ''
}

function parseCspellOutput(out) {
  const lines = out.split('\n')
  const re = /^(.*?):(\d+):(\d+) - Unknown word \((.+?)\)/
  const map = new Map()
  for (const line of lines) {
    const m = re.exec(line)
    if (m) {
      const file = m[1]
      const lineNo = Number(m[2])
      const col = Number(m[3])
      const word = m[4]
      if (!map.has(word)) map.set(word, [])
      map.get(word).push({ file, lineNo, col })
    }
  }
  return map
}

function showList(map) {
  if (map.size === 0) {
    console.log('No unknown words found.')
    return
  }
  console.log(`Found ${map.size} unknown words:`)
  let index = 1
  for (const [word, occs] of map.entries()) {
    const files = [...new Set(occs.map((o) => o.file))]
    console.log(`${index}. ${word} — ${occs.length} occurrence(s) in ${files.length} file(s)`)
    console.log(`   Files: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`)
    index += 1
  }
}

async function interactive(map) {
  if (map.size === 0) {
    console.log('No unknown words found.')
    return
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const question = (q) => new Promise((resolve) => rl.question(q, resolve))

  // Load .cspell.json
  const cspellPath = path.join(CWD, '.cspell.json')
  let cspell = { words: [], ignorePaths: [] }
  try {
    const txt = fs.readFileSync(cspellPath, 'utf8')
    cspell = JSON.parse(txt)
    if (!Array.isArray(cspell.words)) cspell.words = []
  } catch {
    console.log('No .cspell.json found — creating a new one when needed')
  }

  for (const [word, occs] of map.entries()) {
    console.log('\n-------------------------------------------------')
    console.log(`Word: ${word}`)
    const files = [...new Set(occs.map((o) => o.file))]
    console.log('Occurrences:')
    for (const o of occs.slice(0, 8)) {
      console.log(` - ${o.file}:${o.lineNo}:${o.col}`)
    }
    if (occs.length > 8) console.log(` - ...and ${occs.length - 8} more`)

    const answer = (await question('\nChoose action — (g)lobal add, (f)ile ignore, (s)kip? '))
      // eslint-disable-next-line unicorn/no-await-expression-member
      .trim()
      .toLowerCase()
    if (answer === 'g' || answer === 'global' || answer === '1') {
      if (cspell.words.includes(word)) {
        console.log(`${word} already present in .cspell.json`)
      } else {
        cspell.words.push(word)
        console.log(`Added ${word} to .cspell.json words`)
      }
    } else if (answer === 'f' || answer === 'file' || answer === '2') {
      console.log('Files:')
      for (const [index, f] of files.entries()) console.log(`${index + 1}) ${f}`)
      // eslint-disable-next-line unicorn/no-await-expression-member
      const pick = (await question('Select files (comma-separated numbers, * for all): ')).trim()
      let pickIndexes = []
      pickIndexes =
        pick === '*'
          ? files.map((_, index) => index)
          : pick
              .split(',')
              .map((s) => Number(s.trim()) - 1)
              .filter((n) => Number.isFinite(n) && n >= 0 && n < files.length)

      for (const index of pickIndexes) {
        const filePath = files[index]
        try {
          const txt = fs.readFileSync(filePath, 'utf8')
          const lines = txt.split('\n')
          // Find existing cspell ignore line at top
          let inserted = false
          for (let index = 0; index < Math.min(lines.length, 5); index++) {
            const line = lines[index]
            const m = /<!--\s*cspell:ignore\s*(.*?)-->/.exec(line)
            if (m) {
              const existing = m[1].trim()
              const words = existing ? existing.split(/\s+/) : []
              if (!words.includes(word)) words.push(word)
              lines[index] = `<!-- cspell:ignore ${words.join(' ')} -->`
              fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
              console.log(`Appended ignore to ${filePath}`)
              inserted = true
              break
            }
          }
          if (!inserted) {
            // insert at top
            const newTxt = `<!-- cspell:ignore ${word} -->\n${txt}`
            fs.writeFileSync(filePath, newTxt, 'utf8')
            console.log(`Inserted ignore at top of ${filePath}`)
          }
        } catch (error) {
          console.error(`Failed to update ${filePath}: ${error.message}`)
        }
      }
    } else {
      console.log(`Skipped ${word}`)
    }
  }

  // Save cspell
  try {
    const cspellPathOut = path.join(CWD, '.cspell.json')
    const out = JSON.stringify(cspell, undefined, 2)
    fs.writeFileSync(cspellPathOut, out, 'utf8')
    console.log('\nUpdated .cspell.json')
  } catch (error) {
    console.error('Failed to write .cspell.json:', error.message)
  }

  rl.close()
}

async function main() {
  const arguments_ = new Set(process.argv.slice(2))
  const listOnly = arguments_.has('--list') || arguments_.has('-l')
  const out = runCspell()
  const map = parseCspellOutput(out)
  if (listOnly) {
    showList(map)
    process.exit(0)
  }
  // interactive
  await interactive(map)
  // Re-run and show remaining
  const out2 = runCspell()
  const map2 = parseCspellOutput(out2)
  console.log('\nFinal check:')
  showList(map2)
}

// eslint-disable-next-line unicorn/prefer-top-level-await
main().catch((error) => {
  console.error(error)
  process.exit(1)
})
