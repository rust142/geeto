#!/usr/bin/env node
/**
 * Geeto - Git flow automation CLI tool with AI-powered branch naming
 * Main entry point - delegates to modular workflows
 */
import { main } from './workflows/main'

// Start the application
main().catch((error: unknown) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
