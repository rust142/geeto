/**
 * Security & Quality Gate - AI-powered security and code quality analyzer
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import type { CopilotModel } from '../api/copilot.js'
import type { GeminiModel } from '../api/gemini.js'
import type { OpenRouterModel } from '../api/openrouter.js'

import { confirm } from '../cli/input.js'
import { multiSelect, select } from '../cli/menu.js'
import { colors } from '../utils/colors.js'
import { exec } from '../utils/exec.js'
import { generateCommitMessageWithProvider } from '../utils/git-ai.js'
import { getCurrentBranch, getStagedFiles } from '../utils/git.js'
import { log } from '../utils/logging.js'
import { loadState } from '../utils/state.js'

interface SecurityIssue {
  type: 'security' | 'quality'
  severity: 'high' | 'medium' | 'low'
  title: string
  description: string
  location?: string
  suggestion: string
}

interface SecurityScanResult {
  securityWarnings: SecurityIssue[]
  qualityIssues: SecurityIssue[]
  summary: string
  overallRisk: 'high' | 'medium' | 'low' | 'none'
}

/**
 * Collect data for security analysis
 */
function collectSecurityData(): { diff: string; files: string[]; hasDependencies: boolean } {
  // Get staged files or all changed files
  const stagedFiles = getStagedFiles()
  const files = stagedFiles.length > 0 ? stagedFiles : []

  // Get diff
  let diff = ''
  try {
    if (stagedFiles.length > 0) {
      diff = exec('git diff --cached', true)
    } else {
      diff = exec('git diff HEAD', true)
    }
  } catch {
    diff = 'No diff available'
  }

  // Truncate if too long
  const truncatedDiff =
    diff.length > 10000 ? diff.slice(0, 10000) + '\n\n... (diff truncated)' : diff

  // Check for dependency changes
  const hasDependencies = files.some(
    (f) =>
      f.includes('package.json') ||
      f.includes('requirements.txt') ||
      f.includes('Gemfile') ||
      f.includes('pom.xml') ||
      f.includes('go.mod')
  )

  return {
    diff: truncatedDiff,
    files,
    hasDependencies,
  }
}

/**
 * Collect data from specific commits for security analysis
 */
function collectCommitData(commitHashes: string[]): {
  diff: string
  files: string[]
  hasDependencies: boolean
} {
  let diff = ''
  const allFiles = new Set<string>()

  for (const hash of commitHashes) {
    try {
      const commitDiff = exec(`git show ${hash} --format="" --patch`, true)
      diff += commitDiff + '\n'
    } catch {
      // skip if commit can't be read
    }

    try {
      const files = exec(`git show ${hash} --format="" --name-only`, true)
        .split('\n')
        .filter(Boolean)
      for (const f of files) allFiles.add(f)
    } catch {
      // skip
    }
  }

  const files = [...allFiles]

  // Truncate if too long
  const truncatedDiff =
    diff.length > 10000 ? diff.slice(0, 10000) + '\n\n... (diff truncated)' : diff

  const hasDependencies = files.some(
    (f) =>
      f.includes('package.json') ||
      f.includes('requirements.txt') ||
      f.includes('Gemfile') ||
      f.includes('pom.xml') ||
      f.includes('go.mod')
  )

  return { diff: truncatedDiff, files, hasDependencies }
}

/**
 * Get recent commits for selection
 */
function getRecentCommits(count = 30): Array<{
  hash: string
  shortHash: string
  subject: string
  date: string
}> {
  try {
    const logOutput = exec(`git log -${count} --no-merges --format="%H|%h|%s|%cr"`, true)
    return logOutput
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, shortHash, subject, date] = line.split('|')
        return {
          hash: hash ?? '',
          shortHash: shortHash ?? '',
          subject: subject ?? '',
          date: date ?? '',
        }
      })
      .filter((c) => c.hash !== '')
  } catch {
    return []
  }
}

/**
 * Build AI prompt for security analysis
 */
function buildSecurityPrompt(data: {
  diff: string
  files: string[]
  hasDependencies: boolean
}): string {
  const { diff, files, hasDependencies } = data

  const prompt = `You are an AI Security Reviewer for application code.

**Context:**
- Files changed: ${files.length}
- Changed files: ${files.slice(0, 10).join(', ')}${files.length > 10 ? ' ...' : ''}
- Dependency changes: ${hasDependencies ? 'Yes' : 'No'}

**Code Changes (diff):**
\`\`\`diff
${diff}
\`\`\`

**Your Task:**
Analyze the code for potential security and quality issues.

**Security Analysis - Look for:**
1. Hardcoded secrets (API keys, passwords, tokens)
2. Exposed credentials or sensitive data
3. Risky dependencies or known vulnerabilities
4. Vulnerable code patterns:
  - SQL injection risks
  - XSS (Cross-Site Scripting) vulnerabilities
  - Command injection
  - Path traversal
  - Insecure random number generation
  - Weak cryptography
  - Authentication/authorization bypasses
5. Configuration issues (exposed debug mode, unsafe CORS, etc.)

**Quality Analysis - Look for:**
1. Overly complex logic (nested loops, deep conditionals)
2. Code duplication
3. Violations of common best practices
4. Missing error handling
5. Inconsistent naming or patterns

**Important:**
- Focus on REAL issues, not theoretical ones
- Provide practical explanations: WHY is it dangerous or problematic?
- Suggest realistic, actionable fixes
- Do NOT block the workflow - focus on education and risk mitigation
- If no issues found, say so clearly

**Output Format (use this exact structure):**

SECURITY_WARNINGS:
[If found, list each warning as:]
- SEVERITY: [high/medium/low]
- TITLE: [short title]
- DESCRIPTION: [why is this dangerous?]
- LOCATION: [file:line or general area]
- SUGGESTION: [how to fix it]

[If no security warnings:]
- None detected

QUALITY_ISSUES:
[If found, list each issue as:]
- SEVERITY: [high/medium/low]
- TITLE: [short title]
- DESCRIPTION: [what's the problem?]
- LOCATION: [file:line or general area]
- SUGGESTION: [how to improve it]

[If no quality issues:]
- None detected

OVERALL_RISK: [high/medium/low/none]

SUMMARY:
[1-2 sentence summary of findings]
`

  return prompt
}

/**
 * Parse AI response into structured security result
 */
function parseSecurityResponse(response: string): SecurityScanResult {
  const lines = response.split('\n')
  const securityWarnings: SecurityIssue[] = []
  const qualityIssues: SecurityIssue[] = []
  let summary = 'No issues detected'
  let overallRisk: SecurityScanResult['overallRisk'] = 'none'

  let section = ''
  let currentIssue: Partial<SecurityIssue> = {}

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('SECURITY_WARNINGS:')) {
      section = 'security'
      currentIssue = {}
    } else if (trimmed.startsWith('QUALITY_ISSUES:')) {
      section = 'quality'
      currentIssue = {}
    } else if (trimmed.startsWith('OVERALL_RISK:')) {
      const risk = trimmed.replace('OVERALL_RISK:', '').trim().toLowerCase()
      if (risk === 'high' || risk === 'medium' || risk === 'low' || risk === 'none') {
        overallRisk = risk
      }
      section = ''
    } else if (trimmed.startsWith('SUMMARY:')) {
      section = 'summary'
    } else if (section === 'summary' && trimmed) {
      summary = trimmed
    } else if (
      (section === 'security' || section === 'quality') &&
      trimmed.startsWith('- SEVERITY:')
    ) {
      // Save previous issue if exists
      if (currentIssue.title) {
        const issue: SecurityIssue = {
          type: section,
          severity: currentIssue.severity ?? 'low',
          title: currentIssue.title ?? 'Unknown issue',
          description: currentIssue.description ?? '',
          location: currentIssue.location,
          suggestion: currentIssue.suggestion ?? 'Review and fix',
        }
        if (section === 'security') {
          securityWarnings.push(issue)
        } else {
          qualityIssues.push(issue)
        }
      }

      // Start new issue
      const severity = trimmed.replace('- SEVERITY:', '').trim().toLowerCase()
      currentIssue = {
        severity:
          severity === 'high' || severity === 'medium' || severity === 'low' ? severity : 'low',
      }
    } else if (
      (section === 'security' || section === 'quality') &&
      trimmed.startsWith('- TITLE:')
    ) {
      currentIssue.title = trimmed.replace('- TITLE:', '').trim()
    } else if (
      (section === 'security' || section === 'quality') &&
      trimmed.startsWith('- DESCRIPTION:')
    ) {
      currentIssue.description = trimmed.replace('- DESCRIPTION:', '').trim()
    } else if (
      (section === 'security' || section === 'quality') &&
      trimmed.startsWith('- LOCATION:')
    ) {
      currentIssue.location = trimmed.replace('- LOCATION:', '').trim()
    } else if (
      (section === 'security' || section === 'quality') &&
      trimmed.startsWith('- SUGGESTION:')
    ) {
      currentIssue.suggestion = trimmed.replace('- SUGGESTION:', '').trim()
    }
  }

  // Save last issue
  if (currentIssue.title) {
    const issue: SecurityIssue = {
      type: section === 'security' ? 'security' : 'quality',
      severity: currentIssue.severity ?? 'low',
      title: currentIssue.title ?? 'Unknown issue',
      description: currentIssue.description ?? '',
      location: currentIssue.location,
      suggestion: currentIssue.suggestion ?? 'Review and fix',
    }
    if (section === 'security') {
      securityWarnings.push(issue)
    } else {
      qualityIssues.push(issue)
    }
  }

  return {
    securityWarnings,
    qualityIssues,
    summary,
    overallRisk,
  }
}

/**
 * Run security scan with AI
 */
async function runSecurityScan(
  data: { diff: string; files: string[]; hasDependencies: boolean },
  aiProvider: 'gemini' | 'copilot' | 'openrouter',
  model?: string
): Promise<string | null> {
  const prompt = buildSecurityPrompt(data)
  const spinner = log.spinner()

  try {
    const modelInfo = model ? ` (${model})` : ''
    console.log('')
    spinner.start(`Analyzing code security and quality with ${aiProvider}${modelInfo}...`)

    let result: string | null = null

    // Use generateCommitMessage as a generic text generator
    result = await generateCommitMessageWithProvider(
      aiProvider,
      prompt,
      undefined,
      model as CopilotModel,
      model as OpenRouterModel,
      model as GeminiModel
    )

    spinner.stop()

    if (result) {
      return result
    }

    log.warn('AI returned empty response')
    return null
  } catch (error) {
    spinner.fail(`Failed to analyze security: ${error}`)
    return null
  }
}

/**
 * Display security scan results
 */
function displaySecurityResults(result: SecurityScanResult): void {
  console.log('')
  console.log(
    `${colors.cyan}┌─ Security & Quality Gate ───────────────────────────────┐${colors.reset}`
  )

  // Overall risk
  const riskColor =
    result.overallRisk === 'high'
      ? colors.red
      : result.overallRisk === 'medium'
        ? colors.yellow
        : colors.green
  console.log(
    `${colors.cyan}│${colors.reset} Overall Risk: ${riskColor}${result.overallRisk.toUpperCase()}${colors.reset}`
  )
  console.log(`${colors.cyan}│${colors.reset} Summary: ${result.summary}`)
  console.log(
    `${colors.cyan}│${colors.reset} Security Warnings: ${result.securityWarnings.length > 0 ? colors.red + result.securityWarnings.length : colors.green + '0'}${colors.reset}`
  )
  console.log(
    `${colors.cyan}│${colors.reset} Quality Issues: ${result.qualityIssues.length > 0 ? colors.yellow + result.qualityIssues.length : colors.green + '0'}${colors.reset}`
  )
  console.log(
    `${colors.cyan}└─────────────────────────────────────────────────────────┘${colors.reset}`
  )
  console.log('')

  // Security warnings
  if (result.securityWarnings.length > 0) {
    console.log(colors.red + colors.bright + '⚠ SECURITY WARNINGS:' + colors.reset + '\n')
    for (const warning of result.securityWarnings) {
      const sevColor =
        warning.severity === 'high'
          ? colors.red
          : warning.severity === 'medium'
            ? colors.yellow
            : colors.blue
      console.log(
        `  ${sevColor}●${colors.reset} ${colors.bright}${warning.title}${colors.reset} [${sevColor}${warning.severity}${colors.reset}]`
      )
      console.log(`    ${colors.gray}Description:${colors.reset} ${warning.description}`)
      if (warning.location) {
        console.log(`    ${colors.gray}Location:${colors.reset} ${warning.location}`)
      }
      console.log(`    ${colors.green}Suggestion:${colors.reset} ${warning.suggestion}`)
      console.log('')
    }
  }

  // Quality issues
  if (result.qualityIssues.length > 0) {
    console.log(colors.yellow + colors.bright + '📋 QUALITY ISSUES:' + colors.reset + '\n')
    for (const issue of result.qualityIssues) {
      const sevColor =
        issue.severity === 'high'
          ? colors.red
          : issue.severity === 'medium'
            ? colors.yellow
            : colors.blue
      console.log(
        `  ${sevColor}●${colors.reset} ${colors.bright}${issue.title}${colors.reset} [${sevColor}${issue.severity}${colors.reset}]`
      )
      console.log(`    ${colors.gray}Description:${colors.reset} ${issue.description}`)
      if (issue.location) {
        console.log(`    ${colors.gray}Location:${colors.reset} ${issue.location}`)
      }
      console.log(`    ${colors.green}Suggestion:${colors.reset} ${issue.suggestion}`)
      console.log('')
    }
  }
}

/**
 * Save security report to file
 */
async function saveSecurityReport(result: SecurityScanResult, filename: string): Promise<void> {
  const outputDir = path.join(process.cwd(), '.geeto')
  await fs.mkdir(outputDir, { recursive: true })

  let report = `# Security & Quality Gate Report\n\n`
  report += `**Generated:** ${new Date().toISOString()}\n`
  report += `**Branch:** ${getCurrentBranch()}\n`
  report += `**Overall Risk:** ${result.overallRisk.toUpperCase()}\n\n`
  report += `## Summary\n\n${result.summary}\n\n`

  if (result.securityWarnings.length > 0) {
    report += `## Security Warnings\n\n`
    for (const warning of result.securityWarnings) {
      report += `### ${warning.title} [${warning.severity.toUpperCase()}]\n\n`
      report += `**Description:** ${warning.description}\n\n`
      if (warning.location) {
        report += `**Location:** ${warning.location}\n\n`
      }
      report += `**Suggestion:** ${warning.suggestion}\n\n`
    }
  }

  if (result.qualityIssues.length > 0) {
    report += `## Quality Issues\n\n`
    for (const issue of result.qualityIssues) {
      report += `### ${issue.title} [${issue.severity.toUpperCase()}]\n\n`
      report += `**Description:** ${issue.description}\n\n`
      if (issue.location) {
        report += `**Location:** ${issue.location}\n\n`
      }
      report += `**Suggestion:** ${issue.suggestion}\n\n`
    }
  }

  const filePath = path.join(outputDir, filename)
  await fs.writeFile(filePath, report, 'utf8')
  log.success(`Security report saved to: ${colors.cyan}${filePath}${colors.reset}`)
}

/**
 * Main Security Gate workflow
 */
export async function showSecurityGateMenu(): Promise<void> {
  log.step('Security & Quality Gate')

  // Get current state to check AI provider
  const state = loadState()

  if (!state?.aiProvider || state.aiProvider === 'manual') {
    log.warn('No AI provider configured. Please run main workflow first to set up AI provider.')
    const setupNow = confirm('Set up AI provider now?')

    if (setupNow) {
      const { handleAIProviderSelection } = await import('./ai-provider.js')
      const selection = await handleAIProviderSelection()

      if (!selection.aiProvider || selection.aiProvider === 'manual') {
        log.error('AI provider required for security analysis. Exiting.')
        return
      }
    } else {
      return
    }
  }

  const currentBranch = getCurrentBranch()
  log.info(`Current branch: ${colors.cyan}${currentBranch}${colors.reset}`)

  // Choose what to analyze
  const scanChoice = await select('What would you like to analyze?', [
    { label: 'Staged changes', value: 'staged' },
    { label: 'All uncommitted changes', value: 'all' },
    { label: 'Specific commits', value: 'commits' },
    { label: 'Cancel', value: 'cancel' },
  ])

  if (scanChoice === 'cancel') {
    return
  }

  let scanData: { diff: string; files: string[]; hasDependencies: boolean }

  if (scanChoice === 'commits') {
    // Fetch recent commits and let user pick
    const commits = getRecentCommits()

    if (commits.length === 0) {
      log.warn('No commits found.')
      return
    }

    const commitChoices = commits.map((c) => ({
      label: `${colors.yellow}${c.shortHash}${colors.reset} ${c.subject} ${colors.gray}(${c.date})${colors.reset}`,
      value: c.hash,
    }))

    const selectedHashes = await multiSelect('Select commits to analyze:', commitChoices)

    if (selectedHashes.length === 0) {
      log.warn('No commits selected. Cancelled.')
      return
    }

    log.info(`Analyzing ${colors.cyan}${selectedHashes.length}${colors.reset} commits`)

    const spinner = log.spinner()
    spinner.start('Collecting commit changes...')
    scanData = collectCommitData(selectedHashes)
    spinner.stop()
  } else {
    // Collect staged or all uncommitted changes
    const spinner = log.spinner()
    spinner.start('Collecting code changes...')
    scanData = collectSecurityData()
    spinner.stop()
  }

  if (!scanData.diff || scanData.diff === 'No diff available' || scanData.diff.trim() === '') {
    log.warn('No code changes detected. Nothing to analyze.')
    return
  }

  log.info(`Files to analyze: ${scanData.files.length}`)
  if (scanData.hasDependencies) {
    log.warn('⚠ Dependency changes detected - will check for known vulnerabilities')
  }

  // Run security scan
  const aiResponse = await runSecurityScan(
    scanData,
    state!.aiProvider as 'gemini' | 'copilot' | 'openrouter',
    state!.copilotModel ?? state!.openrouterModel ?? state!.geminiModel
  )

  if (!aiResponse) {
    log.error('Failed to complete security analysis')
    return
  }

  // Parse and display
  const scanResult = parseSecurityResponse(aiResponse)
  displaySecurityResults(scanResult)

  // Ask to save report
  if (scanResult.securityWarnings.length > 0 || scanResult.qualityIssues.length > 0) {
    const shouldSave = confirm('Save security report to file?')

    if (shouldSave) {
      const filename = `security-report-${currentBranch.replaceAll(/[^a-z0-9-]/gi, '-')}-${Date.now()}.md`
      await saveSecurityReport(scanResult, filename)
    }
  }

  // Warning for high-risk findings
  if (scanResult.overallRisk === 'high') {
    console.log(
      colors.red +
        colors.bright +
        '⚠ HIGH RISK detected - Please review and address security warnings before proceeding' +
        colors.reset
    )
  } else if (scanResult.overallRisk === 'medium') {
    console.log(
      colors.yellow + '⚠ MEDIUM RISK - Consider addressing the issues identified' + colors.reset
    )
  }

  console.log('')
  log.success('Security gate analysis complete!')
  console.log('')

  // Back to menu option
  const backChoice = await select('What would you like to do next?', [
    { label: 'Back to main menu', value: 'back' },
    { label: 'Exit', value: 'exit' },
  ])

  if (backChoice === 'back') {
    const { main } = await import('./main.js')
    await main()
  }
}
