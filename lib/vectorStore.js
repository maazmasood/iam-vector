export function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function searchVectors(db, userId, queryEmbedding, topK = 5, publicOnly = false) {
  if (!userId) throw new Error('userId required — search must always be user-scoped');

  const filter = { userId, embeddingStatus: 'embedded' };
  if (publicOnly) filter.isPublic = true;

  const docs = await db.collection('facts').find(filter).toArray();

  return docs
    .map(doc => ({
      _id: doc._id,
      text: doc.text,
      category: doc.category,
      similarity: cosineSimilarity(queryEmbedding, doc.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}
