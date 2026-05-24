import { Router } from 'express';
import { getDb } from '../lib/db.js';
import { generateEmbedding, generateGenieResponse } from '../lib/google.js';
import { searchVectors } from '../lib/vectorStore.js';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { userId, query, targetUserId: rawTarget, topK: rawTopK } = req.body;
    if (!userId || !query) return res.status(400).json({ error: 'userId and query are required' });

    const topK = Math.min(parseInt(rawTopK) || 5, 10);
    const targetUserId = rawTarget?.trim() || userId;
    const crossUser = targetUserId !== userId;
    const db = getDb();

    const filter = { userId: targetUserId, embeddingStatus: 'embedded' };
    if (crossUser) filter.isPublic = true;

    const embeddedCount = await db.collection('facts').countDocuments(filter);
    if (embeddedCount === 0) {
      const msg = crossUser
        ? `${targetUserId} hasn't made any public facts available yet. They need to mark some facts as public first.`
        : 'No vectors found for this user. Push to Vector first.';
      return res.status(400).json({ error: msg });
    }

    const queryEmbedding = await generateEmbedding(query);
    const vectorResults = await searchVectors(db, targetUserId, queryEmbedding, topK, crossUser);
    const genieResponse = await generateGenieResponse(targetUserId, query, vectorResults);

    res.json({
      userId,
      targetUserId,
      crossUser,
      query,
      vectorResults: vectorResults.map(r => ({
        text: r.text,
        category: r.category,
        similarity: r.similarity,
      })),
      genieResponse,
      resultCount: vectorResults.length,
    });
  } catch (err) { next(err); }
});

export default router;
