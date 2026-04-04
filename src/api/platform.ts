/**
 * Platform abstraction layer — unifies GitHub and GitLab APIs
 */

import type { Platform } from '../types/index.js'

import {
  createIssue as ghCreateIssue,
  createPullRequest as ghCreatePR,
  getDefaultBranch as ghGetDefaultBranch,
  listLabels as ghListLabels,
  listPullRequests as ghListPRs,
  parseRepoFromUrl,
} from './github.js'
import {
  encodeProjectPath,
  createIssue as glCreateIssue,
  createMergeRequest as glCreateMR,
  getDefaultBranch as glGetDefaultBranch,
  listLabels as glListLabels,
  listMergeRequests as glListMRs,
  parseGitlabRepoFromUrl,
} from './gitlab.js'
import { hasGithubConfig, hasGitlabConfig } from '../utils/config.js'

// ── Unified Interfaces ───────────────────────────────────────────────

export interface PlatformRepo {
  platform: Platform
  /** For GitHub: "owner". For GitLab: "namespace" (may contain slashes for nested groups) */
  owner: string
  /** Repository/project name */
  repo: string
  /** For GitLab: URL-encoded project path. For GitHub: "owner/repo" */
  projectPath: string
}

export interface PlatformPRParams {
  projectPath: string
  title: string
  body: string
  sourceBranch: string
  targetBranch: string
  draft?: boolean
  // GitHub-specific (ignored for GitLab)
  owner?: string
  repo?: string
}

export interface PlatformPR {
  number: number
  url: string
  title: string
  state: string
  sourceBranch: string
  targetBranch: string
  draft: boolean
  author: string
  createdAt: string
}

export interface PlatformIssueParams {
  projectPath: string
  title: string
  body: string
  labels?: string[]
  assignees?: string[]
  // GitHub-specific
  owner?: string
  repo?: string
}

export interface PlatformIssue {
  number: number
  url: string
  title: string
  state: string
  author: string
  createdAt: string
  labels: string[]
}

export interface PlatformLabel {
  name: string
  color: string
  description: string | null
}

export interface PlatformAPI {
  platform: Platform
  createPR(params: PlatformPRParams): Promise<PlatformPR | null>
  listPRs(
    projectPath: string,
    sourceBranch?: string,
    owner?: string,
    repo?: string
  ): Promise<PlatformPR[]>
  getDefaultBranch(projectPath: string, owner?: string, repo?: string): Promise<string | null>
  createIssue(params: PlatformIssueParams): Promise<PlatformIssue | null>
  listLabels(projectPath: string, owner?: string, repo?: string): Promise<PlatformLabel[]>
}

// ── Platform Detection ───────────────────────────────────────────────

/**
 * Detect platform from git remote URL or fallback to config
 */
export const detectPlatform = (remoteUrl: string): Platform | null => {
  if (remoteUrl.includes('github.com')) return 'github'
  if (remoteUrl.includes('gitlab')) return 'gitlab'

  // Fallback: check which platform has a config
  if (hasGitlabConfig()) return 'gitlab'
  if (hasGithubConfig()) return 'github'

  return null
}

/**
 * Parse remote URL into a unified PlatformRepo
 */
export const parseRemoteUrl = (remoteUrl: string): PlatformRepo | null => {
  const platform = detectPlatform(remoteUrl)
  if (!platform) return null

  if (platform === 'github') {
    const parsed = parseRepoFromUrl(remoteUrl)
    if (!parsed) return null
    return {
      platform,
      owner: parsed.owner,
      repo: parsed.repo,
      projectPath: `${parsed.owner}/${parsed.repo}`,
    }
  }

  if (platform === 'gitlab') {
    const parsed = parseGitlabRepoFromUrl(remoteUrl)
    if (!parsed) return null
    return {
      platform,
      owner: parsed.namespace,
      repo: parsed.project,
      projectPath: encodeProjectPath(parsed.namespace, parsed.project),
    }
  }

  return null
}

// ── GitHub API Adapter ───────────────────────────────────────────────

const createGitHubAPI = (): PlatformAPI => ({
  platform: 'github',

  async createPR(params) {
    if (!params.owner || !params.repo) return null

    const result = await ghCreatePR({
      owner: params.owner,
      repo: params.repo,
      title: params.title,
      body: params.body,
      head: params.sourceBranch,
      base: params.targetBranch,
      draft: params.draft,
    })
    if (!result) return null

    return {
      number: result.number,
      url: result.html_url,
      title: result.title,
      state: result.state,
      sourceBranch: result.head.ref,
      targetBranch: result.base.ref,
      draft: result.draft,
      author: result.user.login,
      createdAt: result.created_at,
    }
  },

  async listPRs(_projectPath, sourceBranch, owner, repo) {
    if (!owner || !repo) return []

    const results = await ghListPRs(owner, repo, sourceBranch)
    return results.map((pr) => ({
      number: pr.number,
      url: pr.html_url,
      title: pr.title,
      state: pr.state,
      sourceBranch: pr.head.ref,
      targetBranch: pr.base.ref,
      draft: pr.draft,
      author: pr.user.login,
      createdAt: pr.created_at,
    }))
  },

  async getDefaultBranch(_projectPath, owner, repo) {
    if (!owner || !repo) return null
    return ghGetDefaultBranch(owner, repo)
  },

  async createIssue(params) {
    if (!params.owner || !params.repo) return null

    const result = await ghCreateIssue({
      owner: params.owner,
      repo: params.repo,
      title: params.title,
      body: params.body,
      labels: params.labels,
      assignees: params.assignees,
    })
    if (!result) return null

    return {
      number: result.number,
      url: result.html_url,
      title: result.title,
      state: result.state,
      author: result.user.login,
      createdAt: result.created_at,
      labels: result.labels.map((l) => l.name),
    }
  },

  async listLabels(_projectPath, owner, repo) {
    if (!owner || !repo) return []

    const results = await ghListLabels(owner, repo)
    return results.map((l) => ({
      name: l.name,
      color: l.color,
      description: l.description,
    }))
  },
})

// ── GitLab API Adapter ───────────────────────────────────────────────

const createGitLabAPI = (): PlatformAPI => ({
  platform: 'gitlab',

  async createPR(params) {
    const result = await glCreateMR({
      projectPath: params.projectPath,
      title: params.title,
      description: params.body,
      sourceBranch: params.sourceBranch,
      targetBranch: params.targetBranch,
      draft: params.draft,
    })
    if (!result) return null

    return {
      number: result.iid,
      url: result.web_url,
      title: result.title,
      state: result.state,
      sourceBranch: result.source_branch,
      targetBranch: result.target_branch,
      draft: result.draft ?? false,
      author: result.author.username,
      createdAt: result.created_at,
    }
  },

  async listPRs(projectPath, sourceBranch) {
    const results = await glListMRs(projectPath, sourceBranch)
    return results.map((mr) => ({
      number: mr.iid,
      url: mr.web_url,
      title: mr.title,
      state: mr.state,
      sourceBranch: mr.source_branch,
      targetBranch: mr.target_branch,
      draft: mr.draft ?? false,
      author: mr.author.username,
      createdAt: mr.created_at,
    }))
  },

  async getDefaultBranch(projectPath) {
    return glGetDefaultBranch(projectPath)
  },

  async createIssue(params) {
    const result = await glCreateIssue({
      projectPath: params.projectPath,
      title: params.title,
      description: params.body,
      labels: params.labels,
    })
    if (!result) return null

    return {
      number: result.iid,
      url: result.web_url,
      title: result.title,
      state: result.state,
      author: result.author.username,
      createdAt: result.created_at,
      labels: result.labels,
    }
  },

  async listLabels(projectPath) {
    const results = await glListLabels(projectPath)
    return results.map((l) => ({
      name: l.name,
      color: l.color,
      description: l.description,
    }))
  },
})

// ── Factory ──────────────────────────────────────────────────────────

/**
 * Get platform API implementation by platform type
 */
export const getPlatformAPI = (platform: Platform): PlatformAPI => {
  if (platform === 'github') return createGitHubAPI()
  return createGitLabAPI()
}
