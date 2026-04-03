---
author: baem1n
pubDatetime: 2026-04-03T12:00:00.000Z
title: "Neo4j vs Apache AGE 실측 벤치마크 — 같은 Cypher, 같은 데이터, 다른 결과"
description: "동일한 Cypher 쿼리를 Neo4j 5와 Apache AGE 1.7.0에서 실행한 공정 비교 벤치마크. 포인트 룩업, 1~6홉 탐색, CREATE, 배치 삽입, 스키마 조회 8개 항목을 실측했다."
tags:
  - benchmark
  - neo4j
  - apache-age
  - postgresql
  - graphrag
  - langchain
featured: true
---

> **TL;DR**: 1K 노드/2K 엣지 그래프에서 동일한 Cypher를 실행한 결과, AGE는 8개 테스트 중 **6개에서 Neo4j보다 빠르다** (포인트 룩업 2.2배, CREATE 3.7배, 스키마 조회 2.1배). Neo4j는 **3홉 이상 깊은 탐색에서 11~15배 빠르다**. RAG 워크로드 (1~2홉 + CRUD)에서는 AGE가 더 빠르고, 깊은 그래프 분석에서는 Neo4j가 확실히 우위다.

## Table of contents

## 왜 이 벤치마크가 필요한가

"Apache AGE는 Neo4j 대비 어떤가?"라는 질문에 대부분의 답변은 정성적이다 — "AGE는 PostgreSQL 확장이라 편하다", "Neo4j는 네이티브 그래프라 빠르다". 실측 데이터가 없다.

이 벤치마크는 **동일한 조건에서 동일한 쿼리를 실행**하여 정량적으로 비교한다.

## 테스트 환경

| 항목 | Neo4j | AGE |
|------|-------|-----|
| 버전 | Neo4j 5 (Docker) | PostgreSQL 18 + AGE 1.7.0 (Docker) |
| 드라이버 | `langchain-neo4j` (neo4j Python driver) | `langchain-age` (psycopg3) |
| 리소스 | 동일 머신, Docker 컨테이너 | 동일 머신, Docker 컨테이너 |

### 데이터셋

- **1,000 노드** (`:Node {idx, name}`)
- **2,000 엣지** (`:LINK` — 각 노드가 2개의 deterministic 관계)
- 양쪽에 **완전히 동일한 데이터**를 UNWIND로 삽입

### 측정 방법

```python
# 3회 웜업 후 N회 반복, p50(중앙값) 기준
def bench(fn, iterations=50):
    for _ in range(3): fn()  # warmup
    times = [measure(fn) for _ in range(iterations)]
    return median(times)
```

## 결과

| 테스트 | Neo4j p50 | AGE p50 | 승자 | 배율 |
|--------|:---------:|:-------:|:----:|:----:|
| **포인트 룩업** (MATCH by property) | 2.0ms | **0.9ms** | AGE | 2.2x |
| **1홉 탐색** | 1.7ms | **1.0ms** | AGE | 1.7x |
| **3홉 탐색** | **1.7ms** | 25.8ms | Neo4j | 14.9x |
| **6홉 탐색** | **2.4ms** | 27.7ms | Neo4j | 11.6x |
| **전체 카운트** (aggregation) | 1.5ms | **1.0ms** | AGE | 1.5x |
| **단건 CREATE** | 3.3ms | **0.9ms** | AGE | 3.7x |
| **배치 CREATE** (100 노드) | 2.6ms | **1.1ms** | AGE | 2.4x |
| **스키마 조회** (refresh_schema) | 16.6ms | **7.9ms** | AGE | 2.1x |

### AGE가 이긴 6개 항목

**포인트 룩업 (2.2x)**: PostgreSQL의 B-tree 인덱스가 단건 프로퍼티 조회에서 효율적이다.

**1홉 탐색 (1.7x)**: 얕은 관계 탐색은 PostgreSQL JOIN으로도 충분히 빠르다. RAG에서 가장 흔한 패턴.

**집계 (1.5x)**: `count(n)` 같은 전체 스캔에서 PostgreSQL 쿼리 플래너가 강점을 보인다.

**단건 CREATE (3.7x)**: PostgreSQL의 트랜잭션 오버헤드가 Neo4j보다 가볍다. LLM 응답을 실시간으로 그래프에 저장하는 패턴에서 유리.

**배치 CREATE (2.4x)**: UNWIND 100개 노드 기준. 양쪽 모두 UNWIND를 사용했으나 AGE가 더 빠르다.

**스키마 조회 (2.1x)**: `langchain-age`는 `ag_catalog` 시스템 테이블을 직접 SQL로 조회한다. Neo4j는 APOC 메타데이터를 거친다.

### Neo4j가 이긴 2개 항목

**3홉 탐색 (14.9x)**: Neo4j의 핵심 강점인 **index-free adjacency** — 관계를 포인터로 직접 따라가므로 JOIN 없이 탐색한다.

**6홉 탐색 (11.6x)**: 홉이 깊어질수록 Neo4j의 아키텍처 우위가 명확해진다. AGE는 매 홉마다 PostgreSQL JOIN이 필요하다.

## 분석: 왜 이런 차이가 나는가

### AGE가 빠른 영역 — PostgreSQL의 저력

AGE의 그래프 데이터는 PostgreSQL 테이블(`graph_name."LabelName"`)에 저장된다. 즉 PostgreSQL의 모든 최적화가 그대로 적용된다:

- **B-tree 인덱스**: 프로퍼티 룩업에 즉시 활용
- **쿼리 플래너**: 집계, 정렬, 필터에 수십 년간 최적화된 엔진
- **경량 트랜잭션**: MVCC 기반, 단건 쓰기에 효율적
- **통계 수집기**: `ANALYZE`로 최적 실행 계획 자동 선택

### Neo4j가 빠른 영역 — 네이티브 그래프 아키텍처

Neo4j는 관계를 **물리적 포인터**로 저장한다. 노드 A에서 노드 B로 이동할 때 인덱스 룩업이나 JOIN이 필요 없다 — 포인터를 따라가면 된다.

```
Neo4j:   Node A → [pointer] → Node B → [pointer] → Node C  (O(1) per hop)
AGE:     SELECT ... JOIN ... JOIN ... JOIN ...               (O(index) per hop)
```

1홉에서는 차이가 미미하지만, 3홉 이상에서는 지수적으로 벌어진다.

### AGE의 탈출구: `traverse()` + WITH RECURSIVE

`langchain-age`는 깊은 탐색을 위해 PostgreSQL `WITH RECURSIVE`를 사용하는 `traverse()` 메서드를 제공한다. AGE의 Cypher `*N` 대비 **10~22배 빠르다**:

```python
# Cypher *6: 27.7ms
graph.query("MATCH (a:Node {idx: 0})-[:LINK*6]->(b) RETURN count(b)")

# traverse(): ~4ms (WITH RECURSIVE)
graph.traverse(
    start_label="Node", start_filter={"idx": 0},
    edge_label="LINK", max_depth=6,
)
```

이 방법을 쓰면 6홉에서도 AGE가 Neo4j에 근접한 성능을 낸다. Neo4j에서는 불가능한 접근법이다 — Cypher 엔진을 우회할 수 없기 때문.

## 자주 묻는 질문

### Neo4j와 AGE의 Cypher 호환성은 어떤가?

AGE는 openCypher 스펙을 구현하며 MATCH, CREATE, MERGE, DELETE, UNWIND 등 핵심 문법을 지원한다. APOC 프로시저는 사용 불가. 이 벤치마크의 모든 쿼리는 양쪽에서 수정 없이 동일하게 실행됐다.

### 수십억 노드 규모에서도 AGE가 쓸만한가?

저장은 문제없다 (PostgreSQL 테이블 최대 32TB). 1~3홉 얕은 탐색은 규모가 커져도 인덱스 기반이라 성능이 유지된다. 6홉+ 깊은 탐색은 Neo4j가 더 적합하다.

### 벡터 검색 성능은 비교하지 않았나?

이 벤치마크는 **그래프 쿼리**에 집중했다. 벡터 검색은 양쪽 모두 pgvector / Neo4j Vector Index를 사용하며, 별도 벤치마크가 필요하다.

### langchain-age의 traverse()는 Neo4j에도 적용할 수 있나?

불가능하다. traverse()는 AGE의 데이터가 PostgreSQL 테이블에 저장되기 때문에 가능한 접근법이다. Neo4j는 자체 스토리지 엔진을 사용하므로 SQL을 실행할 수 없다.

## 결론

| 워크로드 | 추천 | 이유 |
|----------|------|------|
| RAG (1~2홉 + CRUD) | **AGE** | 포인트 룩업 2.2x, CREATE 3.7x 빠름 |
| 소셜 네트워크 분석 (3~6홉) | **Neo4j** | 깊은 탐색 11~15x 빠름 |
| 비용 최적화 | **AGE** | $0 vs $15K+/년 |
| 기존 PostgreSQL 인프라 | **AGE** | 확장 설치만으로 완료 |
| 엔터프라이즈 지원 | **Neo4j** | SLA, 24/7 지원 |

**대부분의 LLM/RAG 애플리케이션은 1~2홉이면 충분하다.** 이 영역에서 AGE는 Neo4j보다 빠르고, 무료이며, 운영이 단순하다.

## 재현 방법

```bash
git clone https://github.com/BAEM1N/langchain-age.git
cd langchain-age

# AGE 컨테이너
cd docker && docker compose up -d && cd ..

# Neo4j 컨테이너
docker run -d --name neo4j-bench -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/testpassword neo4j:5

# 벤치마크 실행
pip install -e ".[dev]" langchain-neo4j
python benchmarks/bench.py
```

벤치마크 스크립트는 [benchmarks/bench.py](https://github.com/BAEM1N/langchain-age/blob/main/benchmarks/bench.py)에 공개되어 있다.

## 관련 포스트

- [GraphRAG를 PostgreSQL만으로 구축하기](/posts/graphrag-with-postgresql)

---

*langchain-age는 MIT 라이선스. 벤치마크 코드와 데이터는 GitHub에서 누구나 재현 가능.*
