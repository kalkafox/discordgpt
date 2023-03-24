import * as dotenv from 'dotenv'
dotenv.config()

const env_variables = [
  'DISCORD_API_KEY',
  'OPENAI_API_KEY',
  'CLIENT_ID',
  'GUILD_ID',
  'THREAD_PARENT_ID',
]

env_variables.forEach(variable => {
  if (!process.env[variable]) {
    console.error(`Missing environment variable: ${variable}`)
    process.exit(1)
  }
})

import { Events, TextChannel } from 'discord.js'

import commands from '@/util/commands'

import discord_client from '@/util/discord'

discord_client.commands = commands

discord_client.on(Events.ClientReady, () => {
  console.log(`Logged in as ${discord_client.user?.tag}!`)
})

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
      console.log('ye')
    } else {
      console.log('no')
      await interaction.editReply({
        content: 'There was an error while executing this command!',
      })
    }
  }
})

discord_client.login(process.env.DISCORD_API_KEY as string)
