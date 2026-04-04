---
author: baem1n
pubDatetime: 2026-04-04T07:00:00.000Z
title: "DeepCoWork #8: 에이전트 메모리 4계층 -- SOUL.md, USER.md, AGENTS.md, MEMORY.md"
description: "DeepCoWork의 4단계 메모리 시스템이 어떻게 에이전트의 페르소나, 사용자 선호, 세션 기억을 관리하는지 해부합니다."
tags:
  - agent-memory
  - system-prompt
  - personalization
  - ai-agent
aiAssisted: true
---

> **TL;DR**: DeepCoWork는 4개의 마크다운 파일로 에이전트 메모리를 관리한다. SOUL.md(페르소나), USER.md(사용자 선호), AGENTS.md(에이전트 지침)는 글로벌이고, MEMORY.md는 워크스페이스별 세션 기억이다. 모두 시스템 프롬프트에 자동 주입되며, UI에서 직접 편집 가능하다.

## Table of contents

## 4계층 구조

```
~/.cowork/                      (글로벌)
    +-- SOUL.md                  에이전트 페르소나
    +-- USER.md                  사용자 선호
    +-- AGENTS.md                에이전트 지침
    +-- {workspace}/             (워크스페이스별)
          +-- MEMORY.md          세션 기억
```

| 계층 | 파일 | 범위 | 수정 주체 | 용도 |
|------|------|------|-----------|------|
| 1 | SOUL.md | 글로벌 | 사용자 (UI) | 에이전트 성격, 전문성, 소통 스타일 |
| 2 | USER.md | 글로벌 | 사용자 (UI) | 선호 언어, 기술 스택, 금지 사항 |
| 3 | AGENTS.md | 글로벌 | 사용자 (UI) | 작업 규칙, 워크플로, 도구 가이드 |
| 4 | MEMORY.md | 워크스페이스 | 에이전트 (자동) | 세션 간 기억할 사항 |

## 시스템 프롬프트 주입

`build_system_prompt()`가 존재하는 메모리 파일만 시스템 프롬프트에 포함한다:

```python
def build_system_prompt(mode: str, workspace_dir: Path) -> str:
    soul = read_memory_file(config.WORKSPACE_ROOT / "SOUL.md")
    user_prefs = read_memory_file(config.WORKSPACE_ROOT / "USER.md")
    session_memory = read_memory_file(workspace_dir / "MEMORY.md")

    parts = [role_declaration, mode_prompt, common_rules]

    if soul:
        parts.append(f"## 에이전트 페르소나 (SOUL.md)\n{soul}")
    if user_prefs:
        parts.append(f"## 사용자 선호 (USER.md)\n{user_prefs}")
    if session_memory:
        parts.append(f"## 이전 세션 메모리 (MEMORY.md)\n{session_memory}")

    return "\n\n".join(parts)
```

비어있는 파일은 건너뛴다 -- 불필요한 컨텍스트를 LLM에 넘기지 않는다.

## SOUL.md: 에이전트 페르소나

앱 최초 실행 시 기본 페르소나가 생성된다:

```python
def _init_default_soul():
    soul_path = config.WORKSPACE_ROOT / "SOUL.md"
    if not soul_path.exists():
        soul_path.write_text(
            "# Agent Persona\n\n"
            "열정적이고 체계적인 시니어 엔지니어처럼 행동합니다.\n"
            "복잡한 문제를 명확하게 분해하고, 코드 품질을 중시하며,\n"
            "팀워크와 지식 공유를 가치 있게 생각합니다.\n"
            "간결하고 직접적으로 소통합니다.",
            encoding="utf-8",
        )
```

사용자가 원하는 페르소나로 수정할 수 있다. 예: "항상 일본어로 응답하세요" 또는 "주니어 개발자에게 설명하듯이 상세하게 답하세요."

## MEMORY.md: 세션 자동 기록

에이전트가 `memory_write` 도구로 세션 중 중요한 정보를 자동 저장한다:

```python
@tool
def memory_write(content: str) -> str:
    """중요한 정보를 MEMORY.md에 기록합니다."""
    mem_file = workspace_dir / "MEMORY.md"
    existing = mem_file.read_text(encoding="utf-8") if mem_file.exists() else "# Session Memory\n"
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    new_entry = f"\n## [{timestamp}]\n{content.strip()}\n"
    mem_file.write_text(existing + new_entry, encoding="utf-8")
    return "MEMORY.md에 저장 완료."
```

기록 형식:
```markdown
# Session Memory

## [2026-04-03 14:30]
사용자는 TypeScript 프로젝트에서 ESLint flat config를 사용하고 있음.
패키지 매니저는 pnpm 사용.

## [2026-04-03 15:45]
API 서버는 포트 3001에서 실행, CORS 설정 필요.
```

다음 세션에서 에이전트가 이 정보를 시스템 프롬프트로 받아 맥락을 유지한다.

## memory_read: 메모리 조회

```python
@tool
def memory_read(target: str = "all") -> str:
    """저장된 메모리를 읽습니다.
    target: 'soul' | 'user' | 'memory' | 'all'"""
    files = {
        "soul": config.WORKSPACE_ROOT / "SOUL.md",
        "user": config.WORKSPACE_ROOT / "USER.md",
        "memory": workspace_dir / "MEMORY.md",
    }
    results = []
    for key, path in files.items():
        if target not in ("all", key):
            continue
        content = read_memory_file(path)
        if content:
            results.append(f"### {key.upper()}.md\n{content}")
    return "\n\n".join(results) if results else "저장된 메모리가 없습니다."
```

에이전트가 스스로 메모리를 조회할 수 있다. HITL 없이 자동 실행된다.

## UI: MemoryPanel

```tsx
export function MemoryPanel() {
  const [values, setValues] = useState<Record<MemoryKey, string>>({
    soul: "", user: "", agents: "",
  });

  async function handleSave(key: MemoryKey) {
    await updateMemory(key, values[key]);
  }

  return (
    <div>
      {(["agents", "soul", "user"] as MemoryKey[]).map((key) => (
        <div key={key}>
          <span className="font-mono">{LABELS[key].title}</span>
          <textarea
            value={values[key]}
            onChange={(e) => setValues((p) => ({ ...p, [key]: e.target.value }))}
          />
          <button onClick={() => handleSave(key)}>저장</button>
        </div>
      ))}

      {/* MEMORY.md는 읽기 전용 안내 */}
      <div>
        <p>MEMORY.md (세션별 자동 기록)</p>
        <p>에이전트가 memory_write 도구로 자동 저장 · Files 탭에서 확인</p>
      </div>
    </div>
  );
}
```

SOUL, USER, AGENTS는 UI에서 직접 편집하고, MEMORY.md는 에이전트가 자동 관리한다.

## 메모리 저장 API

```python
@router.post("/settings/memory")
async def update_memory(req: MemoryUpdateRequest):
    target_map = {
        "soul": config.WORKSPACE_ROOT / "SOUL.md",
        "user": config.WORKSPACE_ROOT / "USER.md",
        "agents": config.WORKSPACE_ROOT / "AGENTS.md",
    }
    path = target_map.get(req.target)
    # 50KB 크기 제한
    if len(req.content.encode("utf-8")) > config.MAX_MEMORY_BYTES:
        raise HTTPException(413, "메모리 파일 크기는 50KB를 초과할 수 없습니다")
    path.write_text(req.content, encoding="utf-8")
    await rebuild_all_agents_safe()  # 모든 에이전트에 즉시 반영
    return {"ok": True}
```

메모리 변경 시 `rebuild_all_agents_safe()`가 모든 활성 에이전트의 시스템 프롬프트를 갱신한다.

## 다른 에이전트 앱과의 비교

| 특성 | DeepCoWork | Claude Code | Cursor |
|------|-----------|------------|--------|
| 페르소나 커스텀 | SOUL.md | CLAUDE.md | Rules |
| 사용자 선호 | USER.md | - | - |
| 에이전트 지침 | AGENTS.md | CLAUDE.md | .cursorrules |
| 세션 기억 | MEMORY.md (자동) | - | - |
| 편집 방식 | UI 내장 에디터 | 파일 직접 편집 | 설정 UI |

## 자주 묻는 질문

### MEMORY.md가 너무 커지면?

현재는 자동 정리가 없다. 파일 탭에서 직접 편집하거나, 에이전트에게 "메모리를 요약해줘"라고 요청하면 된다. 향후 자동 요약 기능을 추가할 예정이다.

### AGENTS.md와 SOUL.md의 차이는?

SOUL.md는 에이전트의 성격과 소통 스타일을, AGENTS.md는 작업 수행 규칙과 도구 사용 가이드를 담는다. "친절하게 응답"은 SOUL.md, "테스트를 먼저 작성"은 AGENTS.md에 적합하다.

---

## 시리즈 목차

1. [DeepCoWork: AI 에이전트 데스크톱 앱을 만들었다](/posts/deepcowork-01-introduction)
2. [Tauri 2 + Python 사이드카](/posts/deepcowork-02-tauri-sidecar)
3. [DeepAgents SDK 핵심 해부](/posts/deepcowork-03-deep-agents-sdk)
4. [모드별 시스템 프롬프트 설계](/posts/deepcowork-04-system-prompts)
5. [SSE 스트리밍 파이프라인](/posts/deepcowork-05-sse-streaming)
6. [HITL 승인 플로우](/posts/deepcowork-06-hitl-approval)
7. [멀티에이전트 ACP 모드](/posts/deepcowork-07-acp-multi-agent)
8. **[이번 글]** 에이전트 메모리 4계층
9. [스킬 시스템](/posts/deepcowork-09-skills-system)
10. [LLM 프로바이더 통합](/posts/deepcowork-10-llm-providers)
11. [보안 체크리스트](/posts/deepcowork-11-security)
12. [GitHub Actions 크로스 플랫폼 빌드](/posts/deepcowork-12-ci-cd)
