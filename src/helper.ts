import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config()

const envSchema = z.object({
  // Bot token
  TELEGRAM_BOT_TOKEN: z.string(),
  
  // Agent IDs
  AGENT_ID: z.coerce.number(),
  DEXSCREEN_AGENT_ID: z.coerce.number(),
  JSON_ANALYZER_ID: z.coerce.number(),
  TWITTER_FETCHER_ID: z.coerce.number(),
  SEARCH_AGENT_ID: z.coerce.number(),
  COPY_WRITER_ID: z.coerce.number(),
})

export const env = envSchema.parse({
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  AGENT_ID: process.env.AGENT_ID,
  DEXSCREEN_AGENT_ID: process.env.DEXSCREEN_AGENT_ID,
  JSON_ANALYZER_ID: process.env.JSON_ANALYZER_ID,
  TWITTER_FETCHER_ID: process.env.TWITTER_FETCHER_ID,
  SEARCH_AGENT_ID: process.env.SEARCH_AGENT_ID,
  COPY_WRITER_ID: process.env.COPY_WRITER_ID,
})

export function convertToTelegramMarkdown(text: string): string {
  // First, escape special characters that need escaping in MarkdownV2
  const escapeChars = (str: string) => {
    return str.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&')
  }

  return (
    text
      // First escape all special characters
      .split('\n')
      .map(line => escapeChars(line))
      .join('\n')
      // Then apply markdown formatting
      // Headers (convert to bold)
      .replace(/^\\\#\\\#\\\# (.*$)/gm, '*$1*')
      .replace(/^\\\#\\\# (.*$)/gm, '*$1*')
      .replace(/^\\\# (.*$)/gm, '*$1*')

      // Bold (already escaped * will be unescaped for actual formatting)
      .replace(/\\\*\\\*(.*?)\\\*\\\*/g, '*$1*')
      .replace(/\\_\\_(.*?)\\_\\\_/g, '*$1*')

      // Italic (already escaped * and _ will be unescaped for actual formatting)
      .replace(/\\\*(.*?)\\\*/g, '_$1_')
      .replace(/\\_(.*?)\\_/g, '_$1_')

      // Lists (escape bullet points)
      .replace(/^\\-\s+/gm, '• ')
      .replace(/^\d+\\\.\s+/gm, '• ')

      // Links (handle already escaped brackets and parentheses)
      .replace(/\\\[(.*?)\\\]\\\((.*?)\\\)/g, '[$1]($2)')

      // Remove multiple newlines
      .replace(/\n{3,}/g, '\n\n')
  )
}

export const reportFormat = `### Token Analysis Report for [TICKER] 📊

## Market Data 💹 
(full dexscreen data as a list of key value pairs)


## Recent News & Development 📰
(Summary of key news and developments from web research as a list of key value pairs with citations)

## Social Media Activity 🔍
(If Twitter data available: Summary of recent tweets and engagement)

## Technical Analysis 📈
(Key insights from DexScreen data)

## Risk Assessment ⚠️
(Key risk factors identified)

## Overall Assessment 🎯
(Concise summary of findings and potential outlook)

---
Report generated [TIMESTAMP] via OpenServ Analytics"`
