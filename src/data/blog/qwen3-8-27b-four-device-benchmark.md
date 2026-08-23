---
author: baem1n
pubDatetime: 2026-08-23T00:00:00.000Z
title: "같은 모델, 4개 하드웨어 — Qwen3.8-27B 추론 속도 실측"
description: "RTX 3090, Apple M5 Max, DGX Spark(GB10), Ryzen AI Max 395를 같은 GGUF 파일로 비교했다. 체크섬까지 맞춘 통제 실험에서 CUDA는 Metal의 3.9배, Vulkan의 4.5배였고 벤치마크 코드를 세 번 고쳐야 했다."
tags:
  - benchmark
  - llama-cpp
  - mlx
  - vllm
  - qwen
  - local-llm
featured: false
aiAssisted: true
articleType: TechArticle
proficiencyLevel: "intermediate"
---

> **TL;DR**: Qwen3.8-27B 하나를 4개 하드웨어에서 재봤다. **decode는 RTX 3090이 압도적**(38 t/s, 2위의 2배), **prefill은 GB10이 1등**(1,467 t/s). Apple Silicon에서는 **MLX가 llama.cpp Metal보다 1.4~1.7배 빠르다**. 그리고 벤치마크 코드를 **세 번 고쳤다** — 첫 결과를 그대로 믿었다면 정반대 결론을 발표했을 것이다.

## Table of contents

## 이 글을 읽고 나면

- 같은 모델이 하드웨어에 따라 prefill/decode에서 **어떻게 반대로 갈리는지** 알 수 있다.
- 로컬 LLM 벤치마크에서 **거짓 숫자가 나오는 세 가지 함정**과 그 회피법을 알 수 있다.
- Apple Silicon에서 MLX와 llama.cpp Metal 중 무엇을 쓸지 근거를 갖고 결정할 수 있다.
- 통합 메모리(Apple/GB10/Strix Halo)와 전용 VRAM(dGPU)의 실제 격차를 수치로 파악할 수 있다.

## 왜 이 비교를 했나

Qwen3.8-27B는 27B dense 모델이지만 아키텍처가 특이하다. 64개 레이어 중 **16개만 full attention**이고 나머지 48개는 linear attention인 하이브리드다(`full_attention_interval: 4`). KV 캐시가 그만큼 작아져서 24GB 카드에도 긴 컨텍스트가 들어간다.

문제는 "그래서 어떤 장비에 올려야 하나"였다. 손에 있는 네 종류가 아키텍처 계열이 전부 달랐다.

| 장비 | 가속기 | 메모리 | 엔진 |
|---|---|---|---|
| 데스크톱 | RTX 3090 (Ampere) | 24GB **전용 VRAM** | llama.cpp CUDA |
| MacBook | Apple M5 Max | 128GB **통합** | MLX / llama.cpp Metal |
| DGX Spark | GB10 (Blackwell) | 128GB **통합** | vLLM |
| 미니 워크스테이션 | Ryzen AI Max 395 (Radeon 8060S) | ~96GB **UMA** | llama.cpp Vulkan |

## 공정성을 어떻게 확보했나

이게 이 글의 핵심이다. "4개 장비 비교"는 쉽게 무의미해진다.

### 같은 GGUF 파일 — 체크섬까지 맞췄다

RTX 3090, M5 Max, Ryzen AI Max는 **완전히 같은 파일**을 썼다.

```bash
sha256sum Qwen3.8-27B-UD-Q4_K_XL.gguf
# bee238bbeb3dc0a34bde4d0dedbaee1f98c009e8bb4226f03070054c12fb1372  (3대 모두 동일)
```

여기서 함정을 하나 만났다. **Hugging Face의 파일이 그사이 교체됐다.** 8월 16일에 받은 파일은 17,923,394,624 바이트인데 8월 23일에 같은 URL에서 받은 건 17,559,178,144 바이트였다. 재양자화되어 재업로드된 것이다.

`content-length`가 새 크기와 일치하니 **다운로드는 정상 완료로 보인다.** 크기만 확인하면 눈치채지 못한다. 결국 원본 노드에서 직접 복사해 체크섬을 맞췄다.

### 양자화가 다른 것은 다르다고 밝힌다

MLX와 vLLM은 GGUF를 못 쓴다. 그래서 이 둘은 **양자화 방식이 다르다.**

| 스택 | 4bit 방식 | 크기 |
|---|---|---|
| llama.cpp | GGUF UD-Q4_K_XL (레이어별 혼합 비트) | 16.69 GiB |
| MLX | 균일 양자화 (group size 64) | 14.0 GiB |
| vLLM | NVFP4 (Blackwell 네이티브 FP4) | ~15 GiB |

크기가 다르면 메모리 대역폭 부하도 달라진다. 따라서 이 비교는 **"어느 하드웨어가 빠른가"가 아니라 "각 스택이 실제로 내는 속도"** 다. 순수 하드웨어 대조는 GGUF 3종뿐이다.

### MLX 모델은 공식 가중치에서 직접 변환했다

`mlx-community`, `lmstudio-community`에 이미 변환본이 있다. 하지만 전부 제3자 변환본이다. 예전에 제3자 GGUF 리랭커 변환본을 썼다가 점수가 e-14 수준 노이즈로 나오면서 랭킹이 붕괴한 적이 있어, 그 뒤로는 공식 또는 unsloth 배포만 쓴다는 원칙을 지킨다.

MLX는 둘 다 배포하지 않으니 직접 변환했다.

```bash
mlx_lm.convert --hf-path Qwen/Qwen3.8-27B -q --q-bits 4 \
               --mlx-path ~/.cache/mlx-models/Qwen3.8-27B-4bit
# BF16 56GB 다운로드 → 4bit 14GiB (3샤드)
```

원칙을 지키면서 **다른 장비와 같은 원본 가중치**가 되니 비교 공정성도 함께 올라갔다.

## 측정 방법 — 세 번 고친 끝에

첫 하네스는 그럴듯한 거짓 숫자를 뱉었다. RTX 3090이 64K 입력을 **112,865 t/s로 prefill** 한다고 나왔다. 물리적으로 불가능한 값이라 코드를 의심했고, 결국 세 가지를 고쳤다.

### 1. prefix 캐시 적중

같은 프롬프트를 3회 반복 측정하면 2회차부터 prefill을 건너뛴다. 응답의 `usage`가 증거를 준다.

```json
"prompt_tokens_details": { "cached_tokens": 42 }
```

**매 호출 맨 앞에 랜덤 nonce를 붙여** 캐시를 무효화했다. 뒤에 붙이면 앞부분이 그대로 캐시되니 위치가 중요하다. 그리고 `cached_tokens`를 결과에 함께 출력해 무효화를 매번 **검증**했다.

### 2. 차분법의 자기 오염

prefill과 decode를 분리하려면 `max_tokens=1` 호출과 `max_tokens=N` 호출의 차이를 쓴다. 그런데 **같은 프롬프트로 두 번 부르면** 두 번째가 첫 번째가 적재한 캐시에 적중한다.

증상이 특이했다. **decode가 컨텍스트가 길수록 빨라졌고**, 64K에서는 분모가 음수가 되어 `nan`이 나왔다.

두 호출에 **서로 다른 nonce**를 주면 해결된다. 길이는 같으니 prefill 비용은 사실상 동일하다.

### 3. 스트리밍 형태가 엔진마다 다르다

TTFT를 재려고 스트리밍을 썼는데, 엔진별로 델타 모양이 달랐다.

| 엔진 | 델타 형태 |
|---|---|
| llama.cpp | 증분 (reasoning 38개 + content 1개) |
| vLLM + reasoning parser | **50토큰을 1덩어리로** |

vLLM은 `ttft ≈ total`이 되어 decode 계산이 0으로 나뉘고 **255,000,000 t/s** 같은 값이 나왔다. 스트리밍을 버리고 차분법으로 통일했다.

### 검산 규칙

이 경험에서 규칙 하나를 세웠다.

> **decode는 컨텍스트가 길수록 느려져야 정상이다. 반대로 나오면 캐시 오염이다.**

최종 측정에서 리눅스 3대는 이 검산을 완벽히 통과했다.

## 결과

각 구간 3회 중앙값, `-c 32768 -ctk q8_0 -ctv q8_0 -fa on --parallel 1`.

### prefill (t/s) — 입력 처리

| 장비/스택 | 0.5K | 2K | 8K | 32K |
|---|---|---|---|---|
| **GB10** / vLLM NVFP4 | **1,327** | **1,619** | **2,222** | **1,467** |
| **RTX 3090** / CUDA | 595 | 847 | 1,135 | 1,218 |
| **M5 Max** / MLX | 335 | 435 | 556 | 519 |
| **M5 Max** / Metal | 306 | 281 | 376 | 314 |
| **Radeon 8060S** / Vulkan | 80 | 143 | 228 | 271 |

### decode (t/s) — 생성

| 장비/스택 | 0.5K | 2K | 8K | 32K |
|---|---|---|---|---|
| **RTX 3090** / CUDA | **40.40** | **40.13** | **39.72** | **38.11** |
| **M5 Max** / MLX | 25.45 | 24.85 | 24.51 | 19.44 |
| **GB10** / vLLM NVFP4 | 17.06 | 17.68 | 17.35 | 16.90 |
| **M5 Max** / Metal | 17.23 | 14.77 | 14.70 | 13.26 |
| **Radeon 8060S** / Vulkan | 11.63 | 11.63 | 11.46 | 11.42 |

## 읽어낸 것

### prefill과 decode는 반대로 갈린다

GB10은 prefill에서 3090의 1.8배지만 decode는 절반 이하다. 이유가 분명하다.

- **prefill은 연산 바운드** — Blackwell의 FP4 연산 처리량이 유리하다
- **decode는 대역폭 바운드** — 3090의 전용 GDDR6X가 통합 LPDDR을 앞선다

그래서 손익분기를 계산하면 이런 기준이 나온다.

```
입력 토큰 P > 약 79 × 출력 토큰 O  →  GB10 유리
그 외                              →  RTX 3090 유리
```

| 시나리오 | RTX 3090 | GB10 | 승자 |
|---|---|---|---|
| 12K 입력 + 256 출력 | 17.2s | 20.2s | **3090** |
| 100K 입력 + 256 출력 | 90.5s | 59.6s | **GB10** |
| 4K 입력 + 1000 출력 | 25.8s | 56.4s | **3090** |

**긴 문서를 넣고 짧게 답하는 작업(RAG·요약)은 GB10, 대화와 코드 생성은 3090.**

### 통제된 3-way 대조 — CUDA가 압도한다

같은 GGUF, 같은 인자, 같은 엔진. 하드웨어와 백엔드만 다른 유일한 순수 비교다.

| 백엔드 | prefill (32K) | decode (32K) |
|---|---|---|
| **CUDA** (RTX 3090) | **1,218** | **38.11** |
| **Metal** (M5 Max) | 314 | 13.26 |
| **Vulkan** (Radeon 8060S) | 271 | 11.42 |

3090이 Metal의 **3.9배 prefill / 2.9배 decode**, Vulkan의 **4.5배 / 3.3배**다.

흥미로운 건 **Metal과 Vulkan이 거의 동급**이라는 점이다(314 vs 271, 13.26 vs 11.42). 128GB 통합 메모리의 M5 Max와 96GB UMA의 Strix Halo가 llama.cpp 기준으로는 같은 급이다. 통합 메모리 아키텍처의 공통 한계로 보인다.

### Apple Silicon에서는 MLX를 쓰자

같은 하드웨어, 같은 모델, 엔진만 바꿨다.

| | decode (32K) | prefill (32K) |
|---|---|---|
| **MLX** | **19.44** | **519** |
| llama.cpp Metal | 13.26 | 314 |

**decode 1.4~1.7배, prefill 1.1~1.5배** MLX가 빠르다. 각 엔진을 2회씩 측정했고 두 엔진의 구간이 겹치지 않아 우위는 실재한다.

MLX 가중치가 2.7GiB 작은 것(14.0 vs 16.69GiB)이 decode에 일부 기여하지만, prefill 우위는 크기로 설명되지 않는다.

### 노트북 측정은 두 번 이상 돌려야 한다

이 부분에서 **내 해석이 한 번 틀렸다.**

1차 측정에서 MLX의 prefill이 403 → 470 → 432 → 446으로 거의 평탄했다. 다른 장비는 모두 증가하는데 MLX만 평탄하니 "`mlx_lm.server`가 배치 최적화를 덜 하는 것"이라고 해석했다.

2차 측정에서 그 가설이 무너졌다.

| MLX | 0.5K | 2K | 8K | 32K |
|---|---|---|---|---|
| 1차 prefill | 403 | 470 | 432 | 446 |
| 2차 prefill | 335 | 435 | **556** | **519** |
| 1차 decode | 27.02 | **19.17** | 20.79 | 18.57 |
| 2차 decode | 25.45 | **24.85** | 24.51 | 19.44 |

2차는 335 → 435 → 556 → 519로 **다른 장비와 같은 증가 패턴**이다. 평탄성은 실재하지 않았다. decode도 2K 지점에서 19.17 vs 24.85로 **30% 차이**가 났다.

하네스는 각 구간을 3회 재고 중앙값을 쓴다. 하지만 그건 **구간 내 분산**만 잡고 **실행 간 분산**은 못 잡는다. 리눅스 서버 3대는 단조성이 완벽해 이 함정이 드러나지 않았는데, 노트북에서 바로 드러났다.

> **노트북 벤치마크는 전체 실행을 최소 2회 반복할 것.**

덧붙이면, 이번엔 **Metal이 MLX보다 재현성이 좋았다**(decode 편차 약 2 t/s).

### GB10은 32K에서 prefill이 꺾인다

유일하게 비단조다. 8K에서 2,222인데 32K에서 1,467로 떨어진다.

`--max-num-batched-tokens 8192` 때문으로 본다. 8K 프롬프트는 한 청크에 들어가지만 32K는 4청크로 쪼개져 오버헤드가 붙는다. 긴 입력을 자주 쓴다면 이 값을 올릴 근거가 된다.

## 곁가지로 얻은 것

### MTP는 엔진에 따라 쓸 수 있거나 버려진다

Qwen3.8은 Multi-Token Prediction 레이어를 갖고 있다(`mtp_num_hidden_layers: 1`). GGUF에도 `blk.64.nextn.*` 텐서로 들어 있다.

**llama.cpp는 이걸 `unused tensor`로 무시한다.** vLLM은 쓴다.

vLLM에서 켜보니 수용률 80%, decode가 11.36 → 17.15 t/s로 **51% 빨라졌다.** 대신 prefill이 30% 깎였다 — draft 슬롯 확보 때문에 `max_num_scheduled_tokens`가 2048로 강제되면서다. `--max-num-batched-tokens 8192`를 함께 주면 prefill 손실이 8%로 줄어든다.

### 디렉터리 권한이 엉뚱한 크래시를 만든다

읽기 권한 없는 디렉터리에 셸의 cwd가 남은 상태로 `llama-server`를 띄웠더니 이렇게 죽었다.

```
libc++abi: terminating due to uncaught exception of type
std::filesystem::filesystem_error: in current_path: call to getcwd failed
```

GGUF 로드도 Metal 초기화도 아닌 **백엔드 탐색의 `getcwd()`** 에서 터졌다. 로그만 보면 llama.cpp 버그처럼 보인다. 자동화 스크립트에는 `cd "$HOME"`을 명시하는 게 안전하다.

## 외부 자료

- [Qwen3.8-27B (공식)](https://huggingface.co/Qwen/Qwen3.8-27B) — 원본 BF16 가중치
- [unsloth GGUF](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF) — 이 실험에 쓴 UD-Q4_K_XL
- [MLX LM](https://github.com/ml-explore/mlx-lm) — Apple Silicon 추론 프레임워크
- [llama.cpp](https://github.com/ggml-org/llama.cpp) — CUDA / Metal / Vulkan 백엔드
- [vLLM](https://github.com/vllm-project/vllm) — NVFP4·MTP 지원

## 핵심 정리

- **decode는 RTX 3090이 압도적**(38.11 t/s)이다. 2위 MLX(19.44)의 두 배다. 전용 GDDR6X 대역폭이 통합 메모리를 앞선다.
- **prefill은 GB10이 1등**(1,467 t/s)이다. Blackwell의 FP4 연산 처리량 덕이고, 그래서 긴 입력 작업에 유리하다.
- 손익분기는 **입력 토큰이 출력 토큰의 약 79배**다. 그 위는 GB10, 아래는 3090.
- 같은 GGUF 기준 **CUDA는 Metal의 3.9배, Vulkan의 4.5배**다. 그리고 **Metal ≈ Vulkan**으로 통합 메모리 두 아키텍처는 동급이다.
- **Apple Silicon에서는 MLX**를 쓰자. llama.cpp Metal보다 decode 1.4~1.7배 빠르다.
- 벤치마크 코드를 세 번 고쳤다. **물리적으로 불가능한 숫자가 나오면 코드를 의심**해야 하고, **노트북은 전체 실행을 2회 이상** 돌려야 한다.

---

*모든 수치는 단일 사용자·동시성 없음(`--parallel 1`) 조건 실측이다. 양자화 방식이 다른 스택 간 비교는 하드웨어 비교가 아니라 스택별 실효 속도로 읽어야 한다.*
