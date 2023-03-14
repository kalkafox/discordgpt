import * as dotenv from 'dotenv'
dotenv.config()

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CacheType,
  EmbedBuilder,
  Events,
  Interaction,
  SlashCommandBuilder,
} from 'discord.js'

import { Configuration, OpenAIApi } from 'openai'

import mongo_client from '@/util/mongo'
import discord_client from '@/util/discord'
import { format_time } from '@/util/helpers'

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
})
const openai = new OpenAIApi(configuration)

discord_client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return

  // Check if the message is a reply to the bot
  if (message.reference && message.reference.messageId) {
    const reply = await message.channel.messages.fetch(
      message.reference.messageId,
    )
    if (reply.author.id === discord_client.user?.id) {
      // If so, grab the message ID from the reply and get the history from the database
      await mongo_client.connect()
      const db = mongo_client.db('gpt3')
      const collection = db.collection('messages')

      console.log(message.reference.messageId)

      console.log(
        `Searching DB for message ID ${reply.id} of user ${message.author.id}...`,
      )

      const user_messages = await collection.findOne({
        message_id: reply.id,
        user_id: message.author.id,
      })

      console.log(user_messages)

      // TODO: figure out why the DB is returning null, even though the message exists in the DB
      // TODO: better mongodb find/update logic

      await mongo_client.close()

      if (!user_messages) {
        await message.reply(
          'There was an error while fetching your message history. Please try again later.',
        )
        return
      }
    }
  }
})

discord_client.on(Events.ThreadCreate, async thread => {
  if (thread.parentId !== process.env.THREAD_PARENT_ID) return
  // TODO: Thread logic here

  await thread.join()
})

// TODO: cool website with openAI moderation api values (fancy bars/countup/graphs) for filter results
// TODO: more fiddling with openAI api

discord_client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return

  // @ts-expect-error
  const command = interaction.client.commands.get(interaction.commandName)

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`)
    return
  }

  try {
    await command.execute(interaction)
  } catch (error) {
    console.error(error)
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'There was an error while executing this command!',
        ephemeral: true,
      })
    } else {
      await interaction.reply({
        content: 'There was an error while executing this command!',
        ephemeral: true,
      })
    }
  }
})

export const data = new SlashCommandBuilder()
  .setName('gpt')
  .setDescription(
    'Send a message to the GPT-3 API and (hopefully) get a response back!',
  )
  .addStringOption(option =>
    option
      .setName('message')
      .setDescription('The message to send to the GPT-3 API')
      .setRequired(true),
  )
  .addStringOption(option =>
    option
      .setName('image')
      .setDescription('Whether to generate as an image or not')
      .setRequired(false),
  )
  .addBooleanOption(option =>
    option
      .setName('ephemeral')
      .setDescription(
        'Send the response as an ephemeral message (only you can see it)',
      )
      .setRequired(false),
  )

export async function execute(interaction: Interaction<CacheType>) {
  if (!interaction.isCommand()) return
  const bot_message = await interaction.deferReply({
    fetchReply: true,
    ephemeral: interaction.options.get('ephemeral')?.value as boolean,
  })
  const time = Date.now()

  const message = interaction.options.get('message')?.value as string

  // Make a request to OpenAI's moderation API endpoint to check if the message is safe
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
    await interaction.editReply({
      content:
        'There was an error while checking your message for moderation. Please try again later.',
    })
    return
  }

  const moderation_res_data =
    (await moderation_res.json()) as TextModerationResult

  // Pedantically check if the response is an object
  if (typeof moderation_res_data !== 'object' || moderation_res_data === null) {
    await interaction.editReply({
      content:
        'There was an error while checking your message for moderation. Please try again later.',
    })
    return
  }

  if (moderation_res_data && moderation_res_data.results[0].flagged) {
    await interaction.editReply({
      content:
        'Your message was flagged by the moderation API. Please try again with a different message.',
    })
    return
  }

  const user = interaction.user

  await mongo_client.connect()
  const db = mongo_client.db('gpt-3')
  const collection = db.collection('messages')

  // Grab the user's array of messages from the database, or create a new one if it doesn't exist in the collection
  const user_messages: string[] =
    (
      await collection.findOne({
        user_id: user.id,
        message_id: bot_message.id,
      })
    )?.messages || []

  user_messages.push(message)

  // Update the user's array of messages in the database
  await collection.updateOne(
    { user_id: user.id, message_id: bot_message.id },
    { $set: { messages: user_messages } },
    { upsert: true },
  )

  // Disconnect from the database
  await mongo_client.close()

  const res_data = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'user',
        content: message,
      },
    ],
    user: `discord:${user.id}`,
  })

  if (!res_data.data.choices[0].message) {
    await interaction.editReply(
      `There was an error while getting a response from the API. Please try again later.`,
    )
    return
  }

  const response = res_data.data.choices[0].message.content

  if (response.length > 2000) {
    await interaction.editReply({
      files: [
        {
          name: 'response.txt',
          attachment: Buffer.from(response),
        },
      ],
    })
    return
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`gpt-3-close-${bot_message.id}`)
      .setEmoji('❌')
      .setLabel('Delete')
      .setStyle(ButtonStyle.Primary),
  )

  const collector = interaction.channel?.createMessageComponentCollector({
    filter: i =>
      i.customId === `gpt-3-close-${bot_message.id}` && i.user.id === user.id,
  })

  collector?.on('collect', async i => {
    try {
      await i.update({
        content: 'Deleted!',
        components: [],
      })

      await i.deleteReply()
    } catch (e) {
      console.error(e)
    }
  })

  const msg = await interaction.editReply({
    content: response,
    components: [row],
    embeds: [
      new EmbedBuilder().setFooter({
        text: `${format_time(Date.now() - time)}`,
        iconURL: 'https://emojigraph.org/media/twitter/ten-oclock_1f559.png',
      }),
    ],
  })

  if (msg.id === bot_message.id) {
    console.error('Message IDs do match!')
  }
}
