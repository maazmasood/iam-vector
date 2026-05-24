import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDb, getDb } from './lib/db.js';
import factsRouter from './routes/facts.js';
import embedRouter from './routes/embed.js';
import searchRouter from './routes/search.js';
import { runSeed } from './seed/seedData.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.use('/api/facts', factsRouter);
app.use('/api/embed', embedRouter);
app.use('/api/search', searchRouter);

app.post('/api/seed', async (req, res, next) => {
  try {
    const db = getDb();
    await runSeed(db);
    res.json({ success: true, message: '24 facts seeded successfully' });
  } catch (err) { next(err); }
});

app.use((err, req, res, _next) => {
  res.status(err.status || 500).json({ error: err.message });
});

await connectDb();
console.log('Google AI Studio: ready (gemini-embedding-001)');
app.listen(PORT, () => {
  console.log(`iAM Vector Test  →  http://localhost:${PORT}`);
});
