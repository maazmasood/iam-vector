import 'dotenv/config';

const key = process.env.GOOGLE_AI_API_KEY;
const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
);
const { models } = await res.json();

const embedding = models.filter(m =>
  m.supportedGenerationMethods?.includes('embedContent')
);

console.log('Models that support embedContent:');
embedding.forEach(m => console.log(' ', m.name, '—', m.displayName));
