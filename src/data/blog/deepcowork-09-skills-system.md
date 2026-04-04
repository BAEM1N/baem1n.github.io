---
author: baem1n
pubDatetime: 2026-04-04T08:00:00.000Z
title: "DeepCoWork #9: 스킬 시스템 -- SKILL.md, 프로그레시브 디스클로저, 런타임 주입"
description: "SKILL.md 기반 스킬 시스템의 설계, YAML 프론트매터 파싱, UI 관리, 런타임 주입 메커니즘을 분석합니다."
tags:
  - skills
  - plugin-system
  - agent
  - extensibility
aiAssisted: true
---

> **TL;DR**: DeepCoWork의 스킬 시스템은 `~/.cowork/skills/{name}/SKILL.md` 파일 기반이다. YAML 프론트매터로 이름, 설명, 허용 도구를 선언하고, 마크다운 본문에 에이전트 지침을 작성한다. 스킬은 UI에서 생성/편집/삭제 가능하며, 변경 즉시 모든 에이전트에 반영된다.

## Table of contents

## 스킬이란

스킬은 에이전트의 능력을 확장하는 플러그인이다. 예를 들어 "django-expert" 스킬을 추가하면 에이전트가 Django 프로젝트에 특화된 행동을 한다.

```
~/.cowork/skills/
    +-- django-expert/
    |       +-- SKILL.md
    +-- code-reviewer/
    |       +-- SKILL.md
    +-- test-writer/
            +-- SKILL.md
```

## SKILL.md 형식

```markdown
---
name: django-expert
description: Django 프로젝트 전문가
license: MIT
metadata:
  category: web
  version: "1.0"
allowed-tools: read_file write_file execute
---

# django-expert

## When to Use
- Django 프로젝트에서 모델, 뷰, URL, 시리얼라이저 작업할 때
- Django REST Framework API 설계 시

## Instructions
- settings.py 변경 전 반드시 현재 설정을 먼저 읽으세요
- migration은 항상 makemigrations -> migrate 순서로 실행
- 테스트는 pytest-django 사용
```

## 프론트매터 파싱

```python
def _parse_skill_frontmatter(content: str) -> dict:
    result = {"name": "", "description": "", "allowed_tools": []}
    if not content.startswith("---"):
        return result
    parts = content.split("---", 2)
    if len(parts) < 3:
        return result
    for line in parts[1].strip().splitlines():
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip()
        if key == "name":
            result["name"] = val
        elif key == "description":
            result["description"] = val
        elif key == "allowed-tools":
            result["allowed_tools"] = val.split()
    return result
```

단순한 YAML 파서로 외부 의존성 없이 처리한다.

## 스킬 해석과 주입

에이전트 빌드 시 `_resolve_skills()`가 스킬 디렉토리를 탐색한다:

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

`create_deep_agent`의 `skills` 파라미터로 전달되면, SDK가 스킬 디렉토리의 모든 SKILL.md를 읽어 에이전트 컨텍스트에 포함한다.

우선순위:
1. 글로벌 스킬: `~/.cowork/skills/`
2. 워크스페이스 스킬: `{workspace}/skills/` (오버라이드)

## REST API

### 스킬 목록 조회

```python
@router.get("/settings/skills")
async def list_skills():
    skills_dir = config.WORKSPACE_ROOT / "skills"
    if not skills_dir.is_dir():
        return {"skills": []}
    skills = []
    for d in sorted(skills_dir.iterdir()):
        if not d.is_dir():
            continue
        skill_file = d / "SKILL.md"
        if not skill_file.exists():
            continue
        content = read_memory_file(skill_file)
        meta = _parse_skill_frontmatter(content)
        meta["path"] = str(d.relative_to(config.WORKSPACE_ROOT))
        meta["content"] = content
        skills.append(meta)
    return {"skills": skills}
```

### 스킬 생성/수정

```python
@router.put("/settings/skills/{skill_name}")
async def update_skill(skill_name: str, req: MemoryUpdateRequest):
    safe_name = _validate_skill_name(skill_name)
    skill_dir = config.WORKSPACE_ROOT / "skills" / safe_name
    if not is_safe_path(config.WORKSPACE_ROOT / "skills", skill_dir.resolve()):
        raise HTTPException(403, "접근 거부")
    skill_dir.mkdir(parents=True, exist_ok=True)
    skill_file = skill_dir / "SKILL.md"
    skill_file.write_text(req.content, encoding="utf-8")
    await rebuild_all_agents_safe()
    return {"ok": True}
```

### 스킬 이름 검증

```python
def _validate_skill_name(name: str) -> str:
    clean = name.strip()
    if not re.match(r'^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]?$', clean):
        raise HTTPException(400, "스킬 이름은 영문 소문자, 숫자, 하이픈만 허용")
    if ".." in clean or "/" in clean or "\\" in clean:
        raise HTTPException(400, "잘못된 스킬 이름")
    return clean
```

경로 탈출 공격을 방지하기 위해 이름 형식을 엄격히 제한한다.

## UI: SkillsPanel

```tsx
export function SkillsPanel() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [skillContent, setSkillContent] = useState("");

  async function handleCreate() {
    const template = `---
name: ${name}
description: 새 스킬 설명을 입력하세요
allowed-tools: read_file write_file execute
---

# ${name}

## When to Use
- ...

## Instructions
...
`;
    await fetch(`${base}/settings/skills/${name}`, {
      method: "PUT",
      body: JSON.stringify({ target: name, content: template }),
    });
  }

  // 스킬 목록 + 선택된 스킬 편집기
  return (
    <div>
      {skills.map((skill) => (
        <div onClick={() => setSelectedSkill(skill.name)}>
          <span className="font-mono">{skill.name}</span>
          <span>{skill.description}</span>
          {skill.allowed_tools.map((tool) => <span>{tool}</span>)}
        </div>
      ))}

      {selectedSkill && (
        <textarea value={skillContent} onChange={...} />
      )}
    </div>
  );
}
```

## 프로그레시브 디스클로저

스킬은 "필요할 때만 로드"되는 프로그레시브 디스클로저 패턴을 따른다:
1. 에이전트 빌드 시 스킬 디렉토리 존재 여부만 확인
2. SDK가 작업 컨텍스트에 맞는 스킬만 활성화
3. 사용자가 스킬을 삭제하면 즉시 비활성화

이 방식으로 불필요한 스킬이 LLM 컨텍스트를 낭비하지 않는다.

## 자주 묻는 질문

### 스킬 추가 후 에이전트 재시작이 필요한가?

아니다. `rebuild_all_agents_safe()`가 스킬 변경 즉시 모든 활성 에이전트를 재빌드한다. 진행 중인 대화의 다음 메시지부터 적용된다.

### allowed-tools는 어떤 역할인가?

스킬이 사용할 수 있는 도구 목록을 선언한다. 현재는 메타데이터로만 사용되며, 향후 도구 접근 제어에 활용할 예정이다.

---

## 시리즈 목차

1. [DeepCoWork: AI 에이전트 데스크톱 앱을 만들었다](/posts/deepcowork-01-introduction)
2. [Tauri 2 + Python 사이드카](/posts/deepcowork-02-tauri-sidecar)
3. [DeepAgents SDK 핵심 해부](/posts/deepcowork-03-deep-agents-sdk)
4. [모드별 시스템 프롬프트 설계](/posts/deepcowork-04-system-prompts)
5. [SSE 스트리밍 파이프라인](/posts/deepcowork-05-sse-streaming)
6. [HITL 승인 플로우](/posts/deepcowork-06-hitl-approval)
7. [멀티에이전트 ACP 모드](/posts/deepcowork-07-acp-multi-agent)
8. [에이전트 메모리 4계층](/posts/deepcowork-08-agent-memory)
9. **[이번 글]** 스킬 시스템
10. [LLM 프로바이더 통합](/posts/deepcowork-10-llm-providers)
11. [보안 체크리스트](/posts/deepcowork-11-security)
12. [GitHub Actions 크로스 플랫폼 빌드](/posts/deepcowork-12-ci-cd)
