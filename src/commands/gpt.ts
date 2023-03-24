import discord_client from '@/util/discord'
import {
  add_message,
  add_reply,
  chat_completion,
  check_reply,
  delete_reply,
  get_message,
  prompt_context,
  token_embed,
  update_message,
} from '@/util/helpers'
import { CacheType, Events, Interaction, SlashCommandBuilder } from 'discord.js'
import { encode } from 'gpt-3-encoder'
import { ChatCompletionRequestMessage } from 'openai'

discord_client.on(Events.MessageCreate, async msg => {
  if (msg.author.bot) return

  if (msg.reference && msg.reference.messageId) {
    const reply = await msg.channel.messages.fetch(msg.reference.messageId)

    if (reply.author.id === discord_client.user?.id) {
      const is_being_replied_to = await check_reply(reply.id)

      if (is_being_replied_to) {
        const msg_response = await msg.reply(
          'I am replying to this message! Please try again when I am done!',
        )
        await new Promise(resolve => setTimeout(resolve, 5000))
        await msg.delete()
        await msg_response.delete()
        return
      }

      const msg_db = await get_message(reply.id)

      if (!msg_db) {
        const msg_response = await msg.reply(
          'There was an error while getting the message from the database. Please try again later!',
        )
        await new Promise(resolve => setTimeout(resolve, 5000))
        await msg.delete()
        await msg_response.delete()
        return
      }

      add_reply(reply.id)

      const now = new Date()

      const prompt = prompt_context(now)

      const messages: ChatCompletionRequestMessage[] = msg_db.messages.map(
        message => {
          return {
            role: message.role,
            content: message.content,
          }
        },
      )

      messages.push({
        role: 'user',
        content: msg.content,
      })

      if (!msg_db.raw) {
        messages.unshift({
          role: 'user',
          content: prompt,
        })
      }

      let processing = true

      await reply.channel.sendTyping()

      new Promise(async resolve => {
        while (processing) {
          await new Promise(resolve => setTimeout(resolve, 5000))
          if (!processing) return
          await reply.channel.sendTyping()
        }
        resolve(true)
      })

      const gpt_res = await chat_completion(msg.author.id, messages)

      const token_data: TokenData = {
        prompt_tokens: gpt_res.data.usage?.prompt_tokens!,
        completion_tokens: gpt_res.data.usage?.completion_tokens!,
        total_tokens: gpt_res.data.usage?.total_tokens,
      }

      const embed = token_embed(now, token_data)

      const bot_response = await msg.reply({
        content: gpt_res.data.choices[0].message?.content!,
        embeds: [embed],
      })

      processing = false

      delete_reply(reply.id)

      update_message(
        reply.id,
        [
          {
            username: msg.author.username,
            role: 'user',
            content: msg.content,
          },
          {
            username: discord_client.user?.username!,
            role: 'assistant',
            content: gpt_res.data.choices[0].message?.content!,
          },
        ],
        bot_response.id,
      )
    }
  }
})

export const data = new SlashCommandBuilder()
  .setName('chat')
  .setDescription(
    'Send a message to the GPT-3 API and (hopefully) get a response back!',
  )
  .addStringOption(option =>
    option
      .setName('message')
      .setDescription('The message to send to the GPT-3 API')
      .setRequired(true),
  )
  .addBooleanOption(option =>
    option
      .setName('ephemeral')
      .setDescription(
        'Send the response as an ephemeral message (only you can see it)',
      ),
  )
  .addBooleanOption(option =>
    option
      .setName('stream')
      .setDescription(
        'Whether to stream the response or not. (NOTE: The best results are not streamed)',
      ),
  )
  .addBooleanOption(option =>
    option
      .setName('raw')
      .setDescription('Whether to send with a prompt or not.'),
  )

export async function execute(interaction: Interaction<CacheType>) {
  if (!interaction.isCommand()) return

  const now = new Date()

  const message = interaction.options.get('message')!.value as string
  const ephemeral = interaction.options.get('ephemeral')?.value as boolean
  const stream = interaction.options.get('stream')?.value as boolean
  const raw = interaction.options.get('raw')?.value as boolean

  const prompt = prompt_context(now)

  const prompt_token_length = encode(`${prompt}${message}`).length

  await interaction.deferReply({ ephemeral: ephemeral })

  let token_data = {
    prompt_tokens: prompt_token_length,
    completion_tokens: 0,
  } as TokenData

  await interaction.editReply({
    content: `<a:infinityloadgif:866114912865484800>`,
    embeds: [token_embed(now, token_data)],
  })

  await interaction.channel?.sendTyping()

  const messages: ChatCompletionRequestMessage[] = [
    {
      role: 'user',
      content: message,
    },
  ]

  // If raw is false, add the prompt to the messages array, but at the start
  if (!raw) {
    messages.unshift({
      role: 'user',
      content: prompt,
    })
  }

  const res_data = await chat_completion(interaction.user.id, messages, stream)

  if (stream) {
    const message_chunks: string[] = []

    if (!res_data.data) {
      await interaction.editReply(
        `There was an error while getting a response from the API. Please try again later.`,
      )
      return
    }

    // @ts-ignore
    res_data.data.on('data', async (chunk: BufferSource | unknown) => {
      if (chunk) {
        const lines = chunk
          .toString()
          .split('\n')
          .filter(line => line.trim() !== '')

        const message_content = message_chunks.join('')

        token_data.completion_tokens = encode(message_content).length

        // if last line is data: [DONE], then we are done
        if (lines[lines.length - 1] === 'data: [DONE]') {
          const msg = await interaction.editReply({
            content: message_chunks.join(''),
            embeds: [token_embed(now, token_data)],
          })

          add_message(
            interaction.user.username,
            [
              {
                username: interaction.user.username,
                role: 'user',
                content: message,
              },
              {
                username: 'GPT-3',
                role: 'assistant',
                content: message_content,
              },
            ],
            msg.id,
            raw,
          )
          return
        }

        if (
          (message_content.length !== 0 &&
            message_content.length % 250 === 0) ||
          (message_content.length < 250 && message_content.length % 100 === 0)
        ) {
          await interaction.editReply({
            content: message_content,
            embeds: [token_embed(now, token_data)],
          })
          await interaction.channel?.sendTyping()
        }

        lines.forEach(async line => {
          const data = line.replace(/^data: (.*)$/, '$1')

          if (data === '[DONE]') {
            return
          }

          const json = JSON.parse(data)

          if (
            json &&
            typeof json === 'object' &&
            'choices' in json &&
            Array.isArray(json.choices) &&
            json.choices.length > 0
          ) {
            const choice = json.choices[0]

            if (
              choice &&
              typeof choice === 'object' &&
              'delta' in choice &&
              typeof choice.delta === 'object' &&
              'content' in choice.delta! &&
              typeof choice.delta.content === 'string'
            ) {
              message_chunks.push(choice.delta.content)
            }
          }
        })
      }
    })
  } else {
    if (!res_data.data) {
      await interaction.editReply(
        `There was an error while getting a response from the API. Please try again later.`,
      )
      return
    }

    const message_content = res_data.data.choices[0].message?.content!

    token_data = res_data.data.usage!

    const msg = await interaction.editReply({
      content: message_content,
      embeds: [token_embed(now, token_data)],
    })

    add_message(
      interaction.user.username,
      [
        {
          username: interaction.user.username,
          role: 'user',
          content: message,
        },
        {
          username: 'GPT-3',
          role: 'assistant',
          content: message_content,
        },
      ],
      msg.id,
    )
  }
}
