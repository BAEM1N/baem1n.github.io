---
author: baem1n
pubDatetime: 2026-04-03T00:00:00.000Z
title: "Qwen3.5 로컬 추론 벤치마크: MLX vs llama.cpp vs Ollama (M5 Max)"
description: "Qwen3.5 모델 4종을 M5 Max에서 3개 백엔드로 692회 측정한 생성/프리필 벤치마크 결과. MoE 모델의 효율성과 백엔드별 트레이드오프를 실험 데이터로 분석합니다."
tags:
  - llm
  - benchmark
  - mlx
  - ollama
  - apple-silicon
featured: true
---

> **TL;DR**: Qwen3.5-35B-A3B(MoE)는 MLX에서 **139 tok/s**로 27B Dense 대비 4.6배 빠르면서 메모리는 29%만 더 사용한다. 긴 컨텍스트 프리필은 llama.cpp Flash Attention이 MLX 대비 **204배** 빠르다. 로컬 LLM 추론에서 "어떤 백엔드를 쓸 것인가"는 생성 vs 프리필 어느 쪽이 중요한지에 따라 결정해야 한다.

## Table of contents

## 실험 개요

Apple Silicon Mac에서 LLM을 로컬 추론할 때 어떤 조합이 가장 효율적인지 측정했다.

| 항목 | 내용 |
|------|------|
| 하드웨어 | MacBook Pro 14 (M5 Max), 128GB Unified Memory |
| 모델 | Qwen3.5-9B, 27B, 35B-A3B(MoE), 122B-A10B(MoE) |
| 백엔드 | MLX 0.31.2, llama.cpp b8500, Ollama 0.18.2 |
| 양자화 | Q4_K_M (4-bit), Q8_0 (8-bit) |
| 총 측정 | 692회 (워밍업 제외) |

모든 모델은 Linear Attention + Full Attention 하이브리드(3:1 비율) 아키텍처를 사용한다. 순수 Self-Attention이 아니라는 점이 프리필 성능에 영향을 준다.

### 벤치마크 트랙

**생성 트랙** (입력 64토큰 고정, 출력 가변):

- gen-512, gen-2048, gen-4096, gen-8192

**프리필 트랙** (입력 가변, 출력 10토큰 고정):

- prefill-1k, prefill-4k, prefill-16k, prefill-64k, prefill-128k

### 측정 방법

- 워밍업 1회 (결과 제외) + 측정 5회, 중앙값 사용
- 열 보호: 85°C 도달 시 60초 쿨다운
- 인터 트랙 60초, 인터 모델 120초 대기

---

## 생성 성능 (Generation TPS)

### Q4_K_M (4-bit) 중앙값

| 모델 | 파라미터 | MLX | llama.cpp | Ollama |
|------|---------|----:|----------:|-------:|
| 9B (Dense) | 9B/9B | **97.4** | 68.0 | 53.2 |
| 27B (Dense) | 27B/27B | **31.9** | 23.4 | 17.9 |
| 35B-A3B (MoE) | 35B/3B | **138.9** | 93.6 | 60.0 |
| 122B-A10B (MoE) | 122B/10B | **63.5** | 39.4 | 27.9 |

> 단위: tokens/sec. 굵은 수치가 해당 모델 최고 성능.

**핵심 발견**: 35B-A3B는 총 파라미터 35B이지만 활성 파라미터가 3B에 불과해, 27B Dense보다 **4.6배 빠르면서** 메모리는 18.2GB(27B의 14.1GB 대비 +29%)만 사용한다.

### Q8_0 (8-bit) 중앙값

| 모델 | MLX (Q8) | MLX (Q4) | 속도 비율 |
|------|----------:|----------:|----------:|
| 9B | 58.7 | 97.4 | 0.60x |
| 27B | 18.4 | 31.9 | 0.58x |
| 35B-A3B | 99.7 | 138.9 | 0.72x |
| 122B-A10B | OOM | 63.5 | - |

Q4 → Q8 전환 시 30~42% 속도 하락. 122B Q8_0은 128GB 메모리를 초과해 모든 백엔드에서 OOM 발생.

---

## 메모리 사용량

### Q4_K_M Peak Memory (GB)

| 모델 | MLX | llama.cpp | Ollama | Ollama/MLX 비율 |
|------|----:|----------:|-------:|:---------:|
| 9B | **4.7** | 6.7 | 19.9 | 4.2x |
| 27B | **14.1** | 17.8 | 40.4 | 2.9x |
| 35B-A3B | **18.2** | 21.5 | 33.3 | 1.8x |
| 122B-A10B | **64.0** | 72.8 | 92.0 | 1.4x |

MLX가 일관되게 가장 적은 메모리를 사용한다. Ollama는 `num_ctx=262144` 설정으로 KV 캐시를 사전 할당하기 때문에 메모리 사용량이 크게 증가한다.

---

## 프리필 성능 (128K 컨텍스트)

긴 문서를 처리하는 RAG, 요약, 분석 워크로드의 핵심 지표다.

### 128K 입력 처리량 (tokens/sec)

| 모델 | llama.cpp | Ollama | MLX |
|------|----------:|-------:|----:|
| 9B | **574,324** | 61,717 | 2,797 |
| 27B | **436,715** | 33,698 | 1,729 |
| 35B-A3B | **568,545** | 58,415 | 2,963 |
| 122B-A10B | **488,661** | 27,749 | 1,136 |

llama.cpp의 Flash Attention이 압도적이다. MLX 대비 **204배**, Ollama 대비 **9.3배** 빠르다.

### 128K TTFT (Time To First Token)

| 모델 | llama.cpp | MLX | Ollama |
|------|----------:|----:|-------:|
| 9B | **229 ms** | 46,000+ ms | 2,000+ ms |
| 35B-A3B | **90 ms** | 274 ms | 9,175 ms |
| 122B-A10B | **167 ms** | 988 ms | 19,385 ms |

llama.cpp는 131K 토큰을 229ms에 처리한다. MLX는 동일 작업에 46초가 걸린다.

---

## 엔드투엔드 레이턴시 (8192토큰 생성)

실제 사용자 경험에 가장 가까운 지표다.

| 모델 | MLX | llama.cpp | Ollama |
|------|----:|----------:|-------:|
| 9B | 51.7s | 55.6s | 102.7s |
| 27B | 165.6s | 161.2s | 337.0s |
| 35B-A3B | **21.8s** | 55.3s | 85.8s |
| 122B-A10B | 50.8s | 123.0s | 176.9s |

35B-A3B + MLX 조합이 8K 토큰을 **21.8초**에 생성한다. 9B보다도 빠르다.

---

## 백엔드별 트레이드오프 정리

| 기준 | 최적 백엔드 | 이유 |
|------|-----------|------|
| 생성 속도 (tok/s) | **MLX** | Metal GPU 네이티브 최적화 |
| 긴 컨텍스트 프리필 | **llama.cpp** | Flash Attention (204x 차이) |
| 메모리 효율 | **MLX** | 온디맨드 KV 캐시 할당 |
| 설치/사용 편의성 | **Ollama** | 원커맨드 설치, API 서버 내장 |
| 짧은 TTFT | **llama.cpp** | Flash Attention + 최적화된 프롬프트 처리 |

### 실무 선택 가이드

**챗봇/대화형 서비스** → MLX + 35B-A3B (Q4_K_M)
- 생성 속도 최우선, 139 tok/s, 메모리 18.2GB

**RAG/문서 분석 (긴 입력)** → llama.cpp + Flash Attention
- 128K 프리필 229ms, 프리필 후 생성은 MLX보다 느리지만 총 레이턴시에서 유리

**프로토타이핑/API 서버** → Ollama
- 설치 간편, REST API 기본 제공, 성능은 타협

---

## MoE가 로컬 추론을 바꾸는 이유

이번 벤치마크의 가장 중요한 발견은 **MoE(Mixture of Experts) 모델의 효율성**이다.

Qwen3.5-35B-A3B는:

- 총 파라미터: 35B (모델 품질 결정)
- 활성 파라미터: 3B (추론 속도 결정)
- 결과: **27B Dense 품질 + 9B Dense 속도**

| 비교 | 27B Dense | 35B-A3B MoE | 차이 |
|------|-----------|-------------|------|
| 생성 TPS | 31.9 | 138.9 | **4.3x** |
| 메모리 | 14.1 GB | 18.2 GB | +29% |
| E2E (8K) | 165.6s | 21.8s | **7.6x** |

메모리 29% 추가 투자로 속도를 4~7배 얻는 구조다. 128GB Mac이라면 122B-A10B MoE(64GB, 63.5 tok/s)도 실용적이다.

---

## 주의사항

1. **가중치 소스 차이**: MLX는 mlx-community 4-bit, llama.cpp/Ollama는 unsloth GGUF를 사용. 순수 엔진 비교가 아니라 엔진+가중치 패키지 비교임
2. **Ollama KV 사전 할당**: `num_ctx=262144` 설정이 메모리 수치를 불리하게 만듦. 실 사용 시 더 낮은 컨텍스트로 설정하면 메모리 절감 가능
3. **Flash Attention 비대칭**: llama.cpp만 명시적 Flash Attention 지원. MLX는 미지원으로 16K+ 프리필에서 급격한 성능 저하
4. **Ollama TTFT 이상치**: TTFT가 max_tokens에 비례해 증가하는 현상 관찰. 프리필 트랙 데이터는 정상
5. **발열 쓰로틀링**: MacBook Pro 88°C 부근에서 쓰로틀링 발생. 일관된 냉각 환경에서는 결과가 달라질 수 있음

---

## 자주 묻는 질문

### M5 Max 128GB에서 가장 빠른 로컬 LLM 조합은?

생성 기준으로 **Qwen3.5-35B-A3B + MLX + Q4_K_M** 조합이 139 tok/s로 가장 빠르다. 메모리 18.2GB만 사용하므로 다른 작업과 병행도 가능하다.

### Q4_K_M과 Q8_0 중 어떤 양자화를 써야 하나?

대부분의 경우 **Q4_K_M**이 유리하다. Q8 대비 1.4~1.7배 빠르고 메모리도 절반 수준이다. 122B 모델은 Q8에서 128GB 메모리를 초과해 Q4가 유일한 선택지다. 품질 차이가 체감되는 경우에만 Q8을 고려하라.

### Ollama는 왜 메모리를 많이 쓰나?

Ollama는 `num_ctx` 설정에 따라 KV 캐시를 사전 할당한다. 256K 풀 컨텍스트 설정에서 9B 모델의 경우 MLX(4.7GB) 대비 4.2배(19.9GB)를 사용한다. 컨텍스트를 4K~8K로 낮추면 메모리 사용량이 크게 줄어든다.

### RAG 파이프라인에서 어떤 백엔드를 써야 하나?

입력 문서가 길다면 (16K+) **llama.cpp**가 압도적이다. 128K 프리필에서 MLX 대비 204배 빠르다. 다만 생성 속도는 MLX보다 느리므로, 프리필과 생성을 분리할 수 있는 아키텍처라면 각각 최적 백엔드를 사용하는 것이 이상적이다.

### 이 결과를 다른 Apple Silicon(M4, M3 등)에 적용할 수 있나?

상대적 순위(MLX > llama.cpp > Ollama 생성 속도)는 유사할 것으로 예상되지만, 절대 수치는 메모리 대역폭과 GPU 코어 수에 따라 달라진다. 특히 메모리가 적은 모델(64GB, 32GB)에서는 MoE 모델의 이점이 더 크다.

---

## 실험 환경 상세

```yaml
hardware:
  device: MacBook Pro 14 (M5 Max)
  memory: 128GB Unified Memory
  os: macOS

backends:
  mlx: 0.31.2 (stream_generate, temperature=0)
  llama_cpp: b8500 (n-gpu-layers=99, flash-attn=on, batch=512)
  ollama: 0.18.2 (temperature=0, num_ctx=262144)

measurement:
  warmup: 1 run (excluded)
  runs: 5 per config
  aggregation: median
  thermal_guard: 85°C / 60s cooldown
  total_runs: 692
```
