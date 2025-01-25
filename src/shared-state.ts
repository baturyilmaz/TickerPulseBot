//TODO: db

// Global state to store the latest chat ID
export let currentChatId: number | null = null

// Function to update the chat ID
export function setCurrentChatId(chatId: number) {
  currentChatId = chatId
}

// Function to get the chat ID
export function getCurrentChatId(): number | null {
  return currentChatId
}
