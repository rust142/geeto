/**
 * Trello API integration
 */

import type { TrelloCard, TrelloLabel, TrelloList } from '../types/index.js'

import { getTrelloConfig } from '../utils/config.js'
import { log } from '../utils/logging.js'

/**
 * Fetch Trello lists from board
 */
export const fetchTrelloLists = async (): Promise<TrelloList[]> => {
  const config = getTrelloConfig()
  if (!config.apiKey || !config.token || !config.boardId) {
    return []
  }

  try {
    const response = await fetch(
      `https://api.trello.com/1/boards/${config.boardId}/lists?key=${config.apiKey}&token=${config.token}`,
      { method: 'GET' }
    )

    if (!response.ok) {
      log.clearLine()
      log.gap()
      log.warn(`Trello API error: ${response.status} ${response.statusText}`)
      return []
    }

    const lists = (await response.json()) as TrelloList[]
    return lists
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.clearLine()
    log.gap()
    log.warn(`Failed to fetch Trello lists: ${msg}`)
    return []
  }
}

/**
 * Fetch Trello cards from board (optionally filtered by list)
 */
export const fetchTrelloCards = async (listId?: string): Promise<TrelloCard[]> => {
  const config = getTrelloConfig()
  if (!config.apiKey || !config.token || !config.boardId) {
    return []
  }

  try {
    const response = await fetch(
      `https://api.trello.com/1/boards/${config.boardId}/cards?fields=id,name,desc,idShort,shortLink,url,idList,labels&checklists=all&key=${config.apiKey}&token=${config.token}`,
      { method: 'GET' }
    )

    if (!response.ok) {
      log.clearLine()
      log.gap()
      log.warn(`Trello API error: ${response.status} ${response.statusText}`)
      return []
    }

    let cards = (await response.json()) as TrelloCard[]

    if (listId) {
      cards = cards.filter((card) => card.idList === listId)
    }

    return cards.filter(
      (card) => !card.name.includes('[DONE]') && !card.name.includes('[ARCHIVED]')
    )
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    log.clearLine()
    log.gap()
    log.warn(`Failed to fetch Trello cards: ${msg}`)
    return []
  }
}

export const TRELLO_LABEL_COLORS = [
  'red',
  'pink',
  'orange',
  'yellow',
  'lime',
  'green',
  'sky',
  'blue',
  'purple',
  'black',
] as const

const trelloFetch = async (
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<unknown | null> => {
  const config = getTrelloConfig()
  if (!config.apiKey || !config.token) return null
  const sep = path.includes('?') ? '&' : '?'
  try {
    const res = await fetch(
      `https://api.trello.com/1${path}${sep}key=${config.apiKey}&token=${config.token}`,
      {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      }
    )
    if (!res.ok) {
      log.warn(`Trello API error: ${res.status} ${res.statusText}`)
      return null
    }
    const text = await res.text()
    return text ? (JSON.parse(text) as unknown) : true
  } catch (error: unknown) {
    log.warn(`Trello request failed: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

export const fetchTrelloLabels = async (): Promise<TrelloLabel[]> => {
  const config = getTrelloConfig()
  if (!config.boardId) return []
  const data = await trelloFetch('GET', `/boards/${config.boardId}/labels`)
  return Array.isArray(data) ? (data as TrelloLabel[]) : []
}

export const createTrelloLabel = async (
  name: string,
  color: string | null
): Promise<TrelloLabel | null> => {
  const config = getTrelloConfig()
  if (!config.boardId) return null
  const data = await trelloFetch('POST', `/labels`, {
    name,
    color: color ?? '',
    idBoard: config.boardId,
  })
  return data ? (data as TrelloLabel) : null
}

export const updateTrelloLabel = async (
  labelId: string,
  name: string,
  color: string | null
): Promise<boolean> => {
  const data = await trelloFetch('PUT', `/labels/${labelId}`, { name, color: color ?? '' })
  return data !== null
}

export const deleteTrelloLabel = async (labelId: string): Promise<boolean> => {
  const data = await trelloFetch('DELETE', `/labels/${labelId}`)
  return data !== null
}

export const addLabelToCard = async (cardId: string, labelId: string): Promise<boolean> => {
  const data = await trelloFetch('POST', `/cards/${cardId}/idLabels`, { value: labelId })
  return data !== null
}

export const removeLabelFromCard = async (cardId: string, labelId: string): Promise<boolean> => {
  const data = await trelloFetch('DELETE', `/cards/${cardId}/idLabels/${labelId}`)
  return data !== null
}

export const createTrelloCard = async (
  listId: string,
  name: string,
  desc?: string
): Promise<TrelloCard | null> => {
  const data = await trelloFetch('POST', `/cards`, { idList: listId, name, desc: desc ?? '' })
  return data ? (data as TrelloCard) : null
}

export const updateTrelloCard = async (
  cardId: string,
  fields: { name?: string; desc?: string }
): Promise<boolean> => {
  const data = await trelloFetch('PUT', `/cards/${cardId}`, fields)
  return data !== null
}

export const moveTrelloCard = async (cardId: string, listId: string): Promise<boolean> => {
  const data = await trelloFetch('PUT', `/cards/${cardId}`, { idList: listId })
  return data !== null
}

export const archiveTrelloCard = async (cardId: string): Promise<boolean> => {
  const data = await trelloFetch('PUT', `/cards/${cardId}`, { closed: true })
  return data !== null
}

export const deleteTrelloCard = async (cardId: string): Promise<boolean> => {
  const data = await trelloFetch('DELETE', `/cards/${cardId}`)
  return data !== null
}

/**
 * Generate branch name from Trello card title
 */
export const generateBranchNameFromTrelloTitle = (
  cardTitle: string,
  cardId: string,
  separator: string = '-'
): string => {
  const cleanTitle = cardTitle
    .toLowerCase()
    .replaceAll(/[^\s\w-]/gi, '')
    .replaceAll(/\s+/g, separator)
    .replace(separator === '-' ? /-+/g : /_+/g, separator)
    .replace(separator === '-' ? /^-|-$/g : /^_|_$/g, '')
  return `${cardId}${separator}${cleanTitle}`
}
