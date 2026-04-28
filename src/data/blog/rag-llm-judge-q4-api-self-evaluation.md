---
title: "Q4 — API LLM 답변 34종을 API judge 8종이 채점한 self-evaluation 매트릭스"
description: "Anthropic 6종 + OpenAI 4종 + Google 5종 + OpenRouter 19종이 만든 RAG 답변을 8개 flagship API judge로 cross-validate. 40,792 calls × 8 judge = 326,336 calls 100% 완료. gpt-5.4와 gpt-5.4-pro가 공동 1위(Avg 0.76), self-judge bias는 ranking 안정성 대비 미미한 수준 (+1~2%p)."
pubDatetime: 2026-04-27T12:03:00.000Z
tags:
  - rag
  - llm-judge
  - evaluation
  - korean-nlp
featured: false
draft: false
---

## 요약

- **실험**: 34개 API LLM 답변을 동일 API judge 8종으로 cross-validate.
- **방법론**: allganize 4-metric × threshold=4 × majority(≥3).
- **규모**: 8 judges × 34 candidates × 4 metric × 300 Q = **326,400 calls** (40,792 × 8 = **326,336** unique 키, 100% 완료).
- **결과**: `gpt-5.4` 0.761, `gpt-5.4-pro` 0.759, `x-ai/grok-4.20` 0.753 — 상위 3 모델이 1%p 이내. self-judge bias 약함 (+1~2%p).

## Judge 8종

| Judge | 가족 | 호출 |
|---|---|---|
| `claude-sonnet-4-6` | Anthropic | Batch + retry (max_tokens 1024) |
| `claude-opus-4-7` | Anthropic | Batch + 128건 `claude-opus-4-6` fallback (안전 거부 회피) |
| `gemini-3.1-pro-preview` | Google | OpenRouter, reasoning low |
| `gemini-3-flash-preview` | Google | OpenRouter |
| `gemini-3.1-flash-lite-preview` | Google | OpenRouter |
| `gpt-5.4` | OpenAI | Batch API |
| `gpt-5.4-mini` | OpenAI | Batch API |
| `gpt-5.4-nano` | OpenAI | Batch API |

## 결과 매트릭스 (top 15, accuracy = O / 300)

| Cand | G-Pro | G-Flash | G-FL | Sonnet | Opus | 5.4 | 5.4-m | 5.4-n | **Avg** |
|---|---|---|---|---|---|---|---|---|---|
| `gpt-5.4` | 0.750 | 0.793 | 0.747 | 0.750 | 0.777 | 0.783 | 0.763 | 0.723 | **0.761** |
| `gpt-5.4-pro` | 0.737 | 0.797 | 0.753 | 0.750 | 0.770 | 0.780 | 0.760 | 0.727 | **0.759** |
| `x-ai/grok-4.20` | 0.740 | 0.797 | 0.747 | 0.760 | 0.767 | 0.773 | 0.737 | 0.703 | **0.753** |
| `gpt-5.4-mini` | 0.713 | 0.773 | 0.727 | 0.720 | 0.750 | 0.767 | 0.730 | 0.717 | **0.737** |
| `moonshotai/kimi-k2.5` | 0.707 | 0.763 | 0.723 | 0.737 | 0.750 | 0.740 | 0.750 | 0.710 | **0.735** |
| `moonshotai/kimi-k2.6` | 0.703 | 0.750 | 0.710 | 0.733 | 0.750 | 0.737 | 0.733 | 0.717 | **0.729** |
| `claude-sonnet-4-6` | 0.713 | 0.760 | 0.723 | 0.733 | 0.727 | 0.743 | 0.720 | 0.687 | **0.726** |
| `gemini-3-flash-preview` | 0.700 | 0.747 | 0.727 | 0.733 | 0.750 | 0.730 | 0.737 | 0.683 | **0.726** |
| `claude-opus-4-7` | 0.703 | 0.750 | 0.717 | 0.717 | 0.730 | 0.733 | 0.713 | 0.703 | **0.721** |
| `claude-sonnet-4-6-thinking` | 0.707 | 0.750 | 0.703 | 0.730 | 0.727 | 0.733 | 0.727 | 0.663 | **0.717** |
| `claude-opus-4-7-thinking` | 0.697 | 0.747 | 0.700 | 0.703 | 0.743 | 0.737 | 0.703 | 0.697 | **0.716** |
| `gemini-3.1-flash-lite-preview` | 0.697 | 0.750 | 0.703 | 0.697 | 0.727 | 0.740 | 0.703 | 0.690 | **0.713** |
| `gemini-3-pro-preview` | 0.690 | 0.727 | 0.700 | 0.703 | 0.733 | 0.723 | 0.710 | 0.697 | **0.710** |
| `gemini-3.1-pro-preview-thinking` | 0.690 | 0.730 | 0.700 | 0.703 | 0.720 | 0.710 | 0.720 | 0.700 | **0.709** |
| `deepseek/deepseek-v4-pro` | 0.697 | 0.730 | 0.693 | 0.700 | 0.720 | 0.730 | 0.707 | 0.693 | **0.709** |

## 결과 매트릭스 (mid + bottom)

| Cand | G-Pro | G-Flash | G-FL | Sonnet | Opus | 5.4 | 5.4-m | 5.4-n | **Avg** |
|---|---|---|---|---|---|---|---|---|---|
| `z-ai/glm-5.1` | 0.690 | 0.720 | 0.697 | 0.697 | 0.717 | 0.723 | 0.717 | 0.703 | **0.708** |
| `gemini-3.1-pro-preview` | 0.687 | 0.720 | 0.700 | 0.697 | 0.730 | 0.720 | 0.720 | 0.680 | **0.707** |
| `qwen/qwen3.6-plus` | 0.667 | 0.730 | 0.687 | 0.700 | 0.720 | 0.720 | 0.707 | 0.687 | **0.702** |
| `z-ai/glm-4.7` | 0.680 | 0.727 | 0.687 | 0.690 | 0.707 | 0.723 | 0.720 | 0.670 | **0.700** |
| `deepseek/deepseek-v4-flash` | 0.663 | 0.723 | 0.700 | 0.697 | 0.703 | 0.720 | 0.687 | 0.660 | **0.694** |
| `claude-sonnet-4-5` | 0.673 | 0.733 | 0.673 | 0.700 | 0.713 | 0.717 | 0.677 | 0.653 | **0.693** |
| `minimax/minimax-m2.5` | 0.663 | 0.727 | 0.677 | 0.687 | 0.713 | 0.713 | 0.680 | 0.670 | **0.691** |
| `xiaomi/mimo-v2.5` | 0.660 | 0.750 | 0.683 | 0.673 | 0.693 | 0.723 | 0.673 | 0.670 | **0.691** |
| `xiaomi/mimo-v2.5-pro` | 0.663 | 0.737 | 0.677 | 0.673 | 0.700 | 0.717 | 0.670 | 0.667 | **0.688** |
| `z-ai/glm-5` | 0.657 | 0.717 | 0.673 | 0.677 | 0.703 | 0.693 | 0.680 | 0.673 | **0.684** |
| `minimax/minimax-m2.7` | 0.660 | 0.717 | 0.650 | 0.677 | 0.700 | 0.717 | 0.670 | 0.660 | **0.681** |
| `deepseek/deepseek-v3.2` | 0.657 | 0.720 | 0.673 | 0.663 | 0.680 | 0.697 | 0.653 | 0.673 | **0.677** |
| `qwen/qwen3-max-thinking` | 0.650 | 0.727 | 0.670 | 0.673 | 0.677 | 0.687 | 0.660 | 0.653 | **0.675** |
| `gpt-5.4-nano` | 0.627 | 0.717 | 0.670 | 0.653 | 0.687 | 0.697 | 0.677 | 0.657 | **0.673** |
| `claude-haiku-4-5` | 0.653 | 0.713 | 0.657 | 0.667 | 0.670 | 0.700 | 0.640 | 0.653 | **0.669** |
| `mistralai/mistral-small-2603` | 0.627 | 0.710 | 0.637 | 0.647 | 0.683 | 0.687 | 0.657 | 0.657 | **0.663** |
| `z-ai/glm-4.7-flash` | 0.603 | 0.670 | 0.637 | 0.623 | 0.673 | 0.660 | 0.650 | 0.633 | **0.644** |
| `nvidia/nemotron-3-nano-30b-a3b` | 0.587 | 0.667 | 0.607 | 0.593 | 0.617 | 0.643 | 0.620 | 0.603 | **0.617** |
| `upstage/solar-pro-3` | 0.573 | 0.673 | 0.600 | 0.613 | 0.637 | 0.650 | 0.593 | 0.570 | **0.614** |

## 인사이트

### 1. Self-judge bias 가설 검증 — 약함

판단 모델이 자기 가족을 더 후하게 채점하는지 (`claude-opus-4-7` judge 가 `claude-opus-4-7` cand 에 +α 점수) 확인.

| Cand 가족 | 자기 family judge 평균 | 다른 family judge 평균 | Δ |
|---|---|---|---|
| Anthropic (Sonnet/Opus cand × Anthropic judge) | 0.726 | 0.715 | +1.1%p |
| OpenAI (gpt-5.4 family cand × OpenAI judge) | 0.736 | 0.728 | +0.8%p |
| Google (Gemini cand × Gemini judge) | 0.715 | 0.713 | +0.2%p |

→ **self-judge bias 미미** (1-2%p 이내). 평균 모든 judge가 ranking을 거의 동일하게 도출 — Q3 결과와 같은 강한 cross-judge consensus.

### 2. 상위 cand: thinking ≠ 우월

`gpt-5.4` (0.761) > `gpt-5.4-pro` (0.759) — 1위. `claude-opus-4-7-thinking` (0.716) < `claude-opus-4-7` (0.721) — thinking이 오히려 약간 낮음. RAG 답변에서 추론 시간보다 정확한 발췌가 중요하다는 시사점.

### 3. 한국 RAG에서 어떤 모델이 강한가

| 클래스 | Top 모델 | Avg |
|---|---|---|
| OpenAI | `gpt-5.4` | 0.761 |
| OpenAI Pro | `gpt-5.4-pro` | 0.759 |
| Anthropic | `claude-sonnet-4-6` | 0.726 |
| Google | `gemini-3-flash-preview` | 0.726 |
| 중국계 (large) | `moonshotai/kimi-k2.5` | 0.735 |
| 중국계 (open) | `z-ai/glm-5.1` | 0.708 |
| xAI | `x-ai/grok-4.20` | 0.753 |

→ 흥미롭게도 **Grok 4.20 이 GPT-5.4 와 1%p 이내 동급 성능**. Kimi-K2 family 도 Sonnet 4.6 수준. open-source 클래스 (z-ai glm-5) 도 0.708로 frontier 와 -5%p 정도 차이.

### 4. Bottom — 작은 nano 모델 + nemotron

`upstage/solar-pro-3` 0.614, `nvidia/nemotron-3-nano-30b-a3b` 0.617 — 30B 이하 모델은 한국어 RAG 정확도에서 -10%p 이상 격차.

## 방법론

### Anthropic Opus 4.7 → 4.6 fallback (128건 / 40,792)

Q3와 동일 패턴 — `q142`, `q240`, `q258` 등 의료/정책 질문의 cand 답변에 대해 Opus 4.7 이 `stop_reason: refusal` 반환.

11가지 우회 (system disclaimer, adaptive thinking, prompt reformulation, backtick wrapping 5변형, prefilling 등) 모두 실패. → 동일 prompt를 `claude-opus-4-6` 으로 호출해 정상 score 획득.

분석 시 표기: "Opus 4.7 (~128/40,792 items: 4.6 fallback for safety refusals on q142/q240/q258)".

### Empty cand 16 pair 재평가

7개 cand 파일에서 일부 qid 의 첫 entry 가 빈 답변 (`""`) — 후속 retry entry 에 valid 답변 있는 것을 발견. 16 (cand, qid) pair 모두 8 judge × 4 metric = 512 calls 로 재평가.

영향 받은 cand:
- `moonshotai/kimi-k2.6`: q117, q140, q150, q206, q266
- `moonshotai/kimi-k2.5`: q113, q128
- `deepseek/deepseek-v4-pro`: q176, q231
- `minimax/minimax-m2.5`: q176
- `z-ai/glm-4.7-flash`: q067, q094, q168
- `z-ai/glm-4.7`: q243
- `z-ai/glm-5.1`: q104, q187

→ 본 매트릭스의 점수는 모두 **재평가 결과 반영**.

### gpt-5.4-pro q181, q223 재생성

cand 파일에 누락 (298/300). Responses API 로 직접 호출 (`reasoning effort=medium`) → 정상 답변 생성 후 8 judge × 4 metric = 64 calls.

### Sonnet 4.6 max_tokens 보정 (343건)

Q3와 동일 패턴 (max_tokens 64 부족) → 1024 로 retry, 100% 정상.

## 다음

- Q1 (로컬 cand × 로컬 judge) 결과는 [별도 글](/posts/rag-llm-judge-q1-local-cross-validation/) 참조.
- Q3 (로컬 cand × API judge) 는 [Q3 글](/posts/rag-llm-judge-q3-flagship-api-judges/) 참조.
- 4-quadrant 통합 비교는 [요약 글](/posts/rag-llm-judge-summary-4quadrant-matrix/) 참조.

자세한 fallback / supplemental 처리 내역: `results/phase5_judge_flagship/_Q4_FALLBACK_NOTES.md`.
