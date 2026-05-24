import { Router } from 'express';
import { getDb } from '../lib/db.js';
import { generateEmbedding } from '../lib/google.js';

const router = Router();

router.get('/:userId', async (req, res) => {
  const { userId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Clean up if the client disconnects mid-stream
  req.on('close', () => res.end());

  try {
    const db = getDb();
    const pending = await db.collection('facts')
      .find({ userId, embeddingStatus: 'pending' })
      .toArray();

    let embedded = 0;
    for (const fact of pending) {
      if (res.writableEnded) break;
      const vector = await generateEmbedding(fact.text);
      await db.collection('facts').updateOne(
        { _id: fact._id, userId },
        { $set: { embedding: vector, embeddingStatus: 'embedded' } }
      );
      embedded++;
      res.write(`data: ${JSON.stringify({ factId: fact._id, text: fact.text, status: 'done' })}\n\n`);
    }

    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ done: true, embedded, total: pending.length })}\n\n`);
    }
  } catch (err) {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    }
  } finally {
    res.end();
  }
});

export default router;
