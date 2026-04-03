import type { PlatformRepo } from '../api/platform.js'
import type { Platform } from '../types/index.js'

import { hasGithubConfig, hasGitlabConfig } from './config.js'
import { execSilent } from './exec.js'
import { log } from './logging.js'
import { parseRepoFromUrl } from '../api/github.js'
import { detectPlatform, parseRemoteUrl } from '../api/platform.js'
import { setupGithubConfigInteractive } from '../core/github-setup.js'
import { setupGitlabConfigInteractive } from '../core/gitlab-setup.js'

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
 * Validate platform config (GitHub or GitLab), prompting setup if missing.
 */
export const validatePlatformConfig = (platform: Platform): boolean => {
  if (platform === 'github') return validateGithubConfig()

  if (!hasGitlabConfig()) {
    const ok = setupGitlabConfigInteractive()
    if (!ok) {
      log.info('Setup cancelled. Run --setup-gitlab later.')
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

/**
 * Detect platform and resolve repo info from git remote "origin".
 * Returns PlatformRepo or null if remote is missing/unparseable.
 */
export const getPlatformRepoFromRemote = (): PlatformRepo | null => {
  let remoteUrl = ''
  try {
    remoteUrl = execSilent('git remote get-url origin').trim()
  } catch {
    log.error('No git remote "origin" found.')
    log.info('Add a remote: git remote add origin <url>')
    return null
  }

  const repoInfo = parseRemoteUrl(remoteUrl)
  if (!repoInfo) {
    log.error('Could not parse owner/repo from remote URL.')
    log.info(`Remote: ${remoteUrl}`)
    return null
  }
  return repoInfo
}

/**
 * Detect platform from remote URL. Returns null if undetectable.
 */
export const detectPlatformFromRemote = (): Platform | null => {
  try {
    const remoteUrl = execSilent('git remote get-url origin').trim()
    return detectPlatform(remoteUrl)
  } catch {
    return null
  }
}

/**
 * Get the CLI tool name for the detected platform (gh or glab).
 */
export const getPlatformCLI = (platform: Platform): string => {
  return platform === 'github' ? 'gh' : 'glab'
}
