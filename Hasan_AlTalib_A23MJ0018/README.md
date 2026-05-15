# NEXUS

Autonomous incident intelligence for DHL Asia Pacific customer service operations.

NEXUS reads incoming customer emails, classifies and routes them through a team of eight specialised AI agents, generates resolution plans grounded in past cases and SOPs, communicates with customers, alerts hub managers when clusters form, and feeds every resolved case back into a vector knowledge corpus that the next incident matches against.

Built for the **DHL Digital Automation Challenge 3.0 — Scenario 2: AI-Enhanced Incident Reporting & Resolution System**.

---

## Live demo

| | |
|---|---|
| **Live URL** | https://nexus-dhl.vercel.app |
| **Admin login** | `admin@nexus.com` / `nexus123` |
| **Reviewer login** | `reviewer@nexus.com` / `nexus123` |
| **Reporter login** | `reporter@nexus.com` / `nexus123` |

Open the URL in a browser. No install required. The full stack runs in the cloud.

---

## What it does

A support agent costing RM 21.50/hour spends 10–15 minutes per email reading, classifying, looking up history, drafting a response, and updating internal records. NEXUS does the same work in under 30 seconds and feeds the outcome back into a learning loop.

- **Reads** unstructured email text in English and Bahasa Melayu
- **Classifies** into 7 incident types with 99.65% accuracy (LightGBM + isotonic calibration)
- **Deduplicates** against a vector embedding corpus to avoid double-handling
- **Retrieves** the top-3 relevant SOPs and similar resolved cases
- **Drafts** a customer recovery message and a hub manager notice
- **Routes** to human reviewer when severity, sentiment, or churn-risk signals cross threshold
- **Sends** the customer acknowledgment via SMTP, with a live chat link
- **Detects clusters** across hubs and predicts cascade risk using a Malaysia adjacency map
- **Retrains** the classifier every 20 resolutions; calibration tracked per class
- **Audits** every decision into a single observability page

---

## Architecture

Three independent services, each deployable separately:

```
┌──────────────────────────────────────────────────────────┐
│  Frontend  React 19 + Vite + Tailwind  (Vercel)          │
│            20 pages, SSE-driven live updates             │
└──────────────────────────────────────────────────────────┘
                          ↑↓ HTTPS + cookies
┌──────────────────────────────────────────────────────────┐
│  Backend   Node.js + Express 5  (Render)                 │
│            8 background monitors                          │
│            Agent orchestrator + 8 specialised agents      │
└──────────────────────────────────────────────────────────┘
        ↓                ↓                ↓
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│ MongoDB      │  │ FastAPI ML   │  │ Anthropic Claude │
│ Atlas        │  │ (Render)     │  │ DeepSeek (fallback)│
│              │  │ LightGBM,    │  │                  │
│ Incidents,   │  │ SHAP,        │  │                  │
│ SOPs,        │  │ fastembed    │  │                  │
│ Embeddings,  │  │ vector index │  │                  │
│ Audit log    │  │              │  │                  │
└──────────────┘  └──────────────┘  └──────────────────┘
                          ↑
┌──────────────────────────────────────────────────────────┐
│  RPA Layer  UiPath ReFramework + 2,200-line C# workflow  │
│             Local: hub operator workstations              │
│             Cloud: UiPath Cloud Orchestrator + REST API   │
└──────────────────────────────────────────────────────────┘
```

---

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4, Radix UI, Recharts, D3.js, Framer Motion |
| Backend | Node.js (ESM), Express 5, Mongoose 9, JWT (HTTP-only cookies), Server-Sent Events |
| ML | Python 3.12, FastAPI, scikit-learn 1.5+, LightGBM 4.6, fastembed (sentence-transformers/all-MiniLM-L6-v2), SHAP |
| LLM | Anthropic Claude (primary), DeepSeek (fallback), provider abstraction in `backend/src/config/aiProvider.js` |
| Database | MongoDB Atlas (M0, ap-southeast-1) |
| RPA | UiPath Studio 26.2, ReFramework, Coded Workflow (C#), UiPath Cloud Orchestrator |
| Email | Nodemailer + Gmail SMTP, queued outbound with status tracking |
| Deployment | Vercel (frontend), Render (backend + ML), GitHub (CI/CD via push to main) |

---

## Repo structure

```
backend/                 Node + Express API
  src/
    agents/              intake, classifier, dedup, resolution, orchestrator
    services/            27 services (SLA prediction, cluster detection, retraining, ...)
    routes/              incidents, brain, admin, knowledge, rpa, chat, ops
    models/              Mongoose schemas (21 collections)
  index.js               server bootstrap + background monitor startup

frontend/                React 19 SPA
  src/
    pages/               20 routes (Board, Detail, Audit, Brain, RpaCenter, ...)
    components/          PipelineModal, SHAPWaterfall, KnowledgeMapGraph, ...
    lib/api.js           123 typed client functions
    hooks/               useAuth, useSSE

ml-service/              Python FastAPI
  main.py                /classify, /embed, /pca-project, /reload-model, ...
  classifier.py          LightGBM + isotonic calibrator
  embeddings.py          fastembed + cosine search
  train.py               training pipeline with calibration report
  model.pkl              LightGBM artifact

uipath/                  UiPath project
  refw/                  ReFramework Main.xaml + Dispatcher.xaml + framework/
  nexus_rpa.cs           Coded workflow (~2,200 lines C#)
```

---

## Running locally

Three services, three terminals.

```bash
# 1. Backend (port 3001)
cd backend
npm install
cp .env.example .env       # fill in MONGODB_URI, ANTHROPIC_API_KEY, SMTP_*
npm run dev

# 2. ML service (port 8000)
cd ml-service
python -m venv venv
venv/Scripts/activate      # or `source venv/bin/activate` on Unix
pip install -r requirements.txt
uvicorn main:app --reload

# 3. Frontend (port 5173)
cd frontend
npm install
echo "VITE_API_URL=http://localhost:3001" > .env
npm run dev
```

Open `http://localhost:5173`, log in with `admin@nexus.com / nexus123`.

For the RPA layer, open `uipath/refw/` in UiPath Studio (Windows). The Studio robot reads emails from a watch folder at `C:\NEXUS_Watch`.

---

## Key technical decisions

**Hybrid ML + LLM classifier**  
The classifier agent runs LightGBM first (fast, deterministic) then arbitrates with Claude. Confidence ≥0.85 confirms ML; 0.65–0.85 runs an independent LLM evaluation; <0.65 lets the LLM override. This combines ML's calibration with the LLM's contextual reasoning.

**SHAP for explainability**  
Every classification stores its top-N positive and negative features. The Detail page renders the waterfall. Operators see *why* the model decided what it decided, not just *what*.

**CRAG (Corrective RAG) for case retrieval**  
The case memory service first attempts semantic search. If results are weak, it reformulates the query using incident type + location + severity and retries. This handles low-quality input emails where direct embedding similarity misses obvious matches.

**Background learning loops**  
- Every resolved incident → vector embedding → corpus update
- Every 20 resolutions → automatic LightGBM retrain → calibration report → live model reload
- HITL corrections are weighted as high-priority training samples

**Cluster detection and cascade prediction**  
A 4-hour sliding window groups incidents by type + hub. When ≥3 incidents form a cluster, NEXUS sends a proactive notice to the hub manager and predicts downstream impact to adjacent hubs using a hardcoded Malaysia adjacency map.

**Brain executable actions**  
The NEXUS Brain (analyst-grade NL Q&A over the entire corpus) produces actions with executable operations: `create_sop`, `fire_proactive_notice`, `flag_customer_account`. One click writes the suggestion into the database and audits the execution.

**Resilience**  
- Heuristic JS fallback classifier if FastAPI is unreachable
- Autonomous escalation rate limit (50/hour sliding)
- Kill switch on Admin Dashboard halts all autonomous loops
- Robot store-and-forward folder for offline tolerance
- Per-incident error isolation in every background monitor

---

## Background monitors

| Monitor | Interval | Function |
|---|---|---|
| SLA breach checker | 5 min | Updates breach probabilities, marks deadlines |
| Follow-up outcome tracker | 5 min | Records 24h post-resolution outcomes |
| Email queue flusher | 60 s | Drains outbound SMTP queue |
| SOP auto-generator | 30 min | Drafts SOPs for uncovered type/location combos |
| Proactive auto-generation | 15 min | Generates hub notices and customer emails for clusters |
| Morning briefing | Daily 07:00 MYT | Summary digest to ops |
| Stuck incident monitor | 60 s | Recovers DRAFT incidents stuck in pipeline |
| Embedder monitor | 30 s | Embeds incidents missed by inline path |

---

## License

Submitted for academic evaluation as part of SECJ 3483 Web Technology coursework at Universiti Teknologi Malaysia.

---

## Author

**Hasan Ammar Abdulaziz Al-Talib**  
Matric No: A23MJ0018  
Course: SECJ 3483 — Web Technology  
Lecturer: Dr Harry Aiman
