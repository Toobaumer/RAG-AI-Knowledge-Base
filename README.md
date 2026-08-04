# Enterprise Knowledge Base (RAG Chatbot)

An enterprise-style Retrieval-Augmented Generation (RAG) chatbot. Upload PDF documents, they get parsed, cleaned, chunked, embedded, and indexed into ChromaDB and an in-memory BM25 keyword index. Ask questions and get answers from Gemini 2.5 Flash, retrieved through hybrid search (vector + keyword) and reranking, grounded only in what you uploaded.

**Stack:** NestJS, TypeScript, Gemini 2.5 Flash, Gemini Embeddings, ChromaDB, BM25, Tailwind CSS, vanilla JavaScript

![Upload Interface](docs/screenshots/home.png)

---

## What it does

**Uploading a PDF** (`POST /knowledge/upload`): parses the PDF, cleans the text, converts it to Markdown, splits it into overlapping chunks, embeds each chunk with Gemini, and indexes it into both ChromaDB and an in-memory BM25 index.

**Asking a question** (`POST /chat`):
1. Sanitizes and validates the question
2. Runs semantic vector search and BM25 keyword search in parallel (top 10 each)
3. Merges and deduplicates the results
4. Reranks the merged candidates by semantic similarity, keyword strength, and metadata quality, keeping the top 5
5. Sends the top chunks and question to Gemini 2.5 Flash, with a system prompt that forbids answering from outside knowledge
6. Returns `{ answer, sources, confidence }`, confidence is a High/Medium/Low label, forced to Low whenever the model couldn't find an answer, regardless of how good retrieval looked

---

## Why hybrid search, not just embeddings

Semantic embeddings are good at matching meaning but can miss exact terminology. A question using a document's literal heading phrase can fail to retrieve that section if the embedding doesn't represent a short, sparse chunk distinctly enough. BM25 keyword search has no notion of meaning at all, which is exactly what makes it a good complement: it catches exact-phrase matches embeddings sometimes miss. Reranking then blends both signals (plus metadata quality) into one score, instead of trusting either search method alone.

---

## Project structure

```
rag-ai-knowledge-base/
├── public/                    Frontend (upload left, chat right)
├── src/
│   ├── config/                 Typed environment configuration
│   ├── common/                 PDF parsing, text cleaning, Markdown conversion,
│   │                           chunking, input sanitization
│   ├── gemini/                 Embedding, generation, and evaluation-judge
│   │                           services - the only files that call Gemini
│   ├── vector-store/            VectorStorePort interface + ChromaDB adapter
│   ├── retrieval/               BM25, vector search, hybrid merge, reranking,
│   │                           and the pipeline that orchestrates all of it
│   ├── prompt/                  Assembles retrieved chunks into delimited context
│   ├── knowledge/               POST /knowledge/upload
│   └── chat/                    POST /chat
├── .env.example
└── package.json
```

### Key architectural decisions

- **`VectorStorePort`** is an interface, not a direct ChromaDB dependency. Swapping in Pinecone later means one new class, zero changes anywhere else.
- **`RerankProvider`** is the same pattern for reranking, A documented, unwired `CohereRerankProvider` stub shows exactly where a real Cohere integration would plug in.
- **`RetrievalPipelineService`** is the only place that knows the pipeline's stages and their order. `ChatService` depends only on its `retrieve()` method, so retrieval internals can keep evolving without touching the `/chat` API contract.
- **BM25 runs in memory**, rehydrating itself from ChromaDB at startup, no Redis or extra infrastructure required, and no keyword-search coverage lost on restart.

---

## Setup

```bash
npm install
npx chroma run --path ./chroma-data --port 8000   # separate terminal, leave running
cp .env.example .env                                # then add your GEMINI_API_KEY
npm run start:dev
```

Open `http://localhost:3000`. Upload a PDF on the left, ask a question on the right. No Postman needed - the browser is the entire test surface.

A free Gemini API key: https://aistudio.google.com/apikey

---

## Security

- Every request is validated; empty questions, non-PDF uploads, and oversized files are rejected with clear 400 responses
- Questions are sanitized (control characters, excessive whitespace stripped) before use
- The system prompt explicitly instructs Gemini to treat retrieved document content as reference material only, never as instructions - a defense against prompt injection embedded in uploaded documents
- Every retrieved chunk is wrapped in explicit excerpt delimiters as a second layer of the same defense
- Internal errors are never exposed to the client; real errors are logged server-side only

---

## Known simplifications

- Embeddings are generated one chunk at a time (cached, so repeats within a session are free), not batched into a single API call
- BM25 has no stopword removal or stemming, negligible at real document scale, can distort rankings on very small test sets
- Reranking weights (semantic / keyword / metadata) are set by judgment, not tuned against measured accuracy. A planned Ragas evaluation pass would replace this with real numbers
- No conversation memory at this moment, each question is answered independently

## Roadmap

- [x] PDF ingestion, chunking, Gemini embeddings, ChromaDB storage
- [x] Hybrid search (vector + BM25) and reranking
- [ ] Ragas-based evaluation of answer quality and reranker weights
- [ ] Redis-backed conversation memory


---

## Debugging notes

A few real bugs found and fixed while building this:

- **Retrieval missed obviously relevant chunks, even on exact keyword matches.** Root cause: Gemini embeddings had no `taskType` set (`RETRIEVAL_DOCUMENT` vs `RETRIEVAL_QUERY` produces meaningfully better retrieval), and `gemini-embedding-001` doesn't auto-normalize vectors at reduced output dimensionality, distorting ChromaDB's similarity scoring. Fixed both; also tried prefixing each chunk's heading onto its embedded text, which measurably hurt short chunks by diluting their focus, and was reverted.
- **A query using a document's exact heading phrase still failed after that fix.** This was the case for hybrid search: BM25 found the correct chunk when vector search alone missed it entirely.
- **Hybrid search still didn't fix it, at first.** `ChunkingService` strips headings out of chunk body text entirely, and BM25 was only indexing that body text - so the literal words in a heading like "Program Overview" didn't exist in *any* chunk's searchable text, in either retrieval method. Fixed by indexing heading + content together in BM25 specifically (safe there, unlike the embedding case above, since BM25 scores terms additively rather than blending them into one vector).
- **A source PDF's bullet points lost their bullet glyph during text extraction**, causing lines to be misclassified as section headings, fragmenting the real "Program Overview" section into disconnected pieces. Fixed by recognizing "Label: value" lines and excluding them from heading detection.
- **The confidence indicator sometimes showed "High confidence" on a "couldn't find this" answer.** It only scored retrieval quality, with no awareness of what Gemini actually did with that context. Fixed by forcing confidence to Low whenever the answer matches the not-found message exactly.
- **Every Gemini API failure showed the same "verify your API key" message**, including once when the real cause was a 429 daily free-tier quota limit - unrelated to key validity, and it cost real debugging time chasing the wrong fix. Fixed with an error parser that distinguishes an invalid key, a short-term rate limit, and a daily quota cap, since each needs a different response.

This was all verified with real evidence, not just code review: direct logic-level tests of BM25 and reranking replaying the exact failure scenarios above, and end-to-end tests against the real uploaded document with debug logging showing each candidate chunk's score breakdown.
