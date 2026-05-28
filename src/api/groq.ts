import path from 'node:path'

export type { GroqModel } from './groq-sdk.js'
export {
  generateBranchName,
  generateCommitMessage,
  generateReleaseNotes,
  generateText,
  getGroqModels as getGroqModelsLive,
  isAvailable,
} from './groq-sdk.js'

const FALLBACK_MODELS: Array<{ label: string; value: string }> = [
  { label: 'llama-3.3-70b-versatile', value: 'llama-3.3-70b-versatile' },
  { label: 'llama-3.1-8b-instant', value: 'llama-3.1-8b-instant' },
  { label: 'gemma2-9b-it', value: 'gemma2-9b-it' },
  { label: 'mixtral-8x7b-32768', value: 'mixtral-8x7b-32768' },
]

/**
 * Return Groq model choices — persisted file first, fallback to live API.
 */
export const getGroqModels = async (): Promise<Array<{ label: string; value: string }>> => {
  try {
    const fs = await import('node:fs')
    const modelFile = path.join(process.cwd(), '.geeto', 'groq-model.json')
    if (fs.existsSync(modelFile)) {
      const data = JSON.parse(fs.readFileSync(modelFile, 'utf8')) as Array<{
        label: string
        value: string
      }>
      if (Array.isArray(data) && data.length > 0) {
        return data
      }
    }
  } catch {
    /* fall through to live */
  }

  // Live API fallback
  try {
    const { getGroqModels: getLive } = await import('./groq-sdk.js')
    return await getLive()
  } catch {
    /* fall through to hardcoded */
  }

  return FALLBACK_MODELS
}
