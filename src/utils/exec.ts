/** Execute shell commands and helpers. */

import { execSync, spawn } from 'node:child_process'

import { log } from './logging.js'

/** Run a command and return its trimmed stdout. */
export const exec = (command: string, silent = false): string => {
  try {
    const result = execSync(command, { encoding: 'utf8', stdio: silent ? 'pipe' : 'inherit' })
    return result?.trim() || ''
  } catch (error) {
    if (!silent) {
      log.error(`Error executing: ${command}`)
    }
    throw error
  }
}

/**
 * Run a command asynchronously and return a promise that resolves when it exits.
 * Streams output to stdout/stderr unless `silent` is true, in which case output is captured.
 */
export const execAsync = (
  command: string,
  silent: boolean = false
): Promise<{ code: number; stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    try {
      const child = spawn(command, { shell: true })
      let out = ''
      let err = ''

      if (child.stdout) {
        child.stdout.on('data', (d: Buffer) => {
          const s = d.toString()
          out += s
          if (!silent) process.stdout.write(s)
        })
      }
      if (child.stderr) {
        child.stderr.on('data', (d: Buffer) => {
          const s = d.toString()
          err += s
          if (!silent) process.stderr.write(s)
        })
      }

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ code: code ?? 0, stdout: out.trim(), stderr: err.trim() })
        } else {
          const errObj = new Error(`Command failed: ${command} (code ${code})`) as Error & {
            code?: number
            stdout?: string
            stderr?: string
          }
          errObj.code = code ?? 0
          errObj.stdout = out
          errObj.stderr = err
          reject(errObj)
        }
      })
    } catch (error) {
      reject(error)
    }
  })
}

/** Run git commands and handle common non-zero exit codes gracefully. */
export const execGit = (command: string, silent = false): string => {
  try {
    const result = execSync(command, { encoding: 'utf8', stdio: silent ? 'pipe' : 'inherit' })
    return result?.trim() || ''
  } catch (error) {
    // For git commands, exit code 1 is often not an error (e.g., git diff when there are changes)
    const execError = error as { status?: number }
    if (execError.status === 1 && command.includes('git diff')) {
      // Return empty string for git diff when there are no changes to diff
      return ''
    }
    if (!silent) {
      log.error(`Error executing: ${command}`)
    }
    throw error
  }
}

// /** Run a command silently and return stdout. */
export const execSilent = (command: string): string => {
  return exec(command, true)
}

/** Check whether an executable is available on PATH. */
export const commandExists = (command: string): boolean => {
  const platform = process.platform
  const checkCommand = platform === 'win32' ? 'where' : 'which'
  try {
    exec(`${checkCommand} ${command}`)
    return true
  } catch {
    return false
  }
}
