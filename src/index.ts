import { z } from 'zod'
import { Agent } from '@openserv-labs/sdk'
import 'dotenv/config'
import { bot, startTelegramBot } from './telegram-bot'
import { getCurrentChatId } from './shared-state'
import { convertToTelegramMarkdown, reportFormat, env } from './helper'

if (!process.env.WORKSPACE_ID) {
  throw new Error('Required environment variables are missing')
}

const WORKSPACE_ID = parseInt(process.env.WORKSPACE_ID)

const AGENT = env.AGENT_ID
const DEXSCREEN_AGENT = env.DEXSCREEN_AGENT_ID
const JSON_ANALYZER = env.JSON_ANALYZER_ID
const TWITTER_FETCHER = env.TWITTER_FETCHER_ID
const SEARCH_AGENT = env.SEARCH_AGENT_ID
const COPY_WRITER = env.COPY_WRITER_ID

const teleTickerAgent = new Agent({
  systemPrompt: `You are an AI agent capable of formatting and sending messages to Telegram`
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

async function createSequentialTasks(ticker: string, uuid: string): Promise<void> {
  const dexscreenTask = await teleTickerAgent.createTask({
    workspaceId: WORKSPACE_ID,
    assignee: DEXSCREEN_AGENT,
    body: `Get dexscreen data for ${ticker}`,
    description: `Fetch dexscreen data for ${ticker}`,
    input: ticker,
    expectedOutput: `JSON containing dexscreen data, save it as json file saved as: ${uuid}_${ticker}_DEXSCREEN_DATA.json }`,
    dependencies: []
  })

  const webSearchTask = await teleTickerAgent.createTask({
    workspaceId: WORKSPACE_ID,
    assignee: SEARCH_AGENT,
    body: `Conduct a focused web search for ${ticker + ' token'} (do not delete or add anything to this search query). 
    Gather relevant news, headlines, and references. Do not include any price or market cap information unless it is historical.`,
    description: `Web research for ${ticker + ' token'}`,
    input: ticker,
    expectedOutput: `JSON containing web research data, save it as json file saved as: ${uuid}_${ticker}_WEB_RESEARCH_DATA.json }`,
    dependencies: [dexscreenTask.id]
  })

  const getOfficialTwitterAccount = await teleTickerAgent.createTask({
    workspaceId: WORKSPACE_ID,
    assignee: JSON_ANALYZER,
    body: `Analyze ${uuid}_${ticker}_DEXSCREEN_DATA.json to extract the official Twitter account`,
    description: `Analyze dexscreen data to extract the official Twitter account`,
    input: `${uuid}_${ticker}_DEXSCREEN_DATA.json`,
    expectedOutput: `the official Twitter account name`,
    dependencies: [dexscreenTask.id]
  })

  const twitterTask = await teleTickerAgent.createTask({
    workspaceId: WORKSPACE_ID,
    assignee: TWITTER_FETCHER,
    body: `Get last 5 tweets from ${ticker}'s official Twitter account`,
    description: `Fetch recent tweets for ${ticker}'s official Twitter account`,
    input: `output of previous task`,
    expectedOutput: `Whatever is returned by the capability and save it as json file saved as ${uuid}_${ticker}_TWITTER_DATA.json`,
    dependencies: [getOfficialTwitterAccount.id]
  })

  const generateReportTask = await teleTickerAgent.createTask({
    workspaceId: WORKSPACE_ID,
    assignee: COPY_WRITER,
    body: `Prepare a thorough, insightful report on the given ticker.Provide meaningful commentary on the results, explaining 
    their potential implications or relevance in the broader context.
    The REPORT MUST FOLLOW THE FOLLOWING FORMAT: ${reportFormat}"
    `,
    description: `Comprehensive analysis and commentary on ${ticker}`,
    input: `${uuid}_${ticker}_DEXSCREEN_DATA.json and ${uuid}_${ticker}_WEB_RESEARCH_DATA.json and if available ${uuid}_${ticker}_TWITTER_DATA.json`,
    expectedOutput: `Report in following format ${reportFormat} and saved as ${uuid}_${ticker}_REPORT.txt`,
    dependencies: [dexscreenTask.id, getOfficialTwitterAccount.id, webSearchTask.id]
  })

  const sendReportTask = await teleTickerAgent.createTask({
    workspaceId: WORKSPACE_ID,
    assignee: AGENT,
    body: `Send the generated Telegram message content to the specified Telegram bot or channel along with uuid. uuid for this message is ${uuid}`,
    description: `Send generated content to Telegram`,
    input: `${uuid}_${ticker}_REPORT.txt and the uuid : ${uuid}`,
    expectedOutput: `Confirmation of message sent to Telegram.`,
    dependencies: [generateReportTask.id]
  })
}

export { teleTickerAgent, createSequentialTasks }

teleTickerAgent.start()
startTelegramBot()
