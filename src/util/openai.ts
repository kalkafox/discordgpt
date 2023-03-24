import * as dotenv from 'dotenv'
dotenv.config()
import { Configuration, OpenAIApi } from 'openai'

import fetch from 'node-fetch'

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
})
export const openai = new OpenAIApi(configuration)

export const moderation_flag = async (message: string) => {
  const moderation_res = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      input: message,
    }),
  })

  if (!moderation_res.ok) {
    return 'There was an error while checking your message for moderation. Please try again later.'
  }

  const moderation_res_data =
    (await moderation_res.json()) as TextModerationResult

  // Pedantically check if the response is an object
  if (typeof moderation_res_data !== 'object' || moderation_res_data === null) {
    return 'There was an error while checking your message for moderation. Please try again later.'
  }

  if (moderation_res_data && moderation_res_data.results[0].flagged) {
    return 'Your message was flagged by the moderation API. Please try again with a different message.'
  }

  return null
}
