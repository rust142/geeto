/**
 * Trello API integration
 */

import type { TrelloCard, TrelloList } from '../types/index.js'

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
      console.log('') // Force newline to separate from any active spinner
      log.warn(`Trello API error: ${response.status} ${response.statusText}`)
      return []
    }

    const lists = (await response.json()) as TrelloList[]
    return lists
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.log('') // Force newline to separate from any active spinner
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
      `https://api.trello.com/1/boards/${config.boardId}/cards?fields=id,name,desc,idShort,shortLink,url,idList&key=${config.apiKey}&token=${config.token}`,
      { method: 'GET' }
    )

    if (!response.ok) {
      console.log('') // Force newline to separate from any active spinner
      log.warn(`Trello API error: ${response.status} ${response.statusText}`)
      return []
    }

    let cards = (await response.json()) as TrelloCard[]

    if (listId) {
      cards = cards.filter((card) => card.idList === listId)
    }

    // Filter out done/archived cards
    return cards.filter(
      (card) => !card.name.includes('[DONE]') && !card.name.includes('[ARCHIVED]')
    )
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.log('') // Force newline to separate from any active spinner
    log.warn(`Failed to fetch Trello cards: ${msg}`)
    return []
  }
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
