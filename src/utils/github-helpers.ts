import { hasGithubConfig } from './config.js'
import { execSilent } from './exec.js'
import { log } from './logging.js'
import { parseRepoFromUrl } from '../api/github.js'
import { setupGithubConfigInteractive } from '../core/github-setup.js'

/**
 * Ensure GitHub config is available, prompting interactive setup if missing.
 * Returns true if config is available, false if setup was cancelled.
 */
export const validateGithubConfig = (): boolean => {
  if (!hasGithubConfig()) {
    const ok = setupGithubConfigInteractive()
    if (!ok) {
      log.info('Setup cancelled. Run --setup-github later.')
      return false
    }
    console.log('')
  }
  return true
}

/**
 * Resolve GitHub owner/repo from the git remote "origin".
 * Returns null and logs errors if the remote is missing or unparseable.
 */
export const getRepoFromRemote = (): { owner: string; repo: string } | null => {
  let remoteUrl = ''
  try {
    remoteUrl = execSilent('git remote get-url origin').trim()
  } catch {
    log.error('No git remote "origin" found.')
    log.info('Add a remote: git remote add origin <url>')
    return null
  }

  const repoInfo = parseRepoFromUrl(remoteUrl)
  if (!repoInfo) {
    log.error('Could not parse GitHub owner/repo from remote URL.')
    log.info(`Remote: ${remoteUrl}`)
    return null
  }
  return repoInfo
}
