---
author: baem1n
pubDatetime: 2026-04-04T00:00:00.000Z
title: "langchain-age 벡터 검색 완전 정복 — Hybrid Search, MMR, 메타데이터 필터링"
description: "Similarity, MMR, Hybrid Search 세 가지 검색 전략을 실전 코드로 비교하고, MongoDB 스타일 메타데이터 필터링과 HNSW/IVFFlat 인덱스 전략까지 다룬다."
tags:
  - rag
  - graphrag
  - postgresql
  - langchain
  - llm
  - vector-search
featured: false
aiAssisted: true
---

> **TL;DR**: `langchain-age`의 AGEVector는 Similarity, MMR, Hybrid(벡터+풀텍스트 RRF) 세 가지 검색을 지원한다. Hybrid Search는 의미적 유사도와 키워드 매칭을 RRF(k=60)로 결합해 단일 벡터 검색 대비 재현율을 높인다. MongoDB 스타일 메타데이터 필터(`$gte`, `$in`, `$between` 등 14개 연산자)로 검색 범위를 좁힐 수 있고, HNSW 인덱스로 대규모 벡터에서도 밀리초 단위 응답이 가능하다.

## Table of contents

## 시리즈

이 글은 langchain-age 시리즈의 3편이다.

1. [GraphRAG를 PostgreSQL만으로 구축하기](/posts/graphrag-with-postgresql) — 개요 + 셋업
2. [Neo4j vs Apache AGE 실측 벤치마크](/posts/neo4j-vs-age-benchmark) — 성능 데이터
3. **벡터 검색 완전 정복** (현재 글)
4. [GraphRAG 파이프라인 실전 구축](/posts/langchain-age-graphrag-pipeline) — 벡터 + 그래프 통합
5. [PostgreSQL 하나로 AI Agent 전체 스택](/posts/langchain-age-langgraph-agent) — LangGraph 연동

## 배경: 벡터 검색만으로는 부족하다

[1편](/posts/graphrag-with-postgresql)에서 AGEVector의 기본 사용법을 소개했다. `similarity_search()`로 의미적으로 유사한 문서를 찾는 것까지는 간단하다. 하지만 실전에서는 금방 한계에 부딪힌다:

- **동의어/약어 문제**: "PostgreSQL"을 검색했는데 "PG"가 포함된 문서가 누락
- **다양성 부족**: 상위 결과가 거의 같은 내용의 문서로 채워짐
- **범위 제한 불가**: 2024년 이후 문서만 검색하고 싶은데 벡터 거리로는 불가능

AGEVector는 이 세 가지를 각각 해결하는 검색 전략을 제공한다.

## 세 가지 검색 전략

### 1. Similarity Search — 기본

벡터 코사인 거리 기반. 의미적으로 가장 가까운 k개를 반환한다.

```python
from langchain_age import AGEVector, DistanceStrategy
from langchain_openai import OpenAIEmbeddings

store = AGEVector(
    connection_string="host=localhost port=5433 dbname=langchain_age user=langchain password=langchain",
    embedding_function=OpenAIEmbeddings(model="text-embedding-3-small"),
    collection_name="tech_docs",
    distance_strategy=DistanceStrategy.COSINE,
)

# 기본 유사도 검색
docs = store.similarity_search("PostgreSQL 확장", k=5)

# 거리 점수 포함 (낮을수록 유사)
results = store.similarity_search_with_score("PostgreSQL 확장", k=5)

# 관련도 점수 포함 (0~1, 높을수록 유사)
results = store.similarity_search_with_relevance_scores("PostgreSQL 확장", k=5)
```

**장점**: 구현이 간단하고 빠르다.
**한계**: 키워드 매칭을 하지 않으므로 정확한 용어가 포함된 문서를 놓칠 수 있다.

### 2. MMR — 다양성 확보

Maximal Marginal Relevance. 관련성과 다양성의 균형을 맞춘다. DB에 저장된 임베딩을 재사용하므로 **추가 임베딩 API 호출이 없다**.

```python
docs = store.max_marginal_relevance_search(
    "데이터베이스 기술",
    k=3,              # 최종 반환 수
    fetch_k=10,       # 후보 풀 크기
    lambda_mult=0.5,  # 0=최대 다양성, 1=최대 관련성
)
```

**동작 원리**:
1. 벡터 검색으로 상위 `fetch_k`개 후보를 가져온다
2. 첫 번째 문서 선택 (가장 유사)
3. 나머지 후보 중 "이미 선택된 문서와 가장 다른" 문서를 반복 선택
4. `lambda_mult`로 관련성-다양성 비율 조절

**사용 시점**: LLM에 넘길 컨텍스트가 중복되면 토큰 낭비. MMR로 다양한 각도의 문서를 제공하면 답변 품질이 올라간다.

### 3. Hybrid Search — 벡터 + 키워드 결합

벡터 유사도와 PostgreSQL 전문 검색(tsvector)을 RRF(Reciprocal Rank Fusion, k=60)로 결합한다.

```python
from langchain_age import AGEVector, SearchType

store = AGEVector(
    connection_string=conn_str,
    embedding_function=embeddings,
    collection_name="hybrid_docs",
    search_type=SearchType.HYBRID,  # 핵심: 하이브리드 모드 활성화
)

store.add_texts([
    "PostgreSQL은 JSON과 전문 검색을 지원합니다.",
    "Apache AGE는 PostgreSQL에 Cypher 그래프 쿼리를 추가합니다.",
    "pgvector는 벡터 유사도 검색을 지원합니다.",
    "PG의 확장 시스템은 커스텀 데이터 타입을 허용한다.",
])

# 벡터 + 키워드 매칭 자동 결합
results = store.similarity_search("PostgreSQL 그래프 확장", k=3)
```

**RRF 작동 방식**:

```
score(doc) = 1/(k + rank_vector) + 1/(k + rank_keyword)
```

| 문서 | 벡터 순위 | 키워드 순위 | RRF 점수 (k=60) |
|------|:---------:|:----------:|:----------------:|
| "Apache AGE는 PostgreSQL에..." | 1 | 1 | 1/61 + 1/61 = **0.0328** |
| "PG의 확장 시스템은..." | 3 | 2 | 1/63 + 1/62 = **0.0320** |
| "pgvector는 벡터..." | 2 | ∞ | 1/62 + 0 = 0.0161 |

벡터 검색에서 2위였지만 키워드 매칭이 없는 문서보다, 벡터 3위+키워드 2위인 문서가 더 높은 점수를 받는다.

**사용 시점**: "AGE"같은 약어, 고유명사, 정확한 용어가 중요한 도메인에서 벡터 단독보다 재현율이 높다.

## 세 전략 비교

| 전략 | 의미 매칭 | 키워드 매칭 | 다양성 | 사용 시점 |
|------|:---------:|:----------:|:------:|-----------|
| Similarity | O | X | X | 일반적인 유사도 검색 |
| MMR | O | X | **O** | LLM 컨텍스트 다양성 필요 |
| Hybrid | **O** | **O** | X | 정확한 용어/약어가 중요 |

## 메타데이터 필터링

AGEVector는 JSONB 메타데이터에 대한 MongoDB 스타일 필터를 지원한다. 14개 연산자로 검색 범위를 정밀하게 제한할 수 있다.

### 기본 사용법

```python
# 문서 추가 시 메타데이터 포함
store.add_texts(
    ["AGE 1.7.0 릴리스 노트", "pgvector 0.8 성능 개선", "LangChain v1 마이그레이션"],
    metadatas=[
        {"author": "alice", "year": 2026, "tag": "release"},
        {"author": "bob", "year": 2026, "tag": "benchmark"},
        {"author": "alice", "year": 2025, "tag": "migration"},
    ],
)
```

### 비교 연산자

```python
# 같음
store.similarity_search("릴리스", filter={"author": "alice"})

# 크기 비교
store.similarity_search("성능", filter={"year": {"$gte": 2026}})

# 포함 여부
store.similarity_search("쿼리", filter={"tag": {"$in": ["release", "benchmark"]}})

# 범위
store.similarity_search("쿼리", filter={"year": {"$between": [2025, 2026]}})

# 패턴 매칭 (대소문자 무시)
store.similarity_search("쿼리", filter={"author": {"$ilike": "%ali%"}})

# 필드 존재 여부
store.similarity_search("쿼리", filter={"tag": {"$exists": True}})
```

### 논리 조합

```python
# AND 조건
store.similarity_search("쿼리", filter={
    "$and": [
        {"author": "alice"},
        {"year": {"$gte": 2026}},
    ]
})

# OR 조건
store.similarity_search("쿼리", filter={
    "$or": [
        {"tag": "release"},
        {"tag": "benchmark"},
    ]
})
```

### 전체 연산자 목록

| 연산자 | 의미 | 예시 |
|--------|------|------|
| `$eq` | 같음 | `{"year": {"$eq": 2026}}` |
| `$ne` | 같지 않음 | `{"tag": {"$ne": "draft"}}` |
| `$lt` | 미만 | `{"score": {"$lt": 0.5}}` |
| `$lte` | 이하 | `{"score": {"$lte": 0.5}}` |
| `$gt` | 초과 | `{"year": {"$gt": 2024}}` |
| `$gte` | 이상 | `{"year": {"$gte": 2025}}` |
| `$in` | 포함 | `{"tag": {"$in": ["a", "b"]}}` |
| `$nin` | 미포함 | `{"tag": {"$nin": ["draft"]}}` |
| `$between` | 범위 | `{"score": {"$between": [0.5, 1.0]}}` |
| `$like` | 패턴 (대소문자 구분) | `{"name": {"$like": "%AGE%"}}` |
| `$ilike` | 패턴 (대소문자 무시) | `{"name": {"$ilike": "%age%"}}` |
| `$exists` | 존재 여부 | `{"bio": {"$exists": True}}` |
| `$and` | AND 조합 | `{"$and": [{...}, {...}]}` |
| `$or` | OR 조합 | `{"$or": [{...}, {...}]}` |

내부적으로는 JSONB 연산자(`->>`와 PostgreSQL 비교)로 변환되므로, GIN 인덱스가 있으면 필터링도 빠르다.

## 인덱스 전략: HNSW vs IVFFlat

벡터가 수만 건을 넘어가면 순차 스캔이 느려진다. pgvector는 두 가지 근사 최근접 이웃(ANN) 인덱스를 제공한다.

### HNSW (프로덕션 권장)

```python
store.create_hnsw_index(m=16, ef_construction=64)
```

| 파라미터 | 기본값 | 의미 |
|----------|:------:|------|
| `m` | 16 | 각 노드의 연결 수. 높으면 재현율↑, 메모리↑ |
| `ef_construction` | 64 | 빌드 시 탐색 폭. 높으면 품질↑, 빌드 시간↑ |

- **장점**: 검색 속도와 재현율 모두 우수. 증분 삽입 가능.
- **단점**: 빌드 시간이 IVFFlat 대비 길고 메모리 사용량이 더 높다.
- **추천**: 프로덕션 환경. 데이터가 지속적으로 추가되는 경우.

### IVFFlat

```python
store.create_ivfflat_index(n_lists=100)
```

| 파라미터 | 기본값 | 의미 |
|----------|:------:|------|
| `n_lists` | 100 | 클러스터 수. `sqrt(총 벡터 수)` 근처가 적절 |

- **장점**: 빌드가 빠르다. 메모리 효율적.
- **단점**: 데이터 추가 후 재빌드(REINDEX) 필요. HNSW 대비 재현율 약간 낮음.
- **추천**: 배치 삽입 후 검색만 하는 정적 데이터셋.

### 인덱스 제거

```python
store.drop_index()
```

### 선택 기준

| 기준 | HNSW | IVFFlat |
|------|:----:|:-------:|
| 검색 정확도 | **높음** | 보통 |
| 빌드 속도 | 느림 | **빠름** |
| 증분 삽입 | **지원** | 재빌드 필요 |
| 메모리 사용 | 높음 | **낮음** |
| 프로덕션 추천 | **O** | 정적 데이터만 |

## 실전 조합: Hybrid + 메타데이터 + HNSW

세 기능을 조합하면 프로덕션 수준의 검색 파이프라인이 된다.

```python
from langchain_age import AGEVector, SearchType
from langchain_openai import OpenAIEmbeddings

# 1. Hybrid + HNSW로 스토어 구성
store = AGEVector(
    connection_string=conn_str,
    embedding_function=OpenAIEmbeddings(model="text-embedding-3-small"),
    collection_name="production_docs",
    search_type=SearchType.HYBRID,
)

# 2. 문서 적재
store.add_texts(
    texts=["..."],
    metadatas=[{"source": "internal", "year": 2026, "dept": "engineering"}],
)

# 3. HNSW 인덱스 생성
store.create_hnsw_index(m=16, ef_construction=64)

# 4. 메타데이터 필터 + Hybrid 검색
results = store.similarity_search(
    "PostgreSQL 그래프 확장 성능",
    k=5,
    filter={
        "$and": [
            {"source": "internal"},
            {"year": {"$gte": 2025}},
        ]
    },
)

# 5. LangChain Retriever로 변환
retriever = store.as_retriever(
    search_kwargs={
        "k": 5,
        "filter": {"dept": "engineering"},
    }
)
```

## LangChain Retriever 연동

AGEVector는 LangChain의 `as_retriever()`를 지원하므로 기존 RAG 체인에 바로 연결된다.

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_openai import ChatOpenAI

retriever = store.as_retriever(search_kwargs={"k": 5})

prompt = ChatPromptTemplate.from_template(
    "다음 컨텍스트를 기반으로 질문에 답변하세요.\n\n"
    "컨텍스트:\n{context}\n\n질문: {question}"
)

chain = (
    {"context": retriever, "question": lambda x: x}
    | prompt
    | ChatOpenAI(model="gpt-4o-mini")
    | StrOutputParser()
)

answer = chain.invoke("AGE의 Hybrid Search는 어떻게 동작하나?")
```

## 자주 묻는 질문

### Hybrid Search에서 벡터와 키워드의 가중치를 조절할 수 있나?

현재 RRF의 k값은 60으로 고정되어 있다. RRF의 특성상 k값이 클수록 두 순위의 차이가 평탄해지므로 k=60은 벡터와 키워드에 비슷한 가중치를 부여한다. 향후 버전에서 커스텀 가중치 지원이 계획되어 있다.

### 메타데이터 필터를 쓰면 검색이 느려지나?

JSONB 컬럼에 GIN 인덱스가 있으면 필터링 비용은 무시할 수 있다. AGEVector는 테이블 생성 시 메타데이터 컬럼을 JSONB로 생성하므로, 필요 시 `CREATE INDEX ON "collection" USING gin (metadata);`를 직접 추가하면 된다.

### MMR과 Hybrid를 동시에 쓸 수 있나?

`max_marginal_relevance_search()`는 `SearchType.VECTOR` 모드에서 동작한다. Hybrid + MMR 조합은 현재 미지원이지만, Hybrid로 후보를 넓게 가져온 후 애플리케이션 레벨에서 MMR 재정렬을 적용하는 패턴으로 우회할 수 있다.

### 기존 PostgreSQL에 pg_trgm이 없으면 Hybrid Search가 안 되나?

Hybrid Search는 PostgreSQL의 `tsvector` 전문 검색을 사용하며, 이는 PostgreSQL 기본 기능이다. `pg_trgm`은 선택적으로 유사도 매칭을 강화하지만 필수는 아니다. `langchain-age`의 Docker 이미지에는 pg_trgm이 사전 설치되어 있다.

## 다음 편 미리보기

이번 편에서 벡터 검색을 깊이 다뤘다. [4편](/posts/langchain-age-graphrag-pipeline)에서는 이 벡터 검색과 그래프 탐색을 결합해 GraphRAG 파이프라인을 end-to-end로 구축한다.

## 관련 포스트

- [GraphRAG를 PostgreSQL만으로 구축하기](/posts/graphrag-with-postgresql) — 1편: 개요와 빠른 시작
- [Neo4j vs Apache AGE 실측 벤치마크](/posts/neo4j-vs-age-benchmark) — 2편: 성능 비교
- [GraphRAG 파이프라인 실전 구축](/posts/langchain-age-graphrag-pipeline) — 4편: 벡터 + 그래프 통합
- [PostgreSQL 하나로 AI Agent 전체 스택](/posts/langchain-age-langgraph-agent) — 5편: LangGraph 연동

---

*langchain-age는 MIT 라이선스. Apache AGE는 Apache 2.0. pgvector는 PostgreSQL License.*
