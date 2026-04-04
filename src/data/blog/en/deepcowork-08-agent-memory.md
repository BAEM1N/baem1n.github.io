---
author: baem1n
pubDatetime: 2026-04-04T07:00:00.000Z
title: "DeepCoWork #8: Agent Memory 4 Layers -- SOUL.md, USER.md, AGENTS.md, MEMORY.md"
description: "A practical guide to DeepCoWork's 4-layer memory system for agent persona, user preferences, and session memory."
tags:
  - agent-memory
  - system-prompt
  - personalization
  - ai-agent
aiAssisted: true
---

> **TL;DR**: Four markdown files -- SOUL.md, USER.md, AGENTS.md, MEMORY.md -- manage everything from agent persona to session memory, all auto-injected into the system prompt.

## Table of contents

## The 4-Layer Structure

| Layer | File | Scope | Modified By | Purpose |
|-------|------|-------|-------------|---------|
| 1 | SOUL.md | Global | User (UI) | Agent personality, expertise, communication style |
| 2 | USER.md | Global | User (UI) | Preferred language, tech stack, constraints |
| 3 | AGENTS.md | Global | User (UI) | Work rules, workflows, tool usage guides |
| 4 | MEMORY.md | Per-workspace | Agent (auto) | Cross-session memory |

## System Prompt Injection

`build_system_prompt()` includes only existing memory files:

```python
def build_system_prompt(mode: str, workspace_dir: Path) -> str:
    soul = read_memory_file(config.WORKSPACE_ROOT / "SOUL.md")
    user_prefs = read_memory_file(config.WORKSPACE_ROOT / "USER.md")
    session_memory = read_memory_file(workspace_dir / "MEMORY.md")

    parts = [role_declaration, mode_prompt, common_rules]
    if soul:
        parts.append(f"## Agent Persona (SOUL.md)\n{soul}")
    if user_prefs:
        parts.append(f"## User Preferences (USER.md)\n{user_prefs}")
    if session_memory:
        parts.append(f"## Previous Session Memory (MEMORY.md)\n{session_memory}")

    return "\n\n".join(parts)
```

Empty files are skipped -- as the [LangChain token usage tracking guide](https://python.langchain.com/docs/how_to/chat_token_usage_tracking/) emphasizes, minimizing unnecessary context matters for both cost and quality.

## SOUL.md: Agent Persona

A default persona is created on first launch. Users can customize it to anything: "Always respond in Japanese" or "Explain things as if to a junior developer."

## MEMORY.md: Automatic Session Recording

The agent auto-saves important information via the `memory_write` tool:

```python
@tool
def memory_write(content: str) -> str:
    """Records important information to MEMORY.md."""
    mem_file = workspace_dir / "MEMORY.md"
    existing = mem_file.read_text(encoding="utf-8") if mem_file.exists() else "# Session Memory\n"
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    new_entry = f"\n## [{timestamp}]\n{content.strip()}\n"
    mem_file.write_text(existing + new_entry, encoding="utf-8")
    return "Saved to MEMORY.md."
```

Next session, the agent receives this as system prompt context to maintain continuity. Unlike [LangGraph persistence](https://langchain-ai.github.io/langgraph/concepts/persistence/) checkpointers, this file-based memory is human-readable and editable.

## Memory Update API

Memory changes trigger `rebuild_all_agents_safe()` to immediately refresh all active agent system prompts. A 50KB size limit prevents abuse.

## Comparison with Other Agent Apps

| Feature | DeepCoWork | Claude Code | Cursor |
|---------|-----------|------------|--------|
| Persona custom | SOUL.md | CLAUDE.md | Rules |
| User prefs | USER.md | - | - |
| Agent instructions | AGENTS.md | CLAUDE.md | .cursorrules |
| Session memory | MEMORY.md (auto) | - | - |
| Edit method | Built-in UI editor | Direct file edit | Settings UI |

## Benchmark

| Metric | Value |
|--------|-------|
| Memory file max size (SOUL/USER/AGENTS.md) | 50KB |
| MEMORY.md auto-record frequency (typical session) | 2-4 times/session |
| System prompt increase from memory injection | ~200-800 tokens |
| Memory change to agent rebuild time | ~150ms |
| rebuild_all_agents_safe() concurrency protection | asyncio.Lock (single rebuild guarantee) |

## FAQ

### What if MEMORY.md gets too large?

No auto-cleanup currently. Edit it in the Files tab or ask the agent to "summarize my memory." Auto-summarization is planned for a future release.

### What is the difference between AGENTS.md and SOUL.md?

SOUL.md defines personality and communication style. AGENTS.md defines work rules and tool usage guides. "Be friendly" goes in SOUL.md; "Always write tests first" goes in AGENTS.md.

---

## Series

1. [DeepCoWork: I Built an AI Agent Desktop App](/posts/deepcowork-01-introduction)
2. [Tauri 2 + Python Sidecar](/posts/deepcowork-02-tauri-sidecar)
3. [DeepAgents SDK Internals](/posts/deepcowork-03-deep-agents-sdk)
4. [System Prompt Design per Mode](/posts/deepcowork-04-system-prompts)
5. [SSE Streaming Pipeline](/posts/deepcowork-05-sse-streaming)
6. [HITL Approval Flow](/posts/deepcowork-06-hitl-approval)
7. [Multi-Agent ACP Mode](/posts/deepcowork-07-acp-multi-agent)
8. **[This post]** Agent Memory 4 Layers
9. [Skills System](/posts/deepcowork-09-skills-system)
10. [LLM Provider Integration](/posts/deepcowork-10-llm-providers)
11. [Security Checklist](/posts/deepcowork-11-security)
12. [GitHub Actions Cross-Platform Build](/posts/deepcowork-12-ci-cd)
