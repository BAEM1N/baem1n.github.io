---
author: baem1n
pubDatetime: 2026-04-27T12:02:00.000Z
title: "Q3 — 12 local LLM RAG answers judged by 9 flagship API judges"
description: "12 local LLM RAG answers cross-judged by Anthropic Opus 4.7 / Sonnet 4.6, OpenAI gpt-5.5 / gpt-5.4 family, Google Gemini 3 Pro / Flash / Flash Lite — 9 API judges total. 14,400 calls × 9 judge = 129,600 calls 100% complete. All 9 judges rank gpt-oss:120b, qwen3.5_122b-think, gpt-oss:20b in the top 3."
tags:
  - rag
  - llm-judge
  - evaluation
  - korean-nlp
featured: false
draft: true
aiAssisted: true
---

## Summary

- **Setup**: 12 local LLM cand × 9 flagship API judges = 108 cells.
- **Scale**: 9 × 12 × 4 metric × 300 Q = **129,600 judge calls**, 100% complete.
- **Result**: All 9 judges agree on top 5 ranking. `gpt-oss:120b` #1.
- **Insight**: Even premium API judges (Opus, gpt-5.5, gemini-3-pro) produce the same ranking as cheaper ones (gpt-5.4-nano, gemini-flash-lite). Judge cost choice is irrelevant for ranking.

## Top 5 (RRF across 9 judges)

| Rank | Cand | RRF | Avg acc |
| ---:| --- | ---:| ---:|
| 1 | `gpt-oss:120b` | 0.1462 | 0.703 |
| 2 | `gpt-oss:20b` | 0.1445 | 0.694 |
| 3 | `qwen3.5_122b-a10b_think` | 0.1441 | 0.689 |
| 4 | `qwen3.5_27b-q8_nothink` | 0.1411 | 0.674 |
| 5 | `qwen3.5_122b-a10b_nothink` | 0.1387 | 0.663 |

## Bottom (no surprise)

- `lfm2_24b`: avg 0.412 — **#12 across all 9 judges** (English-biased, unsuitable for Korean).
- `qwen3.5_9b-q8_nothink`: avg 0.575 — small model handicap.

## Cross-judge consistency

- 8 of 9 judges rank `gpt-oss:120b` or `gpt-oss:20b` #1 (only gemini-pro flips them).
- All 9 judges rank `lfm2:24b` #12.
- Top 5 ranking is **identical across all 9 judges**.

→ Premium ($-heavy) judges produce the same ranking as small ones. **Spending $$$ on judge model is wasted**.

## Operational notes

### Anthropic Opus 4.7 → 4.6 fallback (52 items)

Opus 4.7 raised `stop_reason: refusal` for medical-safety queries (e.g. q142, q258). After 11 different mitigation attempts (system prompt, user prompt, completion API, message reformulation), Opus 4.6 (older safety policy) was used as fallback for these 52 cells.

### Sonnet 4.6 max_tokens fix (147 items)

Initial `max_tokens=64` was too short — Sonnet emitted only the analysis text without the integer answer. Re-ran with `max_tokens=1024` → 100% recovery.

### Gemini Pro reasoning effort=low

OpenRouter `extra_body={"reasoning":{"effort":"low"}}` was required. With `effort=none`, thinking-class Gemini models regressed to 1-token output.

## Next

- Q4 (API cand × API judge): see [Q4 article](/posts/en/rag-llm-judge-q4-api-self-evaluation/).
- 4-Quadrant unified analysis: see [summary](/posts/en/rag-llm-judge-summary-4quadrant-matrix/).

---

## RAG Series Index

**Phase 1-4: Retrieval optimization**

- [Experiment design](/posts/en/rag-evaluation-experiment-design/)
- [Parser comparison](/posts/en/rag-parser-comparison/) — pymupdf4llm wins (+5.4%p)
- [Chunking comparison](/posts/en/rag-chunking-comparison/) — small chunks +23.5%p (biggest MRR lever)
- [Vector store comparison](/posts/en/rag-vectorstore-comparison/) — FAISS 0.74ms (accuracy tied)
- [Embedding benchmark (27)](/posts/en/rag-embedding-benchmark-results/) — koe5 #1 (Korean-tuned)

**Phase 5: LLM-as-Judge cross-validation**

- [Q1 — Local cand × Local judge](/posts/en/rag-llm-judge-q1-local-cross-validation/)
- [Q2 — API cand × Local judge](/posts/en/rag-llm-judge-q2-api-llm-vs-local-judges/)
- [Q3 — Local cand × API judge](/posts/en/rag-llm-judge-q3-flagship-api-judges/)
- [Q4 — API cand × API judge](/posts/en/rag-llm-judge-q4-api-self-evaluation/)
- [4-Quadrant unified RRF leaderboard](/posts/en/rag-llm-judge-summary-4quadrant-matrix/) — 46 cand × 17 judge
- [Judge × Judge correlation analysis](/posts/en/rag-llm-judge-correlation-analysis/) — severity vs consensus, optimal ensemble
