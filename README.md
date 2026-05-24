# iAM Vector Test

A minimal Node.js + Express + MongoDB app that demonstrates iAM's custom vector database pipeline end to end. The UI walks through three explicit steps so every stage of the pipeline is visible and interactive.

## What it demonstrates

1. **View Data** — raw facts stored in MongoDB, no embeddings yet
2. **Push to Vector** — embed facts using Google AI (`gemini-embedding-001`) and store the 768-dimensional vectors in MongoDB
3. **Search + Genie** — semantic vector search against your own facts, plus a Genie LLM response grounded only in the matched results (via Groq / Llama 3.3)

Privacy is enforced at the database layer — every query filters by `userId` before touching any vector. Users can also mark individual facts as **public**, allowing other users to search their public stage.

---

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | MongoDB (local or Atlas) |
| Embeddings | Google AI Studio — `gemini-embedding-001` (768d) |
| LLM | Groq — `llama-3.3-70b-versatile` |
| Frontend | Single `index.html`, vanilla JS, no build step |

---

## Project structure

```
iam-vector/
├── server.js              # Express entry point, mounts routes
├── .env.example           # Environment variable template
├── lib/
│   ├── db.js              # MongoDB connection singleton
│   ├── google.js          # Google AI (embeddings) + Groq (LLM)
│   ├── vectorStore.js     # Cosine similarity + scoped MongoDB search
│   └── privacy.js         # userId ownership guard
├── routes/
│   ├── facts.js           # GET / POST / PATCH / DELETE /api/facts
│   ├── embed.js           # GET /api/embed/:userId  (SSE stream)
│   └── search.js          # POST /api/search
├── seed/
│   └── seedData.js        # Insert 24 facts for alice / maaz / gilson
└── public/
    └── index.html         # Full UI
```

---

## Setup

### 1. Prerequisites

- Node.js 18+
- MongoDB running locally (`mongod`) or an Atlas connection string
- A [Google AI Studio](https://aistudio.google.com/) API key (free tier)
- A [Groq](https://console.groq.com/) API key (free tier)

### 2. Install

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
GOOGLE_AI_API_KEY=AIza...
GROQ_API_KEY=gsk_...
MONGODB_URI=mongodb://localhost:27017/iam_vector_test
PORT=3000
```

### 4. Run

```bash
# Development (auto-restarts on file change)
npm run dev

# Production
npm start
```

Open [http://localhost:3000](http://localhost:3000).

---

## Using the app

### Step 1 — View Data

Click **Load Seed Data** to insert 24 facts for three seed users (`alice`, `maaz`, `gilson`) with no embeddings. Switch between users using the sidebar selector. Each fact shows its category and embedding status (`pending` or `vectorised`).

Every fact has a **🔒 private / 🌐 public** toggle. Private facts are only visible and searchable by their owner. Public facts can be searched by any user via the cross-user search in Step 3.

### Step 2 — Push to Vector

Click **Embed All Pending Facts**. Each fact is sent to `gemini-embedding-001`, the returned 768-dimensional vector is stored in MongoDB, and the progress bar updates live via Server-Sent Events. Switching users shows their independent embedding state.

### Step 3 — Search + Genie

The **Ask about** field defaults to the current user. Change it to another user's ID (e.g. `maaz` while logged in as `alice`) to search their public stage. A green banner confirms cross-user mode.

Type any natural-language query and click **Ask Genie**. Results appear in two parts:

- **Vector matches** — the top facts ranked by cosine similarity, colour-coded by score (green ≥ 80%, amber ≥ 60%, red < 60%)
- **Genie response** — a 2–4 sentence answer from Llama 3.3, grounded strictly in the matched facts above it

---

## API reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/facts?userId=` | List all facts for a user (no embeddings returned) |
| `POST` | `/api/facts` | Add a fact `{ userId, text, category }` |
| `PATCH` | `/api/facts/:id` | Toggle visibility `{ userId, isPublic }` |
| `DELETE` | `/api/facts/:id?userId=` | Delete a fact (owner only) |
| `GET` | `/api/embed/:userId` | Embed all pending facts, streams SSE progress |
| `POST` | `/api/search` | Vector search + Genie response `{ userId, query, targetUserId?, topK? }` |
| `POST` | `/api/seed` | Re-seed the database for all three default users |

---

## Privacy model

- A user can search **all** of their own embedded facts.
- A user can search another user's facts **only if** those facts are marked `isPublic: true`.
- The `userId` filter is applied at the MongoDB query level before any vector is touched — it is not a middleware flag that can be bypassed.
- The `assertUserScope` guard in `lib/privacy.js` enforces ownership on all write and delete operations.

---

## How the vector search works

No external vector database. Pure MongoDB + math:

1. The query string is embedded with `gemini-embedding-001` → a 768-float array.
2. All embedded facts for the target user are loaded from MongoDB (filtered by `userId` and optionally `isPublic`).
3. Cosine similarity is computed in JavaScript against each fact's stored vector.
4. The top-K results by similarity score are returned.
5. Those results are passed to Llama 3.3 on Groq with a strict grounding prompt — the model is instructed to only use the provided facts, never hallucinate.

---

## Seed users

| User | Persona |
|---|---|
| `alice` | Writer, early riser, introvert |
| `maaz` | Builder, product thinker, introvert |
| `gilson` | Founder, optimist, community builder |

Each has 8 facts across categories: `belief`, `thought`, `preference`, `fact`, `story`.
