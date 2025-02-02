import { z } from 'zod'
import { Agent } from '@openserv-labs/sdk'
import 'dotenv/config'
import { bot, startTelegramBot } from './telegram-bot'
import { getCurrentChatId } from './shared-state'
import { convertToTelegramMarkdown, reportFormat, env } from './helper'
import { getDexScreenData } from './services/dexscreen'
import { getTwitterData } from './services/twitter'
import { getWebpageContent } from './services/webpage'
import { createCombinedReport } from './services/report'
import { formatTokenReport, TwitterData, FormattedReport } from './services/telegram-formatter'
import { WorkspaceFile } from './types'
import { SelectedTokenInfo } from './services/dexscreen'

if (!process.env.WORKSPACE_ID) {
  throw new Error('Required environment variables are missing')
}

const WORKSPACE_ID = parseInt(process.env.WORKSPACE_ID)

const AGENT = env.AGENT_ID
const SEARCH_AGENT = env.SEARCH_AGENT_ID
const COPY_WRITER = env.COPY_WRITER_ID

const teleTickerAgent = new Agent({
  systemPrompt: `You are an AI agent capable of formatting and sending messages to Telegram`
})

teleTickerAgent.addCapability({
  name: 'getReportBase',
  description: 'Get base report data for a ticker',
  schema: z.object({
    tokenInfo: z.object({
      symbol: z.string(),
      address: z.string(),
      chain: z.string()
    }),
    uuid: z.string()
  }),
  async run({ args, action }) {
    try {
      const reportData: { dexscreen?: any; twitter?: any; website?: string } = {}

      const dexscreenData = await getDexScreenData(args.tokenInfo)
      const chatId = getCurrentChatId(args.uuid)

      if (!dexscreenData) {
        if (chatId) {
          await bot.sendMessage(
            chatId,
            `❌ *Error:* Could not fetch data for ${args.tokenInfo.symbol}. The token might not exist or DexScreen service might be unavailable.`,
            {
              parse_mode: 'Markdown'
            }
          )
        }
        return 'Could not fetch DexScreen data'
      }

      console.log(JSON.stringify(dexscreenData, null, 2))
      reportData.dexscreen = dexscreenData

      // Send combined data to Telegram
      if (chatId) {
        let twitterData: TwitterData | undefined
        if (dexscreenData.twitter && dexscreenData.twitter !== 'N/A' && action?.workspace?.id) {
          twitterData = await getTwitterData(
            teleTickerAgent,
            action.workspace.id,
            dexscreenData.twitter
          )
          if (twitterData) {
            reportData.twitter = twitterData
          }
        }

        const formattedReport: FormattedReport = formatTokenReport(
          dexscreenData,
          twitterData,
          args.uuid
        )

        // Create inline keyboard for "more" button if needed
        const keyboard = formattedReport.needsMoreButton
          ? {
              inline_keyboard: [
                [
                  {
                    text: '🔍 Get Additional Analysis',
                    callback_data: `more_${args.uuid}`
                  }
                ]
              ]
            }
          : undefined

        await bot.sendMessage(chatId, formattedReport.text, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        })

        // Get website content if available
        if (dexscreenData.website && dexscreenData.website !== 'N/A') {
          const webContent = await getWebpageContent(dexscreenData.website)
          if (webContent) {
            reportData.website = webContent
          }
        }
      }

      // Create combined report and upload to system
      const combinedReport = await createCombinedReport(args.tokenInfo.symbol, reportData)
      const reportFileName = `${args.uuid}_${args.tokenInfo.symbol}_COMBINED_REPORT.md`

      if (action?.workspace?.id) {
        await teleTickerAgent.uploadFile({
          workspaceId: action.workspace.id,
          path: reportFileName,
          file: Buffer.from(combinedReport, 'utf-8')
        })
      }

      return 'Base report data fetched successfully'
    } catch (error) {
      console.error('Error in getReportBase:', error)
      return 'Base report data fetch failed'
    }
  }
})

teleTickerAgent.addCapability({
  name: 'sendLatestResults',
  description: 'Send latest results to the Telegram bot',
  schema: z.object({
    uuid: z.string(),
    content: z.string()
  }),
  async run({ args }) {
    const chatId = getCurrentChatId(args.uuid)
    if (!chatId) {
      return 'No chat ID available'
    }

    try {
      // Escape special characters for MarkdownV2
      await bot.sendMessage(chatId, convertToTelegramMarkdown(args.content), {
        parse_mode: 'MarkdownV2'
      })
      return 'Message sent successfully'
    } catch (error) {
      console.error('Error sending message:', error)
      // Fallback to plain text if markdown fails
      try {
        await bot.sendMessage(chatId, args.content, { parse_mode: undefined })
        return 'Message sent as plain text'
      } catch (fallbackError) {
        console.error('Fallback error:', fallbackError)
        return 'Failed to send message'
      }
    }
  }
})

async function createSequentialTasks(tokenInfo: SelectedTokenInfo, uuid: string): Promise<void> {
  const baseReportTask = await teleTickerAgent.createTask({
    workspaceId: WORKSPACE_ID,
    assignee: AGENT,
    body: `Get base report data for ${tokenInfo.symbol} with address ${tokenInfo.address} on chain ${tokenInfo.chain}`,
    description: `Get initial base report data for ${tokenInfo.symbol}`,
    input: JSON.stringify({ tokenInfo, uuid }),
    expectedOutput: `Confirmation or error message of base report data fetched successfully`,
    dependencies: []
  })

  const webSearchTask = await teleTickerAgent.createTask({
    workspaceId: WORKSPACE_ID,
    assignee: SEARCH_AGENT,
    body: `Conduct a focused web search for ${tokenInfo.symbol + ' token'} (do not delete or add anything to this search query). 
    Gather relevant news, headlines, and references. Do not include any price or market cap information.`,
    description: `Web research for ${tokenInfo.symbol + ' token'}`,
    input: tokenInfo.symbol,
    expectedOutput: `JSON containing web research data, save it as json file saved as: ${uuid}_${tokenInfo.symbol}_WEB_RESEARCH_DATA.json }`,
    dependencies: []
  })

  const generateReportTask = await teleTickerAgent.createTask({
    workspaceId: WORKSPACE_ID,
    assignee: COPY_WRITER,
    body: `Prepare a thorough, insightful report on the given ticker.Provide meaningful commentary on the results, explaining 
    their potential implications or relevance in the broader context.
    The REPORT MUST FOLLOW THE FOLLOWING FORMAT: ${reportFormat}"
    `,
    description: `Comprehensive analysis and commentary on ${tokenInfo.symbol}`,
    input: `${uuid}_${tokenInfo.symbol}_COMBINED_REPORT.md and ${uuid}_${tokenInfo.symbol}_WEB_RESEARCH_DATA.json`,
    expectedOutput: `Report in following format ${reportFormat} and saved as ${uuid}_${tokenInfo.symbol}_REPORT.md`,
    dependencies: [baseReportTask.id, webSearchTask.id]
  })
}

async function getMoreInfoTasks(uuid: string): Promise<boolean> {
  try {
    // Get all files
    const files = await teleTickerAgent.getFiles({
      workspaceId: WORKSPACE_ID
    })

    // Find the exact REPORT.md file
    const reportFile = files.find((file: WorkspaceFile) => {
      const pattern = new RegExp(`${uuid}_[A-Za-z0-9]+_REPORT\\.md$`)
      return pattern.test(file.path)
    })

    if (!reportFile) {
      console.log(`Report file not found for UUID ${uuid}, tasks still in progress`)
      return false
    }

    // Extract ticker from filename (format: UUID_TICKER_REPORT.md)
    const ticker = reportFile.path.split('_')[1]

    const sendReportTask = await teleTickerAgent.createTask({
      workspaceId: WORKSPACE_ID,
      assignee: AGENT,
      body: `Send the generated ${uuid}_${ticker}_REPORT.md content to the specified Telegram bot or channel along with uuid. uuid for this message is ${uuid}`,
      description: `Send generated content to Telegram`,
      input: `${uuid}_${ticker}_REPORT.md content and the uuid : ${uuid}`,
      expectedOutput: `Confirmation of message sent to Telegram.`,
      dependencies: []
    })

    return true
  } catch (error) {
    console.error('Error in getMoreInfoTasks:', error)
    return false
  }
}

export { teleTickerAgent, createSequentialTasks, getMoreInfoTasks }

teleTickerAgent.start()
startTelegramBot()
