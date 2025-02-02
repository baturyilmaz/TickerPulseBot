import TelegramBot from 'node-telegram-bot-api'
import { z } from 'zod'
import { createSequentialTasks, getMoreInfoTasks } from './index'
import { setCurrentChatId, cleanupOldSessions } from './shared-state'
import { v4 as uuidv4 } from 'uuid'
import { searchTokens, TokenSearchResult, SelectedTokenInfo } from './services/dexscreen'

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

interface PendingSearch {
  results: TokenSearchResult[]
  timestamp: number
}

// Keep track of pending searches
const pendingSearches = new Map<string, PendingSearch>()

// Clean up old pending searches every hour
setInterval(() => {
  const now = Date.now()
  for (const [uuid, search] of pendingSearches.entries()) {
    if (now - search.timestamp > 3600000) {
      // 1 hour
      pendingSearches.delete(uuid)
    }
  }
}, 3600000)

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
        const cleanTicker = ticker.substring(1) // Remove $
        const requestId = generateShortUuid()
        console.log(`Found ticker: ${cleanTicker} in chat ${chatId}, Request ID: ${requestId}`)

        try {
          const results = await searchTokens(cleanTicker)

          if (results.length === 0) {
            await bot.sendMessage(chatId, `No tokens found matching ${ticker}`)
            continue
          }

          // Store the search results
          pendingSearches.set(requestId, {
            results,
            timestamp: Date.now()
          })

          // Format the results message
          const limitedResults = results.slice(0, 5) // Limit to max 5 results
          let message = `🔍 *Found ${results.length} tokens matching ${ticker}*\n`
          message += `${results.length > 5 ? '(Showing top 5 results)\n' : ''}`
          message += `\nPlease select one to analyze:\n\n`

          limitedResults.forEach((token, index) => {
            message += `*${index + 1}. ${token.name} (${token.symbol})*\n\n`
            message += `   🕒 Created: ${token.age}\n`
            message += `   ⛓️ Chain: ${token.chain}\n`
            message += `   🏦 DEX: ${token.dex}\n`
            message += `   📝 Address: \`${token.address}\`\n`
            message += `\n${index < limitedResults.length - 1 ? '━━━━━━━━━━━━━━━━\n\n' : ''}`
          })

          // Create inline keyboard
          const keyboard = {
            inline_keyboard: limitedResults.map((_, index) => [
              {
                text: `Select ${index + 1}`,
                callback_data: `select_${requestId}_${index}`
              }
            ])
          }

          await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
          })
        } catch (error) {
          console.error(`Error processing ticker ${cleanTicker}:`, error)
          await bot.sendMessage(
            chatId,
            `Error processing ticker ${cleanTicker}: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        }
      }
    }
  })

  // Handle inline button clicks
  bot.on('callback_query', async query => {
    if (!query.message || !query.data) return

    const chatId = query.message.chat.id
    const [action, requestId, selectionStr] = query.data.split('_')

    if (action === 'select') {
      const selection = parseInt(selectionStr)
      const pendingSearch = pendingSearches.get(requestId)

      if (!pendingSearch) {
        await bot.answerCallbackQuery(query.id, {
          text: 'Search results have expired. Please try searching again.',
          show_alert: true
        })
        return
      }

      const { results } = pendingSearch
      if (selection < 0 || selection >= results.length) {
        await bot.answerCallbackQuery(query.id, {
          text: 'Invalid selection. Please try again.',
          show_alert: true
        })
        return
      }

      try {
        const selectedToken = results[selection]
        setCurrentChatId(chatId, requestId)

        // Acknowledge the button click
        await bot.answerCallbackQuery(query.id, {
          text: `Starting analysis of ${selectedToken.name}...`
        })

        // Update the message to show selection
        await bot.editMessageText(
          `Analysis started for ${selectedToken.name} (${selectedToken.chain}) (ID ${requestId})...`,
          {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: { inline_keyboard: [] } // Remove the buttons
          }
        )

        // Pass the complete token info
        const tokenInfo: SelectedTokenInfo = {
          symbol: selectedToken.symbol,
          address: selectedToken.address,
          chain: selectedToken.chain
        }

        await createSequentialTasks(tokenInfo, requestId)
        pendingSearches.delete(requestId)
      } catch (error) {
        console.error('Error starting analysis:', error)
        await bot.answerCallbackQuery(query.id, {
          text: 'Error starting analysis. Please try again.',
          show_alert: true
        })
      }
    }

    if (action === 'more') {
      try {
        // Acknowledge the button click
        await bot.answerCallbackQuery(query.id, {
          text: 'Starting additional analysis...'
        })

        // Update the button to show processing state
        await bot.editMessageReplyMarkup(
          {
            inline_keyboard: [
              [
                {
                  text: '🔄 Processing Additional Analysis...',
                  callback_data: 'processing'
                }
              ]
            ]
          },
          {
            chat_id: chatId,
            message_id: query.message.message_id
          }
        )

        const success = await getMoreInfoTasks(requestId)

        if (!success) {
          // Update button to show waiting state
          await bot.editMessageReplyMarkup(
            {
              inline_keyboard: [
                [
                  {
                    text: '⏳ Initial Analysis Still in Progress...',
                    callback_data: `more_${requestId}`
                  }
                ]
              ]
            },
            {
              chat_id: chatId,
              message_id: query.message.message_id
            }
          )

          await bot.answerCallbackQuery(query.id, {
            text: 'Please wait for the initial analysis to complete.',
            show_alert: true
          })
          return
        }

        // Update the message to show confirmation
        await bot.editMessageReplyMarkup(
          {
            inline_keyboard: [
              [
                {
                  text: '✅ Additional Analysis Requested',
                  callback_data: 'completed'
                }
              ]
            ]
          },
          {
            chat_id: chatId,
            message_id: query.message.message_id
          }
        )
      } catch (error) {
        console.error('Error processing more info request:', error)
        await bot.answerCallbackQuery(query.id, {
          text: 'Error starting additional analysis. Please try again.',
          show_alert: true
        })
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
