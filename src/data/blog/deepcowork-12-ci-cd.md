---
author: baem1n
pubDatetime: 2026-04-04T11:00:00.000Z
title: "DeepCoWork #12: GitHub Actions 크로스 플랫폼 빌드 -- PyInstaller 사이드카, CI/CD"
description: "macOS, Windows, Linux 3개 플랫폼에서 Tauri + PyInstaller 앱을 빌드하고 릴리스하는 GitHub Actions 워크플로를 해부합니다."
tags:
  - github-actions
  - ci-cd
  - pyinstaller
  - tauri
  - cross-platform
aiAssisted: true
---

> **TL;DR**: DeepCoWork는 GitHub Actions에서 macOS, Linux, Windows 3개 플랫폼을 매트릭스 빌드한다. 각 러너에서 PyInstaller로 Python 사이드카를 빌드한 후, Tauri가 이를 포함하여 .dmg/.deb/.msi를 생성한다. 태그 푸시 시 자동 릴리스까지 처리된다.

## Table of contents

## 빌드 파이프라인

```
Tag push (v*)
    |
    v
build job (3x parallel)
    +-- macOS-arm64  (macos-latest)
    +-- Linux-x64    (ubuntu-latest)
    +-- Windows-x64  (windows-latest)
    |
    | 각 러너에서:
    +-- 1. 시스템 의존성 설치
    +-- 2. Rust + Node.js + Python 세팅
    +-- 3. python bundle.py -> agent-server-{target}
    +-- 4. npm ci + tauri build -> 설치 파일
    |
    v
release job
    +-- 모든 아티팩트 다운로드
    +-- GitHub Release (draft) 생성
```

## 워크플로 트리거

```yaml
on:
  push:
    tags: ['v*']
  workflow_dispatch:
    inputs:
      deploy_mode:
        description: 'Deploy mode (all, local, cloud)'
        required: false
        default: 'all'
```

태그 푸시(`v1.0.0` 등)로 자동 트리거되고, `workflow_dispatch`로 수동 실행도 가능하다. `deploy_mode` 입력으로 빌드 변형을 제어한다.

## 빌드 매트릭스

```yaml
strategy:
  fail-fast: false
  matrix:
    include:
      - platform: macos-latest
        target: aarch64-apple-darwin
        label: macOS-arm64
      - platform: ubuntu-latest
        target: x86_64-unknown-linux-gnu
        label: Linux-x64
      - platform: windows-latest
        target: x86_64-pc-windows-msvc
        label: Windows-x64
```

`fail-fast: false`로 하나가 실패해도 나머지 플랫폼 빌드가 계속된다.

## PyInstaller 사이드카 빌드

`bundle.py`가 각 플랫폼에서 실행된다:

```python
def get_target_triple() -> str:
    system = platform.system()
    machine = platform.machine().lower()
    if system == "Darwin":
        arch = "aarch64" if machine == "arm64" else "x86_64"
        return f"{arch}-apple-darwin"
    elif system == "Linux":
        return "x86_64-unknown-linux-gnu"
    elif system == "Windows":
        return "x86_64-pc-windows-msvc"

def build():
    target = get_target_triple()
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--name", f"agent-server-{target}",
        "--hidden-import", "uvicorn.logging",
        "--hidden-import", "uvicorn.loops.auto",
        "--hidden-import", "aiosqlite",
        "--hidden-import", "langchain_anthropic",
        "--hidden-import", "deepagents",
        "--collect-submodules", "deepagents",
        "--collect-submodules", "langgraph",
        "--collect-submodules", "langchain_core",
        "main.py",
    ]
    subprocess.run(cmd)

    # Tauri binaries 디렉토리에 복사
    src = Path(f"dist/agent-server-{target}{exe_suffix}")
    dst = Path("../app/src-tauri/binaries") / f"agent-server-{target}{exe_suffix}"
    shutil.copy2(src, dst)
```

핵심: `--hidden-import`와 `--collect-submodules`가 PyInstaller가 동적 임포트를 놓치지 않게 한다. FastAPI(uvicorn)와 LangChain 생태계는 동적 임포트를 많이 사용한다.

## CI 스텝 상세

### 시스템 의존성 (Linux)

```yaml
- name: Install Linux dependencies
  if: matrix.platform == 'ubuntu-latest'
  run: |
    sudo apt-get update
    sudo apt-get install -y \
      libwebkit2gtk-4.1-dev librsvg2-dev \
      patchelf libssl-dev libgtk-3-dev libayatana-appindicator3-dev
```

Tauri가 Linux에서 WebKitGTK, GTK, appindicator를 요구한다.

### Rust 캐시

```yaml
- uses: swatinem/rust-cache@v2
  with:
    workspaces: app/src-tauri
```

Rust 컴파일 캐시로 2차 빌드 이후 빌드 시간을 절반 이상 단축한다.

### Tauri 빌드

```yaml
- name: Build Tauri app
  uses: tauri-apps/tauri-action@v0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    VITE_DEPLOY_MODE: ${{ env.DEPLOY_MODE }}
  with:
    projectPath: app
    tauriScript: npm run tauri
    args: --target ${{ matrix.target }}
```

`VITE_DEPLOY_MODE`가 빌드 시 프로바이더 노출을 제어한다.

## 아티팩트와 릴리스

### 아티팩트 업로드

```yaml
- name: Upload build artifacts
  uses: actions/upload-artifact@v4
  with:
    name: DeepCoWork-${{ matrix.label }}
    path: |
      app/src-tauri/target/${{ matrix.target }}/release/bundle/**/*.dmg
      app/src-tauri/target/${{ matrix.target }}/release/bundle/**/*.deb
      app/src-tauri/target/${{ matrix.target }}/release/bundle/**/*.msi
```

### 릴리스 생성

```yaml
release:
  if: startsWith(github.ref, 'refs/tags/v')
  needs: build
  runs-on: ubuntu-latest
  steps:
    - uses: actions/download-artifact@v4
      with: { path: artifacts }
    - uses: softprops/action-gh-release@v2
      with:
        files: artifacts/**/*
        generate_release_notes: true
        draft: true
```

태그 푸시 시에만 릴리스가 생성되고, `draft: true`로 수동 확인 후 게시한다.

## 빌드 결과물

| 플랫폼 | 형식 | 포함 내용 |
|--------|------|----------|
| macOS | `.dmg` | 앱 번들 + `agent-server-aarch64-apple-darwin` |
| Linux | `.deb`, `.AppImage` | 바이너리 + `agent-server-x86_64-unknown-linux-gnu` |
| Windows | `.msi`, `.exe` | 설치 파일 + `agent-server-x86_64-pc-windows-msvc.exe` |

사용자는 Python, Node.js, Rust를 설치할 필요 없이 설치 파일만 실행하면 된다.

## 트러블슈팅

| 문제 | 원인 | 해결 |
|------|------|------|
| PyInstaller 누락 모듈 | 동적 임포트 | `--hidden-import` 추가 |
| Tauri sidecar 미발견 | 이름 불일치 | `agent-server-{target-triple}` 형식 확인 |
| Linux 빌드 실패 | WebKitGTK 미설치 | `apt-get install libwebkit2gtk-4.1-dev` |
| macOS 코드사인 | 인증서 미설정 | Notarization 설정 필요 (현재 미지원) |

## 자주 묻는 질문

### macOS Intel 빌드는?

현재 Apple Silicon(aarch64)만 지원한다. Intel 빌드를 추가하려면 매트릭스에 `x86_64-apple-darwin` 타겟을 추가하면 된다.

### 빌드 시간은 얼마나 걸리나?

초기 빌드: 15-20분 (Rust 컴파일 포함). 캐시 적중 시: 8-12분. PyInstaller 사이드카 빌드가 가장 시간이 오래 걸린다.

### 자동 업데이트를 지원하나?

아직 미지원. Tauri의 `tauri-plugin-updater`로 구현할 수 있고, 릴리스 JSON 파일을 GitHub Pages에 호스팅하면 된다.

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
9. [스킬 시스템](/posts/deepcowork-09-skills-system)
10. [LLM 프로바이더 통합](/posts/deepcowork-10-llm-providers)
11. [보안 체크리스트](/posts/deepcowork-11-security)
12. **[이번 글]** GitHub Actions 크로스 플랫폼 빌드
