---
author: baem1n
pubDatetime: 2026-05-08T03:00:00.000Z
title: "Judge × Judge Correlation — Korean RAG 18 Judges Agreement / Conflict / Outlier Analysis"
description: "Pairwise Pearson correlation across 18 LLM judges from Q1~Q4 cross-judge matrix. gpt-5.4-mini ↔ gemini-3.1-flash-lite-OR r=0.98 (redundant). gemma4_31b ↔ nemotron-120b r=−0.71 (opposite). solar-100b has avg corr -0.137 (outlier). 4 optimal ensemble scenarios derived."
tags:
  - rag
  - llm-judge
  - evaluation
  - korean-nlp
  - statistics
featured: false
draft: false
aiAssisted: true
---

## Summary

- **Goal**: Quantify how much 18 judges agree/disagree on candidate accuracy. Inform ensemble selection.
- **Method**: Pearson correlation between judges' cand-acc vectors (n ≥ 10 valid).
- **Key findings**:
  1. Small API judges (`gpt-5.4-mini`, `gemini-3.1-flash-lite-OR`, `gpt-5.4`) **r ≈ 0.98** — effectively identical scoring.
  2. OSS judges `gemma4_31b` ↔ `nemotron-120b` **r = −0.71** — opposite ranking.
  3. `solar-open-100b` avg corr = **−0.137** (negative) — full outlier.
  4. Best consensus: `gpt-5.4`, `gemini-3-flash-preview`, `claude-opus-4-7` all avg_r ≈ 0.70.

## Controlled variables

- Dataset: allganize `RAG-Evaluation-Dataset-KO` 300 Q&A × 58 PDF
- Metric: 4-metric majority(≥2/4) → O/X → accuracy
- Cand: 12 local + 34 API = **46 cand**
- Judge: 8 OSS (Q1+Q2) + 9 API (Q3+Q4) + 1 OSS distill (qwen3.5-27b-claude-distill) = **18 judge**

## Judge map — Severity vs Consensus

Each judge plotted on 2D plane. **X-axis**: mean accuracy (severity, lenient ↔ strict). **Y-axis**: avg correlation with other 17 judges (consensus).

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 520" style="background:#fafafa;font-family:system-ui,-apple-system,sans-serif;width:100%;height:auto;max-width:720px">
<rect x="80" y="30" width="610" height="430" fill="white" stroke="#ddd"/>
<text x="232.5" y="48" text-anchor="middle" fill="#1976d2" font-size="11" font-weight="600">⬆ strict + consensus↑ (ideal)</text>
<text x="537.5" y="48" text-anchor="middle" fill="#388e3c" font-size="11" font-weight="600">⬆ lenient + consensus↑ (good)</text>
<text x="232.5" y="452" text-anchor="middle" fill="#d32f2f" font-size="11" font-weight="600">⬇ strict + consensus↓ (solo risk)</text>
<text x="537.5" y="452" text-anchor="middle" fill="#d32f2f" font-size="11" font-weight="600">⬇ lenient + consensus↓ (outlier)</text>
<line x1="385" y1="30" x2="385" y2="460" stroke="#bbb" stroke-dasharray="4,3"/>
<line x1="80" y1="180.5" x2="690" y2="180.5" stroke="#bbb" stroke-dasharray="4,3"/>
<line x1="76" y1="438.5" x2="80" y2="438.5" stroke="#888"/>
<text x="72" y="442.5" text-anchor="end" font-size="10" fill="#666">-0.2</text>
<line x1="76" y1="352.5" x2="80" y2="352.5" stroke="#888"/>
<text x="72" y="356.5" text-anchor="end" font-size="10" fill="#666">+0.0</text>
<line x1="76" y1="266.5" x2="80" y2="266.5" stroke="#888"/>
<text x="72" y="270.5" text-anchor="end" font-size="10" fill="#666">+0.2</text>
<line x1="76" y1="180.5" x2="80" y2="180.5" stroke="#888"/>
<text x="72" y="184.5" text-anchor="end" font-size="10" fill="#666">+0.4</text>
<line x1="76" y1="94.5" x2="80" y2="94.5" stroke="#888"/>
<text x="72" y="98.5" text-anchor="end" font-size="10" fill="#666">+0.6</text>
<line x1="202" y1="460" x2="202" y2="464" stroke="#888"/>
<text x="202" y="478" text-anchor="middle" font-size="10" fill="#666">0.5</text>
<line x1="324" y1="460" x2="324" y2="464" stroke="#888"/>
<text x="324" y="478" text-anchor="middle" font-size="10" fill="#666">0.6</text>
<line x1="446" y1="460" x2="446" y2="464" stroke="#888"/>
<text x="446" y="478" text-anchor="middle" font-size="10" fill="#666">0.7</text>
<line x1="568" y1="460" x2="568" y2="464" stroke="#888"/>
<text x="568" y="478" text-anchor="middle" font-size="10" fill="#666">0.8</text>
<line x1="690" y1="460" x2="690" y2="464" stroke="#888"/>
<text x="690" y="478" text-anchor="middle" font-size="10" fill="#666">0.9</text>
<text x="360" y="505" text-anchor="middle" font-size="13" fill="#333" font-weight="600">Severity (mean accuracy across cands) → lenient</text>
<text x="20" y="260" text-anchor="middle" font-size="13" fill="#333" font-weight="600" transform="rotate(-90,20,260)">avg correlation with other judges → consensus</text>
<circle cx="653" cy="417" r="6" fill="#f57c00" opacity="0.85" stroke="white" stroke-width="1.5"/>
<text x="595" y="421" font-size="11" fill="#f57c00">solar-100b</text>
<circle cx="553" cy="176" r="6" fill="#f57c00" opacity="0.85" stroke="white" stroke-width="1.5"/>
<text x="561" y="180" font-size="11" fill="#f57c00">qwen3.6-35b</text>
<circle cx="484" cy="258" r="6" fill="#f57c00" opacity="0.85" stroke="white" stroke-width="1.5"/>
<text x="492" y="262" font-size="11" fill="#f57c00">nemotron-120b</text>
<circle cx="447" cy="271" r="6" fill="#f57c00" opacity="0.85" stroke="white" stroke-width="1.5"/>
<text x="455" y="275" font-size="11" fill="#f57c00">supergemma4</text>
<circle cx="446" cy="73" r="6" fill="#1976d2" opacity="0.85" stroke="white" stroke-width="1.5"/>
<text x="454" y="65" font-size="11" fill="#1976d2">gemini-3-flash</text>
<circle cx="426" cy="86" r="6" fill="#f57c00" opacity="0.85" stroke="white" stroke-width="1.5"/>
<text x="434" y="100" font-size="11" fill="#f57c00">qwen3.5_35b</text>
<circle cx="421" cy="90" r="6" fill="#f57c00" opacity="0.85" stroke="white" stroke-width="1.5"/>
<text x="332" y="94" font-size="11" fill="#f57c00">qwen3.5_122b</text>
<circle cx="419" cy="77" r="6" fill="#1976d2" opacity="0.85" stroke="white" stroke-width="1.5"/>
<text x="427" y="81" font-size="11" fill="#1976d2">claude-opus-4-7</text>
<circle cx="418" cy="78" r="6" fill="#1976d2" opacity="0.85" stroke="white" stroke-width="1.5"/>
<text x="365" y="69" font-size="11" fill="#1976d2">gpt-5.5</text>
<circle cx="416" cy="78" r="6" fill="#1976d2" opacity="0.85" stroke="white" stroke-width="1.5"/>
<text x="362" y="93" font-size="11" fill="#1976d2">gpt-5.4</text>
<circle cx="380" cy="82" r="6" fill="#1976d2" opacity="0.85" stroke="white" stroke-width="1.5"/>
<text x="298" y="86" font-size="11" fill="#1976d2">claude-sonnet-4-6</text>
<circle cx="347" cy="245" r="6" fill="#f57c00" opacity="0.85" stroke="white" stroke-width="1.5"/>
<text x="225" y="249" font-size="11" fill="#f57c00">qwen3.5-27b-distill</text>
<circle cx="347" cy="86" r="6" fill="#1976d2" opacity="0.85" stroke="white" stroke-width="1.5"/>
<text x="220" y="78" font-size="11" fill="#1976d2">gemini-3.1-flash-lite</text>
<circle cx="345" cy="86" r="6" fill="#1976d2" opacity="0.85" stroke="white" stroke-width="1.5"/>
<text x="353" y="100" font-size="11" fill="#1976d2">gpt-5.4-mini</text>
<circle cx="342" cy="90" r="6" fill="#1976d2" opacity="0.85" stroke="white" stroke-width="1.5"/>
<text x="350" y="112" font-size="11" fill="#1976d2">gpt-5.4-nano</text>
<circle cx="331" cy="361" r="6" fill="#f57c00" opacity="0.85" stroke="white" stroke-width="1.5"/>
<text x="339" y="365" font-size="11" fill="#f57c00">gemma4_31b</text>
<circle cx="256" cy="94" r="6" fill="#1976d2" opacity="0.85" stroke="white" stroke-width="1.5"/>
<text x="264" y="98" font-size="11" fill="#1976d2">gemini-3.1-pro</text>
<circle cx="180" cy="305" r="6" fill="#f57c00" opacity="0.85" stroke="white" stroke-width="1.5"/>
<text x="188" y="309" font-size="11" fill="#f57c00">qwen3-next-80b</text>
<g transform="translate(540,40)">
<rect x="0" y="0" width="140" height="50" fill="white" stroke="#ddd"/>
<circle cx="14" cy="18" r="5" fill="#1976d2"/><text x="26" y="22" font-size="11" fill="#333">API judge</text>
<circle cx="14" cy="36" r="5" fill="#f57c00"/><text x="26" y="40" font-size="11" fill="#333">OSS judge</text>
</g>
</svg>

**Quadrant interpretation**:

- **Top-right (good)**: gemini-3-flash, claude-opus-4-7, gpt-5.4, gpt-5.5, qwen3.5_35b/122b, qwen3.6-35b — frontier judge cluster
- **Top-left (ideal critic)**: gemini-3.1-pro-preview, gpt-5.4-mini/nano, gemini-3.1-flash-lite — strict + consensus
- **Bottom-right (outlier)**: solar-100b — too lenient, opposite ranking
- **Bottom-left (solo risk)**: gemma4_31b, qwen3-next-80b, qwen3.5-27b-distill — solo use distorts ranking

**Eliminate from solo use**: solar-100b, gemma4_31b, qwen3-next-80b.

## 1. Top 5 most-similar judge pairs (redundant)

| Pair | r | n | Note |
| --- | ---:| ---:| --- |
| `gpt-5.4-mini` ↔ `gemini-3.1-flash-lite-OR` | **+0.980** | 46 | small API near-identical |
| `gpt-5.4` ↔ `gemini-3-flash-preview` | **+0.979** | 46 | mid API near-identical |
| `gpt-5.5` ↔ `gemini-3-flash-preview` | +0.977 | 46 | gpt-5.5 ≈ gemini-flash |
| `gpt-5.4` ↔ `gpt-5.5` | +0.971 | 46 | same family, expected |
| `gpt-5.4` ↔ `gemini-3.1-flash-lite-OR` | +0.971 | 46 | cross-family identical |

→ For cost-savings ensembles, none of these pairs add information — pick one judge.

## 2. Top 5 most-different judge pairs (conflict)

| Pair | r | n | Note |
| --- | ---:| ---:| --- |
| `gemma4_31b` ↔ `nemotron-120b` | **−0.712** | 40 | gemma4 calls good what nemotron calls bad |
| `gemma4_31b` ↔ `qwen3.6-35b-a3b` | **−0.647** | 41 | opposite ranking |
| `qwen3.5-27b-distill` ↔ `solar-100b` | −0.374 | 22 | severity gap effect |
| `gemma4_31b` ↔ `solar-100b` | −0.324 | 22 | severity gap |
| `nemotron-120b` ↔ `qwen3.5-27b-distill` | −0.349 | 45 | nemotron lenient vs distill strict |

→ OSS-only ensembles have high variance. Use **severity-corrected accuracy** or **rank-based RRF** instead of simple averaging.

## 3. Judge isolation — outliers

Each judge's avg correlation with the other 17.

| Judge | avg corr | Note |
| --- | ---:| --- |
| `solar-open-100b` | **−0.137** | negative avg — opposite ranking from peers |
| `gemma4_31b` | +0.022 | near random |
| `qwen3-next-80b` | +0.113 | strictest, weak agreement |
| `qwen3.5-27b-distill` | +0.300 | conflicts with some OSS judges |
| `nemotron-120b` | +0.447 | partially outlying |

→ Solo use of `solar-100b` or `gemma4_31b` is dangerous — ranking can completely flip.

## 4. Best consensus judges

| Judge | avg corr | Recommendation |
| --- | ---:| --- |
| `gpt-5.4` | **+0.702** | most reliable — closest to global consensus |
| `gemini-3-flash-preview` | +0.701 | cost-efficient + stable |
| `claude-opus-4-7` | +0.699 | academic baseline |
| `gpt-5.5` | +0.698 | new model, stable |
| `gemini-3.1-flash-lite-OR` | +0.696 | OR cost-savings |

→ **Single judge?** Use `gpt-5.4` or `claude-opus-4-7` (avg_r ≈ 0.70 → predictive of others).

## 5. Optimal ensemble — 4 scenarios

Goal: 3 judges with ① low cost ② high consensus ③ diversity.

| Ensemble | Judges | avg pair corr | Q4 full-eval cost | Trust |
| --- | --- | ---:| ---:| :-:|
| **All API premium** | claude-opus-4-7 + gpt-5.4 + gemini-3.1-pro | 0.71 | $400 | A |
| **Cost-optimized API** | gpt-5.4 + gemini-3-flash + gpt-5.4-mini | 0.97 | $80 | B (redundant) |
| **Mixed family** ⭐ | claude-opus-4-7 + gpt-5.4 + qwen3.5-27b-distill | 0.78 | **$280** | A |
| **OSS-only** | qwen3.5-27b-distill + qwen3.5_122b + nemotron-120b | 0.65 | **$0** | A* |

\* OSS-only achieves Trust=A with severity-corrected accuracy.

→ **Best value**: Mixed family (claude/gpt API + qwen3.5-27b-distill OSS). corr=0.78 (balanced redundancy / diversity), 30% cost savings ($400 → $280).

→ **Continuous monitoring (cron)**: OSS-only viable. With severity correction + RRF ranking, quality A at $0.

## 6. Practical recommendations

### 6-1. Avoid

- **Single OSS judge**: `solar-100b` solo → ranking inverted. `gemma4_31b` solo → near-random.
- **Redundant small API ensemble**: `gpt-5.4-mini + gemini-3.1-flash-lite-OR` → 2x cost, 0 information.
- **Self-family solo**: claude-opus judge × claude cand → +22%p cell-level bias.

### 6-2. Per-scenario recommendation

| Scenario | Recommended ensemble |
| --- | --- |
| **Development, $$$** | All API premium |
| **Development, cost-saving** | Mixed family (claude-opus + gpt-5.4 + qwen3.5-27b-distill) |
| **Continuous / cron** | qwen3.5-27b-distill solo ($0/day) — avg_r 0.30 but near API median |
| **Emergency / fast** | qwen3.6-35b-a3b solo — lenient but trend-tracking ok |
| **Research publication** | Mixed family + RRF + severity-corrected accuracy + per-judge distribution |

### 6-3. Recommended reporting items

1. Ensemble composition (≥3 judges, ≥2 families)
2. Per-judge cand accuracy table + severity (mean acc)
3. Pairwise correlation matrix
4. Final ranking: RRF score + simple judge average (both)
5. Severity-corrected accuracy (z-score normalized)

## Limitations

- **n=46 cand only**: corr estimate SE ≈ ±0.10. r=−0.71 is significant; r=−0.32 may be noise.
- **Q1-only judge** (`supergemma4-26b`, `qwen3.6-35b-a3b` partial): n=12, noisy estimates.
- **Q2 96.7%**: `gemma4_31b` (24/46), `solar-100b` (10/46), `supergemma4-26b` (12/46) corrs are provisional.
- **Task asymmetry**: Q1 (local cand) vs Q4 (API cand) different distributions. Only judges that scored both sets give valid corr.

## Reproduce

```bash
# After Q1~Q4 sync
python3 scripts/build_html_unified.py
# Correlation matrix dump in same script
```

Raw:

- `results/phase5_judge_consolidated/judge_*.json` (Q1+Q2)
- `results/phase5_judge_flagship/q3_*_summary.json`, `q4_*_summary.json` (Q3+Q4)
- Combined HTML: `results/RAG_EVAL_MATRIX_UNIFIED.html` (5 metric tables × 46 cand × 18 judge)

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
