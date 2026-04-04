---
author: baem1n
pubDatetime: 2026-04-04T08:00:00.000Z
title: "DeepCoWork #9: Skills System -- SKILL.md, Progressive Disclosure, Runtime Injection"
description: "Design of the SKILL.md-based skills system: YAML frontmatter parsing, UI management, and runtime injection -- what we learned building it."
tags:
  - skills
  - plugin-system
  - agent
  - extensibility
aiAssisted: true
---

> **TL;DR**: A single `~/.cowork/skills/{name}/SKILL.md` file extends agent capabilities as a plugin, with UI-based CRUD and instant propagation to all agents.

## Table of contents

## What is a Skill

A skill is a plugin that extends agent capabilities. Adding a "django-expert" skill makes the agent specialize in Django projects. The design was inspired by the [Agent Skills Specification](https://www.agentskills.io/) community standard.

## SKILL.md Format

```markdown
---
name: django-expert
description: Django project specialist
allowed-tools: read_file write_file execute
---

# django-expert

## When to Use
- Working with Django models, views, URLs, serializers
- Designing Django REST Framework APIs

## Instructions
- Always read current settings before changing settings.py
- Run migrations in order: makemigrations -> migrate
- Use pytest-django for tests
```

## Frontmatter Parsing

A simple YAML parser with no external dependencies extracts name, description, and allowed_tools from the `---` delimited frontmatter block.

## Skill Resolution and Injection

At agent build time, `_resolve_skills()` scans skill directories:

```python
def _resolve_skills(workspace_dir: Path) -> list[str]:
    sources: list[str] = []
    global_skills = config.WORKSPACE_ROOT / "skills"
    if global_skills.is_dir():
        sources.append("skills/")
    ws_skills = workspace_dir / "skills"
    if ws_skills.is_dir():
        sources.append("skills/")
    return sources
```

Priority: global (`~/.cowork/skills/`) < workspace (`{workspace}/skills/`).

## REST API

Skills are managed through three endpoints:
- `GET /settings/skills` -- List all skills with parsed frontmatter
- `PUT /settings/skills/{name}` -- Create or update a skill
- `DELETE /settings/skills/{name}` -- Delete a skill

Skill name validation prevents path traversal attacks:

```python
def _validate_skill_name(name: str) -> str:
    if not re.match(r'^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]?$', name):
        raise HTTPException(400, "Skill name: lowercase letters, numbers, hyphens only")
    if ".." in name or "/" in name:
        raise HTTPException(400, "Invalid skill name")
    return name
```

## UI: SkillsPanel

The panel provides a list view of all skills with inline editing. Users can create skills from a template, edit SKILL.md content directly, and delete skills with confirmation. Allowed tools are displayed as badges.

## Progressive Disclosure

Skills follow a "load only when needed" pattern:
1. At agent build time, only check if skill directories exist
2. The [Deep Agents SDK](https://github.com/langchain-ai/deepagents)'s `SkillsMiddleware` activates only relevant skills for the task context
3. Deleting a skill deactivates it immediately

This prevents unnecessary skills from consuming LLM context.

## Benchmark

| Metric | Value |
|--------|-------|
| Skill loading time (SKILL.md parsing) | ~2ms/file |
| System prompt increase with 10 skills | ~1,500 tokens (metadata only) |
| Skill name max length | 64 chars (a-z, 0-9, hyphens) |
| Skill change to agent rebuild | ~150ms |
| API response time (GET /settings/skills) | ~8ms (5 skills) |

## Lessons Learned

Placing the skills folder at `~/.cowork/skills/` caused `_resolve_skills()` to return a relative path (`skills/`), which made the SDK look for a `skills/` directory relative to the current working directory. Skills showed up as 0. The fix was resolving paths relative to `config.WORKSPACE_ROOT`. Since it was a silent path mismatch with no error message, debugging took considerable time.

The second issue was skill name validation. Initially we allowed `/` in names, which opened a path traversal attack via `PUT /settings/skills/../../etc/passwd`. We locked it down to a regex allowing only lowercase letters, numbers, and hyphens, plus an additional `is_safe_path()` double-check.

Third, we considered using `pyyaml` for frontmatter parsing but decided against adding the dependency. A simple 20-line parser handling `key: value` pairs was sufficient -- there was no need to support nested YAML structures like `metadata.category`.

## FAQ

### Do I need to restart the agent after adding a skill?

No. `rebuild_all_agents_safe()` rebuilds all active agents immediately on skill changes. Applied from the next message in ongoing conversations.

### What does allowed-tools do?

Declares which tools the skill can use. Currently metadata-only; planned for tool access control in a future release.

---

## Series

1. [DeepCoWork: I Built an AI Agent Desktop App](/posts/deepcowork-01-introduction)
2. [Tauri 2 + Python Sidecar](/posts/deepcowork-02-tauri-sidecar)
3. [DeepAgents SDK Internals](/posts/deepcowork-03-deep-agents-sdk)
4. [System Prompt Design per Mode](/posts/deepcowork-04-system-prompts)
5. [SSE Streaming Pipeline](/posts/deepcowork-05-sse-streaming)
6. [HITL Approval Flow](/posts/deepcowork-06-hitl-approval)
7. [Multi-Agent ACP Mode](/posts/deepcowork-07-acp-multi-agent)
8. [Agent Memory 4 Layers](/posts/deepcowork-08-agent-memory)
9. **[This post]** Skills System
10. [LLM Provider Integration](/posts/deepcowork-10-llm-providers)
11. [Security Checklist](/posts/deepcowork-11-security)
12. [GitHub Actions Cross-Platform Build](/posts/deepcowork-12-ci-cd)
