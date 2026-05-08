---
title: "Judge × Judge 상관관계 — 한국어 RAG 18 judge 합의/충돌/이상치 분석"
description: "Q1~Q4 cross-judge 매트릭스에서 18 개 LLM judge 간 Pearson correlation 을 측정. gpt-5.4-mini ↔ gemini-3.1-flash-lite-OR r=0.98 (중복), gemma4_31b ↔ nemotron-120b r=−0.71 (반대). solar-100b 는 다른 모든 judge 와 음의 상관. 최적 ensemble 4 시나리오 (cost vs trust) 도출."
pubDatetime: 2026-05-08T03:00:00.000Z
tags:
  - rag
  - llm-judge
  - evaluation
  - korean-nlp
  - statistics
featured: false
draft: false
---

## 요약

- **목적**: 18 judge 의 cand-level accuracy 가 서로 얼마나 일치/충돌하는지 측정. judge ensemble 선택의 정량 근거.
- **방법**: 각 judge 의 cand × accuracy 벡터에 대해 모든 pair Pearson correlation 계산 (n ≥ 10 만 유효).
- **핵심 발견**:
  1. 소형 API judge (`gpt-5.4-mini`, `gemini-3.1-flash-lite-OR`, `gpt-5.4`) 끼리 **r ≈ 0.98** — 사실상 동일 평가
  2. OSS judge `gemma4_31b` ↔ `nemotron-120b` **r = −0.71** — 거의 반대 ranking 산출
  3. `solar-open-100b` 의 다른 judge 와 평균 corr = **−0.137** (음수) — outlier
  4. 가장 합의 강한 judge: `gpt-5.4`, `gemini-3-flash-preview`, `claude-opus-4-7` 모두 avg_r ≈ 0.70

## 통제 변수 (이전 Q1~Q4 시리즈와 동일)

- 데이터: allganize `RAG-Evaluation-Dataset-KO` 300 Q&A × 58 PDF
- 메트릭: 4-metric majority(≥2/4) → O/X → accuracy
- Cand: 12 local + 34 API = **46 cand**
- Judge: 8 OSS (Q1+Q2) + 9 API (Q3+Q4) + 1 OSS distill (qwen3.5-27b-claude-distill) = **18 judge**
- 각 judge 가 채점한 cand 의 accuracy 를 변수로 사용

## 1. Top 5 가장 비슷한 judge pair (중복)

| Pair | r | n | 해석 |
| --- | ---:| ---:| --- |
| `gpt-5.4-mini` ↔ `gemini-3.1-flash-lite-OR` | **+0.980** | 46 | 소형 API 끼리 거의 동일 |
| `gpt-5.4` ↔ `gemini-3-flash-preview` | **+0.979** | 46 | 중급 API 끼리 동일 |
| `gpt-5.5` ↔ `gemini-3-flash-preview` | +0.977 | 46 | gpt-5.5 ≈ gemini-flash |
| `gpt-5.4` ↔ `gpt-5.5` | +0.971 | 46 | 같은 family, 예상대로 |
| `gpt-5.4` ↔ `gemini-3.1-flash-lite-OR` | +0.971 | 46 | cross-family 동일 |

**시사점**: 비용 절감 목적의 ensemble 에서 위 5 페어 중 어느 것도 두 judge 같이 쓸 가치 없음 — 한 judge 만 선택하면 충분.

## 2. Top 5 가장 다른 judge pair (의견 충돌)

| Pair | r | n | 해석 |
| --- | ---:| ---:| --- |
| `gemma4_31b` ↔ `nemotron-120b` | **−0.712** | 40 | gemma4 가 좋다고 한 cand 를 nemotron 은 나쁘다고 판정 |
| `gemma4_31b` ↔ `qwen3.6-35b-a3b` | **−0.647** | 41 | gemma4 와 qwen3.6 이 반대 ranking |
| `qwen3.5-27b-distill` ↔ `solar-100b` | −0.374 | 22 | severity 차이 영향 |
| `gemma4_31b` ↔ `solar-100b` | −0.324 | 22 | severity gap |
| `nemotron-120b` ↔ `qwen3.5-27b-distill` | −0.349 | 45 | nemotron 너그러움 vs distill 깐깐 |

**시사점**: OSS judge ensemble 시 분산이 매우 큼. 단순 평균하면 noise 만 증가. **severity-corrected accuracy** 또는 **rank-based RRF** 필수.

## 3. Judge isolation — 다른 judge 와 합의 약한 outlier

각 judge 의 다른 17 judge 와 평균 corr.

| Judge | avg corr | 해석 |
| --- | ---:| --- |
| `solar-open-100b` | **−0.137** | 음의 상관 평균 — 다른 judge 와 정반대 ranking |
| `gemma4_31b` | +0.022 | random 에 가까움 |
| `qwen3-next-80b` | +0.113 | severity 가장 깐깐, 다른 judge 와 동의 약함 |
| `qwen3.5-27b-distill` | +0.300 | 일부 OSS 와 충돌 |
| `nemotron-120b` | +0.447 | 너그러움, 부분 outlier |

**시사점**: `solar-open-100b`, `gemma4_31b` 단독 judge mode 위험. 단일 사용 시 cand ranking 이 완전히 뒤집힐 수 있음.

## 4. Best consensus judge — 다른 judge 와 합의 강함

| Judge | avg corr | 권장 |
| --- | ---:| --- |
| `gpt-5.4` | **+0.702** | 가장 신뢰 — global consensus 와 가장 유사 |
| `gemini-3-flash-preview` | +0.701 | 비용 대비 안정 |
| `claude-opus-4-7` | +0.699 | 학술 baseline |
| `gpt-5.5` | +0.698 | 신모델 안정 |
| `gemini-3.1-flash-lite-OR` | +0.696 | OR 비용 절감 |

→ **단일 judge 선택 시**: `gpt-5.4` 또는 `claude-opus-4-7` 추천 (avg_r ≈ 0.70 → 다른 judge 결과 예측력 높음).

## 5. Optimal ensemble — 4 시나리오 비교

목표: 3 judge 를 골라 ① 비용 최소 ② 합의 강함 ③ 다양성 확보

| Ensemble | Judges | avg pair corr | Q4 풀평가 cost | trust |
| --- | --- | ---:| ---:| :-:|
| **All API premium** | claude-opus-4-7 + gpt-5.4 + gemini-3.1-pro | 0.71 | $400 | A |
| **Cost-optimized API** | gpt-5.4 + gemini-3-flash + gpt-5.4-mini | 0.97 | $80 | B (중복) |
| **Mixed family** ⭐ | claude-opus-4-7 + gpt-5.4 + qwen3.5-27b-distill | 0.78 | **$280** | A |
| **OSS-only** | qwen3.5-27b-distill + qwen3.5_122b + nemotron-120b | 0.65 | **$0** | A* |

\* OSS-only: severity-corrected accuracy 적용 시 trust=A. raw accuracy 는 분산 큼.

→ **최강 가성비**: Mixed family. claude/gpt API + qwen3.5-27b-distill OSS 의 3 judge 조합. corr 0.78 (적당히 비슷, 적당히 다양), 비용 30% 절감 ($400 → $280).

→ **연속 모니터링 (cron)**: OSS-only 가능. severity correction + RRF ranking 사용 시 quality A 유지, $0 비용.

## 6. 실용 권장사항

### 6-1. 절대 피해야 할 setup

- **단일 OSS judge**: `solar-100b` 단독 → ranking 완전 왜곡. `gemma4_31b` 단독 → random 에 가까움.
- **소형 API judge 중복 ensemble**: `gpt-5.4-mini + gemini-3.1-flash-lite-OR` 동시 사용 → 비용만 2x, 정보 0
- **Self-family 단독**: claude-opus judge × claude cand → +22%p bias (Q4 분석 참조)

### 6-2. 시나리오별 추천

| 시나리오 | 권장 ensemble |
| --- | --- |
| **개발 단계, $$$** | All API premium (claude-opus + gpt-5.4 + gemini-pro) |
| **개발 단계, 비용 절감** | Mixed family (claude-opus + gpt-5.4 + qwen3.5-27b-distill) |
| **연속 모니터링 / cron** | qwen3.5-27b-distill 단일 ($0/일) — avg_r 0.30 이지만 API median 과 가까움 |
| **emergency / 빠른 측정** | qwen3.6-35b-a3b 단일 — 너그럽지만 trend 추적 가능 |
| **연구 논문 publish** | Mixed family ensemble + RRF + severity-corrected accuracy + judge별 분포 보고 |

### 6-3. 연구 publish 시 보고 권장 항목

1. ensemble 구성 (≥3 judge, ≥2 family)
2. 각 judge 별 cand accuracy 표 + severity (mean acc)
3. Pairwise correlation matrix
4. Final ranking: RRF score + 1-judge 단순 평균 (둘 다)
5. severity-corrected accuracy (z-score 정규화 후 평균)

## 한계

- **n=46 cand 만**: corr estimate 의 표준오차 약 ±0.10. r=−0.71 정도는 유의하지만 r=−0.32 는 noise 가능.
- **Q1-only judge** (`supergemma4-26b`, `qwen3.6-35b-a3b` 일부): n=12 로 small sample, corr estimate noisy.
- **Q2 진행 중 (89%)**: `gemma4_31b` (24/46), `solar-100b` (10/46), `supergemma4-26b` (12/46) 의 corr 은 잠정값. 완료 후 갱신 예정.
- **task asymmetry**: Q1 (local cand) 과 Q4 (API cand) 가 분포 다름. judge 가 두 cand set 모두 채점한 경우만 corr 유효.

## 재현

```bash
# Q1~Q4 결과 sync 후
python3 scripts/build_html_unified.py
# correlation 분석은 위 스크립트의 corr matrix dump 참조
```

전체 raw:

- `results/phase5_judge_consolidated/judge_*.json` (Q1+Q2)
- `results/phase5_judge_flagship/q3_*_summary.json`, `q4_*_summary.json` (Q3+Q4)
- 통합 HTML: `results/RAG_EVAL_MATRIX_UNIFIED.html` (5 metric tables × 46 cand × 18 judge)

---

이전 글:

- [4-Quadrant 종합 — RRF 통합 cross-judge ranking](/blog/rag-llm-judge-summary-4quadrant-matrix)
- [Q4 — API LLM 답변 34종을 API judge 8종이 채점한 self-evaluation 매트릭스](/blog/rag-llm-judge-q4-api-self-evaluation)
- [Q3 — 로컬 LLM 답변을 API flagship judge 9종이 채점한 결과](/blog/rag-llm-judge-q3-flagship-api-judges)
- [Q1 — 로컬 LLM 8종이 로컬 LLM 12종을 채점하는 cross-validation](/blog/rag-llm-judge-q1-local-cross-validation)
