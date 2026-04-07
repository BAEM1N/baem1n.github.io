---
author: baem1n
pubDatetime: 2026-04-07T09:00:00.000+09:00
modDatetime: 2026-04-08T01:00:00.000+09:00
title: "Qwen3.5 로컬 추론 벤치마크 결과표: 3대 하드웨어 × 4개 엔진, 4,700회 측정"
description: "RTX 3090×2, DGX Spark GB10, Ryzen AI MAX 395에서 Qwen3.5 4개 모델(9B~122B)의 생성 속도, 프리필 속도, TTFT를 llama.cpp, Ollama, vLLM, Lemonade로 측정한 결과 비교표."
tags:
  - llm
  - benchmark
  - nvidia
  - amd
  - qwen
  - inference
  - local-llm
featured: true
aiAssisted: true
---

> Qwen3.5 모델을 3대 하드웨어에서 동일 조건으로 측정한 결과표. cold prefill, cache 차단, 실행 순서 랜덤화 적용. 각 조합 5회 측정 중앙값.
>
> 실험 설계 → [1편: 방법론](/posts/llm-bench-01-methodology) · 분석 → [2편: 상세 비교](/posts/llm-bench-02-results) · 코드 → [GitHub](https://github.com/baem1n/llm-bench)

## Table of contents

## 하드웨어

| | RTX 3090×2 (48GB) | DGX Spark GB10 (128GB) | Ryzen AI MAX 395 (96GB) |
|--|:--:|:--:|:--:|
| GPU | RTX 3090 ×2 (Ampere) | GB10 Blackwell | Radeon 8060S (RDNA 3.5) |
| 메모리 | 128GB DDR4 + 48GB VRAM | 128GB unified | 128GB unified (96GB VRAM) |
| 대역폭 | ~936 GB/s (GDDR6X) | 273 GB/s | 256 GB/s |
| 가격대 | ~$3,000 (중고) | ~$4,700 | ~$2,000 |

---

## 생성 속도 (Generation TPS)

> 동일 llama.cpp + 동일 GGUF. 입력 64토큰, 출력 512토큰.

### Q4_K_M (4-bit 양자화)

| 모델 | RTX 3090×2 | DGX Spark GB10 | Ryzen AI MAX 395 |
|------|----------:|---------------:|------------------:|
| **Qwen3.5-9B** (Dense) | **117.6** | 36.8 | 32.6 |
| **Qwen3.5-27B** (Dense) | **41.4** | 11.5 | 10.3 |
| **Qwen3.5-35B-A3B** (MoE, 3B active) | **138.9** | 59.6 | 58.0 |
| **Qwen3.5-122B-A10B** (MoE, 10B active) | OOM | 21.7 | **22.9** |

### Q8_0 (8-bit 양자화)

| 모델 | RTX 3090×2 | DGX Spark GB10 | Ryzen AI MAX 395 |
|------|----------:|---------------:|------------------:|
| **9B** | **82.2** | 24.3 | 21.7 |
| **27B** | **27.5** | 7.6 | 7.1 |
| **35B-A3B** MoE | **130.3** | 52.6 | 50.8 |

> 122B Q8_0은 GGUF 미제공.

---

## 프리필 속도 (Prefill TPS)

> llama.cpp, Q4_K_M. 단위: tok/s.

### Qwen3.5-9B

| 입력 길이 | RTX 3090×2 | DGX Spark | Ryzen AI |
|----------|----------:|----------:|---------:|
| 1K tokens | **3,258** | 2,217 | 205 |
| 4K | **5,317** | 2,490 | 278 |
| 16K | **6,244** | 2,239 | 915 |
| 64K | **5,827** | 1,093 | 159 |
| 128K | **4,952** | 986 | 56 |

### Qwen3.5-35B-A3B (MoE)

| 입력 길이 | RTX 3090×2 | DGX Spark | Ryzen AI |
|----------|----------:|----------:|---------:|
| 1K | **3,372** | 1,602 | 732 |
| 16K | **6,131** | 1,696 | 960 |
| 128K | **3,142** | 856 | 582 |

### Qwen3.5-122B-A10B (MoE)

| 입력 길이 | RTX 3090×2 | DGX Spark | Ryzen AI |
|----------|----------:|----------:|---------:|
| 1K | OOM | **536** | 215 |
| 16K | OOM | **614** | 312 |
| 128K | OOM | **341** | 205 |

---

## 엔진 비교 (Generation TPS, gen-512, Q4_K_M)

> 같은 하드웨어 안에서만 비교. 다른 하드웨어의 다른 엔진끼리는 비교하지 않음.

### RTX 3090×2

| 모델 | llama.cpp | Ollama | vLLM GPTQ |
|------|----------:|-------:|----------:|
| 9B | **117.3** | 100.5 | 83.6 |
| 27B | **41.5** | 36.7 | 19.3 |
| 35B-A3B | 138.6 | 101.7 | **156.3** |
| 122B | — | 4.7 🚫 | — |

### DGX Spark GB10

| 모델 | llama.cpp | Ollama | vLLM Docker |
|------|----------:|-------:|------------:|
| 9B | **35.7** | 35.1 | 12.9 |
| 27B | **11.5** | 11.4 | 8.5 |
| 35B-A3B | **61.2** | 59.2 | 34.8 |
| 122B | **22.0** | 6.6 | — |

### Ryzen AI MAX 395

| 모델 | llama.cpp | Ollama | Lemonade |
|------|----------:|-------:|---------:|
| 9B | **36.2** | 31.9 | 6.5 |
| 27B | **12.3** | 11.1 | 11.4 |
| 35B-A3B | **58.4** | 43.9 | 48.0 |
| 122B | **22.8** | 4.6 🚫 | — |

---

## 프리필 엔진 비교 (prefill-16k, Q4_K_M, tok/s)

| 엔진 × 하드웨어 | 9B | 27B | 35B MoE | 122B MoE |
|----------------|---:|----:|--------:|---------:|
| **3090 vLLM** | 8,398 | 2,845 | **13,146** | — |
| 3090 llama.cpp | 6,236 | 1,799 | 4,186 | — |
| 3090 Ollama | 3,101 | 998 | 2,239 | 141 |
| DGX vLLM Docker | 6,773 | 1,614 | 4,331 | — |
| DGX llama.cpp | 2,236 | 625 | 1,694 | 623 |
| DGX Ollama | 1,904 | 601 | 1,424 | 507 |
| Ryzen llama.cpp | 915 | 298 | 960 | 313 |
| Ryzen Ollama | 880 | 287 | 754 | — |

---

## MoE 효율

35B-A3B MoE(3B active)는 **전 플랫폼에서** 9B Dense보다 빠르다:

| 하드웨어 | 9B Dense | 35B MoE | MoE 우위 |
|---------|----------|---------|---------|
| RTX 3090×2 | 117.6 | **138.9** | +18% |
| DGX Spark | 36.8 | **59.6** | +62% |
| Ryzen AI | 32.6 | **58.0** | +78% |

122B MoE(10B active)도 27B Dense보다 빠르다:

| 하드웨어 | 27B Dense | 122B MoE | MoE 우위 |
|---------|-----------|----------|---------|
| DGX Spark | 11.5 | **21.7** | +89% |
| Ryzen AI | 10.3 | **22.9** | +122% |

---

## OOM / 실패

| 하드웨어 | 조합 | 사유 |
|---------|------|------|
| 3090×2 | 122B llamacpp (gen OK, prefill OOM) | 48GB VRAM + 256K KV cache 초과 |
| 3090×2 | vLLM 27B/35B Q8 BF16 | BF16 55~70GB > 48GB VRAM |
| 3090×2 | Ollama 122B (4.7 tok/s) | VRAM swap |
| Ryzen AI | Ollama 122B (4.6 tok/s) | KV pre-allocation swap |

---

## 데이터

- **총 측정**: ~4,700회 (중복·이상치 제거 후 ~3,900회 유효)
- **조합당**: 5회 측정, 중앙값
- **필터**: CV(변동계수) < 0.3인 가장 안정적인 5회 세트
- **캐시**: `--no-cache-prompt`, `--slot-prompt-similarity 0`, run별 nonce prefix
- **cold prefill**: prefill track마다 서버 재시작

> 실험 코드: [baem1n/llm-bench](https://github.com/baem1n/llm-bench)
