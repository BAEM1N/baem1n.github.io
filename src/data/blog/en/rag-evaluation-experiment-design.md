---
author: baem1n
pubDatetime: 2026-04-16T00:00:00.000Z
title: "Korean RAG Benchmark — Experiment Design for 300 Q&A × 21 Embeddings × 30 LLMs"
description: "Experiment plan for a component-wise Korean RAG benchmark (parser, chunking, vector store, embedding, LLM) on the allganize RAG-Evaluation-Dataset-KO."
tags:
  - rag
  - llm
  - langchain
  - benchmark
  - korean-nlp
featured: true
aiAssisted: true
---

> **TL;DR**: We decompose a Korean RAG pipeline into five layers (parser → chunking → vector store → embedding → LLM) and run one-variable experiments for each. 21 embeddings, 7 vector stores, and ~30 LLMs (local + OpenRouter + Friendli.ai) are cross-evaluated. The top embedding is **google/gemma-embed-300m (MRR 0.6682)**; to cut Qwen3.5 generation cost by 95% you must pass `chat_template_kwargs: {enable_thinking: false}` — system prompts alone don't work.

## Table of contents

## Why yet another RAG benchmark

Existing Korean RAG benchmarks are narrow in scope.

| Prior work | Data | Parser | Chunking | Embeddings | VectorStore | LLM |
|------------|------|--------|----------|------------|-------------|-----|
| allganize RAG-Evaluation-Dataset-KO | 300 Q&A | PyPDF (fixed) | 1000/200 (fixed) | OpenAI ada-002 only | Chroma | gpt-4-turbo |
| AutoRAG-example | n/a | n/a | n/a | **16** (mixed APIs) | none | none |
| ssisOneTeam | 106 Q&A | n/a | n/a | **24** (mixed APIs) | none | none |
| **This project** | 300 Q&A | **3** | **4** | **21 local + 5 API** | **7** | **~30 (local + OpenRouter + Friendli.ai)** |

Most prior runs vary a single component, use small data, or rely on commercial APIs. This project isolates each component as the independent variable and holds everything else fixed — that's the only way to quantify per-component contribution.

## Dataset

We use the [allganize/RAG-Evaluation-Dataset-KO](https://huggingface.co/datasets/allganize/RAG-Evaluation-Dataset-KO) with 300 Q&A across five domains (finance, public, medical, law, commerce), 60 questions each. Ground-truth PDF (58 files) and page numbers are provided.

### Data composition

| Item | Count |
|------|-------|
| Questions | 300 |
| PDFs | 58 |
| Domains | 5 (60 Q&A each) |
| Context type | paragraph 148, image 57, table 50, text 45 |

## Phased experiment structure

Each phase's winner is frozen for subsequent phases. We vary exactly one component at a time to isolate causality.

### Phase 1 — Parser (3 options)

**Fixed:** chunking=1000/200, embedding=qwen3-embed-8b, vector store=pgvector  
**Variable:** PyPDF, pymupdf4llm, pymupdf

| Parser | MRR | Hit@5 | Chunks |
|--------|-----|-------|--------|
| **pymupdf4llm** (winner) | 0.4715 | 58.3% | 1,920 |
| pymupdf | 0.4663 | 63.3% | 1,263 |
| pypdf | 0.4472 | 60.7% | 1,224 |

Markdown-based pymupdf4llm wins on MRR. Locked in for subsequent phases.

### Phase 2 — Chunking (4 options)

**Variable:** chunk_size × overlap

| Strategy | chunk_size | overlap | MRR | Chunks |
|----------|-----------|---------|-----|--------|
| **small** (winner) | 500 | 100 | **0.5315** | 3,166 |
| baseline | 1,000 | 200 | 0.4713 | 1,920 |
| medium | 1,500 | 200 | 0.4458 | 1,468 |
| large | 2,000 | 300 | 0.4302 | 1,370 |

Smaller chunks dominate. They also fit the llama.cpp embedding server's 512-token limit, which matters a lot in practice.

### Phase 3 — Vector store (7 options)

**Variable:** Vector backend

| Store | MRR | Insert | Query latency |
|-------|-----|--------|--------------|
| **FAISS** | 0.5304 | **0.8s** | **0.7ms** |
| LanceDB | 0.5304 | 6.0s | 6.3ms |
| Qdrant | 0.5304 | 58.6s | 112.8ms |
| Milvus | 0.5304 | 22.4s | 53.7ms |
| Weaviate | 0.5298 | 12.0s | 23.3ms |
| Chroma | 0.5271 | 16.7s | 40.0ms |
| pgvector | 0.5304 | 92.3s | 142.9ms |

**Accuracy is effectively identical across all seven stores (MRR 0.527–0.530)**. Same vectors → same results. The differentiator is pure speed; FAISS wins at 0.8s insert / 0.7ms query.

### Phase 4 — Embedding (21 options)

Top: **google/gemma-embed-300m (MRR 0.6682)** — a 314MB model beating 7–8B dense models. Full results in the [embedding benchmark results post](/en/posts/rag-embedding-benchmark-results).

### Phase 5 — LLM generation (~30 options)

**Variable:** LLM  
**Fixed:** parser=pymupdf4llm, chunking=500/100, embedding=gemma-embed-300m, vector store=FAISS

| Category | Models | Hosting |
|----------|--------|---------|
| Local (AI-395) | 4 (qwen3.5-27b/35b-a3b × think/nothink) | llama.cpp |
| Local (DGX Spark) | 15+ (qwen family, EXAONE, gpt-oss, gemma4…) | Ollama |
| OpenRouter | 23 (GPT-5.4, Claude 4.6, Gemini 3.1, Grok 4.20…) | API |
| Friendli.ai | 5 (K-EXAONE 236B, Qwen3-235B…) | API |

- **Experiment A**: 21 embeddings × 4 local LLMs → measure embedding impact
- **Experiment B**: gemma-embed-300m fixed × ~30 LLMs → measure LLM impact

## Infrastructure

| Server | Role | Spec |
|--------|------|------|
| AI-395 | Embedding + LLM (llama.cpp gateway) | MI100 96GB VRAM |
| DGX Spark | LLM (Ollama) | GB10 128GB unified, 3.7TB SSD |
| T7910 | 7 vector stores in Docker | Dual Xeon 72T, 128GB RAM |
| Mac mini | Experiment orchestration | M2 16GB |

## Three critical pitfalls

### 1. llama.cpp embedding server's 512-token limit

Anything longer silently returns an empty response — success rate collapses to 75%. Truncate inputs to ~500 chars (about 350 tokens).

```python
def get_embeddings_batch(texts, max_chars=500):
    truncated = [t[:max_chars] for t in texts]
    ...
```

### 2. Turning off Qwen3.5 thinking mode the right way

Qwen3.5 still runs thinking when you only put `/no_think` in the system prompt — the tokens just move to `reasoning_content`, wasting ~2,500 output tokens per request.

```python
# Wrong — system prompt (doesn't actually disable thinking)
messages = [{"role": "system", "content": "/no_think"}, ...]

# Right — chat_template_kwargs
req = {
    "model": "qwen3.5-27b",
    "messages": [...],
    "chat_template_kwargs": {"enable_thinking": False},
}
```

With real nothink, output drops from ~2,500 to ~90 tokens — a 27x speedup.

### 3. pgvector's 2000-dim HNSW limit

Qwen3-Embed-8B is 4096-dim. pgvector's HNSW and IVFFlat are both capped at 2000 dims, forcing sequential scan for this model.

```sql
-- Only index when dim ≤ 2000
CREATE INDEX ON bench_chunks USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 200);
```

## Parallelism

We set llama.cpp to `-np 8` and Ollama to `OLLAMA_NUM_PARALLEL=8` to saturate the GPUs.

```python
# LangChain batch via OpenRouter
llm = ChatOpenRouter(model="openai/gpt-5.4-mini", max_tokens=4096)
results = llm.batch(prompts, config={"max_concurrency": 20})
```

Each 300-question combo takes 20–50 min on average. The full matrix (52 LLMs × 300) finishes in 3–4 days when distributed across AI-395 and DGX Spark.

## FAQ

### Why cascade phases instead of full cross?

A full cross (3×4×7×21×30 ≈ 5,292 combos) is infeasible in time and cost. Freezing the winner of each phase drops the total to a linear ~65 experiments while still answering "how much does this component matter?".

### Why did 300M beat 7B in Phase 4?

For Korean RAG, training objective and data matter more than raw size. gemma-embed-300m (Apache 2.0, Google) is trained specifically for retrieval. qwen3-embed-8b is a general-purpose embedder. The 512-token limit also neutralizes the advantage of long-context models.

### Why is FAISS the fastest vector store?

FAISS is an in-process library — zero network round-trip. Chroma, Qdrant, Milvus, Weaviate all add HTTP/gRPC latency. Given identical retrieval accuracy, FAISS is the clear winner for an end-to-end RAG pipeline.

### Why hybrid local + API LLMs?

- Local (AI-395 + DGX Spark): zero-cost, lets us quantify Q4_K_M quantization loss
- OpenRouter: commercial flagships (GPT-5.4, Claude Opus 4.6, etc.)
- Friendli.ai: Korean K-EXAONE 236B MoE — exclusive, not on OpenRouter

This combination is the only way to compare "local-quantized" vs "commercial full-precision" fairly.

## Next steps

1. Embedding deep dive → [Embedding benchmark results](/en/posts/rag-embedding-benchmark-results)
2. Parser/Chunking/VectorStore comparison → [Why preprocessing matters more than embeddings](/en/posts/rag-preprocessing-comparison)
3. Experiment B LLM comparison (in progress)
4. RAGAS-based LLM-as-judge evaluation
5. Per-domain optimal configuration

---

## Code & raw data

- **GitHub**: [github.com/BAEM1N/RAG-Evaluation](https://github.com/BAEM1N/RAG-Evaluation)
- **Experiment design doc**: [docs/experiment-design.md](https://github.com/BAEM1N/RAG-Evaluation/blob/main/docs/experiment-design.md)
- **Model inventory**: [docs/model-inventory-full.md](https://github.com/BAEM1N/RAG-Evaluation/blob/main/docs/model-inventory-full.md)
- **Result JSON**: `results/phase1~4_*/` — all raw data per phase
- **Analysis CSV**: `results/retrieval_analysis/` — heatmaps, failure modes, consensus

Every benchmark is fully reproducible — single-command Phase reruns.
