\# CLAUDE.md — iAM Vector DB Test App



\## What You Are Building



A minimal Node.js + Express + MongoDB application that demonstrates iAM's custom vector

database approach end to end. The UI walks through three explicit steps so the pipeline

is visible and understandable:



1\. \*\*View Data\*\* — see a user's raw facts in MongoDB before any embedding happens.

2\. \*\*Push to Vector\*\* — embed those facts using Google AI Studio and store the vectors.

3\. \*\*Search + Genie\*\* — run semantic search, then get a Gemini LLM response grounded in

&#x20;  the matched facts.



Multiple users exist. Privacy is enforced at every layer — a user's vectors are never

accessible to another user's search. No authentication framework — users are plain string

IDs. The focus is the vector pipeline.



\---



\## Tech Stack



\- \*\*Runtime\*\*: Node.js 18+

\- \*\*Framework\*\*: Express.js

\- \*\*Database\*\*: MongoDB (local `mongod` or Atlas URI in `.env`)

\- \*\*Embeddings\*\*: Google AI Studio — `text-embedding-004` (768-dimensional vectors)

\- \*\*LLM\*\*: Google AI Studio — `gemini-2.0-flash` (Genie conversational response)

\- \*\*SDK\*\*: `@google/generative-ai`

\- \*\*Frontend\*\*: Single `index.html`, vanilla JS, no build step

\- \*\*No TypeScript\*\* — plain `.js` throughout



\---



\## Project Structure



```

iam-vector-test/

├── CLAUDE.md

├── .env.example

├── .gitignore

├── package.json

├── server.js

├── lib/

│   ├── db.js              # MongoDB connection singleton

│   ├── google.js          # Google AI Studio client — embeddings + LLM

│   ├── vectorStore.js     # Cosine similarity + scoped MongoDB search

│   └── privacy.js         # userId scope guard

├── routes/

│   ├── facts.js           # GET, POST, DELETE /api/facts

│   ├── embed.js           # POST /api/embed/:userId — trigger embedding for a user

│   └── search.js          # POST /api/search — vector search + Gemini response

├── seed/

│   └── seedData.js        # Insert raw facts WITHOUT embeddings (no API call)

└── public/

&#x20;   └── index.html

```



\---



\## Environment Variables



`.env` (create from `.env.example`):



```

GOOGLE\_AI\_API\_KEY=AIza...

MONGODB\_URI=mongodb://localhost:27017/iam\_vector\_test

PORT=3000

```



`.env.example` contains the same keys with empty values.



\---



\## MongoDB Schema



\### Collection: `facts`



```js

{

&#x20; \_id:             ObjectId,

&#x20; userId:          String,    // "maaz" | "alice" | "gilson" | any custom string

&#x20; text:            String,    // the raw fact text

&#x20; category:        String,    // "thought" | "belief" | "preference" | "story" | "fact"

&#x20; embedding:       \[Number],  // 768 floats — null until embedded

&#x20; embeddingStatus: String,    // "pending" | "embedded"

&#x20; createdAt:       Date,

}

```



\*\*Key design\*\*: facts are inserted with `embedding: null` and `embeddingStatus: "pending"`.

The embedding is only generated when the user explicitly clicks "Push to Vector". This makes

Step 1 (raw data) and Step 2 (vectorised data) meaningfully distinct in the UI.



\*\*Index required\*\*: `{ userId: 1 }` — every query filters by userId before touching embeddings.



\---



\## lib/db.js



MongoDB connection singleton using the `mongodb` npm package (not Mongoose).



Export:

\- `connectDb()` — opens the connection, stores it internally, logs success

\- `getDb()` — returns the cached db instance, throws if not connected



Call `connectDb()` once at server startup. All route handlers call `getDb()`.



\---



\## lib/google.js



Wraps both Google AI Studio capabilities. Single file, single import.



```js

import { GoogleGenerativeAI } from '@google/generative-ai';



const genAI = new GoogleGenerativeAI(process.env.GOOGLE\_AI\_API\_KEY);



// generateEmbedding(text) -> number\[]

// Model: text-embedding-004

// Returns: result.embedding.values  (768 floats)

export async function generateEmbedding(text) {

&#x20; const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });

&#x20; const result = await model.embedContent(text);

&#x20; return result.embedding.values;

}



// generateGenieResponse(userId, query, retrievedFacts) -> string

// Model: gemini-2.0-flash

// retrievedFacts: array of { text, category, similarity }

// Returns a 2-4 sentence conversational answer grounded only in the retrieved facts.

// Prompt instructs the model: only use the provided facts, never hallucinate,

// speak as if describing what this person believes/thinks/prefers.

export async function generateGenieResponse(userId, query, retrievedFacts) {

&#x20; const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });



&#x20; const factsBlock = retrievedFacts

&#x20;   .map((f, i) => `${i + 1}. \[${f.category}] ${f.text}  (relevance: ${(f.similarity \* 100).toFixed(0)}%)`)

&#x20;   .join('\\n');



&#x20; const prompt = \[

&#x20;   `You are a Genie representing ${userId}'s personal Stage on iAM.`,

&#x20;   `A visitor has asked: "${query}"`,

&#x20;   ``,

&#x20;   `Here are the most relevant things ${userId} has shared:`,

&#x20;   factsBlock,

&#x20;   ``,

&#x20;   `Answer the visitor's question in 2-4 conversational sentences.`,

&#x20;   `Use only the facts above — never infer or add information not present.`,

&#x20;   `If the facts don't cover the question, say so honestly.`,

&#x20;   `Speak about ${userId} in third person (e.g. "Maaz believes...", "According to what she's shared...").`,

&#x20; ].join('\\n');



&#x20; const result = await model.generateContent(prompt);

&#x20; return result.response.text();

}

```



Throw a clear error at the top of the file if `GOOGLE\_AI\_API\_KEY` is missing.



\---



\## lib/vectorStore.js



The custom vector database. No external vector DB dependency — pure MongoDB + math.



\### `cosineSimilarity(a, b)`



Pure function. Two `number\[]` arrays, equal length. Returns float -1 to 1.



```

dot   = Σ a\[i] \* b\[i]

normA = √(Σ a\[i]²)

normB = √(Σ b\[i]²)

return dot / (normA \* normB)

```



\### `searchVectors(db, userId, queryEmbedding, topK = 5)`



Privacy guard first — throw if userId is missing:



```js

if (!userId) throw new Error('userId required — search must always be user-scoped');

```



Then:

1\. `db.collection('facts').find({ userId, embeddingStatus: 'embedded' }).toArray()`

&#x20;  — only embedded facts, only this user's

2\. Map each through `cosineSimilarity(queryEmbedding, doc.embedding)`

3\. Sort descending

4\. Return top `topK` as `\[ { \_id, text, category, similarity } ]`



Never expose the raw `embedding` array in results.



\---



\## lib/privacy.js



```js

export function assertUserScope(requestUserId, resourceUserId) {

&#x20; if (!requestUserId || requestUserId !== resourceUserId) {

&#x20;   const err = new Error('Access denied — you can only access your own data');

&#x20;   err.status = 403;

&#x20;   throw err;

&#x20; }

}

```



Call this in any route that reads, modifies, or deletes a document that belongs to a user.



\---



\## routes/facts.js



\### `GET /api/facts?userId=xxx`



\- `userId` query param required (400 if missing)

\- Return all facts for that user, sorted `createdAt` descending

\- Project out `embedding` field — never send it to the client

\- Include `embeddingStatus` so the UI can show which facts are vectorised



\### `POST /api/facts`



Body: `{ userId, text, category }`



\- Validate: `userId` and `text` required, `text` max 2000 chars

\- Insert with `embedding: null`, `embeddingStatus: "pending"`, `createdAt: new Date()`

\- Return the inserted document (no embedding field)



\### `DELETE /api/facts/:id`



Query param: `?userId=xxx`



1\. Find fact by `\_id`

2\. `assertUserScope(requestUserId, fact.userId)`

3\. Delete



\---



\## routes/embed.js



\### `POST /api/embed/:userId`



Triggers embedding for all `embeddingStatus: "pending"` facts belonging to `:userId`.



```js

1\. Query: facts.find({ userId: params.userId, embeddingStatus: 'pending' })

2\. For each fact (sequentially, not parallel — avoid rate limits):

&#x20;  a. generateEmbedding(fact.text)

&#x20;  b. facts.updateOne(

&#x20;       { \_id: fact.\_id, userId: params.userId },   // userId in filter — always

&#x20;       { $set: { embedding: vector, embeddingStatus: 'embedded' } }

&#x20;     )

&#x20;  c. Emit a Server-Sent Event so the UI can show per-fact progress

3\. When done, return { embedded: N, total: N }

```



Use \*\*Server-Sent Events (SSE)\*\* for progress:

\- Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`

\- Send `data: { factId, text, status: 'done' }\\n\\n` after each fact is embedded

\- Send `data: { done: true, embedded: N }\\n\\n` when complete



This allows the UI to show a live progress bar as vectors are generated.



\---



\## routes/search.js



\### `POST /api/search`



Body: `{ userId, query, topK? }`



1\. Validate: `userId` and `query` required. `topK` defaults to 5, max 10.

2\. Check at least one embedded fact exists for this user — return a helpful error

&#x20;  ("No vectors found for this user. Push to Vector first.") if none.

3\. `generateEmbedding(query)` → queryEmbedding

4\. `searchVectors(db, userId, queryEmbedding, topK)` → vectorResults

5\. `generateGenieResponse(userId, query, vectorResults)` → genieText

6\. Return:



```json

{

&#x20; "userId": "maaz",

&#x20; "query": "what does he think about love?",

&#x20; "vectorResults": \[

&#x20;   { "text": "Love is not a feeling, it is a practice.", "category": "belief", "similarity": 0.91 },

&#x20;   { "text": "I recharge alone. I can be social but it costs me energy.", "category": "preference", "similarity": 0.61 }

&#x20; ],

&#x20; "genieResponse": "Maaz sees love as an active daily choice rather than a passive emotion...",

&#x20; "resultCount": 2

}

```



\---



\## seed/seedData.js



Standalone script: `node seed/seedData.js`



\*\*Critical\*\*: inserts facts with `embedding: null, embeddingStatus: "pending"` — NO embedding

API calls. The seed script is deliberately cheap and instant. Embedding happens in Step 2 of

the UI flow.



Clears existing facts for the three seed userIds before inserting.



\*\*User: `alice`\*\* — writer, early riser, introvert

\- "I believe the first draft of anything is just you telling yourself the story."

\- "I wake up at 5:30am every day, even weekends. It is the only time the house is quiet."

\- "My favourite book is Middlemarch. I have read it four times."

\- "I think social media has made writers more anxious and less curious."

\- "Coffee with oat milk, no sugar. Non-negotiable."

\- "I write longhand first, always. Typing is for editing."

\- "Solitude is not loneliness. It is where I do my best work."

\- "I think ambition and kindness are not in conflict."



\*\*User: `maaz`\*\* — builder, introvert, product thinker

\- "I think the best products feel inevitable in hindsight."

\- "I recharge alone. I can be social but it costs me energy."

\- "Sleep is the most underrated performance lever. I guard 8 hours."

\- "Love is not a feeling, it is a practice. You choose it daily."

\- "I distrust anything that cannot be explained simply."

\- "The best meetings I have ever had were walks, not rooms."

\- "Shipping is a form of honesty."

\- "I think curiosity is a more reliable trait than intelligence."



\*\*User: `gilson`\*\* — founder, optimist, community builder

\- "The idea is never the hard part. Execution is where most people quit."

\- "Small teams that trust each other beat large teams with process every time."

\- "Optimism is a strategy, not a mood."

\- "The best founders are obsessed with the problem, not the solution."

\- "I would rather ship something imperfect and learn than plan for another month."

\- "Community is the moat. Everything else can be copied."

\- "The moment you stop learning, you start becoming irrelevant."

\- "Revenue is a lagging indicator of the value you created."



Log format on insert (no API calls, just DB writes):

```

\[alice] Inserted: "I believe the first draft of anything..."

\[maaz]  Inserted: "I think the best products feel inevitable..."

Seed complete. 24 facts inserted. Run the app and push to vector.

```



\---



\## public/index.html



Single HTML file. Inline `<style>` and `<script>`. No external JS dependencies.

Clean, minimal design — dark sidebar, light content area. Not a toy — make it look intentional.



\---



\### Layout



\*\*Sidebar (left, fixed, \~260px wide, dark background)\*\*

\- App name: "iAM Vector Test" at the top

\- User selector: `<select>` with options alice / maaz / gilson, plus an `<input>` to type a

&#x20; custom userId

\- Below the selector: a small privacy badge — `🔒 Viewing: \[userId]'s data only`

\- Add fact form: textarea + category select + "Add Fact" button (collapsed by default,

&#x20; expandable)



\*\*Main content (right, scrollable)\*\*



Three sections rendered as sequential steps. Each step has a header with a step number,

a status badge, and the content area.



\---



\### Step 1 — View Data



Header: `Step 1 — Raw Data` with status badge `LOADED` (green) or `EMPTY` (grey).



Content:

\- Total count: "8 facts for maaz (3 vectorised, 5 pending)"

\- List of all facts as cards. Each card shows:

&#x20; - The fact text

&#x20; - Category badge (coloured by category type)

&#x20; - Embedding status badge: `✓ vectorised` (green pill) or `· pending` (grey pill)

&#x20; - A small delete button (×) on hover

\- "Load Seed Data" button — calls `POST /api/seed` — reseeds the DB without embeddings.

&#x20; Show a spinner while running. On success, reload the facts list.



Fetched from `GET /api/facts?userId=xxx` on user switch and after any mutation.



\---



\### Step 2 — Push to Vector



Header: `Step 2 — Push to Vector` with status badge `ALL EMBEDDED` (green) /

`N PENDING` (amber) / `NONE YET` (grey).



Content when facts exist but some are pending:

\- Progress bar: `3 of 8 vectorised` — updates live via SSE during embedding

\- "Embed All Pending Facts" button — calls `POST /api/embed/:userId` and opens the SSE stream

\- As each fact is embedded, find it in the Step 1 list and update its badge to `✓ vectorised`

&#x20; and tick the progress bar. No page reload.

\- When complete: badge updates to `ALL EMBEDDED`, show a success message:

&#x20; "All facts are now vectorised. You can search below."



Content when all are already embedded:

\- "All N facts are vectorised" with a checkmark. Button is disabled.



Content when no facts exist:

\- "No facts yet. Add some in Step 1 or load seed data."



\---



\### Step 3 — Search + Genie



Header: `Step 3 — Search` with status badge `READY` (green, only if Step 2 is complete) or

`EMBED FIRST` (amber).



Content:

\- Query input: placeholder "Ask anything about \[userId]..."

\- "Ask Genie" button — disabled if no embedded facts exist

\- Loading state while waiting: spinner + "Searching vectors and generating response..."



\*\*Results area — two sub-sections:\*\*



\*\*Vector Matches\*\* (shown first)

\- Subtitle: "Semantic matches from \[userId]'s facts"

\- Each result as a card:

&#x20; - Similarity score as a percentage badge — coloured:

&#x20;   - ≥ 80% → green background

&#x20;   - ≥ 60% → amber background

&#x20;   - < 60% → light red background

&#x20; - The matched fact text (full)

&#x20; - Category badge

\- If no results above 0.5 similarity: show "No strong matches found in \[userId]'s data."



\*\*Genie Response\*\* (shown below vector matches)

\- Subtitle: "Genie's response — grounded in the matches above"

\- The Gemini-generated paragraph in a styled blockquote/card

\- A small note: "This response was generated only from \[userId]'s own words."

\- The Genie response section should look visually distinct — slightly different background,

&#x20; a subtle left border in the accent colour, maybe a small Genie icon (⟡ or similar)



\---



\### Behaviour Notes



\- On user switch: reset all three steps, reload facts

\- Fact add: reload Step 1 immediately; re-check Step 2 status

\- After embedding completes: Step 3 "Ask Genie" button becomes enabled without reload

\- All errors shown inline in the relevant step — no `alert()`, no console-only errors

\- The SSE stream for embedding: if the connection drops, show a "Retry" button



\---



\## server.js



```js

// Middleware: express.json(), serve public/ as static

// Routes mounted at /api:

//   /api/facts   → routes/facts.js

//   /api/embed   → routes/embed.js

//   /api/search  → routes/search.js

//   POST /api/seed → runs seed/seedData.js programmatically

// Global error handler: return { error: err.message } with err.status or 500

// Startup: connectDb() then app.listen(PORT)

```



Startup log:

```

iAM Vector Test  →  http://localhost:3000

MongoDB connected: iam\_vector\_test

Google AI Studio: ready (text-embedding-004 + gemini-2.0-flash)

```



\---



\## package.json



```json

{

&#x20; "name": "iam-vector-test",

&#x20; "version": "1.0.0",

&#x20; "type": "module",

&#x20; "scripts": {

&#x20;   "start": "node server.js",

&#x20;   "dev": "node --watch server.js",

&#x20;   "seed": "node seed/seedData.js"

&#x20; },

&#x20; "dependencies": {

&#x20;   "@google/generative-ai": "^0.21.0",

&#x20;   "cors": "^2.8.5",

&#x20;   "dotenv": "^16.0.0",

&#x20;   "express": "^4.18.0",

&#x20;   "mongodb": "^6.0.0"

&#x20; }

}

```



\---



\## .gitignore



```

.env

node\_modules/

```



\---



\## Things to Test



\*\*Step 1 — Data visibility\*\*

\- Switch between alice / maaz / gilson. Confirm facts are isolated — you only see the

&#x20; selected user's facts. Alice's facts never appear when maaz is selected.



\*\*Step 2 — Embedding\*\*

\- Load seed data (all facts start as `pending`).

\- Select maaz. Click "Embed All Pending Facts". Watch the progress bar update fact by fact

&#x20; via SSE. When done, all badges show `✓ vectorised`.

\- Switch to alice — her facts still show `pending`. Her data was not touched.



\*\*Step 3 — Semantic search\*\*

\- Select maaz. Search "what does he think about relationships?". The word "relationships"

&#x20; does not appear in any of his facts. Confirm the love/practice fact surfaces with high

&#x20; similarity because the meaning matches.

\- Search "meetings and energy". Confirm the walks fact and the introvert fact surface

&#x20; together — both are semantically adjacent to that query.



\*\*Privacy test (API level)\*\*

\- Open browser dev tools. Call:

&#x20; `fetch('/api/search', { method: 'POST', headers: {'Content-Type':'application/json'},

&#x20;  body: JSON.stringify({ userId: 'alice', query: 'love' }) })`

\- Inspect the response. Confirm every result in `vectorResults` has content only from

&#x20; alice's facts. Maaz's love fact must not appear.



\*\*Delete test\*\*

\- Delete maaz's love fact from the UI.

\- Search "love" or "relationships" again.

\- Confirm the deleted fact no longer surfaces.



\*\*LLM grounding test\*\*

\- Search maaz for "what are his morning habits?"

\- He has no facts explicitly about mornings. The Genie response should acknowledge this

&#x20; ("Based on what Maaz has shared, there's nothing specific about mornings, but...") rather

&#x20; than hallucinating. Confirm the response only references facts visible in the Vector Matches

&#x20; section above it.



\---



\## What This Proves



By the end of this app you can demonstrate, visually and interactively, the complete iAM

Genie pipeline:



1\. Content exists as plain text (Step 1).

2\. Embeddings convert meaning into math and store it in your own DB (Step 2).

3\. A query finds semantically relevant content without keyword matching (Step 3 — vector results).

4\. A language model synthesises those results into a coherent, grounded answer (Step 3 — Genie response).



Privacy is enforced at every database query — not as middleware, not as a flag, but as a

structural guarantee: `userId` is always in the MongoDB filter before any vector is touched.



This is the iAM Genie. The production version adds prompt caching, a Redis semantic cache,

and scales the same MongoDB approach to pgvector when needed. The pipeline is identical.

