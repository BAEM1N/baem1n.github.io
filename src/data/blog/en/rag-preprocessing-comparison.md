---
author: baem1n
pubDatetime: 2026-04-16T02:00:00.000Z
title: "RAG Preprocessing Matters More Than Embeddings — Parser × Chunking × VectorStore Benchmark"
description: "Single-variable experiments on 300 Q&A for 3 PDF parsers, 4 chunking strategies, and 7 vector stores. Chunking moves MRR +23.5%, parser +5.4%, vector stores tie on accuracy but differ 200x in latency."
tags:
  - rag
  - langchain
  - benchmark
  - vector-database
  - korean-nlp
featured: true
aiAssisted: true
---

> **TL;DR**: For Korean RAG, **chunking has the largest impact (+23.5% MRR)**. Parser choice moves MRR only +5.4%, and vector stores tie on accuracy (+0.6%). But vector stores still matter: query latency spans **200x** (FAISS 0.7ms vs pgvector 143ms). The winning preprocessing stack is `pymupdf4llm + 500/100 chunking + FAISS`.

## Table of contents

## Setup

Single-variable experiments on [allganize RAG-Evaluation-Dataset-KO](https://huggingface.co/datasets/allganize/RAG-Evaluation-Dataset-KO) (300 Q&A, 58 PDFs). Each phase varies exactly one component while holding everything else fixed.

| Held constant (Phases 1–3) | Value |
|---------------------------|-------|
| Embedding | qwen3-embed-8b (4096-dim) |
| Top-k | 5 |
| Metrics | MRR, Hit@1/5, File Hit@5 |

Phase winners cascade into the next phase's fixed config.

Full design: [RAG Benchmark Experiment Design](/en/posts/rag-evaluation-experiment-design).

## Phase 1 — Parser comparison

| Parser | MRR | Hit@1 | Hit@5 | File@5 | Chunks | Mode |
|--------|-----|-------|-------|--------|--------|------|
| **pymupdf4llm** | **0.4715** | 38.3% | 58.3% | 86.0% | 1,920 | Markdown (# ##, tables) |
| pymupdf | 0.4663 | 35.7% | **63.3%** | **86.3%** | 1,263 | Plain text |
| pypdf | 0.4472 | 34.3% | 60.7% | 82.7% | 1,224 | Line-based |

### Key finding

**pymupdf4llm wins on MRR** thanks to structure preservation. Markdown conversion adds `#`, `##`, and table syntax, which embeddings pick up as semantic signals. It also produces **56% more chunks** (1,920 vs 1,224) — more units to hit.

**pymupdf has higher Hit@5 (63.3%) but lower MRR (0.4663)** — it gets the right page into top-5 but not at the top rank.

```python
# pymupdf4llm pattern
import pymupdf4llm, pymupdf

doc = pymupdf.open(pdf_path)
pages = [pymupdf4llm.to_markdown(doc, pages=[i]) for i in range(len(doc))]
```

### Choice guide

| Requirement | Pick |
|-------------|------|
| Max accuracy | **pymupdf4llm** |
| Plain text only | pymupdf |
| Legacy compatibility | pypdf |

## Phase 2 — Chunking (the biggest lever) ⭐

**Fixed:** parser=pymupdf4llm  
**Variable:** chunk_size × overlap

| Strategy | chunk_size | overlap | MRR | Hit@1 | Hit@5 | Chunks | Rank |
|----------|-----------|---------|-----|-------|-------|--------|------|
| **small** | 500 | 100 | **0.5315** | **45.0%** | **65.0%** | **3,166** | 🥇 |
| baseline | 1,000 | 200 | 0.4713 | 38.3% | 58.3% | 1,920 | 🥈 |
| medium | 1,500 | 200 | 0.4458 | 36.3% | 55.0% | 1,468 | 🥉 |
| large | 2,000 | 300 | 0.4302 | 34.3% | 53.3% | 1,370 | 4th |

### Smaller chunks, higher MRR

**MRR 0.4302 → 0.5315 (+23.5%)** — the biggest delta across all phases.

```
small (500)     ████████████████████████████████████████████████████████  0.5315
baseline (1000) ████████████████████████████████████████████████          0.4713
medium (1500)   █████████████████████████████████████████████             0.4458
large (2000)    ███████████████████████████████████████████               0.4302
```

### Why small wins

1. **Topical density**: 500-char chunks concentrate a single topic → sharper embedding vectors
2. **Embedding server cap**: llama.cpp caps input at 512 tokens → long chunks get truncated, losing info
3. **Retrieval precision**: smaller chunks allow more diverse positions inside top-k

### Practical pattern

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=100,
    separators=["\n\n", "\n", " ", ""],
    add_start_index=True,
)
chunks = splitter.split_documents(docs)
```

**Caveat**: Korean-specific. English/code/legal may differ — test in your domain between 300 and 1,500.

## Phase 3 — Vector store comparison

**Fixed:** parser=pymupdf4llm, chunking=500/100, embedding=qwen3-embed-8b

| Vector Store | MRR | Hit@5 | Insert | Query latency | Deployment |
|--------------|-----|-------|--------|---------------|------------|
| **FAISS** | 0.5304 | 65.0% | **0.8s** | **0.7ms** | In-memory lib |
| LanceDB | 0.5304 | 65.0% | 6.0s | 6.3ms | Embedded file |
| Qdrant | 0.5304 | 65.0% | 58.6s | 112.8ms | Server |
| Milvus | 0.5304 | 65.0% | 22.4s | 53.7ms | Server |
| Weaviate | 0.5298 | 64.7% | 12.0s | 23.3ms | Server |
| Chroma | 0.5271 | 64.7% | 16.7s | 40.0ms | Server |
| pgvector | 0.5304 | 65.0% | 92.3s | 142.9ms | Postgres ext. |

### Accuracy is effectively identical

**Same vectors → same cosine ranking.** Stores differ only in index structure; ranking differences stay inside 0.6%.

Exception: Chroma (0.5271) lags slightly because the default HNSW `ef=10` misses a few neighbors. Raising to `ef=64` brings it to the same level.

### Latency spans 200x

```
Insert time (3,166 chunks):
  FAISS        ▏ 0.8s
  LanceDB      ███ 6.0s
  Weaviate     █████████ 12.0s
  Chroma       ████████████ 16.7s
  Milvus       ████████████████ 22.4s
  Qdrant       █████████████████████████████████████████████ 58.6s
  pgvector     ██████████████████████████████████████████████████████████████████████ 92.3s

Query latency (single query):
  FAISS        ▏ 0.7ms
  LanceDB      █ 6.3ms
  Weaviate     ████ 23.3ms
  Chroma       █████ 40.0ms
  Milvus       ██████ 53.7ms
  Qdrant       ████████████ 112.8ms
  pgvector     ███████████████ 142.9ms
```

### Why FAISS is fastest

- **In-process library**: no network round-trip
- Optimized HNSW/IVF with direct memory access
- Chroma/Qdrant/Milvus/Weaviate all add HTTP/gRPC hops
- **pgvector ran sequential scan** because both HNSW and IVFFlat cap at 2000 dims (Qwen3-embed-8B is 4096)

### Selection guide

| Requirement | Pick |
|-------------|------|
| Single-node, max speed | **FAISS** |
| Embedded file | LanceDB |
| Ops visibility | Qdrant, Weaviate |
| Existing Postgres | pgvector (dim ≤ 2000) |
| Large-scale distributed | Milvus |

## Phase 1–3 wrap up

### MRR contribution

```
Chunking (500→2000)          +23.5%  ████████████████████████████
Parser (pypdf→pymupdf4llm)   +5.4%   ██████
Vector store (7 options)     +0.6%   ▌
```

### Speed impact

```
Parser (one-time parse)         same (seconds)
Chunking (3166 vs 1370 chunks)  ~2x embedding cost
Vector store (query)            up to 200x (0.7ms vs 143ms)
```

Accuracy: **chunking ≫ parser ≫ vector store**. Speed: **vector store ≫ chunking ≫ parser**.

## Final stack — Korean RAG preprocessing

```python
import pymupdf4llm
from langchain_text_splitters import RecursiveCharacterTextSplitter
import faiss

# 1. Parser: pymupdf4llm
pages = [pymupdf4llm.to_markdown(doc, pages=[i]) for i in range(len(doc))]

# 2. Chunking: 500/100
splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=100)
chunks = splitter.split_documents(docs)

# 3. VectorStore: FAISS
index = faiss.IndexFlatIP(dim)
index.add(normalized_embeddings)
```

This stack hits MRR 0.5304 at Phase 3. Swap in gemma-embed-300m in [Phase 4](/en/posts/rag-embedding-benchmark-results) and you reach **MRR 0.6682 (+26%)**.

## FAQ

### Is smaller always better for chunks?

No. Going below 100 chars fragments context and drops MRR. Sweet spot is usually 300–700 chars for Korean; legal or long-form contracts may prefer 1,000–1,500.

### Why does pymupdf4llm win MRR but lose Hit@5 to pymupdf?

Markdown structure pushes the right chunk to higher ranks (MRR ↑). But 56% more chunks means more near-duplicates inside top-5, occasionally pushing the exact target out — hence a slightly lower Hit@5.

### Why is pgvector the slowest?

Our embeddings are 4096-dim. pgvector's HNSW and IVFFlat cap at 2000 dims, so we ran sequential scan. Switch to `Qwen3-Embedding-0.6B` (1024 dim) and pgvector hits ~10ms.

### If FAISS is fastest, why use Qdrant or Weaviate in production?

FAISS is **in-process, manual persistence, limited update semantics**. Production systems need distribution, replication, backup, observability. Use:
- Scale + replication: Qdrant, Milvus, Weaviate
- Ops dashboard: Qdrant
- Co-locate with Postgres: pgvector

This benchmark measures **RAG pipeline performance with in-process libraries as the baseline.**

### Why do vector stores tie on accuracy?

They all run cosine (or inner product) over the same vectors. Differences come from approximate nearest-neighbor parameters (HNSW `ef`, IVF `nprobe`), which under default settings stay within ~0.1%.

## Next steps

- **Embedding swap effect**: replace with gemma-embed-300m → +26% MRR. See [embedding benchmark](/en/posts/rag-embedding-benchmark-results).
- **Rerankers**: exploit Phase 3's accuracy tie by adding a second-stage reranker.
- **Per-domain chunking**: finance / law / medical may have distinct optimal sizes.

---

## Code & raw data

- **GitHub**: [github.com/BAEM1N/RAG-Evaluation](https://github.com/BAEM1N/RAG-Evaluation)
- **Phase 1 results**: [results/phase1_parser/](https://github.com/BAEM1N/RAG-Evaluation/tree/main/results/phase1_parser)
- **Phase 2 results**: [results/phase2_chunking/](https://github.com/BAEM1N/RAG-Evaluation/tree/main/results/phase2_chunking)
- **Phase 3 results**: [results/phase3_vectorstore/](https://github.com/BAEM1N/RAG-Evaluation/tree/main/results/phase3_vectorstore)
- **Runner**: [scripts/bench_all.py](https://github.com/BAEM1N/RAG-Evaluation/blob/main/scripts/bench_all.py) — single script, all phases
