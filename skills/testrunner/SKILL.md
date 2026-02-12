---
name: testrunner
description: Handle flaky tests, crashing tests, hanging tests, out of memory tests, stack overflow tests, test isolation, test suite stability issues in .NET projects. Use when dotnet test hangs, crashes, produces OOM or stack overflow errors, or when the user has an unstable/flaky test suite. Do NOT use for normal test runs — only when standard dotnet test is insufficient.
argument-hint: "[filter pattern or path]"
---

## Prerequisites

This tool requires .NET 10+ SDK (for `dnx` support).

Check if `dnx` is available:
```
dnx --help
```

If `dnx` is not available, the user needs .NET 10 SDK or later. `dnx` ships with the SDK — it does not need separate installation.

## About Asynkron.TestRunner

Asynkron.TestRunner is an alternative .NET test runner that wraps `dotnet test` with added resilience:

- **Hang detection** — auto-detects stuck tests with per-test timeouts (default 20s)
- **Test isolation** — automatically isolates hanging/crashing tests by splitting the test tree into branches and running them separately
- **History tracking** — maintains pass/fail history per project, detects regressions across runs
- **Trend visualization** — generates bar charts showing test health over time

**This is NOT a replacement for `dotnet test`.** Use it only when standard tooling fails — flaky suites, hanging tests, crashes, OOM, stack overflow, or when you need isolation and regression tracking.

## Running via dnx (no install needed)

`dnx` runs .NET tools from source without installing them, similar to `npx`:

```
dnx Asynkron.TestRunner [arguments]
```

On first run, `dnx` will prompt to download the package. Use `--yes` to skip the prompt in CI.

## Common Usage

**Run all tests with hang detection:**
```
dnx Asynkron.TestRunner
```

**Filter by class or namespace:**
```
dnx Asynkron.TestRunner "MyTestClass"
dnx Asynkron.TestRunner "MyNamespace.Integration"
```

**Custom dotnet test command:**
```
dnx Asynkron.TestRunner -- dotnet test ./tests/MyProject
```

**List tests without running:**
```
dnx Asynkron.TestRunner list
```

**View test history and trends:**
```
dnx Asynkron.TestRunner stats
```

**Compare last two runs for regressions:**
```
dnx Asynkron.TestRunner regressions
```

**Manual isolation (find the culprit test):**
```
dnx Asynkron.TestRunner isolate
```

**Clear all history:**
```
dnx Asynkron.TestRunner clear
```

## Timeout & Isolation Options

| Flag | Default | Purpose |
|------|---------|---------|
| `-t, --timeout <seconds>` | `20` (run), `30` (isolate) | Per-test timeout |
| `--timeout 0` | — | Disable hang detection |
| `-p, --parallel [N]` | — | Run N test batches concurrently |
| `--parallel` (no value) | — | Auto-detect and use CPU core count |

## How Isolation Works

When a hang is detected:
1. The test tree is split into branches (max 100 leaf tests per branch)
2. Branches are run separately in parallel
3. Hanging branches are drilled down sequentially
4. The culprit test is identified and reported

This catches tests that hang, crash the process, cause OOM, or stack overflow — scenarios where `dotnet test` simply dies or never returns.

## History & Regression Tracking

History is stored in `.testrunner/` directory, indexed by:
- Project (git repo root hash or current directory)
- Command signature (test command + filters)

Different filters and repos maintain independent histories for accurate regression detection.

## When to Use This

Use Asynkron.TestRunner instead of `dotnet test` when:
- Tests hang or never complete
- The test process crashes (OOM, stack overflow, access violation)
- Tests are flaky and you need regression tracking across runs
- You need to isolate which specific test is causing failures
- You want trend visualization of test health over time

For normal, healthy test suites — just use `dotnet test`.

## Guidelines

- Always try `dotnet test` first — only reach for testrunner when it fails
- If tests hang, start with the default 20s timeout before adjusting
- Use `isolate` to pinpoint the exact test causing crashes or hangs
- Use `stats` and `regressions` to track flaky test patterns over time
- Use `--parallel` for faster isolation on large test suites
