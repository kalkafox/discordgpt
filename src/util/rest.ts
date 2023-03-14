import * as dotenv from 'dotenv'
dotenv.config()

import { REST } from 'discord.js'

const rest = new REST({ version: '10' }).setToken(
  process.env.DISCORD_API_KEY as string,
)

export default rest
