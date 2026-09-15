# NexusDoc — Self-Correcting RAG Pipeline

A document intelligence application that answers questions about your PDFs and **checks its own
work before replying**. Upload a PDF, ask a question, and the system retrieves passages, grades
each one for relevance, generates an answer, then verifies that the answer is grounded in the
source material and actually addresses the question. If either check fails, it regenerates.

Every answer carries clickable `[Page N]` citations that scroll and highlight the matching page
in a side-by-side PDF viewer.

**Stack:** FastAPI + LangGraph + LangChain + Qdrant + HuggingFace embeddings + OpenAI •
React 19 + TypeScript + Vite + react-pdf

---

## Table of Contents

- [What makes it "self-correcting"](#what-makes-it-self-correcting)
- [Architecture](#architecture)
- [The LangGraph state machine](#the-langgraph-state-machine)
- [Prerequisites](#prerequisites)
- [Backend setup](#backend-setup)
- [Frontend setup](#frontend-setup)
- [Running both](#running-both)
- [API reference](#api-reference)
- [Configuration](#configuration)
- [How citations work end to end](#how-citations-work-end-to-end)
- [Project layout](#project-layout)
- [Diagnostic scripts](#diagnostic-scripts)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)

---

## What makes it "self-correcting"

A plain RAG pipeline is a straight line: retrieve, stuff the context into a prompt, generate,
ship it. It has no idea whether the retrieved chunks were relevant or whether the model made
something up.

This pipeline inserts three LLM-as-judge gates, each returning a structured binary score via
Pydantic-constrained output:

| Gate | Model class | Question it answers | Effect |
|---|---|---|---|
| **Document relevance** | `GradeDocuments` | Is this chunk relevant to the question? | Irrelevant chunks are dropped before generation |
| **Hallucination check** | `GradeHallucinations` | Is the answer grounded in the retrieved facts? | `no` → regenerate |
| **Answer usefulness** | `GradeAnswer` | Does the answer actually resolve the question? | `no` → regenerate |

The graph only reaches `END` when the generation is **both** grounded and useful. Each step
appends its name to a `steps` list that is returned to the UI, so the user sees the reasoning
path (`retrieve → grade_documents → generate`) rendered as check-marked chips beneath the answer.

---

## Architecture

```
                    React 19 + Vite  (localhost:5173)
   +-----------------------------------------------------------+
   |  PDFViewer (react-pdf)        |   ChatInterface            |
   |  - renders all pages          |   - message list           |
   |  - scrollIntoView on citation |   - [Page N] -> buttons    |
   |  - 2s highlight ring          |   - LangGraph step chips   |
   +-------------------------------+----------------------------+
                    |  axios: POST /upload, POST /chat
                    v
                 FastAPI  (localhost:8000)
   +-----------------------------------------------------------+
   |  app/api/endpoints.py                                      |
   |     /api/v1/upload  ->  pdf_parser -> vector_store         |
   |     /api/v1/chat    ->  app_graph.invoke()                 |
   +-----------------------------------------------------------+
        |                                    |
        v                                    v
  pdf_parser.py                         graph.py (LangGraph)
  PyPDFLoader + Recursive               retrieve -> grade -> generate
  splitter (1000 / 200)                       ^              |
        |                                     +--- not grounded / not useful
        v                                                    |
  vector_store.py                                            v
  Qdrant (embedded, ./local_qdrant)                         END
  all-MiniLM-L6-v2, 384-dim, cosine
```

**Embeddings run locally.** `sentence-transformers/all-MiniLM-L6-v2` is loaded in-process via
`HuggingFaceEmbeddings`, so no document text is sent to a third party at index time. Only the
retrieved chunks reach OpenAI, at query time.

**Qdrant runs embedded.** `QdrantClient(path="local_qdrant")` uses on-disk local mode — no
server, no Docker. The tradeoff is a hard single-process file lock (see
[Known limitations](#known-limitations)).

---

## The LangGraph state machine

Defined in [backend/app/services/graph.py](backend/app/services/graph.py).

### State

```python
class GraphState(TypedDict):
    question: str
    generation: str
    documents: List[Document]
    steps: List[str]
```

### Nodes

**`retrieve`** — calls `retrieve_context(question, top_k=5)` for a cosine similarity search over
the Qdrant collection. Appends `"retrieve"` to `steps`.

**`grade_documents`** — for each retrieved document, runs a grader prompt through
`llm.with_structured_output(GradeDocuments)` and keeps only those scored `"yes"`. Appends
`"grade_documents"` to `steps`.

This is N sequential LLM calls for N documents — the dominant latency cost of a query. See
[Known limitations](#known-limitations) for how to parallelize.

**`generate`** — formats the surviving documents as `[Page X]: <content>` blocks and prompts the
model to answer concisely *and to cite sources by appending `[Page X]` to relevant sentences*.
That instruction is what produces the clickable citations in the UI. Appends `"generate"` to
`steps`.

### Conditional edge

`check_hallucinations` runs after `generate` and returns one of three routes:

```
generate --+-- "useful"        --> END
           |
           +-- "not supported" --> generate   (answer not grounded in the docs)
           |
           +-- "not useful"    --> generate   (grounded, but does not answer the question)
```

It first grades groundedness. Only if that passes does it run the second grader for
question-relevance. A `not useful` route in a fuller implementation would rewrite the query and
re-retrieve; here it re-generates against the same context.

### Graph wiring

```python
workflow.set_entry_point("retrieve")
workflow.add_edge("retrieve", "grade_documents")
workflow.add_edge("grade_documents", "generate")
workflow.add_conditional_edges("generate", check_hallucinations, {
    "not supported": "generate",
    "useful": END,
    "not useful": "generate",
})
app_graph = workflow.compile()
```

---

## Prerequisites

- **Python 3.10+**
- **Node.js 18+** (Vite 8 and React 19)
- An **OpenAI API key** — used for `gpt-4o-mini` in generation and in all three graders
- Roughly 2 GB of disk for the PyTorch and sentence-transformers wheels

---

## Backend setup

```bash
cd NexusDoc/backend

python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

`requirements.txt` is a fully pinned lockfile including a CUDA-enabled `torch` build. On a
CPU-only or non-Linux machine, install the CPU wheel first to avoid pulling several GB of NVIDIA
packages:

```bash
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

### Environment

```bash
cp .env.example .env
```

Then edit `.env`:

```
OPENAI_API_KEY=sk-...
```

### Run

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Swagger UI: <http://localhost:8000/docs>

The first request downloads the `all-MiniLM-L6-v2` model (~90 MB) to the HuggingFace cache. That
is a one-time cost.

---

## Frontend setup

```bash
cd NexusDoc/frontend
npm install
npm run dev
```

Opens on <http://localhost:5173>.

Scripts:

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | `tsc -b` type-check, then a production bundle to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | [oxlint](https://oxc.rs) |

---

## Running both

[run.sh](run.sh) starts the backend and the frontend together and terminates both on `Ctrl+C`:

```bash
chmod +x run.sh
./run.sh
```

It expects the backend virtualenv at `backend/venv`. On Windows, run the two commands in
separate terminals instead — the script is bash-only.

---

## API reference

Base path: `http://localhost:8000/api/v1`

### `POST /upload`

Multipart upload of a single PDF. Rejects anything whose filename does not end in `.pdf`.

```bash
curl -X POST http://localhost:8000/api/v1/upload \
  -F "file=@contract.pdf"
```

```json
{ "message": "Document processed and indexed successfully", "chunks": 42 }
```

Pipeline: write to a temp file, `PyPDFLoader` extracts text with `page` and `source` metadata,
`RecursiveCharacterTextSplitter` chunks it (size 1000, overlap 200), chunks are embedded and
upserted into Qdrant, temp file is deleted.

Errors: `400` for a non-PDF, `500` with the exception string for anything else (full traceback
is printed to the server log).

### `POST /chat`

```bash
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the termination notice period?"}'
```

```json
{
  "answer": "Either party may terminate with 30 days written notice [Page 4].",
  "steps": ["retrieve", "grade_documents", "generate"]
}
```

`steps` reflects the actual path taken through the graph and is rendered in the UI as the
agent's reasoning trace.

### `GET /`

Health check — returns `{"message": "Welcome to the Self-Correcting RAG API"}`.

---

## Configuration

[backend/app/core/config.py](backend/app/core/config.py), a `pydantic-settings` model that reads
from `.env`:

| Setting | Default | Meaning |
|---|---|---|
| `PROJECT_NAME` | `"Self-Correcting RAG Pipeline"` | FastAPI title |
| `API_V1_STR` | `"/api/v1"` | Router prefix |
| `QDRANT_PATH` | `"local_qdrant"` | On-disk path for embedded Qdrant |
| `COLLECTION_NAME` | `"documents"` | Qdrant collection |
| `OPENAI_API_KEY` | `""` | Required |

Other constants worth knowing, currently hardcoded:

| Value | Location | Default |
|---|---|---|
| Chunk size / overlap | `services/pdf_parser.py` | 1000 / 200 |
| Retrieval `top_k` | `services/graph.py` (`retrieve`) | 5 |
| Embedding model | `services/vector_store.py` | `all-MiniLM-L6-v2` |
| Vector size / distance | `services/vector_store.py` | 384 / cosine |
| LLM + temperature | `services/graph.py` | `gpt-4o-mini`, `0` |

If you swap the embedding model, the `size=384` in `VectorParams` must change to match the new
model's dimensionality, and the existing collection must be deleted and rebuilt.

---

## How citations work end to end

1. `pdf_parser.process_pdf()` keeps PyPDFLoader's `page` metadata on every chunk.
2. `graph.generate()` builds the context as `[Page X]: <chunk text>` blocks and instructs the
   model to append `[Page X]` to the sentences it draws from.
3. The model emits literal `[Page 4]` markers inside its answer.
4. `ChatInterface.renderContentWithCitations()` scans the answer with `/\[Page (\d+)\]/g` and
   replaces each match with a `📄 P4` button.
5. Clicking that button calls `onCitationClick(4)`, lifting the page number to `App`, which sets
   `activePage`.
6. `PDFViewer`'s effect on `activePage` finds `#pdf-page-4`, calls `scrollIntoView`, and applies
   a 2-second accent-colored `boxShadow` ring.

Note that PyPDF page metadata is **0-indexed** while `PDFViewer` renders pages `1..numPages`. If
citations land one page early, this off-by-one is the cause — normalize in `pdf_parser.py` by
incrementing `doc.metadata["page"]`.

---

## Project layout

```
NexusDoc/
├── backend/
│   ├── app/
│   │   ├── api/endpoints.py        # /upload and /chat routes
│   │   ├── core/config.py          # pydantic-settings
│   │   ├── services/
│   │   │   ├── graph.py            # LangGraph state machine + the 3 graders
│   │   │   ├── pdf_parser.py       # PyPDFLoader + recursive splitter
│   │   │   └── vector_store.py     # Qdrant client, embeddings, add/retrieve
│   │   └── main.py                 # FastAPI app, CORS, lifespan
│   ├── local_qdrant/               # embedded Qdrant storage (generated)
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Chat/ChatInterface.tsx
│   │   │   └── PDF/PDFViewer.tsx
│   │   ├── App.tsx                 # two-panel layout, upload handling
│   │   ├── App.css / index.css     # CSS custom properties, glass panels
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── run.sh                          # start backend + frontend together
├── test_qdrant.py                  # round-trip add/retrieve check
├── test_script.py                  # does the collection exist?
└── test_invoke.py                  # invoke the graph directly
```

---

## Diagnostic scripts

Run these from `backend/` with the virtualenv active — they import `app.*` directly.

| Script | Checks |
|---|---|
| `test_qdrant.py` | Adds a one-document corpus and retrieves it — verifies embeddings and Qdrant writes work |
| `test_script.py` | Reports whether the `documents` collection exists yet |
| `test_invoke.py` | Invokes `app_graph` with a bare question — verifies the LangGraph wiring and the OpenAI key |

> `test_invoke.py` contains a hardcoded `sys.path.append("/home/neural/vishal/AI_Projects/backend")`
> from the original dev machine. Edit that line to your own path, or delete it and run from
> `backend/`.

---

## Known limitations

**Single-process Qdrant lock.** Embedded Qdrant takes an exclusive file lock on `local_qdrant/`.
Running `uvicorn --reload`, a diagnostic script, and the API at the same time produces
`Storage folder ... is already accessed by another instance`. Stop everything else first, or move
to a Qdrant server:

```bash
docker run -p 6333:6333 -v $(pwd)/qdrant_storage:/qdrant/storage qdrant/qdrant
```

then change `QdrantClient(path=...)` to `QdrantClient(url="http://localhost:6333")`.

**Serial document grading.** `grade_documents` makes one LLM call per retrieved chunk in a
`for` loop — with `top_k=5` that is five round trips before generation even begins. Batching with
`retrieval_grader.batch([...])` would cut this to roughly one round trip.

**Unbounded regeneration loop.** The conditional edge routes `not supported` and `not useful`
straight back to `generate` with no attempt counter. A question the model cannot ground will loop
until LangGraph's default recursion limit trips. Add a `retries` field to `GraphState`, increment
it in `generate`, and route to `END` past a threshold.

**Empty-context path.** If `grade_documents` filters out every chunk, `generate` runs with an
empty context. The prompt instructs the model to say it does not know, which is the correct
behavior, but a dedicated "no relevant documents" node would be clearer and cheaper.

**Global, shared collection.** All uploads land in one `documents` collection with no per-user or
per-document namespacing. Uploading a second PDF makes both searchable at once. Add a
`document_id` to the chunk metadata and a Qdrant filter at retrieval time to scope queries.

**Wide-open CORS.** `allow_origins=["*"]` is flagged in the source as a dev setting. Restrict it
before any deployment.

**Hardcoded API base URL.** The frontend calls `http://localhost:8000` literally in `App.tsx` and
`ChatInterface.tsx`. Move it to `import.meta.env.VITE_API_URL` before deploying.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Storage folder local_qdrant is already accessed by another instance` | Another process holds the embedded Qdrant lock. Kill stray `uvicorn`/`python` processes, or switch to a Qdrant server. |
| Upload succeeds, chat answers "I don't know" | Nothing indexed, or every chunk was graded irrelevant. Check the server log for `---GRADE: DOCUMENT NOT RELEVANT---` lines. |
| `AuthenticationError` from OpenAI | `.env` missing or unread. Confirm `backend/.env` exists and that uvicorn was started from `backend/`. |
| Chat hangs for 30+ seconds | Expected on a first query: model download, plus one grader call per chunk, plus generation, plus two verification calls. |
| PDF panel stays blank after upload | `react-pdf` worker failed to load. Check the browser console; the worker is resolved via `import.meta.url` in `PDFViewer.tsx`. |
| Citations jump one page off | 0-indexed PyPDF metadata vs. 1-indexed rendering — see [How citations work](#how-citations-work-end-to-end). |
| `ModuleNotFoundError: app` | Run uvicorn from `backend/`, not from the repo root. |
