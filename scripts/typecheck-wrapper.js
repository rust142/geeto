#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const CWD = process.cwd()
const TSC = path.join(CWD, 'node_modules', '.bin', 'tsc')

const res = spawnSync('node', [TSC, '--noEmit'], { stdio: 'inherit' })
process.exit(res.status ?? 0)
