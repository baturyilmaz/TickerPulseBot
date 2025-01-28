import TelegramBot from 'node-telegram-bot-api'
import { z } from 'zod'
import { createSequentialTasks } from './index'
import { setCurrentChatId, cleanupOldSessions } from './shared-state'
import { v4 as uuidv4 } from 'uuid'

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string()
})

const env = envSchema.parse({
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN
})

function generateShortUuid(): string {
  return uuidv4().split('-')[0].substring(0, 5).toUpperCase()
}

export const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: true })
const tickerRegex = /\$([A-Za-z0-9]+)/g

export function startTelegramBot() {
  console.log('Starting Telegram bot...')

  // Clean up old sessions on startup
  cleanupOldSessions()

  // Set up a periodic cleanup (e.g., every 6 hours)
  setInterval(cleanupOldSessions, 6 * 60 * 60 * 1000)

  bot.on('message', async msg => {
    const chatId = msg.chat.id
    const messageText = msg.text || ''
    const tickers = messageText.match(tickerRegex)

    if (tickers) {
      for (const ticker of tickers) {
        const cleanTicker = ticker.substring(1)
        const requestId = generateShortUuid()
        console.log(`Found ticker: ${cleanTicker} in chat ${chatId}, Request ID: ${requestId}`)

        try {
          setCurrentChatId(chatId, requestId)

          await bot.sendMessage(chatId, `Processing ticker: ${cleanTicker} (ID: ${requestId})`)
          const response = await createSequentialTasks(cleanTicker, requestId)
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          console.error(`Error processing ticker ${cleanTicker} (ID: ${requestId}):`, error)
          await bot.sendMessage(
            chatId,
            `Error processing ticker ${cleanTicker} (ID: ${requestId}): ${errorMessage}`
          )
        }
      }
    }
  })

  bot.on('error', error => {
    console.error('Telegram bot error:', error)
  })

  bot.on('polling_error', error => {
    console.error('Telegram polling error:', error)
  })
}
