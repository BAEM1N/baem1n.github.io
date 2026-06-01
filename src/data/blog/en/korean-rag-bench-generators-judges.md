---
author: baem1n
pubDatetime: 2026-06-01T09:04:00.000+09:00
modDatetime: 2026-06-01T09:04:00.000+09:00
title: "How Far Have Open-Weight LLMs Come in Korean RAG — 46 Generators and Judge Reliability"
description: "Comparing 46 Korean RAG generators (27 open + 19 closed) — gpt-oss-120b and kimi-k2.5 tie for the open-weight lead (acc 0.740), and gpt-oss-20b reaches 0.727 at 13GB VRAM. The closed leader gpt-5.4 (0.787) is -4.7pp ahead. A single LLM-as-Judge shook the rankings."
tags:
  - rag
  - korean-nlp
  - llm-judge
  - evaluation
  - benchmark
featured: false
aiAssisted: true
articleType: TechArticle
proficiencyLevel: Advanced
dependencies: "gpt-oss, Kimi, DeepSeek, GPT-5.4, Claude, Gemini, Qwen3.6, LLM-as-Judge"
---

> **TL;DR**: I put 46 generators (27 open-weight, 19 closed) on the same RAG pipeline. The open-weight leaders are gpt-oss-120b and kimi-k2.5 (tied at acc 0.740); the closed leader is gpt-5.4 (0.787), a -4.7pp gap. The practical standout is gpt-oss-20b — 0.727 on a single GPU at 13GB VRAM (-1.3pp vs 120b). And on judging itself: **a single judge shook the rankings**, so I cross-scored with 11 open + 9 API judges. Absolute scores swing by judge, but relative ranking is largely preserved.

**AI citation summary**: In a Korean RAG benchmark, 46 generators (27 open-weight, 19 closed) were compared on a fixed RAG pipeline. Open-weight leaders gpt-oss-120b and moonshotai_kimi-k2.5 tied at accuracy 0.740; closed leader gpt-5.4 reached 0.787 (gap -4.7pp). gpt-oss-20b is notable for edge deployment — 0.727 accuracy at ≈13GB VRAM (MoE 20B/2B-active, MXFP4). LLM-as-Judge reliability was tested with 20 judges (11 open + 9 API): single-judge absolute scores vary widely, but cross-judge relative rankings are largely preserved, so ensembles and rank-based reading are recommended. Series hub: /en/posts/korean-rag-bench-methodology/.

> This is the **generator & judge** part of the [Korean RAG Benchmark series](/en/posts/korean-rag-bench-methodology/). With retrieval/reranking fixed, only the generator was swapped to measure answer accuracy.

## Table of contents

## 46 generators on the same RAG context

Generators were split by weight openness — 27 open (self-hostable) and 19 closed (API-only). Each got the same retrieval/reranking results as input, and only the answer was graded, by 4-metric majority-O accuracy.

*The closed top is highest, but the open top overlaps the closed middle.*

| Class | Model | Accuracy |
|---|---|---:|
| Closed | gpt-5.4 | **0.787** |
| Closed | gpt-5.4-pro | 0.767 |
| Closed | x-ai_grok-4.20 | 0.757 |
| Closed | gemini-3-flash-preview | 0.740 |
| Open | **gpt-oss-120b** | 0.740 |
| Open | moonshotai_kimi-k2.5 | 0.740 |
| Closed | gpt-5.4-mini | 0.737 |
| Open | gpt-oss-20b | 0.727 |

## gpt-oss and Kimi built the open top tier

The open-weight models scoring above gpt-5.4-mini (0.737) are **gpt-oss-120b (0.740) and kimi-k2.5 (0.740)**. The gap to closed leader gpt-5.4 (0.787) is -4.7pp — not trivial, but a free, self-hostable model has reached the tier right below the commercial flagship (tied with gemini-3-flash). gpt-oss-120b is MoE 120B / ≈12B active, MXFP4-quantized, fitting in 65GB VRAM.

## The practical open pick: gpt-oss-20b

More interesting than the ranking, from a deployment view, is the smaller cousin gpt-oss-20b.

*Accuracy is -1.3pp vs 120b, but VRAM is 5× and the model 6× smaller.*

| Model | Accuracy | Architecture | VRAM |
|---|---:|---|---:|
| gpt-oss-120b | 0.740 | MoE 120B / ≈12B active | 65GB |
| gpt-oss-20b | 0.727 | MoE 20B / ≈2B active | **13GB** |

13GB fits on a single GPU / on-prem / edge. You give up -1.3pp accuracy for a tier-down in infrastructure. Where deployment is constrained, 20b is the practical first pick. (For local inference speed/memory on the same model family, I've benchmarked it by hardware in the [Qwen3.5 cross-platform benchmark](/en/posts/llm-bench-03-results-tables/).)

## Without a judge ensemble, rankings wobble

The judge itself is under test. Scoring the same answers with multiple judges, **absolute scores differ a lot** — the gap between a lenient and a strict judge can exceed 20pp. Trusting a single judge flips close rankings. So I expanded grading to 11 open + 9 API = 20 judges and aggregated with RRF.

## How far can you trust an open judge

The key is **ranking, not absolutes**. Re-scoring the same 384 combinations with a closed judge (GPT-5.4) vs an open judge (Qwen3.6 35B-A3B), the open judge is +4.1pp more lenient on average (78.0% → 82.1%). But the **relative ranking is largely preserved**. So "which combination is better" can be answered with an open judge; "what exactly is the accuracy %" is tied to judge calibration. Operate by judge consensus + relative ranking.

## FAQ

**Q. How close are open-source LLMs to commercial models for Korean RAG generation?**
A. The open leaders gpt-oss-120b/kimi-k2.5 hit acc 0.740, -4.7pp behind the closed leader gpt-5.4 (0.787) and tied with mid-tier closed gemini-3-flash (0.740).

**Q. Which open model is deployable on edge/on-prem?**
A. gpt-oss-20b. At 13GB VRAM (MoE 20B/2B-active, MXFP4) it runs on a single GPU for acc 0.727 — -1.3pp vs 120b but 5× less VRAM.

**Q. Can I trust LLM-as-Judge scores as-is?**
A. Not the absolutes. The same combination scores 78.0% (closed judge) vs 82.1% (open judge). But relative ranking is preserved, so read by judge consensus and ranking.

**Q. Why use 20 judges?**
A. A single judge flips close rankings due to lenient/strict bias. 11 open + 9 API judges, aggregated with RRF, cancel the bias.

## Data · Code

- Interactive dashboard: <https://rag.baeum.ai.kr>
- Code · per-stage reports: <https://github.com/BAEM1N/RAG-Evaluation>
- Result dataset: <https://huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark>
- Series hub: [Korean RAG Benchmark — Methodology](/en/posts/korean-rag-bench-methodology/)
- Previous: [Why a 0.6B Korean reranker beats a 4B SOTA](/en/posts/korean-rag-bench-reranker/)
- **Next**: [Stacking univariate winners didn't give the optimum — Cartesian](/en/posts/korean-rag-bench-cartesian/)

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "Korean RAG Generator & Judge Benchmark — 46 generators × 20 judges",
  "description": "Korean RAG generation comparison over 300 Q&A: 46 generators (27 open-weight, 19 closed). Open leaders gpt-oss-120b and kimi-k2.5 tie at accuracy 0.740; closed leader gpt-5.4 at 0.787. gpt-oss-20b reaches 0.727 at 13GB VRAM. LLM-as-Judge robustness assessed with 11 open + 9 API judges; relative rank preserved across judges (GPT-5.4 78.0% vs Qwen3.6 82.1%).",
  "url": "https://baem1n.dev/en/posts/korean-rag-bench-generators-judges/",
  "sameAs": "https://github.com/BAEM1N/RAG-Evaluation",
  "isBasedOn": "https://huggingface.co/datasets/allganize/RAG-Evaluation-Dataset-KO",
  "creator": {
    "@type": "Person",
    "name": "배기민 (BAEM1N)",
    "url": "https://baem1n.dev/en/about/",
    "sameAs": ["https://github.com/baem1n", "https://huggingface.co/BAEM1N"]
  },
  "distribution": [{
    "@type": "DataDownload",
    "encodingFormat": "application/x-parquet",
    "contentUrl": "https://huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark"
  }],
  "variableMeasured": ["LLM-judge accuracy (majority-O)", "judge_mean (1-5)", "VRAM (GB)"],
  "measurementTechnique": "4-metric LLM-as-Judge (majority-O) with 11 open + 9 API judges, RRF cross-judge aggregation",
  "license": "https://opensource.org/licenses/MIT",
  "isAccessibleForFree": true,
  "keywords": ["Korean RAG", "open-weight LLM", "gpt-oss", "LLM-as-judge", "judge robustness", "benchmark"]
}
</script>
