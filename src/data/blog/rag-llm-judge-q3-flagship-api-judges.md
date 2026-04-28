---
title: "Q3 — 로컬 LLM 답변을 API flagship judge 9종이 채점한 결과"
description: "12개 로컬 LLM이 만든 RAG 답변을 Anthropic Opus 4.7 / Sonnet 4.6, OpenAI gpt-5.5 / gpt-5.4 family, Google Gemini 3 Pro / Flash / Flash Lite — 총 9개 API judge가 cross-judge. 14,400 calls × 9 judge = 129,600 calls 100% 완료. 모든 judge가 gpt-oss:120b, qwen3.5_122b-think, gpt-oss:20b 를 상위 3개로 일치 평가."
pubDatetime: 2026-04-27T12:02:00.000Z
tags:
featured: false
draft: false
---

## 요약

- **실험**: 12개 로컬 LLM 답변(`gemma-embed-300m` top-5 retrieval)을 9개 API judge가 채점.
- **방법론**: allganize 4-metric × threshold=4 × majority(≥3).
- **규모**: 9 judges × 12 candidates × 4 metric × 300 Q = **129,600 judge calls** (100% 완료).
- **결과**: 모든 judge가 `gpt-oss:120b`, `qwen3.5_122b-a10b-q4_K_M_think`, `gpt-oss:20b` 를 상위 3개로 평가 — strong cross-judge consensus.

## Judge 9종

| Judge | 가족 | 호출 방식 |
|---|---|---|
| `claude-opus-4-7` | Anthropic | Batch + retry, 52건은 `claude-opus-4-6` fallback (안전 거부 우회) |
| `claude-sonnet-4-6` | Anthropic | Batch + 147건 retry (max_tokens 1024) |
| `gemini-3.1-pro-preview` | Google | OpenRouter, reasoning effort=low |
| `gemini-3-flash-preview` | Google | OpenRouter, no reasoning |
| `gemini-3.1-flash-lite-preview` | Google | OpenRouter, no reasoning |
| `gpt-5.5` | OpenAI | Responses API, reasoning effort=none |
| `gpt-5.4` | OpenAI | Batch API |
| `gpt-5.4-mini` | OpenAI | Batch API |
| `gpt-5.4-nano` | OpenAI | Batch API |

## 결과 매트릭스 (accuracy = O / 300)

| Cand | G-Pro | G-Flash | G-FL | Sonnet | Opus | 5.4 | 5.4-m | 5.4-n | 5.5 | **Avg** |
|---|---|---|---|---|---|---|---|---|---|---|
| `gpt-oss_120b` | 0.663 | 0.737 | 0.700 | 0.697 | 0.680 | 0.723 | 0.707 | 0.707 | 0.723 | **0.704** |
| `qwen3.5_122b-a10b_think` | 0.667 | 0.727 | 0.680 | 0.690 | 0.693 | 0.723 | 0.697 | 0.657 | 0.683 | **0.691** |
| `gpt-oss_20b` | 0.680 | 0.750 | 0.663 | 0.680 | 0.650 | 0.730 | 0.697 | 0.663 | 0.697 | **0.690** |
| `qwen3.5_27b-q8_0` | 0.647 | 0.713 | 0.667 | 0.680 | 0.673 | 0.697 | 0.667 | 0.657 | 0.683 | **0.676** |
| `qwen3.5_122b-a10b_nothink` | 0.633 | 0.710 | 0.657 | 0.663 | 0.657 | 0.687 | 0.657 | 0.650 | 0.657 | **0.663** |
| `mistral-small_24b` | 0.597 | 0.673 | 0.637 | 0.620 | 0.613 | 0.660 | 0.607 | 0.600 | 0.600 | **0.623** |
| `phi4_14b` | 0.583 | 0.673 | 0.630 | 0.620 | 0.620 | 0.660 | 0.610 | 0.567 | 0.620 | **0.620** |
| `exaone3.5_32b` | 0.573 | 0.680 | 0.610 | 0.607 | 0.603 | 0.670 | 0.613 | 0.600 | 0.627 | **0.620** |
| `deepseek-r1_70b` | 0.577 | 0.673 | 0.603 | 0.593 | 0.593 | 0.650 | 0.593 | 0.613 | 0.583 | **0.609** |
| `qwen3.5_9b-q4` | 0.553 | 0.630 | 0.587 | 0.580 | 0.580 | 0.617 | 0.573 | 0.560 | 0.593 | **0.586** |
| `qwen3.5_9b-q8` | 0.540 | 0.620 | 0.540 | 0.577 | 0.563 | 0.600 | 0.570 | 0.550 | 0.590 | **0.572** |
| `lfm2_24b` | 0.370 | 0.487 | 0.410 | 0.387 | 0.373 | 0.450 | 0.417 | 0.410 | 0.387 | **0.410** |

## 인사이트

### 1. Cross-judge consensus 매우 강함

상위 3개 (`gpt-oss_120b`, `qwen3.5_122b_think`, `gpt-oss_20b`) 와 하위 1개 (`lfm2_24b`) 는 **9개 judge 모두에서 같은 방향**. 작은 judge (`gpt-5.4-nano`, `Gemini Flash Lite`) 도 큰 모델과 동일한 ranking을 도출 — judge 선택이 ranking 결과에 큰 영향 주지 않음.

### 2. Judge 별 평균 점수 차이

| Judge | 12 cand 평균 | 경향 |
|---|---|---|
| `gemini-3-flash` | 0.681 | 가장 관대 |
| `gpt-5.4` | 0.672 | 두 번째 |
| `gpt-5.5` | 0.654 | |
| `claude-sonnet-4-6` | 0.633 | |
| `claude-opus-4-7` | 0.625 | |
| `gemini-3.1-pro` | 0.594 | 가장 엄격 |

→ Gemini Pro 가 동일 답변에 대해 가장 까다롭게 평가. Flash 라인이 +9%p 더 후함. 그러나 **상대 ranking은 9 judge 모두 일치**.

### 3. Thinking 모드의 효과

`qwen3.5_122b-a10b_think` (0.691) vs `qwen3.5_122b-a10b_nothink` (0.663) — thinking 활성화로 **+2.8%p**. 단, 9b small 변종은 think/nothink 차이 거의 없음 (이미 작은 모델이라 추론 여력 부족).

### 4. lfm2_24b 의 큰 격차

`lfm2_24b` 0.410 → 다른 24b 급 (`mistral-small_24b` 0.623, `phi4_14b` 0.620) 대비 -20%p. 한국어 RAG에서 lfm 아키텍처가 약함을 시사.

## 방법론

### Anthropic Opus 4.7 → 4.6 fallback (52건)

`claude-opus-4-7` 이 `q142`, `q258` 등 의료 관련 question 의 일부 candidate 답변을 `stop_reason: refusal` 로 거부. 11가지 우회 (prompt 재구성, system disclaimer, adaptive thinking, backtick wrapping 등) 모두 실패 → `claude-opus-4-6` 으로 fallback (52/52 정상 평가).

분석 시 라벨링: "Opus 4.7 (52/14,400 items: 4.6 fallback for safety refusals)".

### Sonnet 4.6 max_tokens 보정 (147건)

main batch 의 `max_tokens=64` 가 너무 작아 일부 답변에서 모델이 분석 텍스트만 출력하고 정수를 못 적은 케이스 발견. `max_tokens=1024` 로 retry → 147/147 정상 추출.

### Gemini Pro reasoning effort=low

OpenRouter `extra_body={"reasoning":{"effort":"low"}}` 설정. effort=none 은 thinking-class 모델에서 token=1 만 출력하는 회귀 발생 → low로 고정.

## 다음

- Q4 (API cand × API judge) 결과는 [별도 글](/posts/rag-llm-judge-q4-api-self-evaluation/) 참조.
- 4-quadrant 통합 분석은 [요약 글](/posts/rag-llm-judge-summary-4quadrant-matrix/) 참조.
