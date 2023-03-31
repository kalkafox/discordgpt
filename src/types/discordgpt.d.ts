type TokenData = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens?: number
}

type DbMessage = {
  username: string
  content: string
  role: 'user' | 'assistant' | 'system'
}

type DocumentMessage = {
  username: string
  messages: DbMessage[]
  message_id: string
  raw: boolean
}

type DocumentPrompt = {
  prompt: string
  prompt_id: string
}
