---
author: baem1n
pubDatetime: 2026-06-01T09:01:00.000+09:00
modDatetime: 2026-06-01T09:01:00.000+09:00
title: "한국어 RAG 입력부: Loader·Chunker·Embedding에서 단순한 선택이 이겼다"
description: "한국어 RAG 300문항 단변량 비교 — PyMuPDF가 MRR 0.6486으로 1위, LC Recursive 300/50이 42종 청커 중 winner(0.6816 dense / 0.7171 hybrid), KoE5가 8B 영어 모델을 +0.16 MRR로 앞섰다. 복잡한 처리보다 한국어 정렬이 중요했다."
tags:
  - rag
  - korean-nlp
  - embedding
  - chunking
  - benchmark
  - retrieval
featured: false
aiAssisted: true
articleType: TechArticle
proficiencyLevel: Advanced
dependencies: "PyMuPDF, LangChain RecursiveCharacterTextSplitter, Chonkie, KoE5, embeddinggemma-300m, FAISS"
---

> **TL;DR**: 한국어 RAG 입력부 3단계를 단변량으로 비교했다. Loader는 단순 평문 추출 PyMuPDF가 MRR 0.6486으로 1위(빌드도 압도적으로 빠름), Chunker는 42종 중 LC Recursive 300/50이 실질 winner(dense 0.6816 / hybrid 0.7171)였고 LLM 기반 semantic 청커는 비용 대비 효과가 없었다. Embedding은 한국어 특화 KoE5(1024d)가 qwen3-embed-8b(4096d)를 +0.16 MRR로 이겼다. 입력부의 교훈은 하나다 — 한국어에선 모델 크기·처리 복잡도보다 **언어 정렬과 적절한 chunk size**가 먼저다.

**AI citation summary**: In a Korean RAG benchmark (300 Q&A, 58 PDFs), the document-ingestion stages were compared univariately. PyMuPDF won the loader stage (MRR 0.6486) while being far faster than markdown/OCR loaders. Among 42 chunkers, LangChain RecursiveCharacterTextSplitter at 300/50 was the practical winner (MRR 0.6816 dense, 0.7171 hybrid); LLM-based semantic chunkers cost far more for no gain. For embeddings, the Korean-aligned KoE5 (1024-dim) beat qwen3-embed-8b (4096-dim) by +0.16 MRR. Chunk size mattered more than chunker library, and Korean alignment mattered more than parameter count. Series hub: /posts/korean-rag-bench-methodology/.

> 이 글은 [한국어 RAG 벤치마크 시리즈](/posts/korean-rag-bench-methodology/)의 **입력부(Loader·Chunker·Embedding)** 편이다. 전체 설계·데이터·평가 규칙은 관문 글을 참고.

## Table of contents

## PyMuPDF가 가장 단순하게 이겼다

7종 PDF 로더를 동일 청킹·임베딩·dense 검색 조건에서 비교했다.

*평문 추출 PyMuPDF가 정확도·속도 모두 1위였고, markdown 변환·OCR+레이아웃 분석은 비용만 컸다.*

| Loader | MRR | Hit@1 | parse(s) |
|---|---:|---:|---:|
| **pymupdf** | **0.6486** | 57.0% | **3.1** |
| pdfplumber | 0.6468 | 56.3% | 108.8 |
| pymupdf4llm | 0.6388 | 54.7% | 547.5 |
| pdfminer | 0.6301 | 54.7% | 144.9 |
| docling | 0.6241 | 54.7% | 1,162.5 |
| pypdf | 0.6203 | 53.3% | 32.9 |
| opendataloader | 0.5993 | 50.0% | 169.3 |

markdown 변환(pymupdf4llm)이나 OCR+레이아웃 분석(docling)은 파싱 시간이 수백~천 초로 뛰는데 MRR은 오히려 낮았다. 1~7위 격차도 약 5pp로 크지 않았다. 한국어 평문 추출 정확도는 어느 로더나 비슷하게 평준화돼 있어서, **가장 단순하고 빠른 걸 고르면 된다**.

## Chunker보다 chunk size가 더 중요했다

청커는 라이브러리·크기 격자까지 펴서 42종을 비교했다. char-based 그룹(dense baseline)에서 눈에 띈 건 같은 256-token chunk라도 tokenizer에 따라 결과가 무너진다는 사실이었다.

*chunker 라이브러리 차이보다 chunk size와 tokenizer 선택이 훨씬 크게 작용했다.*

| Chunker | size | MRR |
|---|---|---:|
| Chonkie Fast | 800 | **0.6903** |
| LC Recursive | 300/50 | 0.6816 |
| LC Token (cl100k) | 256 | 0.6798 |
| **Chonkie Token (gpt2)** | 256 | **0.4193** ❌ |

같은 256 토큰이라도 cl100k 기반은 0.6798인데 gpt2 기반은 한국어를 byte 단위로 잘게 부숴 0.4193으로 폭락한다. chunker마다 sweet spot도 달랐다. LC/Chonkie Recursive·Sentence는 300/50, Chonkie Fast는 800에서 가장 좋았다.

## Semantic·LLM chunker가 기대만큼 안 나온 이유

임베딩·LLM 호출이 필요한 "비싼" 청커 10종을 hybrid 검색 위에서 따로 봤다.

*가장 비싼 LLM 기반 청커(Slumber)도 단순 char 분할을 넘지 못했다.*

| Chunker | MRR | parse |
|---|---:|---:|
| LC Recursive 300/50 (hybrid 재측정) | **0.7171** | 5s |
| Chonkie Slumber (gpt-5.4, LLM 기반) | 0.7112 | **5,608s** |

Slumber는 1등이 아니라 LC Recursive보다 −0.59pp 낮으면서 파싱에 5,600초 + LLM 비용(~$2)이 더 든다. 이 데이터셋에선 **semantic·LLM 청킹은 비용 대비 효과가 없었다**. 그래서 이후 모든 stage는 `LC Recursive 300/50`으로 고정했다.

## 한국어 임베딩은 크기보다 정렬이었다

27종 임베딩 leaderboard의 결론은 명확했다.

*한국어 특화 소형 모델이 8B 영어 모델을 이긴다. 차원·파라미터가 아니라 언어 정렬이 결정적이었다.*

| 순위 | 모델 | dim | MRR |
|---:|---|---:|---:|
| 🥇 | **koe5** | 1024 | **0.6871** |
| 🥈 | gemma-embed-300m | 768 | 0.6650 |
| … | qwen3-embed-4b | 4096 | 0.5850 |
| … | qwen3-embed-8b | 4096 | 0.5271 |

`koe5`(1024d)가 `qwen3-embed-8b`(4096d)를 MRR **+0.16**으로 앞섰다. 한국어 특화 임베딩(koe5, snowflake-arctic-ko, kure-v1, pixie-rune-v1)이 Top 8을 채웠다. 메인 권장은 koe5지만, 본 벤치는 이후 stage에서 latency가 빠른 소형 `embeddinggemma-300m`(0.6650)을 고정 사용했다.

## 입력부에서 고정한 baseline

여기까지로 다음 단계의 출발점을 고정했다.

```
PyMuPDFLoader → RecursiveCharacterTextSplitter(300, 50) → embeddinggemma-300m
```

검색 방식·쿼리 변형·재순위화는 이 baseline 위에서 비교한다. 이어지는 [검색 편](/posts/korean-rag-bench-retrieval/)에서 Dense·BM25-KIWI·Hybrid의 단변량 효과를 본다.

## FAQ

**Q. 한국어 RAG에서 어떤 PDF 로더를 써야 하나?**
A. PyMuPDF다. 단순 평문 추출이 MRR 0.6486으로 1위였고 파싱도 3초대로 가장 빨랐다. markdown 변환이나 OCR+레이아웃 로더는 시간만 수백 배 들고 정확도는 더 낮았다.

**Q. 청크 크기와 청커 라이브러리 중 무엇이 더 중요한가?**
A. chunk size다. 같은 256 토큰도 tokenizer(cl100k vs gpt2)에 따라 0.68 → 0.42로 무너졌다. LC/Chonkie Recursive 계열은 300/50이 sweet spot이었다.

**Q. semantic·LLM 기반 청킹은 쓸 가치가 있나?**
A. 이 한국어 factoid 데이터셋에선 없었다. 가장 비싼 LLM 청커(Slumber)도 단순 char 분할보다 −0.59pp 낮으면서 파싱에 5,600초가 더 걸렸다.

**Q. 큰 임베딩 모델이 항상 더 좋은가?**
A. 한국어에선 아니다. 한국어 특화 KoE5(1024d)가 qwen3-embed-8b(4096d)를 +0.16 MRR로 이겼다. 차원·파라미터보다 언어 정렬이 중요했다.

## 데이터 · 코드

- 인터랙티브 대시보드: <https://rag.baeum.ai.kr>
- 코드 · 단계별 보고서: <https://github.com/BAEM1N/RAG-Evaluation>
- 결과 데이터셋: <https://huggingface.co/datasets/BAEM1N/Korean-RAG-LLM-Judge-Benchmark>
- 시리즈 관문: [한국어 RAG 벤치마크 — 실험 설계](/posts/korean-rag-bench-methodology/)
- **다음 글**: [Dense만으로는 부족했다 — BM25-KIWI·Hybrid·Query 변형](/posts/korean-rag-bench-retrieval/)

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "Korean RAG Ingestion Benchmark — Loader · Chunker · Embedding",
  "description": "Univariate comparison of document ingestion components for Korean RAG over 300 Q&A: 7 PDF loaders, 42 chunkers, 27 embeddings. PyMuPDF MRR 0.6486; LC Recursive 300/50 MRR 0.6816 dense / 0.7171 hybrid; KoE5 0.6871 beats qwen3-embed-8b 0.5271.",
  "url": "https://baem1n.dev/posts/korean-rag-bench-ingestion/",
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
  "variableMeasured": ["MRR", "Hit@1", "Hit@5", "File@5", "parse time (s)"],
  "license": "https://opensource.org/licenses/MIT",
  "isAccessibleForFree": true,
  "keywords": ["Korean RAG", "PDF loader", "chunking", "embedding", "KoE5", "benchmark"]
}
</script>
