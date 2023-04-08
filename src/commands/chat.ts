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
import {
  APIApplicationCommandOptionChoice,
  CacheType,
  Events,
  Interaction,
  SlashCommandBuilder,
} from 'discord.js'
import { encode } from 'gpt-3-encoder'
import { WithId } from 'mongodb'
import { ChatCompletionRequestMessage } from 'openai'

discord_client.on(Events.MessageCreate, async msg => {
  if (msg.author.id === discord_client.user?.id) return

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

      const prompt = await prompt_context(now)

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
          content: prompt as string,
        })
      }

      let processing = true

      await reply.channel.sendTyping()

      new Promise(async resolve => {
        while (processing) {
          await reply.channel.sendTyping()
          await new Promise(resolve => setTimeout(resolve, 5000))
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

      const gpt_msg = gpt_res.data.choices[0].message?.content!

      const bot_response = await msg.reply({
        content: gpt_msg.length > 2000 ? ':pencil:' : gpt_msg,
        embeds: [embed],
        files:
          gpt_msg.length > 2000
            ? [
                {
                  name: 'response.txt',
                  attachment: Buffer.from(gpt_msg),
                },
              ]
            : undefined,
      })

      processing = false

      await delete_reply(reply.id)

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

const prompt_choices: APIApplicationCommandOptionChoice<string>[] = [
  {
    name: 'Jailbreak',
    value: 'jb',
  },
  {
    name: 'UwU',
    value: 'uwu',
  },
]

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
  .addStringOption(option =>
    option
      .setName('prompt')
      .setDescription('The prompt to send to the GPT-3 API')
      .addChoices(...prompt_choices),
  )
  .addStringOption(option =>
    option
      .setName('persona')
      .setDescription(
        "The persona name if using the 'uwu' prompt. (Be specific! e.g Baine Bloodhoof)",
      ),
  )

export async function execute(interaction: Interaction<CacheType>) {
  if (!interaction.isCommand()) return

  const now = new Date()

  const message = interaction.options.get('message')!.value as string
  const ephemeral = interaction.options.get('ephemeral')?.value as boolean
  const stream = interaction.options.get('stream')?.value as boolean
  let raw = interaction.options.get('raw')?.value as boolean
  const prompt_choice = interaction.options.get('prompt')?.value
  const persona = interaction.options.get('persona')?.value as string

  let prompt = (await prompt_context(now, prompt_choice)) as
    | WithId<DocumentPrompt>
    | undefined
    | string

  if (prompt_choice !== undefined) {
    if (prompt === undefined || prompt === null) {
      await interaction.reply({
        content:
          'There was an error while getting the prompt. Please try again later!',
        ephemeral: true,
      })
      return
    }

    prompt = prompt as WithId<DocumentPrompt>

    switch (prompt_choice) {
      case 'uwu':
        if (persona === undefined) {
          await interaction.reply({
            content:
              "You must specify a persona name when using the 'uwu' prompt! (e.g Baine Bloodhoof)",
            ephemeral: true,
          })
          return
        }
        if (!persona.includes(' ')) {
          await interaction.reply({
            content:
              "You must specify a full persona name when using the 'uwu' prompt! (e.g Baine Bloodhoof)",
            ephemeral: true,
          })
          return
        }
        const full_name = persona.split(' ')
        prompt.prompt = prompt.prompt.replaceAll(
          '{FULL_NAME}',
          full_name.join(' '),
        )
        prompt.prompt = prompt.prompt.replaceAll('{FIRST_NAME}', full_name[0])
        break
    }
  }

  const prompt_token_length = encode(
    `${
      prompt_choice !== undefined
        ? ((prompt as WithId<DocumentPrompt>).prompt as string)
        : (prompt as string)
    }${message}`,
  ).length

  await interaction.deferReply({ ephemeral: ephemeral })

  let token_data = {
    prompt_tokens: prompt_token_length,
    completion_tokens: 0,
  } as TokenData

  await interaction.editReply({
    content: `<a:infinityloadgif:866114912865484800>`,
    embeds: [token_embed(now, token_data)],
  })

  const messages: ChatCompletionRequestMessage[] = [
    {
      role: 'user',
      content: message,
    },
  ]

  // If raw is false, add the prompt to the messages array, but at the start
  if (!raw || prompt_choice !== undefined) {
    messages.unshift({
      role: 'user',
      content:
        prompt_choice !== undefined
          ? ((prompt as WithId<DocumentPrompt>).prompt as string)
          : (prompt as string),
    })
  }

  if (prompt_choice !== undefined) raw = true

  console.log(messages)

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
              prompt_choice !== undefined
                ? {
                    username: interaction.user.username,
                    role: 'user',
                    content:
                      prompt_choice !== undefined
                        ? ((prompt as WithId<DocumentPrompt>).prompt as string)
                        : (prompt as string),
                  }
                : undefined,
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
            ].filter(msg => msg !== undefined) as DbMessage[],
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
      content: message_content.length < 2000 ? message_content : ':pencil:',
      embeds: [token_embed(now, token_data)],
      files:
        message_content.length > 2000
          ? [
              {
                name: 'response.txt',
                attachment: Buffer.from(message_content),
              },
            ]
          : undefined,
    })

    add_message(
      interaction.user.username,
      [
        prompt_choice !== undefined
          ? {
              username: interaction.user.username,
              role: 'user',
              content:
                prompt_choice !== undefined
                  ? ((prompt as WithId<DocumentPrompt>).prompt as string)
                  : (prompt as string),
            }
          : undefined,
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
      ].filter(msg => msg !== undefined) as DbMessage[],
      msg.id,
    )
  }
}
