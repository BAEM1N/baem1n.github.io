---
author: baem1n
pubDatetime: 2026-04-03T00:00:00.000Z
title: "GraphRAG를 PostgreSQL만으로 구축하기 — Neo4j 없이 Apache AGE + pgvector"
description: "Neo4j 없이 PostgreSQL 하나로 GraphRAG 파이프라인을 구축하는 방법. Apache AGE와 pgvector를 조합해 그래프 + 벡터 검색을 단일 DB에서 운영하는 실전 가이드."
tags:
  - rag
  - graphrag
  - postgresql
  - langchain
  - llm
featured: true
aiAssisted: true
---

> **TL;DR**: Apache AGE(그래프) + pgvector(벡터)를 PostgreSQL 위에 올리면 Neo4j + Pinecone 조합과 동일한 GraphRAG를 **DB 1개, 커넥션 1개, 백업 1개**로 운영할 수 있다. `langchain-age` 패키지로 LangChain 생태계에 바로 연결된다.

## Table of contents

## 문제: GraphRAG를 위해 DB를 2개 운영해야 하나?

GraphRAG는 지식 그래프와 벡터 임베딩을 함께 검색해서 LLM에 컨텍스트를 제공하는 패턴이다. 가장 많이 인용되는 접근법은 Neo4j를 사용하지만, 이는 곧:

- **별도 DB** 배포·모니터링·백업·보안 관리
- **$15K~$100K/년** Enterprise 라이선스 (HA, RBAC, 온라인 백업)
- **GPL 라이선스** — 상용 제품에 포함 시 전파 문제
- **커넥션 2개** — 기존 PostgreSQL + Neo4j

이미 PostgreSQL을 쓰고 있다면, 같은 인스턴스에서 그래프와 벡터를 모두 처리할 수 있다.

## 해답: Apache AGE + pgvector

[Apache AGE](https://age.apache.org/)는 PostgreSQL에 Cypher 그래프 쿼리를 추가하는 확장이다. [pgvector](https://github.com/pgvector/pgvector)는 벡터 유사도 검색을 추가한다. 둘 다 같은 PostgreSQL 인스턴스 안에서 동작한다.

```
┌─────────────────────────────────────┐
│          PostgreSQL 18              │
│                                     │
│  ┌───────────┐  ┌────────────────┐  │
│  │ Apache AGE│  │   pgvector     │  │
│  │  (Cypher) │  │  (Embeddings)  │  │
│  └───────────┘  └────────────────┘  │
│                                     │
│  ┌────────────────────────────────┐  │
│  │   LangGraph Store/Checkpoint  │  │
│  └────────────────────────────────┘  │
└─────────────────────────────────────┘
     One database. One connection string.
```

## Neo4j vs PostgreSQL+AGE 비교

| 항목 | Neo4j + Pinecone | PostgreSQL + AGE + pgvector |
|------|:---:|:---:|
| 데이터베이스 수 | 2 (그래프 + 벡터) | **1** |
| 라이선스 | GPL + 상용 | **Apache 2.0 + PostgreSQL License** |
| HA 비용 | $15K+/년 + 벡터 DB 요금 | **$0** (PG 네이티브 HA) |
| LangChain 연동 | `langchain-neo4j` | **`langchain-age`** |
| 배포 | 클러스터 2개 관리 | **PostgreSQL 1개** |
| 백업 | 파이프라인 2개 | **pg_dump 1개** |
| 장기 메모리 | 별도 DB/서비스 | **동일 DB** (LangGraph PostgresStore) |

## 5분 만에 셋업하기

### Step 1: 데이터베이스 시작

```bash
git clone https://github.com/BAEM1N/langchain-age.git
cd langchain-age/docker
docker compose up -d
```

컨테이너 1개에 AGE + pgvector + pg_trgm이 사전 설치되어 있다.

### Step 2: 패키지 설치

```bash
pip install "langchain-age[all]" langchain-openai
```

### Step 3: 지식 그래프 구축

```python
from langchain_age import AGEGraph

graph = AGEGraph(
    "host=localhost port=5433 dbname=langchain_age user=langchain password=langchain",
    graph_name="company_kg",
)

# Neo4j와 동일한 Cypher 문법 — 새로 배울 것 없음
graph.query("CREATE (:Person {name: 'Alice', role: 'CTO'})")
graph.query("CREATE (:Person {name: 'Bob', role: 'Engineer'})")
graph.query("CREATE (:Product {name: 'AGE', desc: 'Graph extension for PostgreSQL'})")
graph.query(
    "MATCH (a:Person {name: 'Alice'}), (p:Product {name: 'AGE'}) "
    "CREATE (a)-[:LEADS]->(p)"
)
graph.query(
    "MATCH (a:Person {name: 'Alice'}), (b:Person {name: 'Bob'}) "
    "CREATE (a)-[:MANAGES]->(b)"
)
```

### Step 4: 그래프 노드 벡터화

```python
from langchain_age import AGEVector
from langchain_openai import OpenAIEmbeddings

# 한 줄로: 그래프 노드 → 벡터 임베딩
store = AGEVector.from_existing_graph(
    embedding=OpenAIEmbeddings(model="text-embedding-3-small"),
    connection_string="host=localhost port=5433 ...",
    graph_name="company_kg",
    node_label="Person",
    text_node_properties=["name", "role"],
    collection_name="person_vectors",
)
```

### Step 5: GraphRAG — 벡터 검색 + 그래프 컨텍스트

```python
# 1단계: 벡터 검색으로 관련 노드 찾기
docs = store.similarity_search("engineering leadership", k=2)

# 2단계: 그래프 관계로 컨텍스트 확장
for doc in docs:
    label = doc.metadata["node_label"]
    neighbors = graph.query(
        f"MATCH (n:{label})-[r]->(m) RETURN type(r) AS rel, m.name AS name"
    )
    print(f"{doc.page_content}: {neighbors}")
```

### Step 6: LLM 기반 Cypher QA

```python
from langchain_age import AGEGraphCypherQAChain
from langchain_openai import ChatOpenAI

chain = AGEGraphCypherQAChain.from_llm(
    ChatOpenAI(model="gpt-4o-mini"),
    graph=graph,
    allow_dangerous_requests=True,
)

answer = chain.run("Who does Alice manage?")
# "Alice manages Bob, who is an Engineer."
```

## Neo4j 대신 AGE를 쓰는 이유

### 1. 이미 PostgreSQL을 쓰고 있다

대부분의 애플리케이션은 이미 PostgreSQL을 운영 중이다. AGE 추가는 `CREATE EXTENSION age;` 한 줄이지, 새 DB 클러스터를 배포하는 것이 아니다.

### 2. 라이선스 자유

Neo4j Community는 GPL이다. 상용 제품에 포함하면 GPL이 전파된다. Enterprise는 $15K+/년 상용 라이선스가 필요하다.

Apache AGE는 Apache 2.0이다. 제약 없이 사용 가능하다.

### 3. 총 비용 비교

| 시나리오 | Neo4j | AGE |
|----------|-------|-----|
| 개발/테스트 | 무료 (Community, 단일 노드) | 무료 |
| 프로덕션 HA | **$15K+/년** (Enterprise) 또는 AuraDB ($65/GB/월) | **$0** (PostgreSQL Patroni/repmgr) |
| 벡터 검색 | 별도 벡터 DB 필요 | **포함** (pgvector) |
| 장기 메모리 | 별도 서비스 필요 | **포함** (LangGraph PostgresStore) |

### 4. 백업 1개, 모니터링 1개, 팀 1개

PostgreSQL DBA가 이미 알고 있는 것들:
- 스트리밍 복제 설정
- pg_dump / pg_basebackup 실행
- pg_stat_statements 모니터링
- PgBouncer 커넥션 풀링

새로운 운영 전문성이 필요 없다.

### 5. RAG 워크로드에서 성능은 충분하다

Neo4j의 인덱스 프리 인접성은 6홉 이상의 깊은 탐색에서 유리하다. 하지만 RAG 워크로드는 보통 1~3홉이다: "관련 문서 찾기", "엔티티 컨텍스트 확장".

이 패턴에서 AGE는 충분히 빠르다. `langchain-age`는 PostgreSQL의 `WITH RECURSIVE`를 활용한 `traverse()` 메서드를 제공하며, 깊은 홉에서 AGE 자체 Cypher보다 **10~22배 빠른** 성능을 보인다.

## Neo4j가 더 나은 경우

솔직하게 말하면:

- **수십억 노드 + 깊은 그래프 알고리즘** (PageRank, 커뮤니티 탐지) — Neo4j GDS에 대응하는 AGE 기능은 없음
- **엔터프라이즈 지원 계약** — Neo4j는 영업팀, SLA, 24/7 지원 제공
- **성숙한 생태계** — 450+ APOC 프로시저, Bloom 시각화, GraphConnect 컨퍼런스

"100억 엣지 소셜 네트워크에서 실시간 커뮤니티 탐지"가 워크로드라면 Neo4j를 쓰고 라이선스비를 내라. 그만한 가치가 있다.

"벡터 검색과 함께 그래프 컨텍스트가 필요한 RAG 애플리케이션"이 워크로드라면, PostgreSQL 위의 AGE가 더 단순하고, 저렴하고, 유지보수하기 쉬운 선택이다.

## 자주 묻는 질문

### Apache AGE와 Neo4j의 Cypher 호환성은 어느 정도인가?

AGE는 openCypher 스펙을 구현하며 CREATE, MATCH, MERGE, DELETE 등 핵심 문법을 지원한다. Neo4j 전용 APOC 프로시저는 사용할 수 없지만, 일반적인 CRUD와 패턴 매칭 쿼리는 그대로 동작한다.

### pgvector와 Pinecone 중 어떤 벡터 DB가 RAG에 적합한가?

1,000만 벡터 이하의 워크로드에서는 pgvector가 충분하다. 별도 인프라 비용이 없고 PostgreSQL 트랜잭션과 함께 동작한다. 수억 벡터 + 초저지연이 필요하면 Pinecone 같은 전용 벡터 DB를 고려하라.

### langchain-age는 LangGraph와 호환되나?

호환된다. 같은 PostgreSQL 인스턴스에서 LangGraph의 PostgresStore와 Checkpoint를 함께 사용할 수 있어, 그래프·벡터·에이전트 상태를 DB 하나로 관리 가능하다.

### 기존 Neo4j 그래프를 AGE로 마이그레이션할 수 있나?

Cypher EXPORT로 노드와 관계를 내보낸 후 AGE에서 동일한 CREATE 문으로 적재할 수 있다. 대량 데이터는 AGE의 CSV 로더를 사용하면 효율적이다.

## 시작하기

```bash
pip install "langchain-age[all]"
```

- [GitHub](https://github.com/BAEM1N/langchain-age)
- [Tutorial (EN)](https://github.com/BAEM1N/langchain-age/blob/main/docs/en/tutorial.md)
- [Tutorial (KO)](https://github.com/BAEM1N/langchain-age/blob/main/docs/ko/tutorial.md)
- [Notebooks](https://github.com/BAEM1N/langchain-age/tree/main/notebooks)

*langchain-age는 MIT 라이선스. Apache AGE는 Apache 2.0. pgvector는 PostgreSQL License. 라이선스 비용 없음, 벤더 종속 없음.*
