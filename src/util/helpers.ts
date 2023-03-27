import mongo_client from '@/util/mongo'
import { ChatCompletionRequestMessage } from 'openai'
import { openai } from '@/util/openai'
import { EmbedBuilder } from 'discord.js'
import { WithId } from 'mongodb'

export const format_time = (time: number) => {
  const seconds = Math.floor(time / 1000)
  const minutes = Math.floor(seconds / 60)

  const seconds_rem = seconds % 60

  const seconds_string = seconds_rem.toString()

  if (minutes > 0) return `${minutes} minutes and ${seconds_string} seconds`
  return `${seconds_string} seconds`
}

async function mongo_connect() {
  try {
    await mongo_client.connect()
  } catch (error) {
    console.log(error)
  }
}

async function mongo_disconnect() {
  try {
    await mongo_client.close()
  } catch (error) {
    console.log(error)
  }
}

export async function add_message(
  username: string,
  messages: DbMessage[],
  message_id: string,
  raw: boolean = false,
) {
  await mongo_connect()
  const db = mongo_client.db('gpt-3')
  const messages_db = db.collection('messages')
  await messages_db.insertOne({
    username,
    messages,
    message_id,
    raw,
  })
  await mongo_disconnect()
}

export async function get_message(message_id: string) {
  try {
    await mongo_connect()
    const db = mongo_client.db('gpt-3')
    const messages_db = db.collection('messages')
    const result = await messages_db.findOne({
      message_id,
    })
    await mongo_disconnect()
    return result as WithId<DocumentMessage> | null
  } catch (error) {
    console.log(error)
  }
}

export async function update_message(
  old_message_id: string,
  messages: DbMessage[],
  new_message_id: string,
) {
  try {
    await mongo_connect()
    const db = mongo_client.db('gpt-3')
    const messages_db = db.collection('messages')
    await messages_db.updateOne(
      {
        message_id: old_message_id,
      },
      {
        $push: {
          messages: {
            $each: messages,
          },
        },
        $set: {
          message_id: new_message_id,
        },
      },
    )
    await mongo_disconnect()
  } catch (error) {
    console.log(error)
  }
}

export async function add_reply(id: string) {
  try {
    await mongo_connect()
    const db = mongo_client.db('gpt-3')
    const being_replied_to = db.collection('being_replied_to')
    await being_replied_to.insertOne({
      message_id: id,
    })
    await mongo_disconnect()
  } catch (error) {
    console.log(error)
  }
}

export async function check_reply(id: string) {
  try {
    await mongo_connect()
    const db = mongo_client.db('gpt-3')
    const being_replied_to = db.collection('being_replied_to')
    const result = await being_replied_to.findOne({
      message_id: id,
    })
    await mongo_disconnect()
    return result
  } catch (error) {
    console.log(error)
    return null
  }
}

export async function delete_reply(id: string) {
  await mongo_connect()
  const db = mongo_client.db('gpt-3')
  const being_replied_to = db.collection('being_replied_to')
  await being_replied_to.deleteOne({
    message_id: id,
  })
  await mongo_disconnect()
}

export async function chat_completion(
  member_id: string,
  messages: ChatCompletionRequestMessage[],
  stream?: boolean,
) {
  return await openai.createChatCompletion(
    {
      model: 'gpt-3.5-turbo',
      messages,
      user: `discord:${member_id}`,
      stream,
    },
    stream
      ? {
          responseType: 'stream',
        }
      : {},
  )
}

export function prompt_context(now: Date) {
  return `Today's date is ${now.toLocaleDateString()}, ${now.toLocaleTimeString()} ${
    now.toLocaleTimeString('en-us', { timeZoneName: 'short' }).split(' ')[2]
  }. Whenever you generate code, wrap block with \`\`\`<language>\`\`\`, where <language> is the detected language. For example, \`\`\`js\`\`\``
}

export function token_embed(now: Date, token_data: TokenData) {
  return new EmbedBuilder()
    .setTitle('Tokens')
    .setFields([
      {
        name: 'Prompt',
        value: `${token_data.prompt_tokens}`,
        inline: true,
      },
      {
        name: 'Completion',
        value: `${token_data.completion_tokens}`,
        inline: true,
      },
      {
        name: 'Total',
        value: `${token_data.prompt_tokens + token_data.completion_tokens}`,
        inline: true,
      },
    ])
    .setFooter({
      text: `${format_time(Date.now() - now.getTime())}`,
      iconURL: 'https://emojigraph.org/media/twitter/ten-oclock_1f559.png',
    })
}
