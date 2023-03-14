import { MongoClient } from 'mongodb'

const url = 'mongodb://localhost:27017'

const mongo_client = new MongoClient(url)

export default mongo_client
