import { Client, GatewayIntentBits, Partials } from 'discord.js'

import type commands from '@/util/commands'

const discord_client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageTyping,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildEmojisAndStickers,
  ],
  partials: [Partials.Channel],
}) as Client & { commands: typeof commands }

export default discord_client
