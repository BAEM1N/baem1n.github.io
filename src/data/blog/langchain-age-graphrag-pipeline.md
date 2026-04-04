---
author: baem1n
pubDatetime: 2026-04-04T00:00:00.000Z
title: "GraphRAG 파이프라인 실전 구축 — 벡터 검색에서 그래프 확장까지"
description: "langchain-age로 그래프 노드 벡터화, 벡터 검색 → 그래프 확장 → LLM 답변의 GraphRAG 파이프라인을 end-to-end로 구축한다. 실제 데이터셋 기반 워크스루 포함."
tags:
  - rag
  - graphrag
  - postgresql
  - langchain
  - llm
featured: false
aiAssisted: true
---

> **TL;DR**: GraphRAG는 "벡터 검색으로 관련 엔티티를 찾고, 그래프에서 관계를 확장해 LLM에 풍부한 컨텍스트를 제공"하는 패턴이다. `langchain-age`의 `from_existing_graph()`로 그래프 노드를 한 줄에 벡터화하고, `AGEGraphCypherQAChain`으로 자연어 질문을 Cypher로 변환해 답변까지 자동화할 수 있다. 모든 것이 PostgreSQL 하나에서 동작한다.

## Table of contents

## 시리즈

이 글은 langchain-age 시리즈의 4편이다.

1. [GraphRAG를 PostgreSQL만으로 구축하기](/posts/graphrag-with-postgresql) — 개요 + 셋업
2. [Neo4j vs Apache AGE 실측 벤치마크](/posts/neo4j-vs-age-benchmark) — 성능 데이터
3. [벡터 검색 완전 정복](/posts/langchain-age-hybrid-search) — Hybrid, MMR, 필터링
4. **GraphRAG 파이프라인 실전 구축** (현재 글)
5. [PostgreSQL 하나로 AI Agent 전체 스택](/posts/langchain-age-langgraph-agent) — LangGraph 연동

## GraphRAG가 일반 RAG보다 나은 이유

일반 벡터 RAG는 질문과 유사한 텍스트 청크를 찾아서 LLM에 넘긴다. 이 방식의 한계:

- **관계 정보 손실**: "Alice가 Bob을 관리한다"는 관계가 서로 다른 청크에 흩어져 있으면 연결되지 않는다
- **멀티홉 질문 실패**: "Alice가 관리하는 사람이 참여하는 프로젝트는?"에 대해 벡터 검색만으로는 답변 불가
- **컨텍스트 부족**: 검색된 청크 주변의 구조적 맥락이 없다

GraphRAG는 지식 그래프의 관계를 활용해 이 문제를 해결한다:

```
일반 RAG:  질문 → 벡터 검색 → [청크1, 청크2] → LLM → 답변
GraphRAG:  질문 → 벡터 검색 → [엔티티] → 그래프 확장 → [엔티티+관계+이웃] → LLM → 답변
```

## 사전 준비

[1편](/posts/graphrag-with-postgresql)의 셋업이 완료되어 있다고 가정한다.

```bash
# 데이터베이스
cd langchain-age/docker && docker compose up -d

# 패키지
pip install "langchain-age[all]" langchain-openai
```

## Step 1: 지식 그래프 구축

연구팀 조직과 프로젝트를 모델링하는 그래프를 만든다.

```python
from langchain_age import AGEGraph

conn_str = "host=localhost port=5433 dbname=langchain_age user=langchain password=langchain"

graph = AGEGraph(conn_str, graph_name="research_kg")

# 연구원
graph.query("CREATE (:Researcher {name: 'Alice', role: 'Lead', specialty: 'Graph DB'})")
graph.query("CREATE (:Researcher {name: 'Bob', role: 'Senior', specialty: 'NLP'})")
graph.query("CREATE (:Researcher {name: 'Carol', role: 'Junior', specialty: 'Vector Search'})")
graph.query("CREATE (:Researcher {name: 'Dave', role: 'Senior', specialty: 'LLM'})")

# 프로젝트
graph.query("CREATE (:Project {name: 'GraphRAG', status: 'active', desc: 'Graph-enhanced RAG pipeline'})")
graph.query("CREATE (:Project {name: 'HybridSearch', status: 'active', desc: 'Vector + full-text fusion'})")
graph.query("CREATE (:Project {name: 'AgentMemory', status: 'planning', desc: 'Long-term memory for agents'})")

# 논문
graph.query("CREATE (:Paper {title: 'Efficient Graph Traversal with CTE', year: 2026})")
graph.query("CREATE (:Paper {title: 'RRF for Hybrid Search', year: 2025})")

# 관계: 팀 구조
graph.query(
    "MATCH (a:Researcher {name: 'Alice'}), (b:Researcher {name: 'Bob'}) "
    "CREATE (a)-[:MANAGES]->(b)"
)
graph.query(
    "MATCH (a:Researcher {name: 'Alice'}), (c:Researcher {name: 'Carol'}) "
    "CREATE (a)-[:MANAGES]->(c)"
)

# 관계: 프로젝트 참여
graph.query(
    "MATCH (a:Researcher {name: 'Alice'}), (p:Project {name: 'GraphRAG'}) "
    "CREATE (a)-[:LEADS]->(p)"
)
graph.query(
    "MATCH (b:Researcher {name: 'Bob'}), (p:Project {name: 'GraphRAG'}) "
    "CREATE (b)-[:WORKS_ON]->(p)"
)
graph.query(
    "MATCH (c:Researcher {name: 'Carol'}), (p:Project {name: 'HybridSearch'}) "
    "CREATE (c)-[:WORKS_ON]->(p)"
)
graph.query(
    "MATCH (d:Researcher {name: 'Dave'}), (p:Project {name: 'AgentMemory'}) "
    "CREATE (d)-[:LEADS]->(p)"
)

# 관계: 논문 저술
graph.query(
    "MATCH (a:Researcher {name: 'Alice'}), (p:Paper {title: 'Efficient Graph Traversal with CTE'}) "
    "CREATE (a)-[:AUTHORED]->(p)"
)
graph.query(
    "MATCH (c:Researcher {name: 'Carol'}), (p:Paper {title: 'RRF for Hybrid Search'}) "
    "CREATE (c)-[:AUTHORED]->(p)"
)
```

스키마를 확인한다:

```python
graph.refresh_schema()
print(graph.schema)
# Node labels and properties:
#   :Researcher {name, role, specialty}
#   :Project {name, status, desc}
#   :Paper {title, year}
# Relationship types and properties:
#   [:MANAGES] {}
#   [:LEADS] {}
#   [:WORKS_ON] {}
#   [:AUTHORED] {}
```

## Step 2: 그래프 노드 벡터화

`from_existing_graph()`는 지정한 라벨의 노드를 읽어서, 텍스트 프로퍼티를 결합하고, 임베딩을 생성해서 벡터 테이블에 저장한다. **한 줄이면 된다.**

```python
from langchain_age import AGEVector
from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

# 연구원 노드 벡터화
researcher_store = AGEVector.from_existing_graph(
    embedding=embeddings,
    connection_string=conn_str,
    graph_name="research_kg",
    node_label="Researcher",
    text_node_properties=["name", "role", "specialty"],  # 이 프로퍼티들을 결합해 임베딩
    collection_name="researcher_vectors",
)

# 프로젝트 노드 벡터화
project_store = AGEVector.from_existing_graph(
    embedding=embeddings,
    connection_string=conn_str,
    graph_name="research_kg",
    node_label="Project",
    text_node_properties=["name", "desc"],
    collection_name="project_vectors",
)
```

내부적으로 생성되는 텍스트 (Researcher 예시):
```
name: Alice
role: Lead
specialty: Graph DB
```

각 벡터 레코드의 메타데이터에는 `node_label`과 `age_node_id`가 자동으로 포함된다. 이것이 벡터 검색 결과를 그래프로 다시 연결하는 열쇠다.

## Step 3: 벡터 검색 → 그래프 확장

GraphRAG의 핵심 패턴: **벡터로 시작점을 찾고, 그래프로 컨텍스트를 확장한다.**

```python
def graphrag_search(query: str, store: AGEVector, graph: AGEGraph, k: int = 2):
    """벡터 검색 후 그래프 관계로 컨텍스트를 확장한다."""

    # 1단계: 벡터 검색으로 관련 엔티티 찾기
    docs = store.similarity_search(query, k=k)

    enriched_results = []
    for doc in docs:
        entity = {
            "text": doc.page_content,
            "metadata": doc.metadata,
            "neighbors": [],
        }

        # 2단계: 그래프에서 나가는 관계 확장
        node_label = doc.metadata["node_label"]
        outgoing = graph.query(
            f"MATCH (n:{node_label})-[r]->(m) "
            f"WHERE n.name = %s "
            f"RETURN type(r) AS rel, m.name AS name",
            params=(doc.metadata.get("name", ""),),
        )

        # 3단계: 들어오는 관계도 확장
        incoming = graph.query(
            f"MATCH (m)-[r]->(n:{node_label}) "
            f"WHERE n.name = %s "
            f"RETURN type(r) AS rel, m.name AS name",
            params=(doc.metadata.get("name", ""),),
        )

        entity["neighbors"] = {
            "outgoing": outgoing,
            "incoming": incoming,
        }
        enriched_results.append(entity)

    return enriched_results


# 실행
results = graphrag_search(
    "그래프 데이터베이스 전문가",
    researcher_store,
    graph,
)

for r in results:
    print(f"\n=== {r['text']} ===")
    for o in r["neighbors"]["outgoing"]:
        print(f"  → [{o['rel']}] → {o['name']}")
    for i in r["neighbors"]["incoming"]:
        print(f"  ← [{i['rel']}] ← {i['name']}")
```

예상 출력:
```
=== name: Alice / role: Lead / specialty: Graph DB ===
  → [MANAGES] → Bob
  → [MANAGES] → Carol
  → [LEADS] → GraphRAG
  → [AUTHORED] → Efficient Graph Traversal with CTE
```

벡터 검색만으로는 "Alice는 Graph DB 전문가"만 알 수 있다. 그래프 확장으로 "Alice는 Bob과 Carol을 관리하며, GraphRAG 프로젝트를 이끌고, CTE 논문을 저술했다"까지 알게 된다.

## Step 4: LLM에 풍부한 컨텍스트 제공

확장된 컨텍스트를 LLM에 전달해 답변을 생성한다.

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_openai import ChatOpenAI

def format_graphrag_context(results: list[dict]) -> str:
    """GraphRAG 결과를 LLM 컨텍스트 문자열로 변환."""
    context_parts = []
    for r in results:
        part = f"엔티티: {r['text']}\n"
        for rel in r["neighbors"].get("outgoing", []):
            part += f"  → [{rel['rel']}] → {rel['name']}\n"
        for rel in r["neighbors"].get("incoming", []):
            part += f"  ← [{rel['rel']}] ← {rel['name']}\n"
        context_parts.append(part)
    return "\n".join(context_parts)


prompt = ChatPromptTemplate.from_template(
    "다음은 지식 그래프에서 검색한 정보입니다.\n\n"
    "{context}\n\n"
    "위 정보를 바탕으로 질문에 답변하세요.\n"
    "질문: {question}"
)

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

# GraphRAG 체인 실행
results = graphrag_search("그래프 DB 관련 프로젝트를 이끄는 사람", researcher_store, graph)
context = format_graphrag_context(results)

chain = prompt | llm | StrOutputParser()
answer = chain.invoke({"context": context, "question": "그래프 DB 관련 프로젝트를 이끄는 사람은 누구이며, 어떤 연구를 했나?"})
print(answer)
# Alice가 GraphRAG 프로젝트를 이끌고 있으며, 'Efficient Graph Traversal with CTE' 논문을 저술했습니다.
# Alice는 Bob과 Carol을 관리하며, Graph DB를 전문으로 합니다.
```

## Step 5: AGEGraphCypherQAChain — 자동화된 GraphRAG

위 과정을 수동으로 구성하지 않고, LLM이 직접 Cypher를 생성해서 그래프를 조회하는 방식도 있다.

```python
from langchain_age import AGEGraphCypherQAChain
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

chain = AGEGraphCypherQAChain.from_llm(
    llm,
    graph=graph,
    allow_dangerous_requests=True,
    return_intermediate_steps=True,
    verbose=True,
)

result = chain.invoke({"query": "Alice가 관리하는 사람들이 참여하는 프로젝트는?"})
print(result["result"])
print(result["intermediate_steps"][0]["query"])
# MATCH (a:Researcher {name: 'Alice'})-[:MANAGES]->(r:Researcher)-[:WORKS_ON]->(p:Project)
# RETURN p.name AS project, r.name AS researcher
```

### 스키마 필터링으로 정확도 높이기

그래프가 커지면 LLM에 전체 스키마를 노출하면 Cypher 생성 정확도가 떨어진다. 필요한 타입만 화이트리스트로 제한한다.

```python
# 연구원-프로젝트 관계만 노출
chain = AGEGraphCypherQAChain.from_llm(
    llm,
    graph=graph,
    include_types=["Researcher", "Project", "MANAGES", "LEADS", "WORKS_ON"],
    allow_dangerous_requests=True,
)

# 또는 블랙리스트로 제외
chain = AGEGraphCypherQAChain.from_llm(
    llm,
    graph=graph,
    exclude_types=["Paper", "AUTHORED"],  # 논문 관련 제외
    allow_dangerous_requests=True,
)
```

스키마 필터링의 효과:

| 접근법 | LLM에 노출되는 스키마 | Cypher 정확도 |
|--------|:---:|:---:|
| 전체 노출 | 모든 라벨, 관계 | 보통 |
| 화이트리스트 | 필요한 것만 | **높음** |
| 블랙리스트 | 불필요한 것 제외 | 높음 |

## Step 6: 딥 트래버셜로 멀티홉 확장

1-2홉 확장으로 부족한 경우, `traverse()`로 깊은 관계까지 탐색할 수 있다. [2편](/posts/neo4j-vs-age-benchmark)에서 다뤘듯이 `traverse()`는 Cypher `*N`보다 10-22배 빠르다.

```python
# Alice에서 MANAGES 관계를 따라 3홉 이내 도달 가능한 모든 노드
reachable = graph.traverse(
    start_label="Researcher",
    start_filter={"name": "Alice"},
    edge_label="MANAGES",
    max_depth=3,
    direction="outgoing",
    return_properties=True,
)

for node in reachable:
    print(f"  depth={node['depth']} → {node['properties']}")
# depth=1 → {'name': 'Bob', 'role': 'Senior', 'specialty': 'NLP'}
# depth=1 → {'name': 'Carol', 'role': 'Junior', 'specialty': 'Vector Search'}
```

## 두 가지 GraphRAG 패턴 비교

| 패턴 | 수동 파이프라인 | CypherQAChain |
|------|:---:|:---:|
| 벡터 검색 | O | X |
| 그래프 확장 | 직접 구현 | LLM이 Cypher 생성 |
| 유연성 | **높음** | 보통 |
| 구현 난이도 | 보통 | **쉬움** |
| 멀티홉 | traverse() 활용 | Cypher `*N` |
| 적합 용도 | 커스텀 파이프라인 | 프로토타입, 단순 QA |

**추천**: 프로토타입은 CypherQAChain으로 빠르게 검증하고, 프로덕션은 수동 파이프라인으로 제어한다.

## 자주 묻는 질문

### from_existing_graph()는 그래프가 변경되면 벡터도 자동 업데이트되나?

아니다. `from_existing_graph()`는 호출 시점의 그래프 스냅샷을 벡터화한다. 그래프가 변경되면 다시 호출해야 한다. 프로덕션에서는 그래프 변경 이벤트에 맞춰 주기적으로 재벡터화하는 파이프라인을 구성하는 것이 좋다.

### CypherQAChain에서 allow_dangerous_requests는 왜 필요한가?

LLM이 생성하는 Cypher는 예측할 수 없으므로, `CREATE`나 `DELETE`같은 쓰기 쿼리가 생성될 수 있다. `allow_dangerous_requests=True`는 이 위험을 인지했다는 명시적 동의다. 프로덕션에서는 읽기 전용 DB 커넥션을 사용하거나, Cypher 검증 로직을 추가하는 것을 권장한다.

### 벡터 검색과 Cypher QA 중 어떤 것이 더 정확한가?

벡터 검색은 의미적 유사도 기반이므로 "비슷한 것"을 잘 찾는다. Cypher는 구조적 관계를 정확하게 따라간다. "Alice가 관리하는 사람의 프로젝트"같은 구조적 질문은 Cypher가 정확하고, "그래프 DB 전문가"같은 의미적 질문은 벡터 검색이 낫다. 둘을 조합하는 것이 가장 강력하다.

### GraphDocument로 LLM이 자동 추출한 엔티티를 그래프에 넣을 수 있나?

가능하다. LangChain의 `LLMGraphTransformer`로 텍스트에서 엔티티/관계를 추출하고, `graph.add_graph_documents()`로 일괄 삽입하면 된다. 이 패턴으로 비정형 문서에서 자동으로 지식 그래프를 구축할 수 있다.

## 다음 편 미리보기

이번 편에서 GraphRAG 파이프라인을 완성했다. [5편](/posts/langchain-age-langgraph-agent)에서는 여기에 LangGraph Agent를 연동해 "대화하면서 지식그래프를 점진적으로 구축하는 에이전트"를 만든다. 그래프, 벡터, 체크포인트, 장기 메모리가 모두 같은 PostgreSQL에서 동작한다.

## 관련 포스트

- [GraphRAG를 PostgreSQL만으로 구축하기](/posts/graphrag-with-postgresql) — 1편: 개요와 빠른 시작
- [Neo4j vs Apache AGE 실측 벤치마크](/posts/neo4j-vs-age-benchmark) — 2편: 성능 비교
- [벡터 검색 완전 정복](/posts/langchain-age-hybrid-search) — 3편: Hybrid, MMR, 필터링
- [PostgreSQL 하나로 AI Agent 전체 스택](/posts/langchain-age-langgraph-agent) — 5편: LangGraph 연동

---

*langchain-age는 MIT 라이선스. Apache AGE는 Apache 2.0. pgvector는 PostgreSQL License.*
