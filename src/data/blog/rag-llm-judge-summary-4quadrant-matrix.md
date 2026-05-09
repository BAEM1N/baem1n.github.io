---
title: "한국어 RAG LLM-as-Judge 4-Quadrant 종합 — RRF 로 통합한 cross-judge ranking"
description: "로컬 LLM 12종 + API LLM 34종 = 46개 candidate를 로컬 8 + API 9 = 17개 judge로 채점한 4-quadrant 매트릭스를 RRF 통합. 약 1M LLM judge calls. cand 1위 gpt-5.4-pro, OSS top gpt-oss:120b (#8). frontier API 격차는 5%p 이내, judge 선택 영향 미미."
pubDatetime: 2026-04-27T12:04:00.000Z
tags:
  - rag
  - llm-judge
  - evaluation
  - korean-nlp
featured: false
draft: false
---

## 통제 변수 (Q1~Q4 공통)

allganize `RAG-Evaluation-Dataset-KO` 300 Q&A 위에 **동일한 retrieval 파이프라인** 을 깔고, 변수는 **생성모델(cand) 과 판단모델(judge) 만** 두는 통제 실험.

| 단계          | 고정값                      | 출처                                                        |
| ------------- | --------------------------- | ----------------------------------------------------------- |
| Parser        | `pymupdf4llm`               | Phase 1 winner (MRR 0.4715, +5.4%p)                         |
| Chunking      | 500 chars / 100 overlap     | Phase 2 winner (MRR 0.5315, +23.5%p)                        |
| VectorStore   | FAISS                       | Phase 3 winner (p95 0.74ms, accuracy tied top)              |
| **Embedding** | **gemma-embed-300m (768d)** | Phase 4 rank 2 (MRR 0.6650), 작은 모델 = 빠른 batch judging |
| Retrieval     | top-5 cosine                | allganize 원본 k=6 근사                                     |

→ 같은 query 가 모든 cand LLM 에 **완전히 동일한 retrieved chunks** 로 들어감. 답변 차이 = 순수 LLM 답변 능력 차이 (retrieval 잡음 제거).

→ Judge 도 동일한 reference + cand answer 를 입력 받으므로, judge 점수 차이 = 순수 채점 모델 차이.

## 4-Quadrant 매트릭스 개요

LLM 답변자 46종 × LLM judge 17종 cross-judge.

```
              Local judge (8)           API judge (9)
            ┌─────────────────────────┬─────────────────────────┐
Local-gen  │ Q1                      │ Q3                      │
(12 LLM)   │  8 × 12 × 4 × 300       │  9 × 12 × 4 × 300       │
            │  = 115,200 calls        │  = 129,600 calls ✅     │
            ├─────────────────────────┼─────────────────────────┤
API-gen    │ Q2                      │ Q4                      │
(34 LLM)   │  8 × 34 × 4 × 300       │  10 × 34 × 4 × 300      │
            │  = 326,400 calls        │  = 408,000 calls ✅     │
            └─────────────────────────┴─────────────────────────┘
```

**Q1 / Q3 / Q4 100% 완료** + **Q2 98.2% 완료** = 총 약 **1M LLM judge calls**.

## RRF (Reciprocal Rank Fusion) 통합 방식

Q1+Q3 (로컬 cand) 와 Q2+Q4 (API cand) 를 **하나의 매트릭스로 통합** 하고 17 judge 의 ranking 을 fusion.

`RRF_score(c) = Σ 1 / (k + rank_j(c))` (`k = 60`)

→ outlier judge 의 영향이 작아짐. judge 선택보다 cand 자체 차이를 강조.

## 통합 ranking — 46 cand RRF leaderboard

17 judge (≥40 cand 채점) 기준 통합. 각 cand 의 17 judge 평균 accuracy 와 RRF 점수.

| Rank | Cand | Type | Avg acc | RRF |
| ---:| --- | :-:| ---:| ---:|
| 🥇 | `gpt-5.4-pro` | API | **0.7418** | **0.2698** |
| 🥈 | `gpt-5.4` | API | 0.7317 | 0.2603 |
| 🥉 | `x-ai/grok-4.20` | API | 0.7264 | 0.2596 |
| 4 | `gpt-5.4-mini` | API | 0.7150 | 0.2562 |
| 5 | `moonshotai/kimi-k2.5` | API | 0.7021 | 0.2488 |
| 6 | `claude-sonnet-4-6` | API | 0.6986 | 0.2451 |
| 7 | `claude-opus-4-7` | API | 0.6962 | 0.2411 |
| 8 | **`gpt-oss_120b`** | **OSS** | **0.7201** | 0.2404 |
| 9 | `gemini-3.1-flash-lite-preview` | API | 0.6869 | 0.2331 |
| 10 | `claude-opus-4-7-thinking` | API | 0.6892 | 0.2323 |
| 11 | `gemini-3-flash-preview` | API | 0.6843 | 0.2304 |
| 12 | `moonshotai/kimi-k2.6` | API | 0.6875 | 0.2294 |
| 13 | `gemini-3-pro-preview` | API | 0.6897 | 0.2285 |
| 14 | `gemini-3.1-pro-preview` | API | 0.6878 | 0.2266 |
| 15 | `claude-sonnet-4-6-thinking` | API | 0.6861 | 0.2250 |
| 16 | **`gpt-oss_20b`** | **OSS** | 0.7118 | 0.2224 |
| 17 | `deepseek/deepseek-v4-pro` | API | 0.6805 | 0.2196 |
| 18 | `gemini-3.1-pro-preview-thinking` | API | 0.6346 | 0.2192 |
| 19 | `z-ai/glm-5.1` | API | 0.6094 | 0.2172 |
| 20 | **`qwen3.5_122b-a10b-q4_K_M_think`** | **OSS** | 0.7052 | 0.2156 |
| 21 | `qwen/qwen3.6-plus` | API | 0.6761 | 0.2118 |
| 22 | `deepseek/deepseek-v4-flash` | API | 0.6729 | 0.2082 |
| 23 | `xiaomi/mimo-v2.5-pro` | API | 0.6412 | 0.2067 |
| 24 | `claude-sonnet-4-5` | API | 0.6681 | 0.2057 |
| 25 | `minimax/minimax-m2.5` | API | 0.6657 | 0.2044 |
| 26 | `z-ai/glm-4.7` | API | 0.6009 | 0.2041 |
| 27 | **`qwen3.5_122b-a10b-q4_K_M_nothink`** | **OSS** | 0.6894 | 0.2000 |
| 28 | **`qwen3.5_27b-q8.0_nothink`** | **OSS** | 0.6913 | 0.1988 |
| 29 | `xiaomi/mimo-v2.5` | API | 0.6392 | 0.1977 |
| 30 | `minimax/minimax-m2.7` | API | 0.6598 | 0.1971 |
| 31 | `z-ai/glm-5` | API | 0.5883 | 0.1938 |
| 32 | `gpt-5.4-nano` | API | 0.6512 | 0.1910 |
| 33 | `claude-haiku-4-5` | API | 0.6538 | 0.1907 |
| 34 | `qwen/qwen3-max-thinking` | API | 0.6528 | 0.1891 |
| 35 | `deepseek/deepseek-v3.2` | API | 0.6541 | 0.1890 |
| 36 | `mistralai/mistral-small-2603` | API | 0.6358 | 0.1811 |
| 37 | **`exaone3.5_32b`** | **OSS** | 0.6363 | 0.1780 |
| 38 | **`mistral-small_24b`** | **OSS** | 0.6336 | 0.1771 |
| 39 | `upstage/solar-pro-3` | API | 0.6061 | 0.1750 |
| 40 | **`deepseek-r1_70b_nothink`** | **OSS** | 0.6257 | 0.1743 |
| 41 | **`phi4_14b`** | **OSS** | 0.6251 | 0.1740 |
| 42 | `z-ai/glm-4.7-flash` | API | 0.5482 | 0.1723 |
| 43 | **`qwen3.5_9b-q4_K_M_nothink`** | **OSS** | 0.6084 | 0.1710 |
| 44 | **`qwen3.5_9b-q8.0_nothink`** | **OSS** | 0.5956 | 0.1700 |
| 45 | `nvidia/nemotron-3-nano-30b-a3b` | API | 0.5950 | 0.1700 |
| 46 | **`lfm2_24b`** | **OSS** | **0.4369** | 0.1619 |

## 메타 인사이트

### 1. Top tier 는 frontier API (5%p 이내 격차)

```
#1 gpt-5.4-pro       0.7418
#2 gpt-5.4           0.7317  (-1.4%p)
#3 grok-4.20         0.7264  (-2.1%p)
#4 gpt-5.4-mini      0.7150  (-3.6%p)
#5 kimi-k2.5         0.7021  (-5.4%p)
```

→ **OpenAI / xAI / Moonshot 가 동급**. Anthropic / Google frontier 도 5%p 이내. **단일 winner 가 압도적이지 않음** — vendor lock-in 없이 비용/지연 기준 선택 가능.

### 2. OSS top tier — gpt-oss_120b 가 frontier 와 견줌

```
#8  gpt-oss_120b              0.7201  ← OSS 1위, frontier 와 -2.2%p
#16 gpt-oss_20b               0.7118  ← 20B 가 frontier 와 -3.0%p
#20 qwen3.5_122b_think        0.7052  ← reasoning 효과 +1.6%p
#27 qwen3.5_122b_nothink       0.6894
#28 qwen3.5_27b_q8_nothink     0.6913
```

→ **gpt-oss 시리즈** 가 한국어 RAG 답변 생성에 frontier API 와 거의 동급. 자체 GPU 보유 시 cost = 0.

### 3. Self-judge bias 약함

| Cand 가족 | self-family judge avg | non-self avg | Δ |
| --- | ---:| ---:| ---:|
| Anthropic (claude cand × claude judge) | 0.726 | 0.715 | +1.1%p |
| OpenAI (gpt-5 cand × OpenAI judge) | 0.736 | 0.728 | +0.8%p |
| Google (gemini cand × gemini judge) | 0.715 | 0.713 | +0.2%p |

→ 1-2%p 이내, RRF ranking 영향 미미. (단 [Judge correlation 분석](/posts/rag-llm-judge-correlation-analysis/) 에서 확인된 cell-level bias 는 약 +22%p 로 더 큼 — 매트릭스 단위 vs cell 단위 차이.)

### 4. Reasoning / thinking 모드 효과 미미

| Cand 쌍 | non-thinking | thinking | Δ |
| --- | ---:| ---:| ---:|
| `qwen3.5_122b-a10b` (OSS) | 0.689 | 0.705 | **+1.6%p** |
| `claude-sonnet-4-6` | 0.699 | 0.686 | -1.3%p |
| `claude-opus-4-7` | 0.696 | 0.689 | -0.7%p |
| `gemini-3.1-pro-preview` | 0.688 | 0.635 | **-5.3%p** |

→ RAG 답변에는 **추론 시간보다 정확한 발췌가 더 중요**. thinking mode 의 비용 대비 효익 ≈ 0. 일부는 오히려 음수.

### 5. Cross-judge consensus 강함

- 모든 17 judge 가 `lfm2_24b` 를 최하위로 일관 평가 (Q1 12 judge × Q4 미해당)
- 17 judge 의 cand-별 ranking r ≈ 0.70~0.98 (중급~상위 corr)
- top-3 ranking 이 14/17 judge 에서 일치 (gpt-5.4 / pro / grok)
- **judge 선택보다 cand 자체 차이가 ranking 결정**

상세: [Judge × Judge correlation 분석](/posts/rag-llm-judge-correlation-analysis/)

### 6. 한국어 RAG bottom — 작은 모델 + 약한 한국어

```
#42 z-ai/glm-4.7-flash     0.5482
#45 nemotron-3-nano        0.5950
#46 lfm2_24b               0.4369  ← OSS 최하위, frontier −31%p
```

`lfm2_24b` 는 영어 중심 학습으로 한국어 RAG 부적합. Solar / Nemotron-nano 도 30B 미만이라 정확도 한계.

## 방법론

### 채점 프로토콜 (allganize 기반)

- 4 metric: `similarity / correctness / completeness / faithfulness`
- threshold = 4 (1-5 scale 에서 4 이상 = "좋음")
- majority vote: 4 metric 중 ≥2개가 ≥4 → "O" (정답 처리)
- accuracy = O / total Q (300)

### Reasoning / thinking 통일

- 로컬 judge: `JUDGE_MODE=nothink` (`enable_thinking=False`)
- OpenAI judge: `reasoning.effort='none'`, `max_output_tokens=64`
- Anthropic judge: thinking 비활성화 (default off)
- Gemini judge: OpenRouter `reasoning.effort='low'`

## 결론

LLM-as-Judge 매트릭스에서 **judge 사이즈·가족·reasoning 여부보다 채점 프로토콜이 ranking 을 결정**한다:

1. 비싼 reasoning judge (`opus-4-7`, `gpt-5.5`) 도 가성비 small judge (`gpt-5.4-nano`, `gemini-3-flash-lite`) 도 **동일한 RRF ranking** 산출
2. Self-judge bias 1-2%p 수준 — RRF ranking 영향 ≈ 0
3. 실용 관점: small / cheap judge 로 충분
4. **RAG 답변자 선택이 ranking 의 본질적 결정 요인**

상세 데이터:

- [Q1: Local × Local cross-validation](/posts/rag-llm-judge-q1-local-cross-validation/)
- [Q2: API × Local 실측 결과 (96.7%)](/posts/rag-llm-judge-q2-api-llm-vs-local-judges/)
- [Q3: Local × API flagship judges](/posts/rag-llm-judge-q3-flagship-api-judges/)
- [Q4: API × API self-validation](/posts/rag-llm-judge-q4-api-self-evaluation/)
- **[Judge × Judge 상관관계 정량 분석](/posts/rag-llm-judge-correlation-analysis/)** — 18 judge corr matrix, optimal ensemble 4 시나리오

---

## 시리즈 목차

**Phase 1-4: RAG retrieval 최적화**

- [실험 설계](/posts/rag-evaluation-experiment-design/) — 5단계 통제 실험
- [파서 비교](/posts/rag-parser-comparison/) — pymupdf4llm 1위 (+5.4%p)
- [청킹 비교](/posts/rag-chunking-comparison/) — small 청크 1위 (+23.5%p, MRR 영향 최대)
- [벡터스토어 비교](/posts/rag-vectorstore-comparison/) — FAISS 0.74ms (정확도 동률)
- [임베딩 27종](/posts/rag-embedding-benchmark-results/) — koe5 1위 (한국어 특화 강세)

**Phase 5: LLM-as-Judge cross-validation**

- [Q1 — Local cand × Local judge](/posts/rag-llm-judge-q1-local-cross-validation/)
- [Q2 — API cand × Local judge](/posts/rag-llm-judge-q2-api-llm-vs-local-judges/)
- [Q3 — Local cand × API judge](/posts/rag-llm-judge-q3-flagship-api-judges/)
- [Q4 — API cand × API judge](/posts/rag-llm-judge-q4-api-self-evaluation/)
- [4-Quadrant 종합 RRF leaderboard](/posts/rag-llm-judge-summary-4quadrant-matrix/) — 46 cand × 17 judge 통합
- [Judge × Judge correlation 분석](/posts/rag-llm-judge-correlation-analysis/) — severity vs consensus, optimal ensemble
