import { SlashCommandBuilder } from 'discord.js'
import type { CacheType, Interaction } from 'discord.js'
import mongo_client from '@/util/mongo'

export const data = new SlashCommandBuilder()
  .setName('clear')
  .setDescription('Clears all GPT-3 data stored in the database')

export async function execute(interaction: Interaction<CacheType>) {
  if (!interaction.isCommand()) return
  await interaction.reply('Clearing all GPT-3 data...')
  await mongo_client.connect()
  const db = mongo_client.db('gpt3')
  const collection = db.collection('messages')
  await collection.deleteMany({
    where: {
      user_id: interaction.user.id,
    },
  })
  await mongo_client.close()
  await interaction.editReply('Cleared all GPT-3 data!')
}
