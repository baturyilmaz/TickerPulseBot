import fs from 'fs'
import path from 'path'

interface ChatSession {
  chatId: number
  createdAt: string
}

interface ChatStore {
  sessions: Record<string, ChatSession>
}

const DB_PATH = path.join(__dirname, '../data/chat-sessions.json')

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH)
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

// Initialize store if it doesn't exist
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({ sessions: {} }, null, 2))
}

// Read store from file
function readStore(): ChatStore {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Error reading store:', error)
    return { sessions: {} }
  }
}

// Write store to file
function writeStore(store: ChatStore): void {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(store, null, 2))
  } catch (error) {
    console.error('Error writing store:', error)
  }
}

// Function to update the chat ID with request ID
export function setCurrentChatId(chatId: number, requestId: string): void {
  const store = readStore()
  store.sessions[requestId] = {
    chatId,
    createdAt: new Date().toISOString()
  }
  writeStore(store)
}

// Function to get the chat ID by request ID
export function getCurrentChatId(requestId: string): number | null {
  const store = readStore()
  return store.sessions[requestId]?.chatId || null
}

// Optional: cleanup function to remove old entries
export function removeChatId(requestId: string): void {
  const store = readStore()
  delete store.sessions[requestId]
  writeStore(store)
}

// Optional: cleanup old sessions (older than 24 hours)
export function cleanupOldSessions(): void {
  const store = readStore()
  const oneDayAgo = new Date()
  oneDayAgo.setDate(oneDayAgo.getDate() - 1)

  const updatedSessions: Record<string, ChatSession> = {}
  Object.entries(store.sessions).forEach(([requestId, session]) => {
    if (new Date(session.createdAt) > oneDayAgo) {
      updatedSessions[requestId] = session
    }
  })

  store.sessions = updatedSessions
  writeStore(store)
}
