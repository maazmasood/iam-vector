import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../lib/db.js';
import { assertUserScope } from '../lib/privacy.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId query param required' });

    const db = getDb();
    const facts = await db.collection('facts')
      .find({ userId }, { projection: { embedding: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(facts);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { userId, text, category } = req.body;
    if (!userId || !text) return res.status(400).json({ error: 'userId and text are required' });
    if (text.length > 2000) return res.status(400).json({ error: 'text must be 2000 chars or fewer' });

    const db = getDb();
    const doc = {
      userId,
      text,
      category: category || 'fact',
      embedding: null,
      embeddingStatus: 'pending',
      isPublic: false,
      createdAt: new Date(),
    };
    const result = await db.collection('facts').insertOne(doc);
    res.status(201).json({ ...doc, _id: result.insertedId });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { userId, isPublic } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const db = getDb();
    const fact = await db.collection('facts').findOne({ _id: new ObjectId(req.params.id) });
    if (!fact) return res.status(404).json({ error: 'Fact not found' });

    assertUserScope(userId, fact.userId);
    await db.collection('facts').updateOne(
      { _id: fact._id },
      { $set: { isPublic: Boolean(isPublic) } }
    );
    res.json({ updated: true, isPublic: Boolean(isPublic) });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId query param required' });

    const db = getDb();
    const fact = await db.collection('facts').findOne({ _id: new ObjectId(req.params.id) });
    if (!fact) return res.status(404).json({ error: 'Fact not found' });

    assertUserScope(userId, fact.userId);
    await db.collection('facts').deleteOne({ _id: fact._id });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

export default router;
