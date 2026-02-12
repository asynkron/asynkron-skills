<p align="center">
  <img src="assets/images/header.png" width="100%" alt="asynkron-skills" />
</p>

# asynkron-skills

Developer tool skills for AI coding agents. Works with Claude Code, Codex, Cursor, and Copilot.

## General Skills

### `/cloc`

Count lines of code using [cloc](https://github.com/AlDanial/cloc). Analyze codebase size, language breakdown, and compare code between git refs. Supports 200+ languages and multiple output formats (JSON, YAML, CSV, Markdown).

### `/quickdup`

Detect code duplication using [QuickDup](https://github.com/asynkron/Asynkron.QuickDup). A fast structural clone detector that processes ~100k lines in 500ms. Surfaces duplication candidates for AI-assisted review.

Includes refactoring guidance for 4 types of duplication:

- **Structural duplication** — same control flow, different injected behavior. Extract the structure, pass behavior in.
- **Structural switch duplication** — repeated pattern matches on domain types. Often intentional documentation — only refactor at 3+ copies.
- **Parameter bundle duplication** — same group of parameters passed together. Extract a value object.
- **Argument unpacking duplication** — repeated defensive parsing of callback arguments. Extract a helper.

### `/systematic-debug`

Two complementary debugging techniques for when the root cause of a bug is unclear.

**Test bombs** create one small test per hypothesis (H1, H2, H3...). Run them all together — the pass/fail pattern reveals the failing area. Start broad, then add targeted hypotheses based on results.

**Layered tests** test each stage of a processing pipeline independently (L1, L2, L3...). If L3 fails but L1 and L2 pass, the bug is in stage 3. Works for compilers, HTTP pipelines, ETL, build systems, and any multi-stage architecture.

Use test bombs first to narrow the component, then layered tests to pinpoint the exact stage. Templates for C#, TypeScript, Python, and Go.

## .NET Skills

### `/profile`

Profile .NET applications using [Asynkron.Profiler](https://github.com/asynkron/Asynkron.Profiler). A CLI profiler that outputs structured text — no GUI needed. Runs via `dnx` (no install required).

Five profiling modes: CPU, memory allocations, lock contention, exceptions, and heap snapshots. Can also capture JIT-to-native compilation events to verify inlining.

Includes a full profiling methodology (symptom-to-mode table, reading hot function tables, allocation call graphs, iterative fix-and-measure workflow) and JIT-aware optimization patterns:

- **Fast/slow path split** — `AggressiveInlining` on the common case, `NoInlining` on the rare case
- **Dispatch tables** — delegate arrays indexed by enum beat switch statements in tight loops
- **Object pooling** — lock-free pools with RAII wrappers for hot allocations
- **Thread-safe lazy init** — `Volatile.Read` + `CompareExchange` without `Lazy<T>` overhead

### `/testrunner`

Alternative .NET test runner using [Asynkron.TestRunner](https://github.com/asynkron/Asynkron.TestRunner). Wraps `dotnet test` with added resilience for unstable test suites. Runs via `dnx` (no install required).

Handles tests that hang, crash the process, cause OOM, or stack overflow — scenarios where `dotnet test` simply dies or never returns. Automatically detects hung tests, isolates the culprit by splitting the test tree, and tracks pass/fail history across runs for regression detection.

This is not a replacement for `dotnet test`. Only use it when standard tooling fails.

### `/roslynator`

C# static analysis using [Roslynator](https://github.com/dotnet/roslynator). Auto-fix diagnostics, format code, find unused declarations, count lines of code, and check spelling — all from the command line.

Covers the `fix`, `analyze`, `format`, `find-unused`, `spellcheck`, `lloc`, and `loc` commands with key flags and `.editorconfig` configuration.

### `/dotnet-strict`

Apply strict .NET coding standards to any project. Adds Roslynator + Meziantou analyzer packages and drops a comprehensive `.editorconfig` with 80+ diagnostic rules.

Covers performance (CA18xx — Span/Memory, Count vs Any, seal internal types), dead code (unused parameters, members, fields), correctness (rethrow, CancellationToken forwarding, ValueTask), culture safety (IFormatProvider, String.Equals), modern C# style (file-scoped namespaces, pattern matching, var everywhere), and naming conventions (PascalCase constants, _camelCase private fields).

### `/pre-pr`

Pre-PR quality gate for .NET projects. Runs a mandatory checklist before creating any pull request:

1. **Roslynator fix** — auto-fix code issues
2. **Build** — verify compilation
3. **Test** — run full test suite
4. **QuickDup** — check for code duplication
5. **Format** — format code

Loops back to step 1 if duplication is found. Only creates the PR after all steps pass.

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

Each skill is a self-contained markdown file at `skills/<name>/SKILL.md` containing prerequisites, usage patterns, flags, and methodology. The tool-specific config files just point to these files — the skill content is the single source of truth.

## License

MIT
