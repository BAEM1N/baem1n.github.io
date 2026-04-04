---
author: baem1n
pubDatetime: 2026-04-04T10:00:00.000Z
title: "DeepCoWork #11: Security Checklist -- Path Traversal, Input Validation, CSP, CORS"
description: "Security measures implemented in an AI agent desktop app that has direct filesystem access."
tags:
  - security
  - cors
  - path-traversal
  - input-validation
  - ai-safety
aiAssisted: true
---

> **TL;DR**: A desktop app where AI agents directly access the filesystem demands strong security. DeepCoWork implements path traversal prevention, skill name validation, CORS whitelisting, file size limits, workspace boundary checks, and HITL approval as defense in depth.

## Table of contents

## Threat Model

| Threat | Vector | Impact |
|--------|--------|--------|
| Path traversal | `../../etc/passwd` | System file read/write |
| Prompt injection | Malicious user input | Agent executes unintended commands |
| Unrestricted shell | `rm -rf /` | System destruction |
| API key leak | Logs, error messages | Cost incurred, data exposure |
| Large file attack | 10GB file upload | Memory/disk exhaustion |

## 1. Path Traversal Prevention

`is_safe_path()` validates every file access:

```python
def is_safe_path(base: Path, target: Path) -> bool:
    try:
        target.resolve().relative_to(base.resolve())
        return True
    except ValueError:
        return False
```

`Path.resolve()` expands symlinks and `..`, then `relative_to()` checks containment within the base directory. Used in file read/write endpoints, skill directories, and workspace paths.

## 2. Workspace Boundary Check

User-specified workspace paths outside the home directory (`~`) are rejected and replaced with a default path. Prevents access to the root filesystem.

## 3. Skill Name Validation

```python
def _validate_skill_name(name: str) -> str:
    if not re.match(r'^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]?$', name):
        raise HTTPException(400, "Lowercase letters, numbers, hyphens only (1-64 chars)")
    if ".." in name or "/" in name or "\\" in name:
        raise HTTPException(400, "Invalid skill name")
    return name
```

Since skill names become directory names, path separators are strictly rejected.

## 4. CORS Whitelist

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1", "http://localhost",
        "tauri://localhost", "https://tauri.localhost",
    ],
    allow_origin_regex=r"http://(127\.0\.0\.1|localhost):\d+",
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Accept"],
)
```

Only localhost and Tauri-specific origins are allowed. External websites cannot call the API.

## 5. File Size Limits

| Resource | Limit |
|----------|-------|
| General files | 10MB |
| Memory files (SOUL/USER/AGENTS.md) | 50KB |
| Shell command output | 50KB (`max_output_bytes`) |
| Tool result SSE transmission | 2KB (truncated) |

## 6. HITL: Human Approval Gate

Dangerous tool calls cannot execute without user approval. Read-only tools are auto-approved. 300-second timeout triggers auto-rejection.

## 7. Shell Command Limits

`LocalShellBackend` restricts working directory, enforces 60-second timeout, and caps output at 50KB.

## 8. API Key Protection

Settings API returns `api_key_set: true/false` instead of the actual key value. Keys are stored only in environment variables and `~/.cowork.env`.

## Security Checklist Summary

- [x] Path traversal prevention (`is_safe_path` + `Path.resolve`)
- [x] Workspace boundary check (home directory based)
- [x] Input validation (skill names, file paths)
- [x] CORS whitelist (localhost + Tauri)
- [x] File size limits (10MB/50KB)
- [x] HITL approval (write/execute tools)
- [x] Shell command timeout (60s)
- [x] API key masking
- [x] SQLite WAL mode (data integrity)
- [ ] CSP headers (using Tauri defaults)
- [ ] Audit logging (planned)

## FAQ

### Can the agent run sudo commands?

Technically possible, but HITL shows `$ sudo ...` to the user for rejection. All shell commands through the `execute` tool require approval.

### Is prompt injection prevented?

There is no system-prompt-level defense. HITL is the practical defense line. Even if the agent generates malicious commands, they will not execute without user approval.

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
9. [Skills System](/posts/deepcowork-09-skills-system)
10. [LLM Provider Integration](/posts/deepcowork-10-llm-providers)
11. **[This post]** Security Checklist
12. [GitHub Actions Cross-Platform Build](/posts/deepcowork-12-ci-cd)
