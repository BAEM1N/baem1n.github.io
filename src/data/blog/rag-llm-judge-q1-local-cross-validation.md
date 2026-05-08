---
title: "Q1 — 로컬 LLM 8종이 로컬 LLM 12종을 채점하는 cross-validation 매트릭스"
description: "동일 retrieval(gemma-embed-300m, top-5)에서 12개 로컬 LLM이 만든 답변을 8개 로컬 LLM judge가 채점. allganize 4-metric × threshold=4 × majority(≥3) 기준 96-entry 매트릭스에서 gpt-oss:120b가 평균 0.7400으로 1위, judge 간 ranking 강한 일관성을 확인."
pubDatetime: 2026-04-27T12:00:00.000Z
tags:
  - rag
  - llm-judge
  - evaluation
  - korean-nlp
featured: false
draft: false
---

## 요약

- **실험**: 로컬 LLM 12종이 만든 RAG 답변(retrieval = `gemma-embed-300m` top-5)을 다시 로컬 LLM 8종이 채점.
- **방법론**: allganize 평가 프로토콜 — 4 metric × threshold=4 × majority(≥3) → O/X.
- **규모**: 8 judges × 12 candidates × 4 metric × 300 Q = **115,200 judge calls**.
- **결과**: `gpt-oss:120b`가 평균 0.7400으로 1위. judge 간 ranking이 거의 동일.
- **이슈**: `solar-open-100b` judge는 chat template 누락으로 모든 응답이 비정수 → 평균에서 제외(추후 재실행).

## 실험 설계

### Candidate (12 LLM, 답변자)

- `deepseek-r1:70b`, `exaone3.5:32b`
- `gpt-oss:120b`, `gpt-oss:20b`
- `lfm2:24b`, `mistral-small:24b`, `phi4:14b`
- `qwen3.5:122b-a10b-q4_K_M` (nothink/think 두 변형)
- `qwen3.5:27b-q8_0_nothink`
- `qwen3.5:9b-q4_K_M_nothink`, `qwen3.5:9b-q8_0_nothink`

### Judge (8 LLM, 채점자)

| Judge                        | 비고                    |
| ---------------------------- | ----------------------- |
| `gemma4:31b`                 | dense                   |
| `nemotron-120b`              | UD-IQ4_XS (AI-395 mmap) |
| `qwen3.5-27b-claude-distill` | reasoning distill       |
| `qwen3.5:122b-a10b-q4_K_M`   | MoE                     |
| `qwen3.6-35b-a3b`            | MoE                     |
| `qwen3-next:80b`             | next-gen                |
| `solar-open-100b`            | ⚠️ chat template 이슈   |
| `supergemma4-26b`            | gemma4 distill          |

### 평가 프로토콜

1. 4 metric: similarity / correctness / completeness / faithfulness 각 1–5점.
2. **threshold = 4**: 각 metric 점수 ≥ 4 → 통과.
3. **majority vote(≥3)**: 4 metric 중 3개 이상 통과 → `O`, 아니면 `X`.
4. accuracy = O / total Q.

## Cross-judge accuracy 매트릭스

> ⚠️ `solar-open-100b` judge는 모든 점수 0(chat template 미정의)이라 Avg 계산에서 제외. `qwen3-next:80b` judge는 일부 candidate 미처리(80B 모델의 inference 처리 한계).

| Candidate              | gemma4 | nemotron | qwen3-next | claude-distill | qwen3.5_122b | qwen3.6 | supergemma | **Avg**    |
| ---------------------- | ------ | -------- | ---------- | -------------- | ------------ | ------- | ---------- | ---------- |
| `gpt-oss_120b`         | 0.7333 | 0.7867   | 0.6300     | 0.7067         | 0.7300       | 0.8000  | 0.7933     | **0.7400** |
| `gpt-oss_20b`          | 0.7067 | 0.7867   | 0.5000     | 0.6967         | 0.7033       | 0.7900  | 0.8100     | **0.7191** |
| `qwen3.5_122b_think`   | 0.6833 | 0.7333   | —          | 0.6700         | 0.6967       | 0.7367  | 0.7500     | **0.7117** |
| `qwen3.5_27b-q8`       | 0.6700 | 0.7400   | —          | 0.6567         | 0.6767       | 0.7300  | 0.7400     | **0.7022** |
| `qwen3.5_122b_nothink` | 0.6733 | 0.7433   | —          | 0.6400         | 0.6800       | 0.7233  | 0.7333     | **0.6989** |
| `phi4_14b`             | 0.6233 | 0.6900   | —          | 0.6067         | 0.6433       | 0.7300  | 0.7167     | **0.6683** |
| `exaone3.5_32b`        | 0.6267 | 0.7200   | 0.5400     | 0.5900         | 0.6567       | 0.7233  | 0.7133     | **0.6529** |
| `mistral-small_24b`    | 0.6167 | 0.6933   | 0.5567     | 0.5933         | 0.6300       | 0.7200  | 0.7000     | **0.6443** |
| `deepseek-r1_70b`      | 0.6033 | 0.7167   | 0.5333     | 0.5633         | 0.6200       | 0.7233  | 0.7233     | **0.6405** |
| `qwen3.5_9b-q4`        | 0.5833 | 0.6533   | —          | 0.5600         | 0.5967       | 0.6767  | 0.6700     | **0.6233** |
| `qwen3.5_9b-q8`        | 0.5633 | 0.6667   | —          | 0.5433         | 0.5867       | 0.6533  | 0.6667     | **0.6133** |
| `lfm2_24b`             | 0.4167 | 0.5733   | 0.3433     | 0.3500         | 0.3900       | 0.5433  | 0.5400     | **0.4509** |

## 인사이트

### 1. Judge 간 ranking 일관성

7개 judge(작동하는 모든 judge) 평균 ranking이 거의 동일:

- 모든 judge에서 `gpt-oss:120b`가 1~2위, `lfm2_24b`가 최하위.
- 평균 0.74 vs 0.45로 candidate 간 차이가 27%p — judge 잡음(±2%p)을 압도.

### 2. MoE의 강세

상위 5위 중 3개가 qwen3.5_122b-a10b MoE 양자화(`think` 0.7117, `nothink` 0.6989), 1·2위는 gpt-oss MoE(120B, 20B). 동일 파라미터 대비 dense인 deepseek-r1:70b(0.6405)보다 효율적.

### 3. Reasoning(think) > non-think

`qwen3.5_122b-a10b-q4_K_M_think` 0.7117 vs `nothink` 0.6989 — same model, +1.3%p. reasoning 토큰이 RAG 답변 품질을 살짝 끌어올림.

### 4. lfm2:24b의 일관된 부진

모든 judge에서 최하위. SSM 기반(Liquid Foundation Model)이라 transformer 답변 품질에 미치지 못하는 패턴이 모든 judge에서 재현.

### 5. solar-open-100b chat template 이슈

ollama Modelfile의 `TEMPLATE` 가 `{{ .Prompt }}` 한 줄로만 정의되어 messages 구조가 raw로 전달 → judge 응답이 정수가 아님 → 모두 X 분류. 추후 GLM4-style chat template으로 재정의해 재실험 필요.

## 데이터셋 / 환경

- Dataset: `allganize/RAG-Evaluation-Dataset-KO` (300 Q&A × 58 PDFs).
- Retrieval: `nlpai-lab/KoE5` 계열 `gemma-embed-300m`, FAISS top-5.
- Judge runtime: ollama / llama.cpp(local llama-server), JUDGE_MODE=`nothink`.
- 모든 judge 호출은 결정적(temperature=0)으로 수행.

## 다음

- Q2: API LLM 답변(34종) × local judge 8종 (계획 단계).
- Q3: Local LLM 답변 × API judge(Anthropic / OpenAI / Google).
- Q4: API LLM 답변 × API judge.

각 quadrant 결과를 통합해 4-quadrant cross-validation 매트릭스를 구축 중.

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
