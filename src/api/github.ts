/**
 * GitHub API integration
 */

import { getGithubConfig } from '../utils/config.js'
import { log } from '../utils/logging.js'

export interface GitHubPRParams {
  owner: string
  repo: string
  title: string
  body: string
  head: string
  base: string
  draft?: boolean
}

export interface GitHubPR {
  number: number
  html_url: string
  title: string
  state: string
  head: { ref: string }
  base: { ref: string }
  draft: boolean
  user: { login: string }
  created_at: string
}

export interface GitHubBranch {
  name: string
  commit: { sha: string }
  protected: boolean
}

/**
 * Parse owner/repo from git remote URL
 */
export const parseRepoFromUrl = (remoteUrl: string): { owner: string; repo: string } | null => {
  // Handle SSH: git@github.com:owner/repo.git
  const sshMatch = remoteUrl.match(/git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?/)
  if (sshMatch?.[1] && sshMatch[2]) {
    return { owner: sshMatch[1], repo: sshMatch[2] }
  }

  // Handle HTTPS: https://github.com/owner/repo.git
  const httpsMatch = remoteUrl.match(/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?/)
  if (httpsMatch?.[1] && httpsMatch[2]) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] }
  }

  return null
}

/**
 * Make a GitHub API request
 */
const githubFetch = async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
  const config = getGithubConfig()
  if (!config.token) {
    throw new Error('GitHub token not configured')
  }

  const url = endpoint.startsWith('https://') ? endpoint : `https://api.github.com${endpoint}`

  return fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  })
}

/**
 * Create a Pull Request
 */
export const createPullRequest = async (params: GitHubPRParams): Promise<GitHubPR | null> => {
  try {
    const response = await githubFetch(`/repos/${params.owner}/${params.repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title: params.title,
        body: params.body,
        head: params.head,
        base: params.base,
        draft: params.draft ?? false,
      }),
    })

    if (!response.ok) {
      const error = (await response.json()) as {
        message?: string
        errors?: Array<{ message: string }>
      }
      const details = error.errors?.map((e) => e.message).join(', ') ?? ''
      log.clearLine()
      log.gap()
      log.error(
        'GitHub API error: ' + `${response.status} - ` + `${error.message ?? response.statusText}`
      )
      if (details) log.error(`Details: ${details}`)
      return null
    }

    return (await response.json()) as GitHubPR
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.clearLine()
    log.gap()
    log.error(`Failed to create PR: ${msg}`)
    return null
  }
}

/**
 * List open Pull Requests for the repo
 */
export const listPullRequests = async (
  owner: string,
  repo: string,
  head?: string
): Promise<GitHubPR[]> => {
  try {
    const params = new URLSearchParams({
      state: 'open',
      per_page: '30',
    })
    if (head) {
      params.set('head', `${owner}:${head}`)
    }

    const response = await githubFetch(`/repos/${owner}/${repo}/pulls?` + `${params.toString()}`)

    if (!response.ok) {
      log.clearLine()
      log.gap()
      log.warn('GitHub API error: ' + `${response.status} ${response.statusText}`)
      return []
    }

    return (await response.json()) as GitHubPR[]
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.clearLine()
    log.gap()
    log.warn(`Failed to list PRs: ${msg}`)
    return []
  }
}

/**
 * Get default branch of the repo
 */
export const getDefaultBranch = async (owner: string, repo: string): Promise<string | null> => {
  try {
    const response = await githubFetch(`/repos/${owner}/${repo}`)

    if (!response.ok) return null

    const data = (await response.json()) as {
      default_branch?: string
    }
    return data.default_branch ?? null
  } catch {
    return null
  }
}

export interface GitHubIssueParams {
  owner: string
  repo: string
  title: string
  body: string
  labels?: string[]
  assignees?: string[]
}

export interface GitHubIssue {
  number: number
  html_url: string
  title: string
  state: string
  user: { login: string }
  created_at: string
  labels: Array<{ name: string; color: string }>
}

export interface GitHubLabel {
  name: string
  color: string
  description: string | null
}

/**
 * Create a GitHub Issue
 */
export const createIssue = async (params: GitHubIssueParams): Promise<GitHubIssue | null> => {
  try {
    const response = await githubFetch(`/repos/${params.owner}/${params.repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: params.title,
        body: params.body,
        labels: params.labels ?? [],
        assignees: params.assignees ?? [],
      }),
    })

    if (!response.ok) {
      const error = (await response.json()) as {
        message?: string
        errors?: Array<{ message: string }>
      }
      const details = error.errors?.map((e) => e.message).join(', ') ?? ''
      log.clearLine()
      log.gap()
      log.error(
        'GitHub API error: ' + `${response.status} - ` + `${error.message ?? response.statusText}`
      )
      if (details) log.error(`Details: ${details}`)
      return null
    }

    return (await response.json()) as GitHubIssue
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.clearLine()
    log.gap()
    log.error(`Failed to create issue: ${msg}`)
    return null
  }
}

/**
 * List labels for a repo
 */
export const listLabels = async (owner: string, repo: string): Promise<GitHubLabel[]> => {
  try {
    const response = await githubFetch(`/repos/${owner}/${repo}/labels?per_page=100`)

    if (!response.ok) return []

    return (await response.json()) as GitHubLabel[]
  } catch {
    return []
  }
}
