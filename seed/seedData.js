import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/iam_vector_test';

const seedFacts = [
  // alice
  { userId: 'alice', text: 'I believe the first draft of anything is just you telling yourself the story.', category: 'belief' },
  { userId: 'alice', text: 'I wake up at 5:30am every day, even weekends. It is the only time the house is quiet.', category: 'preference' },
  { userId: 'alice', text: 'My favourite book is Middlemarch. I have read it four times.', category: 'preference' },
  { userId: 'alice', text: 'I think social media has made writers more anxious and less curious.', category: 'thought' },
  { userId: 'alice', text: 'Coffee with oat milk, no sugar. Non-negotiable.', category: 'preference' },
  { userId: 'alice', text: 'I write longhand first, always. Typing is for editing.', category: 'preference' },
  { userId: 'alice', text: 'Solitude is not loneliness. It is where I do my best work.', category: 'belief' },
  { userId: 'alice', text: 'I think ambition and kindness are not in conflict.', category: 'belief' },
  // maaz
  { userId: 'maaz', text: 'I think the best products feel inevitable in hindsight.', category: 'thought' },
  { userId: 'maaz', text: 'I recharge alone. I can be social but it costs me energy.', category: 'preference' },
  { userId: 'maaz', text: 'Sleep is the most underrated performance lever. I guard 8 hours.', category: 'preference' },
  { userId: 'maaz', text: 'Love is not a feeling, it is a practice. You choose it daily.', category: 'belief' },
  { userId: 'maaz', text: 'I distrust anything that cannot be explained simply.', category: 'belief' },
  { userId: 'maaz', text: 'The best meetings I have ever had were walks, not rooms.', category: 'preference' },
  { userId: 'maaz', text: 'Shipping is a form of honesty.', category: 'belief' },
  { userId: 'maaz', text: 'I think curiosity is a more reliable trait than intelligence.', category: 'thought' },
  // gilson
  { userId: 'gilson', text: 'The idea is never the hard part. Execution is where most people quit.', category: 'belief' },
  { userId: 'gilson', text: 'Small teams that trust each other beat large teams with process every time.', category: 'belief' },
  { userId: 'gilson', text: 'Optimism is a strategy, not a mood.', category: 'belief' },
  { userId: 'gilson', text: 'The best founders are obsessed with the problem, not the solution.', category: 'thought' },
  { userId: 'gilson', text: 'I would rather ship something imperfect and learn than plan for another month.', category: 'preference' },
  { userId: 'gilson', text: 'Community is the moat. Everything else can be copied.', category: 'belief' },
  { userId: 'gilson', text: 'The moment you stop learning, you start becoming irrelevant.', category: 'thought' },
  { userId: 'gilson', text: 'Revenue is a lagging indicator of the value you created.', category: 'fact' },
];

export async function runSeed(db) {
  const collection = db.collection('facts');
  const userIds = ['alice', 'maaz', 'gilson'];
  for (const userId of userIds) {
    await collection.deleteMany({ userId });
  }

  let count = 0;
  for (const fact of seedFacts) {
    await collection.insertOne({
      ...fact,
      embedding: null,
      embeddingStatus: 'pending',
      isPublic: false,
      createdAt: new Date(),
    });
    console.log(`[${fact.userId}] Inserted: "${fact.text.slice(0, 60)}..."`);
    count++;
  }
  console.log(`\nSeed complete. ${count} facts inserted. Run the app and push to vector.`);
}

// Run standalone
if (process.argv[1].endsWith('seedData.js')) {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  await runSeed(db);
  await client.close();
}
