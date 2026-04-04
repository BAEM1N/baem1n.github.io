---
author: baem1n
pubDatetime: 2026-04-03T00:00:00.000Z
title: "GraphRAG with Just PostgreSQL — No Neo4j Required"
description: "Build a production-ready Graph + Vector RAG pipeline using only PostgreSQL with Apache AGE and pgvector. One database, one connection string, zero licensing fees."
tags:
  - rag
  - graphrag
  - postgresql
  - langchain
  - llm
featured: true
aiAssisted: true
---

> **Disclosure**: The author maintains [langchain-age](https://github.com/baem1n/langchain-age).

> **TL;DR**: Combine Apache AGE (graph) + pgvector (vector) on PostgreSQL to get the same GraphRAG capabilities as Neo4j + Pinecone — with **1 database, 1 connection string, 1 backup pipeline**. The `langchain-age` package plugs directly into the LangChain ecosystem.

## Table of contents

## Series

This is Part 1 of the langchain-age series.

1. **GraphRAG with Just PostgreSQL** (this post)
2. [Neo4j vs Apache AGE Benchmark](/en/posts/neo4j-vs-age-benchmark) — Performance Data
3. [Mastering Vector Search](/en/posts/langchain-age-hybrid-search) — Hybrid, MMR, Filtering
4. [Building a GraphRAG Pipeline](/en/posts/langchain-age-graphrag-pipeline) — Vector + Graph Integration
5. [Full AI Agent Stack on One PostgreSQL](/en/posts/langchain-age-langgraph-agent) — LangGraph Integration

## What You'll Be Able to Do

- Set up a PostgreSQL + AGE + pgvector environment with a single Docker command
- Build a knowledge graph with Cypher and vectorize nodes for semantic search
- Compare AGE vs Neo4j on cost, licensing, and operational complexity with real numbers
- Run a natural language → Cypher → graph answer pipeline using LLM-powered QA chains

## The Problem: Do You Really Need Two Databases for GraphRAG?

GraphRAG retrieves context from both a knowledge graph and vector embeddings before generating an answer. The most common approach uses Neo4j, but that means:

- **Another database** to deploy, monitor, back up, and secure
- **$15K–$100K/year** for Enterprise licensing (HA, RBAC, online backup)
- **GPL licensing** — propagation risk when embedding in commercial products
- **Two connection strings** — your existing PostgreSQL plus Neo4j

If you already run PostgreSQL, the same instance can handle both graph and vector workloads.

## The Answer: Apache AGE + pgvector

[Apache AGE](https://age.apache.org/) adds Cypher graph queries to PostgreSQL. [pgvector](https://github.com/pgvector/pgvector) adds vector similarity search. Both run inside the same PostgreSQL instance.

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

## Neo4j vs PostgreSQL+AGE Comparison

| | Neo4j + Pinecone | PostgreSQL + AGE + pgvector |
|---|:---:|:---:|
| Databases | 2 (graph + vector) | **1** |
| Licensing | GPL + proprietary | **Apache 2.0 + PostgreSQL License** |
| HA cost | $15K+/year + vector DB pricing | **$0** (PG native HA) |
| LangChain integration | `langchain-neo4j` | **`langchain-age`** |
| Deployment | 2 clusters to manage | **1 PostgreSQL** |
| Backup | 2 pipelines | **1 pg_dump** |
| Long-term memory | Separate DB or service | **Same DB** (LangGraph PostgresStore) |

## Setup in 5 Minutes

### Step 1: Start the Database

```bash
git clone https://github.com/BAEM1N/langchain-age.git
cd langchain-age/docker
docker compose up -d
```

One container. AGE + pgvector + pg_trgm pre-installed.

### Step 2: Install

```bash
pip install "langchain-age[all]" langchain-openai
```

### Step 3: Build a Knowledge Graph

```python
from langchain_age import AGEGraph

graph = AGEGraph(
    "host=localhost port=5433 dbname=langchain_age user=langchain password=langchain",
    graph_name="company_kg",
)

# Same Cypher as Neo4j — no new syntax to learn
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

### Step 4: Vectorize Graph Nodes

```python
from langchain_age import AGEVector
from langchain_openai import OpenAIEmbeddings

store = AGEVector.from_existing_graph(
    embedding=OpenAIEmbeddings(model="text-embedding-3-small"),
    connection_string="host=localhost port=5433 ...",
    graph_name="company_kg",
    node_label="Person",
    text_node_properties=["name", "role"],
    collection_name="person_vectors",
)
```

### Step 5: GraphRAG — Vector Search + Graph Context

```python
# Step 1: Find relevant nodes via vector search
docs = store.similarity_search("engineering leadership", k=2)

# Step 2: Expand context via graph relationships
for doc in docs:
    label = doc.metadata["node_label"]
    neighbors = graph.query(
        f"MATCH (n:{label})-[r]->(m) RETURN type(r) AS rel, m.name AS name"
    )
    print(f"{doc.page_content}: {neighbors}")
```

### Step 6: LLM-Powered Cypher QA

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

## Why AGE Instead of Neo4j

### 1. You Already Have PostgreSQL

Most applications already run PostgreSQL. Adding AGE is `CREATE EXTENSION age;` — not deploying a new database cluster.

### 2. Licensing Freedom

Neo4j Community is GPL. If you embed it in a distributed product, GPL propagates. Neo4j Enterprise requires a commercial license ($15K+/year).

Apache AGE is Apache 2.0. No restrictions.

### 3. Total Cost Comparison

| Scenario | Neo4j | AGE |
|----------|-------|-----|
| Dev/test | Free (Community, single node) | Free |
| Production HA | **$15K+/year** (Enterprise) or AuraDB ($65/GB/month) | **$0** (PostgreSQL Patroni/repmgr) |
| Vector search | Separate vector DB needed | **Included** (pgvector) |
| Long-term memory | Separate service needed | **Included** (LangGraph PostgresStore) |

### 4. One Backup, One Monitor, One Team

Your PostgreSQL DBA already knows how to set up streaming replication, run pg_dump, monitor with pg_stat_statements, and manage connection pooling with PgBouncer. No new operational expertise required.

### 5. Performance Is Fine for RAG — Measured Data

"Isn't AGE slower than Neo4j?" Here are actual measurements on the same 1K-node / 2K-edge graph, identical Cypher:

| Test | Neo4j p50 | AGE p50 | Winner |
|------|:---------:|:-------:|:------:|
| Point lookup | 2.0ms | **0.9ms** | AGE 2.2x |
| 1-hop traversal | 1.7ms | **1.0ms** | AGE 1.7x |
| Single CREATE | 3.3ms | **0.9ms** | AGE 3.7x |
| 3-hop traversal | **1.7ms** | 25.8ms | Neo4j 14.9x |
| 6-hop traversal | **2.4ms** | 27.7ms | Neo4j 11.6x |

AGE is faster than Neo4j for the most common RAG patterns (1–2 hop lookups, CRUD). Neo4j only wins at 3+ hop deep traversals.

Even deep traversals can be reversed with `langchain-age`'s `traverse()` (PostgreSQL WITH RECURSIVE):

| Depth | AGE Cypher | AGE traverse() | Neo4j |
|:-----:|:----------:|:--------------:|:-----:|
| 3-hop | 26.4ms | **1.3ms** | 1.7ms |
| 6-hop | 28.2ms | **1.4ms** | 2.4ms |

With traverse(), AGE beats Neo4j by 1.7x even at 6 hops. See the full benchmark in [Neo4j vs AGE Benchmark](/en/posts/neo4j-vs-age-benchmark).

## When Neo4j IS Better

Being honest:

- **Billions of nodes + deep graph algorithms** (PageRank, community detection) — Neo4j GDS has no equivalent in AGE
- **Enterprise support contracts** — Neo4j has a sales team, SLAs, and 24/7 support
- **Mature ecosystem** — 450+ APOC procedures, Bloom visualization, GraphConnect conference

If your workload is "social network analysis on 10 billion edges with real-time community detection", use Neo4j and pay the license fee. It's worth it.

If your workload is "RAG application that needs graph context alongside vector search", AGE on PostgreSQL is the simpler, cheaper, and more maintainable choice.

## Frequently Asked Questions

### How compatible is Apache AGE's Cypher with Neo4j?

AGE implements the openCypher spec and supports core syntax including CREATE, MATCH, MERGE, and DELETE. Neo4j-specific APOC procedures are not available, but standard CRUD and pattern matching queries work as-is.

### pgvector vs Pinecone — which vector DB is better for RAG?

For workloads under 10 million vectors, pgvector is sufficient. It has zero infrastructure cost and works within PostgreSQL transactions. For hundreds of millions of vectors with ultra-low latency requirements, consider a dedicated vector DB like Pinecone.

### Is langchain-age compatible with LangGraph?

Yes. You can use LangGraph's PostgresStore and Checkpoint on the same PostgreSQL instance, managing graph, vector, and agent state in a single database.

### Can I migrate an existing Neo4j graph to AGE?

Export nodes and relationships via Cypher EXPORT, then load them with identical CREATE statements in AGE. For large datasets, use AGE's CSV loader for efficiency.

### How compatible is langchain-age with the langchain-neo4j API?

langchain-age mirrors the langchain-neo4j API. `AGEGraph` corresponds to `Neo4jGraph`, `AGEVector` to `Neo4jVector`, and `AGEGraphCypherQAChain` to `GraphCypherQAChain`. In most cases, changing import paths and the connection string is all that's needed. Code using Neo4j-specific APOC procedures will need modification.

### Should I migrate from Neo4j to AGE?

Not necessarily. If Neo4j is working well and licensing costs aren't a concern, there's no reason to switch. AGE is advantageous when: (1) you already run PostgreSQL and don't want another database, (2) GPL licensing conflicts with your commercial product, or (3) you want to reduce HA costs.

### Is Apache AGE production-ready?

Apache AGE is an Apache Software Foundation Top-Level Project and runs as a PostgreSQL extension, inheriting PostgreSQL's MVCC, WAL, and crash recovery guarantees. For production HA, you can use existing PG HA solutions like Patroni or repmgr without any AGE-specific configuration.

## Getting Started

```bash
pip install "langchain-age[all]"
```

- [GitHub](https://github.com/BAEM1N/langchain-age)
- [Tutorial (EN)](https://github.com/BAEM1N/langchain-age/blob/main/docs/en/tutorial.md)
- [Tutorial (KO)](https://github.com/BAEM1N/langchain-age/blob/main/docs/ko/tutorial.md)
- [Notebooks](https://github.com/BAEM1N/langchain-age/tree/main/notebooks)

- [Apache AGE Official](https://age.apache.org/)
- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [LangChain Docs](https://python.langchain.com/)

## Key Takeaways

- Apache AGE is a PostgreSQL extension, so your existing PG infrastructure (HA, backups, monitoring) works as-is. No new operational expertise needed.
- Neo4j Enterprise HA licensing costs $15K+/year. AGE achieves the same availability for $0 using PostgreSQL-native HA (Patroni/repmgr).
- `langchain-age` mirrors the `langchain-neo4j` API, so existing Neo4j code can be migrated by changing import paths and connection strings.
- Graph (AGE) + Vector (pgvector) + Long-term Memory (LangGraph PostgresStore) all run on one PostgreSQL — one backup pipeline, one monitoring target.

## Related

- [Neo4j vs Apache AGE Benchmark](/en/posts/neo4j-vs-age-benchmark) — Part 2: Performance Comparison
- [Mastering Vector Search](/en/posts/langchain-age-hybrid-search) — Part 3: Hybrid, MMR, Filtering
- [Building a GraphRAG Pipeline](/en/posts/langchain-age-graphrag-pipeline) — Part 4: Vector + Graph Integration
- [Full AI Agent Stack on One PostgreSQL](/en/posts/langchain-age-langgraph-agent) — Part 5: LangGraph Integration

---

*langchain-age is MIT licensed. Apache AGE is Apache 2.0. pgvector is PostgreSQL License. No licensing fees, no vendor lock-in.*
