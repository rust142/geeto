/**
 * Step constants for flow control
 */

export const STEP = {
  INIT: 0,
  STAGED: 1,
  BRANCH_CREATED: 2,
  COMMITTED: 3,
  PUSHED: 4,
  MERGED: 5,
  CLEANUP: 6,
  DONE: 7,
} as const

/**
 * Task platform constants
 */
export const TASK_PLATFORMS = [
  { name: 'Trello', value: 'trello' as const, enabled: true },
  // Future platforms:
  // { name: 'Jira', value: 'jira' as const, enabled: false },
  // { name: 'Asana', value: 'asana' as const, enabled: false },
  // { name: 'Linear', value: 'linear' as const, enabled: false },
]
