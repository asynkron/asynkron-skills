<p align="center">
  <img src="assets/images/header.png" width="100%" alt="asynkron-skills" />
</p>

# asynkron-skills

Developer tool skills for AI coding agents. Works with Claude Code, Codex, Cursor, and Copilot.

## Skills

### General (any language)

| Skill | Description |
|-------|-------------|
| **cloc** | Count lines of code using [cloc](https://github.com/AlDanial/cloc). Analyze codebase size, language breakdown, and compare between versions. |
| **quickdup** | Detect code duplication using [QuickDup](https://github.com/asynkron/Asynkron.QuickDup). Includes 4 refactoring patterns: structural duplication, structural switch, parameter bundle, and argument unpacking. |
| **systematic-debug** | Two complementary debugging techniques. **Test bombs** create one test per hypothesis (H1, H2, H3...) — the pass/fail pattern reveals the root cause. **Layered tests** test each pipeline stage independently (L1, L2, L3...) to find the first failing stage. Templates for C#, TypeScript, Python, and Go. |

### .NET

| Skill | Description |
|-------|-------------|
| **profile** | Profile .NET apps using [Asynkron.Profiler](https://github.com/asynkron/Asynkron.Profiler). CPU, memory, contention, exceptions, heap, and JIT/inlining analysis. Includes iterative profiling methodology and JIT-aware optimization patterns (fast/slow path split, dispatch tables, object pooling). Runs via `dnx`. |
| **testrunner** | Alternative .NET test runner using [Asynkron.TestRunner](https://github.com/asynkron/Asynkron.TestRunner). Handles flaky, hanging, crashing, OOM, and stack overflow tests with automatic isolation. Only use when `dotnet test` fails. Runs via `dnx`. |
| **roslynator** | C# static analysis using [Roslynator](https://github.com/dotnet/roslynator). Auto-fix diagnostics, format code, find unused code, and enforce coding standards. |
| **dotnet-strict** | Apply strict .NET coding standards to any project. Adds Roslynator + Meziantou analyzer packages and a comprehensive `.editorconfig` with 80+ diagnostic rules covering performance, dead code, correctness, culture safety, and naming conventions. |
| **pre-pr** | Pre-PR quality gate: roslynator fix → build → test → duplication check → format → PR. Loops back if issues are found. |

## Install

### Claude Code

```
/plugin marketplace add asynkron/asynkron-skills
/plugin install asynkron-devtools@asynkron-marketplace
```

### Codex

Skills are discovered automatically via `AGENTS.md`.

### Cursor

Skills are discovered automatically via `.cursor/rules/`.

### Copilot

Skills are discovered automatically via `.github/copilot-instructions.md`.

## How It Works

Each skill is a self-contained markdown file at `skills/<name>/SKILL.md` containing:

- Prerequisites and installation instructions
- Common usage patterns and examples
- Key flags and options
- Methodology and guidelines

The tool-specific config files (`.claude-plugin/`, `AGENTS.md`, `.cursor/rules/`, `.github/copilot-instructions.md`) just point to these files. The skill content is the single source of truth.

## License

MIT
