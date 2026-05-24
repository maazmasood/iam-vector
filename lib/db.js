import { MongoClient } from 'mongodb';

let db = null;

export async function connectDb() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db();
  await db.collection('facts').createIndex({ userId: 1 });
  console.log(`MongoDB connected: ${db.databaseName}`);
}

export function getDb() {
  if (!db) throw new Error('Database not connected — call connectDb() first');
  return db;
}
