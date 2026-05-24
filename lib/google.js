import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

if (!process.env.GOOGLE_AI_API_KEY) {
  throw new Error('GOOGLE_AI_API_KEY is not set — add it to your .env file');
}
if (!process.env.GROQ_API_KEY) {
  throw new Error('GROQ_API_KEY is not set — add it to your .env file');
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
const groq  = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function generateEmbedding(text) {
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

export async function generateGenieResponse(userId, query, retrievedFacts) {
  const factsBlock = retrievedFacts
    .map((f, i) => `${i + 1}. [${f.category}] ${f.text}  (relevance: ${(f.similarity * 100).toFixed(0)}%)`)
    .join('\n');

  const prompt = [
    `You are a Genie representing ${userId}'s personal Stage on iAM.`,
    `A visitor has asked: "${query}"`,
    ``,
    `Here are the most relevant things ${userId} has shared:`,
    factsBlock,
    ``,
    `Answer the visitor's question in 2-4 conversational sentences.`,
    `Use only the facts above — never infer or add information not present.`,
    `If the facts don't cover the question, say so honestly.`,
    `Speak about ${userId} in third person (e.g. "Maaz believes...", "According to what she's shared...").`,
  ].join('\n');

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 512,
  });

  return completion.choices[0].message.content;
}
