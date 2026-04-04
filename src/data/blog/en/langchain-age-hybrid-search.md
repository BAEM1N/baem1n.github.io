---
author: baem1n
pubDatetime: 2026-04-04T00:00:00.000Z
title: "Mastering Vector Search with langchain-age — Hybrid Search, MMR, and Metadata Filtering"
description: "Compare Similarity, MMR, and Hybrid Search strategies with working code. Covers MongoDB-style metadata filtering (14 operators) and HNSW/IVFFlat index strategies for pgvector."
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

> **TL;DR**: AGEVector in `langchain-age` supports three search strategies: Similarity, MMR, and Hybrid (vector + full-text RRF). Hybrid Search combines semantic similarity with keyword matching via RRF (k=60), improving recall over pure vector search. MongoDB-style metadata filters (`$gte`, `$in`, `$between`, etc. — 14 operators) narrow the search scope, and HNSW indexes keep response times in milliseconds at scale.

## Table of contents

## Series

This is Part 3 of the langchain-age series.

1. [GraphRAG with Just PostgreSQL](/en/posts/graphrag-with-postgresql) — Overview + Setup
2. [Neo4j vs Apache AGE Benchmark](/en/posts/neo4j-vs-age-benchmark) — Performance Data
3. **Mastering Vector Search** (this post)
4. [Building a GraphRAG Pipeline](/en/posts/langchain-age-graphrag-pipeline) — Vector + Graph Integration
5. [Full AI Agent Stack on One PostgreSQL](/en/posts/langchain-age-langgraph-agent) — LangGraph Integration

## Background: Vector Search Alone Is Not Enough

[Part 1](/en/posts/graphrag-with-postgresql) introduced AGEVector basics. Using `similarity_search()` to find semantically similar documents is straightforward. But in production you quickly hit limitations:

- **Synonym/abbreviation gaps**: Searching "PostgreSQL" misses documents containing "PG"
- **Lack of diversity**: Top results are nearly identical in content
- **No scope control**: You want only 2024+ documents, but vector distance can't express that

AGEVector provides a search strategy for each of these problems.

## Three Search Strategies

### 1. Similarity Search — The Default

Cosine distance over embedding vectors. Returns the k nearest documents by semantic similarity.

```python
from langchain_age import AGEVector, DistanceStrategy
from langchain_openai import OpenAIEmbeddings

store = AGEVector(
    connection_string="host=localhost port=5433 dbname=langchain_age user=langchain password=langchain",
    embedding_function=OpenAIEmbeddings(model="text-embedding-3-small"),
    collection_name="tech_docs",
    distance_strategy=DistanceStrategy.COSINE,
)

# Basic similarity search
docs = store.similarity_search("PostgreSQL extensions", k=5)

# With distance scores (lower = more similar)
results = store.similarity_search_with_score("PostgreSQL extensions", k=5)

# With relevance scores (0–1, higher = more similar)
results = store.similarity_search_with_relevance_scores("PostgreSQL extensions", k=5)
```

**Strengths**: Simple and fast.
**Limitations**: No keyword matching — may miss documents with exact terms.

### 2. MMR — Ensuring Diversity

Maximal Marginal Relevance balances relevance with diversity. Reuses stored embeddings so there is **no extra embedding API call**.

```python
docs = store.max_marginal_relevance_search(
    "database technology",
    k=3,              # Final result count
    fetch_k=10,       # Candidate pool size
    lambda_mult=0.5,  # 0=max diversity, 1=max relevance
)
```

**How it works**:
1. Fetch top `fetch_k` candidates by vector similarity
2. Select the most similar document first
3. Iteratively select the candidate most dissimilar from already-selected documents
4. `lambda_mult` controls the relevance-diversity ratio

**When to use**: When LLM context would otherwise be filled with near-duplicate passages, wasting tokens. MMR provides diverse angles for better answers.

### 3. Hybrid Search — Vectors + Keywords Combined

Combines vector similarity with PostgreSQL full-text search (tsvector) via RRF (Reciprocal Rank Fusion, k=60).

```python
from langchain_age import AGEVector, SearchType

store = AGEVector(
    connection_string=conn_str,
    embedding_function=embeddings,
    collection_name="hybrid_docs",
    search_type=SearchType.HYBRID,  # Key: enable hybrid mode
)

store.add_texts([
    "PostgreSQL supports JSON and full-text search.",
    "Apache AGE adds Cypher graph queries to PostgreSQL.",
    "pgvector enables vector similarity search.",
    "PG's extension system allows custom data types.",
])

# Automatically combines vector + keyword matching
results = store.similarity_search("PostgreSQL graph extension", k=3)
```

**RRF scoring**:

```
score(doc) = 1/(k + rank_vector) + 1/(k + rank_keyword)
```

| Document | Vector Rank | Keyword Rank | RRF Score (k=60) |
|----------|:-----------:|:------------:|:-----------------:|
| "Apache AGE adds..." | 1 | 1 | 1/61 + 1/61 = **0.0328** |
| "PG's extension system..." | 3 | 2 | 1/63 + 1/62 = **0.0320** |
| "pgvector enables..." | 2 | ∞ | 1/62 + 0 = 0.0161 |

A document ranked 3rd in vector but 2nd in keyword outscores one ranked 2nd in vector but absent from keyword results.

**When to use**: Domains where abbreviations, proper nouns, or exact terms matter — Hybrid improves recall over vector-only search.

## Strategy Comparison

| Strategy | Semantic | Keyword | Diversity | Best For |
|----------|:--------:|:-------:|:---------:|----------|
| Similarity | Yes | No | No | General similarity search |
| MMR | Yes | No | **Yes** | Diverse LLM context |
| Hybrid | **Yes** | **Yes** | No | Exact terms/abbreviations matter |

## Metadata Filtering

AGEVector supports MongoDB-style filters on JSONB metadata. 14 operators let you precisely control the search scope.

### Basic Usage

```python
# Add documents with metadata
store.add_texts(
    ["AGE 1.7.0 release notes", "pgvector 0.8 performance", "LangChain v1 migration"],
    metadatas=[
        {"author": "alice", "year": 2026, "tag": "release"},
        {"author": "bob", "year": 2026, "tag": "benchmark"},
        {"author": "alice", "year": 2025, "tag": "migration"},
    ],
)
```

### Comparison Operators

```python
# Equality
store.similarity_search("release", filter={"author": "alice"})

# Comparison
store.similarity_search("performance", filter={"year": {"$gte": 2026}})

# Set membership
store.similarity_search("query", filter={"tag": {"$in": ["release", "benchmark"]}})

# Range
store.similarity_search("query", filter={"year": {"$between": [2025, 2026]}})

# Pattern matching (case-insensitive)
store.similarity_search("query", filter={"author": {"$ilike": "%ali%"}})

# Field existence
store.similarity_search("query", filter={"tag": {"$exists": True}})
```

### Logical Combinations

```python
# AND
store.similarity_search("query", filter={
    "$and": [
        {"author": "alice"},
        {"year": {"$gte": 2026}},
    ]
})

# OR
store.similarity_search("query", filter={
    "$or": [
        {"tag": "release"},
        {"tag": "benchmark"},
    ]
})
```

### Full Operator Reference

| Operator | Meaning | Example |
|----------|---------|---------|
| `$eq` | Equal | `{"year": {"$eq": 2026}}` |
| `$ne` | Not equal | `{"tag": {"$ne": "draft"}}` |
| `$lt` | Less than | `{"score": {"$lt": 0.5}}` |
| `$lte` | Less or equal | `{"score": {"$lte": 0.5}}` |
| `$gt` | Greater than | `{"year": {"$gt": 2024}}` |
| `$gte` | Greater or equal | `{"year": {"$gte": 2025}}` |
| `$in` | In set | `{"tag": {"$in": ["a", "b"]}}` |
| `$nin` | Not in set | `{"tag": {"$nin": ["draft"]}}` |
| `$between` | Range | `{"score": {"$between": [0.5, 1.0]}}` |
| `$like` | Pattern (case-sensitive) | `{"name": {"$like": "%AGE%"}}` |
| `$ilike` | Pattern (case-insensitive) | `{"name": {"$ilike": "%age%"}}` |
| `$exists` | Field exists | `{"bio": {"$exists": True}}` |
| `$and` | AND combination | `{"$and": [{...}, {...}]}` |
| `$or` | OR combination | `{"$or": [{...}, {...}]}` |

Internally, these translate to JSONB operators (`->>` and PostgreSQL comparisons), so GIN indexes on the metadata column make filtering fast.

## Index Strategies: HNSW vs IVFFlat

Once vectors exceed tens of thousands, sequential scan becomes slow. pgvector provides two approximate nearest neighbor (ANN) index types.

### HNSW (Recommended for Production)

```python
store.create_hnsw_index(m=16, ef_construction=64)
```

| Parameter | Default | Meaning |
|-----------|:-------:|---------|
| `m` | 16 | Connections per node. Higher = better recall, more memory |
| `ef_construction` | 64 | Build-time search width. Higher = better quality, slower build |

- **Pros**: Excellent search speed and recall. Supports incremental inserts.
- **Cons**: Slower build time and higher memory than IVFFlat.
- **Best for**: Production environments. Data that grows over time.

### IVFFlat

```python
store.create_ivfflat_index(n_lists=100)
```

| Parameter | Default | Meaning |
|-----------|:-------:|---------|
| `n_lists` | 100 | Cluster count. `sqrt(total_vectors)` is a good starting point |

- **Pros**: Fast to build. Memory-efficient.
- **Cons**: Needs REINDEX after data additions. Slightly lower recall than HNSW.
- **Best for**: Static datasets with batch inserts followed by search-only workloads.

### Dropping Indexes

```python
store.drop_index()
```

### Selection Guide

| Criteria | HNSW | IVFFlat |
|----------|:----:|:-------:|
| Search accuracy | **High** | Moderate |
| Build speed | Slow | **Fast** |
| Incremental inserts | **Supported** | Needs rebuild |
| Memory usage | High | **Low** |
| Production recommended | **Yes** | Static data only |

## Putting It Together: Hybrid + Metadata + HNSW

Combining all three features gives you a production-grade search pipeline.

```python
from langchain_age import AGEVector, SearchType
from langchain_openai import OpenAIEmbeddings

# 1. Configure store with Hybrid + HNSW
store = AGEVector(
    connection_string=conn_str,
    embedding_function=OpenAIEmbeddings(model="text-embedding-3-small"),
    collection_name="production_docs",
    search_type=SearchType.HYBRID,
)

# 2. Load documents
store.add_texts(
    texts=["..."],
    metadatas=[{"source": "internal", "year": 2026, "dept": "engineering"}],
)

# 3. Create HNSW index
store.create_hnsw_index(m=16, ef_construction=64)

# 4. Metadata filter + Hybrid search
results = store.similarity_search(
    "PostgreSQL graph extension performance",
    k=5,
    filter={
        "$and": [
            {"source": "internal"},
            {"year": {"$gte": 2025}},
        ]
    },
)

# 5. Convert to LangChain Retriever
retriever = store.as_retriever(
    search_kwargs={
        "k": 5,
        "filter": {"dept": "engineering"},
    }
)
```

## LangChain Retriever Integration

AGEVector supports `as_retriever()`, so it plugs directly into existing RAG chains.

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_openai import ChatOpenAI

retriever = store.as_retriever(search_kwargs={"k": 5})

prompt = ChatPromptTemplate.from_template(
    "Answer the question based on the following context.\n\n"
    "Context:\n{context}\n\nQuestion: {question}"
)

chain = (
    {"context": retriever, "question": lambda x: x}
    | prompt
    | ChatOpenAI(model="gpt-4o-mini")
    | StrOutputParser()
)

answer = chain.invoke("How does Hybrid Search work in AGE?")
```

## FAQ

### Can I adjust the weights between vector and keyword scores in Hybrid Search?

The RRF k value is currently fixed at 60. With k=60, RRF assigns roughly equal weight to both ranking signals. Custom weight support is planned for a future release.

### Does metadata filtering slow down search?

With a GIN index on the JSONB column, filtering cost is negligible. AGEVector creates the metadata column as JSONB, so you can manually add `CREATE INDEX ON "collection" USING gin (metadata);` if needed.

### Can I combine MMR and Hybrid?

`max_marginal_relevance_search()` operates in `SearchType.VECTOR` mode. Hybrid + MMR is not currently supported directly, but you can use Hybrid to fetch a broader candidate set and apply MMR-style reranking at the application level.

### Does Hybrid Search require pg_trgm?

Hybrid Search uses PostgreSQL's built-in `tsvector` full-text search, which requires no extensions. `pg_trgm` optionally enhances similarity matching but is not required. The langchain-age Docker image includes pg_trgm pre-installed.

## Next Up

This post covered vector search in depth. [Part 4](/en/posts/langchain-age-graphrag-pipeline) combines vector search with graph traversal to build an end-to-end GraphRAG pipeline.

## Related Posts

- [GraphRAG with Just PostgreSQL](/en/posts/graphrag-with-postgresql) — Part 1: Overview and Quick Start
- [Neo4j vs Apache AGE Benchmark](/en/posts/neo4j-vs-age-benchmark) — Part 2: Performance Comparison
- [Building a GraphRAG Pipeline](/en/posts/langchain-age-graphrag-pipeline) — Part 4: Vector + Graph Integration
- [Full AI Agent Stack on One PostgreSQL](/en/posts/langchain-age-langgraph-agent) — Part 5: LangGraph Integration

---

*langchain-age is MIT licensed. Apache AGE is Apache 2.0. pgvector is PostgreSQL License.*
