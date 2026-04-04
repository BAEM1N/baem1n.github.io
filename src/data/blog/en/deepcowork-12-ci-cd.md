---
author: baem1n
pubDatetime: 2026-04-04T11:00:00.000Z
title: "DeepCoWork #12: GitHub Actions Cross-Platform Build -- PyInstaller Sidecar, CI/CD"
description: "Building Tauri + PyInstaller apps for macOS, Windows, and Linux -- a CI/CD pipeline implementation story."
tags:
  - github-actions
  - ci-cd
  - pyinstaller
  - tauri
  - cross-platform
aiAssisted: true
---

> **TL;DR**: GitHub Actions matrix builds produce PyInstaller sidecar + Tauri app for 3 OSes, completing in 8-12 minutes with cache hits.

## Table of contents

## Build Pipeline

```
Tag push (v*)
    |
    v
build job (3x parallel)
    +-- macOS-arm64  (macos-latest)
    +-- Linux-x64    (ubuntu-latest)
    +-- Windows-x64  (windows-latest)
    |
    | Per runner:
    +-- 1. Install system dependencies
    +-- 2. Setup Rust + Node.js + Python
    +-- 3. python bundle.py -> agent-server-{target}
    +-- 4. npm ci + tauri build -> installer
    |
    v
release job
    +-- Download all artifacts
    +-- Create GitHub Release (draft)
```

## Workflow Trigger

```yaml
on:
  push:
    tags: ['v*']
  workflow_dispatch:
    inputs:
      deploy_mode:
        description: 'Deploy mode (all, local, cloud)'
        default: 'all'
```

Auto-triggered on tag pushes (`v1.0.0` etc.), with manual dispatch also available. The `deploy_mode` input controls build variants. The [GitHub Actions workflow docs](https://docs.github.com/en/actions/writing-workflows) and [tauri-action](https://github.com/tauri-apps/tauri-action) plugin are the key references.

## Build Matrix

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

`fail-fast: false` ensures remaining platform builds continue if one fails.

## PyInstaller Sidecar Build

`bundle.py` runs on each platform:

```python
def build():
    target = get_target_triple()
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--name", f"agent-server-{target}",
        "--hidden-import", "uvicorn.logging",
        "--hidden-import", "aiosqlite",
        "--hidden-import", "deepagents",
        "--collect-submodules", "deepagents",
        "--collect-submodules", "langgraph",
        "--collect-submodules", "langchain_core",
        "main.py",
    ]
    subprocess.run(cmd)

    # Copy to Tauri binaries directory
    src = Path(f"dist/agent-server-{target}{exe_suffix}")
    dst = Path("../app/src-tauri/binaries") / f"agent-server-{target}{exe_suffix}"
    shutil.copy2(src, dst)
```

Key: `--hidden-import` and `--collect-submodules` ensure PyInstaller catches dynamic imports. FastAPI (uvicorn) and the LangChain ecosystem use dynamic imports extensively.

## CI Steps in Detail

### System Dependencies (Linux)

Tauri requires WebKitGTK, GTK, and appindicator on Linux:

```yaml
- name: Install Linux dependencies
  if: matrix.platform == 'ubuntu-latest'
  run: |
    sudo apt-get install -y \
      libwebkit2gtk-4.1-dev librsvg2-dev \
      patchelf libssl-dev libgtk-3-dev
```

### Rust Cache

```yaml
- uses: swatinem/rust-cache@v2
  with:
    workspaces: app/src-tauri
```

Rust compilation cache cuts build time by more than half after the first build.

### Tauri Build

```yaml
- uses: tauri-apps/tauri-action@v0
  env:
    VITE_DEPLOY_MODE: ${{ env.DEPLOY_MODE }}
  with:
    projectPath: app
    args: --target ${{ matrix.target }}
```

## Artifacts and Release

Build artifacts are uploaded per platform, then the release job downloads all artifacts and creates a draft GitHub Release with auto-generated release notes.

## Build Outputs

| Platform | Format | Contents |
|----------|--------|----------|
| macOS | `.dmg` | App bundle + `agent-server-aarch64-apple-darwin` |
| Linux | `.deb`, `.AppImage` | Binary + `agent-server-x86_64-unknown-linux-gnu` |
| Windows | `.msi`, `.exe` | Installer + `agent-server-x86_64-pc-windows-msvc.exe` |

Users need no Python, Node.js, or Rust installed -- just run the installer.

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| PyInstaller missing module | Dynamic import | Add `--hidden-import` |
| Tauri sidecar not found | Name mismatch | Check `agent-server-{target-triple}` format |
| Linux build failure | WebKitGTK missing | Install `libwebkit2gtk-4.1-dev` |
| macOS code signing | No certificate | Notarization setup needed (not yet supported) |

## Benchmark

| Metric | Value |
|--------|-------|
| First build time (including Rust compilation) | 15-20 minutes |
| Cached build time | 8-12 minutes |
| PyInstaller sidecar build time | ~3 minutes |
| Final .dmg size (macOS arm64) | ~110MB |
| Final .msi size (Windows x64) | ~125MB |
| Final .deb size (Linux x64) | ~105MB |

## Lessons Learned

The macOS x64 build failed because `macos-latest` had already switched to ARM64 (Apple Silicon) runners, so PyInstaller generated an `aarch64-apple-darwin` binary. Tauri expected `--target x86_64-apple-darwin` but the sidecar binary name was `aarch64`, causing a mismatch. We dropped macOS Intel builds and went ARM64-only, since the Intel Mac user base had already shrunk significantly.

The second issue was PyInstaller missing dynamic imports. The LangChain and FastAPI (uvicorn) ecosystems use dynamic imports extensively, so we went through 7-8 cycles of "build, run, check error, add `--hidden-import`." Frequently missed modules included `uvicorn.logging`, `aiosqlite`, and `langchain_anthropic`.

Third, on Windows we forgot to append the `.exe` suffix to the PyInstaller binary name, causing Tauri's sidecar lookup to fail. A simple omission in the `get_target_triple()` function's Windows branch -- but since it only reproduced in CI and not locally, the feedback loop was painfully long.

## FAQ

### What about macOS Intel builds?

Currently Apple Silicon (aarch64) only. Add `x86_64-apple-darwin` to the matrix for Intel support.

### How long does a build take?

First build: 15-20 minutes (includes Rust compilation). With cache: 8-12 minutes. The PyInstaller sidecar build takes the longest.

### Is auto-update supported?

Not yet. Implementable with Tauri's `tauri-plugin-updater` by hosting a release JSON file on GitHub Pages.

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
11. [Security Checklist](/posts/deepcowork-11-security)
12. **[This post]** GitHub Actions Cross-Platform Build
