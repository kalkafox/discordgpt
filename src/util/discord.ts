import { Client, GatewayIntentBits } from 'discord.js'

import type commands from '@/util/commands'

const discord_client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageTyping,
    GatewayIntentBits.GuildMessageTyping,
  ],
}) as Client & { commands: typeof commands }

export default discord_client
