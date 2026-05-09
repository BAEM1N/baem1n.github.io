---
author: baem1n
pubDatetime: 2026-04-27T12:03:00.000Z
title: "Q4 — 34 API LLM RAG answers cross-judged by 8 flagship API judges (self-evaluation matrix)"
description: "Anthropic 6 + OpenAI 4 + Google 5 + OpenRouter 19 = 34 API LLM RAG answers cross-validated by 8 flagship API judges. 40,792 calls × 8 judge = 326,336 calls 100% complete. gpt-5.4 and gpt-5.4-pro tie #1 (RRF 0.1296). Self-judge bias is negligible (+1-2%p)."
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

- **Setup**: 34 API LLM cand × 8 flagship API judges = 272 cells.
- **Scale**: 8 × 34 × 4 × 300 = **326,336 judge calls**, 100% complete.
- **Result**: `gpt-5.4` (RRF 0.1296) and `gpt-5.4-pro` (0.1296) tie at #1. `x-ai/grok-4.20` #3 (0.1266). Self-judge bias is small (+1-2%p).

## Top 10 (RRF across 8 judges)

| Rank | Cand | RRF | Avg acc |
| ---:| --- | ---:| ---:|
| 1 | gpt-5.4 | 0.1296 | 0.760 |
| 2 | gpt-5.4-pro | 0.1296 | 0.759 |
| 3 | x-ai/grok-4.20 | 0.1266 | 0.753 |
| 4 | gpt-5.4-mini | 0.1227 | 0.744 |
| 5 | moonshotai/kimi-k2.5 | 0.1222 | 0.735 |
| 6 | claude-sonnet-4-6 | 0.1184 | 0.726 |
| 7 | moonshotai/kimi-k2.6 | 0.1184 | 0.729 |
| 8 | gemini-3-flash-preview | 0.1171 | 0.726 |
| 9 | claude-opus-4-7 | 0.1159 | 0.722 |
| 10 | claude-sonnet-4-6-thinking | 0.1134 | 0.718 |

## Bottom 5

- z-ai/glm-4.7-flash: 0.638
- mistralai/mistral-small-2603: 0.665
- claude-haiku-4-5: 0.669
- nvidia/nemotron-3-nano-30b-a3b: 0.617
- upstage/solar-pro-3: 0.614

→ Models <30B in Korean RAG hit accuracy ceiling. `claude-haiku-4-5` is the weakest of the 4.5 family — Haiku is not RAG-strong.

## Self-judge bias (small)

| Cand family | Self-family judge avg | Other-family avg | Δ |
| --- | ---:| ---:| ---:|
| Anthropic (Sonnet/Opus cand × Anthropic judge) | 0.726 | 0.715 | +1.1%p |
| OpenAI (gpt-5.4 family cand × OpenAI judge) | 0.736 | 0.728 | +0.8%p |
| Google (Gemini cand × Gemini judge) | 0.715 | 0.713 | +0.2%p |

→ Within 1-2%p — RRF ranking effectively unchanged. (Note: cell-level Claude bias can be higher; matrix-level is small.)

## Reasoning / thinking has negligible effect

| Cand pair | non-thinking | thinking | Δ |
| --- | ---:| ---:| ---:|
| `claude-sonnet-4-6` | 0.726 | 0.717 | -0.9%p |
| `claude-opus-4-7` | 0.721 | 0.716 | -0.5%p |
| `gemini-3.1-pro-preview` | 0.707 | 0.709 | +0.2%p |

→ For RAG answer extraction, faithful retrieval matters more than long reasoning. **thinking mode adds cost without benefit**.

## Cross-judge consensus

Top 5 RRF scores spread within 0.1222–0.1296 (5%p) → judge selection has minor effect; **candidate quality dominates ranking**.

## Operational notes

### Sonnet 4.6 max_tokens fix (343 items)

Same pattern as Q3: `max_tokens=64` truncated the integer answer. Re-ran with `max_tokens=1024` → 100% recovered.

### Anthropic Opus 4.7 → 4.6 fallback (~128 items)

Same medical-safety refusal pattern as Q3. Opus 4.6 was used as fallback.

### gpt-5.4-pro q181 / q223 regen

Cand file had only 298/300 entries due to early API limit. Re-generated via Responses API (`reasoning effort=medium`) → 8 judges × 4 metric = 64 calls.

## Next

- 4-quadrant unified RRF leaderboard: see [summary](/posts/en/rag-llm-judge-summary-4quadrant-matrix/).
- Judge × Judge correlation: see [analysis](/posts/en/rag-llm-judge-correlation-analysis/).

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
