// CommonJS wrapper for ESM Dangerfile
// This file allows Danger's require() to load a CJS module which then dynamically imports
// the real ESM dangerfile (`dangerfile.esm.mjs`) so top-level await / ESM syntax works.

;(async () => {
  try {
    await import('./dangerfile.esm.mjs')
  } catch (e) {
    console.error('Failed to load ESM dangerfile:', e)
    throw e
  }
})()
