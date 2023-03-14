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

import { Events } from 'discord.js'

import commands from '@/util/commands'

import discord_client from '@/util/discord'

discord_client.commands = commands

discord_client.on(Events.ClientReady, () => {
  console.log(`Logged in as ${discord_client.user?.tag}!`)
})

discord_client.login(process.env.DISCORD_API_KEY as string)
