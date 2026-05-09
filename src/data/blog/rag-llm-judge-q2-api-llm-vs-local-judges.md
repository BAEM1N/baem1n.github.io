---
title: "Q2 — API LLM 답변 34종을 로컬 judge 8종이 채점한 결과"
description: "OpenAI 4 + Anthropic 6 + Google 5 + OpenRouter 19 = 34개 API LLM 답변을 8개 로컬 judge로 cross-check. 326,400 calls 중 263/272 cells (96.7%) 완료. ai395 + spark + lianli 3대 분산. 결과: 로컬 OSS judge 만으로도 API judge와 ranking 일치도 r ≈ 0.70 도달."
pubDatetime: 2026-04-27T12:01:00.000Z
tags:
  - rag
  - llm-judge
  - evaluation
  - korean-nlp
featured: false
draft: true
---

## 요약

- **목적**: API 비용 0 (local-only) 으로 API LLM 답변 품질을 cross-check.
- **규모**: 8 judges × 34 candidates × 4 metric × 300 Q = **326,400 judge calls**.
- **상태**: **263/272 cells (96.7%) 완료** (solar-100b 만 21/34 진행 중, ai395 5일 ETA).
- **환경 분배 (실측)**: ai395 (RTX A6000 48GB) / spark (DGX GB10 124GB) / lianli (RTX 3090 24GB) 3대 분산.
- **핵심 발견**: 로컬 8 judge 모두 API judge 와 ranking 일치도 높음. **OSS-only ensemble 로 API 평가 대체 가능성** 입증.

## 진행 환경 (최종)

| 환경      | GPU/RAM                                      | 담당 judge (모델, 시간/cand) |
| --------- | -------------------------------------------- | ---------------------------- |
| **ai395** | RTX A6000 48GB, RAM 256GB                    | qwen3-next:80b (50GB, 4h), solar-open-100b (62GB, 6h) |
| **spark** | DGX GB10 124GB unified                       | nemotron-120b (61GB, 18min), qwen3.5_122b-a10b (81GB, 20min), gemma4_31b (19GB, 36min), supergemma4-26b (16GB, 18min) |
| **lianli**| RTX 3090 × 2 (48GB)                          | qwen3.6-35b-a3b-q4_K_M (23GB, 6min), qwen3.5_35b-a3b-q4_K_M (23GB, Q1 only) |

> **DGX Spark 효과**: ai395 추정 24일 → spark 인계로 **1.5일 단축**. nemotron-120b/qwen3.5_122b/gemma4/supergemma4 4 phase 모두 spark 처리.

### 사고 + 복구 기록

1. **ollama multi-part GGUF 미지원**: nemotron 64GB GGUF 가 3-part split → ollama create 시 일부만 로드 → 모든 응답 빈 응답 → broken 7개. **llama-server 로 전환** 후 정상화.
2. **chain wrapper false-positive**: skip 스크립트가 rsync 명령줄을 nemotron 시작으로 오판 → chain1 즉시 kill → chain2 가 supergemma4 잘못 트리거 → 30초 만에 broken 34개 생성. **즉시 삭제 + phase2_resume 재시작**.
3. **gemma4 broken 3개**: gemini cand 3종 (flash / pro / pro-thinking) 가 acc 0.06–0.09 (다른 judge 0.45–1.00). PARALLEL=2 로 낮춰 재실행 → 정상화.

→ 모든 사고 즉시 검출 + 손상 데이터 삭제 + 재실행. **최종 데이터 무결성 검증 완료**.

## 결과: judge 별 mean accuracy

API cand 34종에 대한 평균 accuracy. **judge severity** 분포가 0.39 까지 벌어짐.

| Judge | mean acc | 해석 |
| --- | ---:| --- |
| **solar-open-100b** | **0.870** (n=22) | 너무 후함 — outlier |
| qwen3.6-35b-a3b | 0.788 | 후함 |
| nemotron-120b | 0.731 | 후함 |
| supergemma4-26b | 0.701 | 평균 |
| qwen3.5_35b-a3b-q4_K_M | 0.684 | 평균 |
| qwen3.5_122b-a10b-q4_K_M | 0.680 | 평균 |
| qwen3.5-27b-claude-distill | 0.619 | 깐깐, **API median 매우 근접** ⭐ |
| gemma4_31b | 0.606 | 깐깐 |
| **qwen3-next-80b** | **0.482** | **가장 깐깐** |

→ severity 분산 0.39 (solar 0.87 ↔ qwen3-next 0.48). 단일 judge 사용 시 cand ranking 이 뒤집힐 수 있음. **3+ judge ensemble 필수**.

## API judge 와 비교 — OSS judge 가 충분한가?

각 judge 의 cand × accuracy 벡터에 대해 Pearson correlation 계산 (상세는 [Judge correlation 분석 글](/posts/rag-llm-judge-correlation-analysis/) 참고).

| OSS judge | API judge median 과 correlation | 비용 (Q2 풀평가) |
| --- | ---:| ---:|
| **qwen3.5-27b-claude-distill** | **r = 0.97** | $0 |
| qwen3.5_122b-a10b-q4_K_M | r = 0.92 | $0 |
| nemotron-120b | r = 0.85 | $0 |
| qwen3.6-35b-a3b | r = 0.85 | $0 |
| supergemma4-26b | r = 0.82 | $0 |
| gemma4_31b | r = 0.74 | $0 |
| qwen3-next-80b | r = 0.71 | $0 |
| solar-open-100b | r = 0.65 (severity outlier) | $0 |

> **핵심 결론**: `qwen3.5-27b-claude-distill` 27B 모델이 **r = 0.97** 로 API judge median 과 사실상 같은 ranking 산출. 비용 $0 + 24GB GPU 에서 7시간/34 cand. **연속 모니터링 / cron 평가에 최적**.

## Top 12 cand (8 OSS judge 평균)

| Rank | Cand | OSS-judge avg | type |
| ---:| --- | ---:| --- |
| 1 | gpt-5.4-pro | 0.732 | API |
| 2 | gpt-5.4 | 0.728 | API |
| 3 | x-ai/grok-4.20 | 0.722 | API |
| 4 | claude-sonnet-4-6 | 0.713 | API |
| 5 | gpt-5.4-mini | 0.710 | API |
| 6 | claude-opus-4-7 | 0.708 | API |
| 7 | moonshotai/kimi-k2.5 | 0.704 | API |
| 8 | gemini-3-pro-preview | 0.696 | API |
| 9 | gemini-3.1-pro-preview-thinking | 0.692 | API |
| 10 | claude-sonnet-4-6-thinking | 0.690 | API |
| 11 | claude-opus-4-7-thinking | 0.685 | API |
| 12 | deepseek/deepseek-v4-pro | 0.682 | API |

→ **top 12 가 Q4 (API judge 평가) ranking 과 거의 일치**. 단 RRF score 차이는 ±2~3% 이내.

## Q2 + Q4 ranking 비교 (cand 단위)

|  Rank diff | 의미 |
| --- | --- |
| 32/34 cand 가 ±2 등수 이내 | OSS judge 와 API judge 가 거의 같은 ranking |
| `claude-haiku-4-5` Q4=#30 → Q2=#28 | OSS judge 가 약간 더 너그러움 (severity diff) |
| `claude-sonnet-4-5` Q4=#20 → Q2=#22 | 동일 family thinking 모델 효과 |

→ **OSS-only Q2 ranking 으로 cand 선정 가능**. API 비용 절감 가능.

## 비용 효과

```
Q4 (API × API):       ~$280/평가 (8 judge × 34 cand × 4 metric × 300 Q)
Q2 (OSS × API):       $0 (전기료 + 시간만)
시간 비교:
  Q4: 8 batch ≈ 2-3일
  Q2: 6.5일 (ai395 solar 병목)
```

→ 시간이 더 걸리지만, **반복적 평가 (CI/CD 매주, A/B test) 시 누적 절감 효과 큼**.

## 다음

- **`solar-open-100b` 잔여 21 cand 완료** (ai395, ETA 5일) → 매트릭스 100% 완성
- **Q2 + Q4 통합 분석** 별도 글: [4-Quadrant 종합](/posts/rag-llm-judge-summary-4quadrant-matrix/)
- **Judge correlation 정량 분석**: [별도 글](/posts/rag-llm-judge-correlation-analysis/)

전체 raw: `results/phase5_judge_consolidated/judge_*.json` (Q1+Q2). 통합 HTML: `results/RAG_EVAL_MATRIX_UNIFIED.html` (322 KB, 18 judge × 46 cand).

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
