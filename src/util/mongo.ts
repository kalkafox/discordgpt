import { MongoClient } from 'mongodb'

const mongo_client = new MongoClient(process.env.MONGO_URL as string)

export default mongo_client
