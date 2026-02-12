# ASYNKRON Developer Tools

This repository contains reusable developer tool skills. Each skill is a self-contained instruction set in `skills/<name>/SKILL.md`.

## Available Skills

### General (any language)

- **[cloc](skills/cloc/SKILL.md)** — Count lines of code, analyze codebase size and language breakdown
- **[quickdup](skills/quickdup/SKILL.md)** — Detect code duplication, find clones, reduce codebase size. Includes 4 refactoring patterns for different duplication types
- **[systematic-debug](skills/systematic-debug/SKILL.md)** — Systematic debugging with test bombs (hypothesis elimination) and layered tests (pipeline stage isolation)

### .NET Specific

- **[profile](skills/profile/SKILL.md)** — Profile .NET apps for CPU, memory, contention, exceptions, heap, and JIT inlining. Includes profiling methodology and JIT-aware optimization patterns
- **[testrunner](skills/testrunner/SKILL.md)** — Alternative .NET test runner for flaky, hanging, crashing, OOM, and stack overflow tests. Only use when `dotnet test` fails
- **[roslynator](skills/roslynator/SKILL.md)** — C# static analysis, auto-fix, formatting, and dead code detection
- **[dotnet-strict](skills/dotnet-strict/SKILL.md)** — Apply strict .NET coding standards: adds Roslynator + Meziantou analyzers and a comprehensive .editorconfig with 80+ rules
- **[pre-pr](skills/pre-pr/SKILL.md)** — Pre-PR quality gate: roslynator fix → build → test → duplication check → format → PR

## How to Use

Read the relevant `SKILL.md` file for the task at hand and follow its instructions. Each skill includes:

- Prerequisites and installation
- Common usage patterns
- Key flags and options
- Methodology and guidelines
