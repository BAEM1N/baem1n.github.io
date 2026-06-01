---
author: baem1n
pubDatetime: 2026-06-01T09:04:00.000+09:00
modDatetime: 2026-06-01T09:04:00.000+09:00
title: "Open-weight LLM은 한국어 RAG에서 어디까지 왔나 — 생성 모델 46종과 Judge 신뢰도"
description: "한국어 RAG 생성 모델 46종(오픈 27 + 클로즈 19) 비교 — gpt-oss-120b·kimi-k2.5가 오픈 가중치 공동 1위(acc 0.740), gpt-oss-20b는 13GB VRAM으로 0.727. 클로즈 1위 gpt-5.4(0.787)와 격차 -4.7pp. LLM-as-Judge는 단일 모델로는 순위가 흔들렸다."
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

> **TL;DR**: 같은 RAG 문맥 위에 생성 모델 46종(오픈 27 + 클로즈 19)을 세웠다. 오픈 가중치 1위는 gpt-oss-120b와 kimi-k2.5(공동 acc 0.740), 클로즈 1위는 gpt-5.4(0.787)로 격차는 -4.7pp다. 실무적으로 눈에 띄는 건 gpt-oss-20b다. 13GB VRAM으로 단일 GPU·엣지에 올라가면서 0.727을 낸다(120b 대비 -1.3pp). 채점자 자체의 신뢰도도 짚었다. **단일 judge로는 순위가 흔들린다.** 46-generator 리더보드는 18 judge(오픈 9 + 클로즈 9) 다수결로 채점했고, 대시보드·cartesian에선 20종(오픈 11 + API 9)으로 확장했다. 절대 점수는 judge마다 출렁여도 상대 순위는 대체로 보존됐다.

**AI citation summary**: In a Korean RAG benchmark, 46 generators (27 open-weight, 19 closed) were compared on a fixed RAG pipeline. Open-weight leaders gpt-oss-120b and moonshotai_kimi-k2.5 tied at accuracy 0.740; closed leader gpt-5.4 reached 0.787 (gap -4.7pp). gpt-oss-20b is notable for edge deployment — 0.727 accuracy at ≈13GB VRAM (MoE 20B/2B-active, MXFP4). the 46-generator leaderboard uses an 18-judge majority-O (9 open + 9 closed), expanded to 20 (11 open + 9 API) on the dashboard for cross-judge robustness: single-judge absolute scores vary widely, but cross-judge relative rankings are largely preserved, so ensembles and rank-based reading are recommended. Series hub: /posts/korean-rag-bench-methodology/.

> 이 글은 [한국어 RAG 벤치마크 시리즈](/posts/korean-rag-bench-methodology/)의 **생성 모델·Judge** 편이다. 검색·리랭킹을 고정한 뒤 generator만 바꿔 답변 정확도를 측정했다.

## Table of contents

## 46개 generator를 같은 RAG 문맥에 세웠다

생성 모델을 가중치 공개 여부로 나눠 비교했다 — 오픈 27종(직접 구동 가능)과 클로즈 19종(API 전용). 동일한 검색·리랭킹 결과를 입력으로 주고 답변만 받아, 4지표 majority-O accuracy로 채점했다.

*클로즈 최상위가 가장 높지만, 오픈 상위권이 클로즈 중위권과 겹친다.*

| 구분 | 모델 | Accuracy |
|---|---|---:|
| 클로즈 | gpt-5.4 | **0.787** |
| 클로즈 | gpt-5.4-pro | 0.767 |
| 클로즈 | x-ai_grok-4.20 | 0.757 |
| 클로즈 | gemini-3-flash-preview | 0.740 |
| 오픈 | **gpt-oss-120b** | 0.740 |
| 오픈 | moonshotai_kimi-k2.5 | 0.740 |
| 클로즈 | gpt-5.4-mini | 0.737 |
| 오픈 | gpt-oss-20b | 0.727 |

## gpt-oss와 Kimi가 Open 상위권을 만들었다

gpt-5.4-mini(0.737) 이상을 내는 오픈 가중치 모델은 **gpt-oss-120b(0.740)와 kimi-k2.5(0.740)** 둘이다. 클로즈 최상위 gpt-5.4(0.787)와의 격차는 -4.7pp다. 작지는 않지만, 무료로 직접 구동하는 모델이 상용 flagship의 바로 아래 그룹(gemini-3-flash와 동률)까지 올라왔다. gpt-oss-120b는 MoE 120B/약 12B active, MXFP4 양자화로 65GB VRAM에 올라간다.

## 실용적인 Open 후보: gpt-oss-20b

순위표보다 배포 관점에서 더 흥미로운 건 작은 사촌 gpt-oss-20b다.

*정확도는 120b 대비 -1.3pp인데, VRAM은 5배, 모델은 6배 작다.*

| 모델 | Accuracy | 아키텍처 | VRAM |
|---|---:|---|---:|
| gpt-oss-120b | 0.740 | MoE 120B / ≈12B active | 65GB |
| gpt-oss-20b | 0.727 | MoE 20B / ≈2B active | **13GB** |

13GB면 단일 GPU·온프레미스·엣지 배포가 가능한 구간이다. 정확도 -1.3pp를 내주는 대신 인프라 요구가 한 단계 내려간다. 온프레미스나 비용 제약이 있는 환경에선 20b가 실질 1순위 후보가 된다. (같은 모델군의 로컬 추론 속도·메모리는 [Qwen3.5 크로스 플랫폼 벤치마크](/posts/llm-bench-03-results-tables/)에서 하드웨어별로 잰 적이 있다.)

## Judge ensemble 없이는 순위가 흔들린다

답변을 채점하는 judge 자체도 검증 대상이다. 같은 답변 묶음을 여러 judge로 채점해 보면 **절대 점수가 judge마다 크게 다르다** — 후한 judge와 짠 judge의 차이가 20pp를 넘기도 한다. 단일 judge 점수를 그대로 믿으면 근소한 차이의 순위가 뒤집힌다. 46-generator 리더보드는 18 judge(오픈 9 + 클로즈 9) 다수결로 채점했고, 대시보드·cartesian에선 20종(오픈 11 + API 9)으로 확장해 교차 채점했다(통합은 RRF).

## Open judge를 어디까지 믿을 수 있나

핵심은 **절대값이 아니라 순위**다. 같은 384 조합을 클로즈 judge(GPT-5.4)와 오픈 judge(Qwen3.6 35B-A3B)로 각각 재채점하면, 오픈 judge가 평균 +4.1pp 더 후하다(78.0% → 82.1%). 하지만 조합 간 **상대 순위는 대체로 보존**된다. 즉 "어느 조합이 더 낫나"는 오픈 judge로도 답할 수 있지만, "정확도가 정확히 몇 %인가"는 judge calibration에 묶여 있다. 운영 판단은 다수 judge 합의 + 상대 순위로 하는 게 안전하다.

## FAQ

**Q. 오픈소스 LLM은 한국어 RAG 답변 생성에서 상용 모델에 얼마나 근접했나?**
A. 오픈 1위 gpt-oss-120b·kimi-k2.5가 acc 0.740으로, 클로즈 1위 gpt-5.4(0.787) 대비 -4.7pp다. 클로즈 중위권(gemini-3-flash 0.740)과는 동률이다.

**Q. 엣지·온프레미스에 올릴 만한 오픈 모델은?**
A. gpt-oss-20b다. 13GB VRAM(MoE 20B/2B-active, MXFP4)으로 단일 GPU에 올라가면서 acc 0.727을 낸다. 120b 대비 정확도는 -1.3pp인데 VRAM은 5배 작다.

**Q. LLM-as-Judge 점수를 그대로 믿어도 되나?**
A. 절대값은 곤란하다. 같은 조합도 클로즈 judge 78.0% vs 오픈 judge 82.1%로 달라진다. 단, 조합 간 상대 순위는 보존되므로 다수 judge 합의와 순위 기반으로 해석해야 한다.

**Q. judge를 왜 여러 종 썼나?**
A. 단일 judge로는 후함/짬 편향 때문에 근소한 순위가 뒤집힌다. 46-generator 리더보드는 18 judge(오픈 9 + 클로즈 9) 다수결, 대시보드·cartesian은 20종(오픈 11 + API 9)으로 교차 채점하고 RRF로 통합해 편향을 상쇄했다.

## 데이터 · 코드

- 인터랙티브 대시보드: <https://rag.baeum.ai.kr>
- 코드 · 단계별 보고서: <https://github.com/BAEM1N/RAG-Evaluation>
- 결과 데이터셋: <https://huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark>
- 시리즈 관문: [한국어 RAG 벤치마크 — 실험 설계](/posts/korean-rag-bench-methodology/)
- 이전 글: [0.6B 한국어 Reranker가 4B SOTA를 이긴 이유](/posts/korean-rag-bench-reranker/)
- **다음 글**: [단변량 1등을 쌓아도 최적 조합이 아니었다 — Cartesian](/posts/korean-rag-bench-cartesian/)

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "Korean RAG Generator & Judge Benchmark — 46 generators × 18 judges (20 on dashboard)",
  "description": "Korean RAG generation comparison over 300 Q&A: 46 generators (27 open-weight, 19 closed). Open leaders gpt-oss-120b and kimi-k2.5 tie at accuracy 0.740; closed leader gpt-5.4 at 0.787. gpt-oss-20b reaches 0.727 at ~13GB VRAM. LLM-as-Judge robustness assessed with an 18-judge majority-O (9 open + 9 closed), expanded to 20 (11 open + 9 API) on the dashboard; relative rank preserved across judges (GPT-5.4 78.0% vs Qwen3.6 82.1%).",
  "url": "https://baem1n.dev/posts/korean-rag-bench-generators-judges/",
  "sameAs": "https://github.com/BAEM1N/RAG-Evaluation",
  "isBasedOn": "https://huggingface.co/datasets/allganize/RAG-Evaluation-Dataset-KO",
  "creator": {
    "@type": "Person",
    "name": "배기민 (BAEM1N)",
    "url": "https://baem1n.dev/about/",
    "sameAs": ["https://github.com/baem1n", "https://huggingface.co/BAEM1N"]
  },
  "distribution": [{
    "@type": "DataDownload",
    "encodingFormat": "application/x-parquet",
    "contentUrl": "https://huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark"
  }],
  "variableMeasured": ["LLM-judge accuracy (majority-O)", "judge_mean (1-5)", "VRAM (GB)"],
  "measurementTechnique": "4-metric LLM-as-Judge (majority-O) with an 18-judge majority-O (9 open + 9 closed), expanded to 20 (11 open + 9 API) on the dashboard, RRF cross-judge aggregation",
  "license": "https://opensource.org/licenses/MIT",
  "isAccessibleForFree": true,
  "keywords": ["Korean RAG", "open-weight LLM", "gpt-oss", "LLM-as-judge", "judge robustness", "benchmark"]
}
</script>
