import * as dotenv from 'dotenv'
dotenv.config()

import {
  Collection,
  RESTPutAPIApplicationCommandsResult,
  Routes,
} from 'discord.js'

import rest from '@/util/rest'

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const commands_json = []
// Grab all the command files from the commands directory you created earlier
const __filename = fileURLToPath(import.meta.url)
const __current_dirname = path.dirname(__filename)
// get parent directory
const __dirname = path.join(__current_dirname, '..')
const commandsPath = path.join(__dirname, 'commands')
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter(file => file.endsWith('.ts'))

// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
for (const file of commandFiles) {
  const command = await import(`../commands/${file}`)
  commands_json.push(command.data.toJSON())
}

const data = (await rest.put(
  Routes.applicationCommands(process.env.CLIENT_ID as string),
  { body: commands_json },
)) as RESTPutAPIApplicationCommandsResult

if (data && Array.isArray(data) && data.length > 0) {
  const command_data = data.map(command => {
    return {
      name: command.name as string,
      id: command.id as string,
    }
  })
  console.log(
    `Successfully registered ${data.length} commands. (${[...command_data]
      .map(command => command.name)
      .join(', ')})`,
  )
} else {
  console.log('No commands were registered.')
}

const commands_api = new Collection()

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file)
  const command = await import(filePath)
  // Set a new item in the Collection with the key as the command name and the value as the exported module
  if ('data' in command && 'execute' in command) {
    commands_api.set(command.data.name, command)
  } else {
    console.log(
      `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
    )
  }
}

export default commands_api
