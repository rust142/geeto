/**
 * GitLab API integration (REST API v4)
 */

import { getGitlabConfig } from '../utils/config.js'
import { log } from '../utils/logging.js'

export interface GitLabMRParams {
  projectPath: string
  title: string
  description: string
  sourceBranch: string
  targetBranch: string
  draft?: boolean
}

export interface GitLabMR {
  iid: number
  web_url: string
  title: string
  state: string
  source_branch: string
  target_branch: string
  draft: boolean
  author: { username: string }
  created_at: string
}

export interface GitLabIssueParams {
  projectPath: string
  title: string
  description: string
  labels?: string[]
  assignee_ids?: number[]
}

export interface GitLabIssue {
  iid: number
  web_url: string
  title: string
  state: string
  author: { username: string }
  created_at: string
  labels: string[]
}

export interface GitLabLabel {
  name: string
  color: string
  description: string | null
}

/**
 * Parse namespace/project from git remote URL.
 * Supports nested groups (e.g. group/subgroup/project).
 */
export const parseGitlabRepoFromUrl = (
  remoteUrl: string
): { namespace: string; project: string } | null => {
  // Handle SSH: git@gitlab.com:namespace/project.git
  // Also handles custom hosts: git@custom-gitlab.example.com:group/subgroup/project.git
  const sshMatch = remoteUrl.match(/git@[^:]+:(.+?)(?:\.git)?\s*$/)
  if (sshMatch?.[1]) {
    const fullPath = sshMatch[1]
    const lastSlash = fullPath.lastIndexOf('/')
    if (lastSlash > 0) {
      return {
        namespace: fullPath.slice(0, lastSlash),
        project: fullPath.slice(lastSlash + 1),
      }
    }
  }

  // Handle HTTPS: https://gitlab.com/namespace/project.git
  // Also handles custom hosts: https://custom.gitlab.com/group/subgroup/project.git
  const httpsMatch = remoteUrl.match(/https?:\/\/[^/]+\/(.+?)(?:\.git)?\s*$/)
  if (httpsMatch?.[1]) {
    const fullPath = httpsMatch[1]
    const lastSlash = fullPath.lastIndexOf('/')
    if (lastSlash > 0) {
      return {
        namespace: fullPath.slice(0, lastSlash),
        project: fullPath.slice(lastSlash + 1),
      }
    }
  }

  return null
}

/**
 * URL-encode a project path for use in GitLab API endpoints.
 */
export const encodeProjectPath = (namespace: string, project: string): string => {
  return encodeURIComponent(`${namespace}/${project}`)
}

/**
 * Make a GitLab API v4 request
 */
const gitlabFetch = async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
  const config = getGitlabConfig()
  if (!config.token) {
    throw new Error('GitLab token not configured')
  }

  const baseUrl = (config.url ?? 'https://gitlab.com').replace(/\/+$/, '')
  const url = endpoint.startsWith('https://') ? endpoint : `${baseUrl}/api/v4${endpoint}`

  return fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/json',
      'PRIVATE-TOKEN': config.token,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  })
}

/**
 * Create a Merge Request
 */
export const createMergeRequest = async (params: GitLabMRParams): Promise<GitLabMR | null> => {
  try {
    const response = await gitlabFetch(`/projects/${params.projectPath}/merge_requests`, {
      method: 'POST',
      body: JSON.stringify({
        title: params.title,
        description: params.description,
        source_branch: params.sourceBranch,
        target_branch: params.targetBranch,
        draft: params.draft ?? false,
      }),
    })

    if (!response.ok) {
      const error = (await response.json()) as {
        message?: string | string[]
        error?: string
      }
      const detail = Array.isArray(error.message)
        ? error.message.join(', ')
        : (error.message ?? error.error ?? response.statusText)
      log.clearLine()
      log.gap()
      log.error(`GitLab API error: ${response.status} - ${detail}`)
      return null
    }

    return (await response.json()) as GitLabMR
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.clearLine()
    log.gap()
    log.error(`Failed to create MR: ${msg}`)
    return null
  }
}

/**
 * List open Merge Requests for the project
 */
export const listMergeRequests = async (
  projectPath: string,
  sourceBranch?: string
): Promise<GitLabMR[]> => {
  try {
    const params = new URLSearchParams({
      state: 'opened',
      per_page: '30',
    })
    if (sourceBranch) {
      params.set('source_branch', sourceBranch)
    }

    const response = await gitlabFetch(
      `/projects/${projectPath}/merge_requests?${params.toString()}`
    )

    if (!response.ok) {
      log.clearLine()
      log.gap()
      log.warn(`GitLab API error: ${response.status} ${response.statusText}`)
      return []
    }

    return (await response.json()) as GitLabMR[]
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.clearLine()
    log.gap()
    log.warn(`Failed to list MRs: ${msg}`)
    return []
  }
}

/**
 * Get default branch of the project
 */
export const getDefaultBranch = async (projectPath: string): Promise<string | null> => {
  try {
    const response = await gitlabFetch(`/projects/${projectPath}`)

    if (!response.ok) return null

    const data = (await response.json()) as {
      default_branch?: string
    }
    return data.default_branch ?? null
  } catch {
    return null
  }
}

/**
 * Create a GitLab Issue
 */
export const createIssue = async (params: GitLabIssueParams): Promise<GitLabIssue | null> => {
  try {
    const response = await gitlabFetch(`/projects/${params.projectPath}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: params.title,
        description: params.description,
        labels: params.labels?.join(',') ?? '',
        assignee_ids: params.assignee_ids ?? [],
      }),
    })

    if (!response.ok) {
      const error = (await response.json()) as {
        message?: string | string[]
        error?: string
      }
      const detail = Array.isArray(error.message)
        ? error.message.join(', ')
        : (error.message ?? error.error ?? response.statusText)
      log.clearLine()
      log.gap()
      log.error(`GitLab API error: ${response.status} - ${detail}`)
      return null
    }

    return (await response.json()) as GitLabIssue
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.clearLine()
    log.gap()
    log.error(`Failed to create issue: ${msg}`)
    return null
  }
}

/**
 * List labels for a project
 */
export const listLabels = async (projectPath: string): Promise<GitLabLabel[]> => {
  try {
    const response = await gitlabFetch(`/projects/${projectPath}/labels?per_page=100`)

    if (!response.ok) return []

    return (await response.json()) as GitLabLabel[]
  } catch {
    return []
  }
}
