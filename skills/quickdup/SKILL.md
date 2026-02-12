---
name: quickdup
description: Find and reduce code duplication, clean up redundant code, detect code clones, reduce codebase size, DRY violations, copy-paste detection. Use when the user asks about duplicate code, code cleanup, reducing code size, DRY principles, or finding copy-pasted code.
argument-hint: "[path or extension]"
---

## Prerequisites

Before running quickdup, check if it is installed:

```
which quickdup
```

If not found, install it:
- macOS/Linux: `curl -sSL https://raw.githubusercontent.com/asynkron/Asynkron.QuickDup/main/install.sh | bash`
- Windows: `iwr -useb https://raw.githubusercontent.com/asynkron/Asynkron.QuickDup/main/install.ps1 | iex`
- From source: `go install github.com/asynkron/Asynkron.QuickDup/cmd/quickdup@latest`

## About QuickDup

QuickDup is a fast structural code clone detector (~100k lines in 500ms). It uses indent-delta fingerprinting to find duplicate code patterns. It is designed as a candidate generator — it optimizes for speed and recall, surfacing candidates fast for AI-assisted review.

Results are written to `.quickdup/results.json` and cached in `.quickdup/cache.gob` for fast incremental re-runs.

## Workflow

1. **Run quickdup** to find duplication candidates
2. **Review the results** with `-select` to inspect specific patterns
3. **Refactor** — extract shared functions, base classes, or utilities to eliminate duplication
4. **Re-run** to verify duplication is reduced

## Determine File Extension

Before running, determine the primary language/extension of the project. Look at the files in the target path and use the appropriate `-ext` flag (e.g. `.go`, `.ts`, `.cs`, `.py`, `.java`, `.rs`).

## Common Usage

**Scan current project:**
```
quickdup -path . -ext .go
```

**Scan with specific extension (adapt to project language):**
```
quickdup -path $ARGUMENTS -ext .ts
```

**Show top 20 patterns:**
```
quickdup -path . -ext .go -top 20
```

**Inspect specific patterns in detail:**
```
quickdup -path . -ext .go -select 0..5
```

**Strict similarity (fewer false positives):**
```
quickdup -path . -ext .go -min-similarity 0.9
```

**Require more occurrences:**
```
quickdup -path . -ext .go -min 5
```

**Exclude generated files:**
```
quickdup -path . -ext .go -exclude "*.pb.go,*_gen.go,*_test.go"
```

**Compare duplication between branches:**
```
quickdup -path . -ext .go -compare origin/main..HEAD
```

## Key Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `-path` | `.` | Directory to scan |
| `-ext` | `.go` | File extension to match |
| `-min` | `2` | Minimum occurrences to report |
| `-min-size` | `3` | Minimum pattern size (lines) |
| `-max-size` | `0` | Max pattern size (0 = unlimited) |
| `-min-score` | `5` | Minimum score threshold |
| `-min-similarity` | `0.75` | Token similarity threshold (0.0-1.0) |
| `-top` | `10` | Show top N patterns |
| `-select` | — | Detailed view (e.g. `0..5`) |
| `-exclude` | — | Exclude file globs (comma-separated) |
| `-no-cache` | `false` | Force full re-parse |
| `-strategy` | `normalized-indent` | Detection strategy |
| `-compare` | — | Compare between commits (`base..head`) |

## Detection Strategies

- **normalized-indent** (default) — indent deltas + first word per line
- **word-indent** — raw indentation + first word
- **word-only** — ignores indentation, first words only
- **inlineable** — detects small patterns suitable for inline extraction

## Suppressing Known Patterns

If a pattern is intentional duplication, suppress it by adding its hash to `.quickdup/ignore.json`:

```json
{
  "description": "Patterns to ignore",
  "ignored": ["56c2f5f9b27ed5a0"]
}
```

## Guidelines

- Always determine the correct `-ext` for the project before running
- Start with defaults, then tighten `-min-similarity` if too many false positives
- Use `-select 0..5` to inspect the top candidates before refactoring
- After refactoring, re-run to confirm duplication is reduced
- For large projects, quickdup caches results — subsequent runs are near-instant
- When the user wants to clean up or reduce code size, run quickdup first to identify targets, then refactor the highest-scoring patterns
