---
name: hotmess
description: Find and explain churn hotspots and unstable code clusters in a git repo. Goes beyond a flat "most-edited files" list — auto-detects clusters by directory, by filename stem (foo.go + foo_test.go), and by co-change (files that change together) — then classifies each cluster (unstable / under-development / buggy / tightly-coupled / spec-shifting) and explains *why* it's a problem. Trigger whenever the user asks about churn, hotspots, unstable code, files that change a lot, refactoring candidates, technical debt hotspots, "what's a mess", "/hotmess", or any combination of folder + time window where they want insight rather than just numbers. Auto-detects code files when no extension is given.
---

# hotmess

Identifies *clusters* of high-churn code and explains why they're problematic — not just a ranked file list. The user wants insight: which areas of the codebase are unstable, why, and what to do.

## When to use

Trigger phrases: "hotmess", "hotspots", "what's churning", "unstable code", "where's the technical debt", "what's a mess in X", "/hotmess <folder>". Always invoke for these — even if the user gives no time window or extension, fall back to sensible defaults (30 days, auto code detection).

## How to run

Always invoke this skill's bundled analyzer (`scripts/analyze.py`, in this skill's base directory), which emits structured JSON with four signal sets. Do not reimplement git log parsing inline.

```bash
"<SKILL_DIR>/scripts/analyze.py" <path> --since "<expr>" [--ext .go,.ts] [--top N] [--html /tmp/hotmess.html] [--quiet]
```

`<SKILL_DIR>` is the "Base directory for this skill" path provided when the skill is invoked. Run from inside the target git repo (or pass an absolute path; git resolves it).

Defaults: `--since "30 days ago"`, `--top 30`, auto-detected code extensions.

If the user asks for a visualization, diagram, picture, "show me", chart, or graph — also pass `--html /tmp/hotmess.html` and then `open /tmp/hotmess.html`. Use `--quiet` together with `--html` if you don't need the JSON in the same call. The HTML page contains a Mermaid module map (modules colored by classification, edges = cross-directory co-change), plus collapsible tables for stems and co-change pairs.

Requires Python 3.8+ (stdlib only) and `git` on PATH.

Period shorthand to translate before passing to `--since`:
- `7d` → `"7 days ago"`, `2w` → `"2 weeks ago"`, `1m` → `"1 month ago"`
- ISO date (`2026-04-01`) → pass through unchanged

## What the JSON contains

```
scope        { path, since, ext, recent_window_days }
totals       { commits, files, add, del }
files[]      per file: commits, add, del, last, authors, recent_commits_7d, is_test
directories[]  aggregated per parent dir (depth 1..3): commits, add, del, files
stems[]      basename groups (foo.go + foo_test.go): members, commits, add, del, test_ratio
cochange[]   pairs of files often changed together: a, b, together, a_total, b_total, jaccard
```

`recent_commits_7d` lets you see if churn is concentrated *now* vs. spread across the window. `test_ratio` is the share of stem-group commits that hit test files. `jaccard` is overlap (1.0 = always change together).

## How to analyze

Read the JSON and identify clusters. A cluster is a coherent group of files — usually a directory, a stem, or a co-change pair/triangle. For each meaningful cluster, classify it using the heuristics below, and explain *why* it matters.

### Classification heuristics

| Signal pattern | Likely classification | What it means |
|---|---|---|
| High commits, balanced add/del, multiple authors, sustained over window | **Instabil / dåligt kravställd** | Koden skrivs om i cykler — kraven eller designen är inte stabila |
| High commits, mostly `+` lines, recent burst, 1-2 authors | **Under aktiv utveckling** | Pågående feature-arbete, förväntat — flagga bara om det varat länge |
| High commits, small commits (low avg lines), same author repeatedly | **Buggig** | Många små fixar — symptom på instabil logik eller dålig täckning |
| Stem-grupp där `test_ratio > 0.45` | **Specifikation flyttar sig** | Testerna ändras nästan lika mycket som koden — kraven är inte fastlagda |
| Co-change-par med `jaccard > 0.6` | **Tät logisk koppling** | Två filer som "alltid" ändras ihop — kanske dålig separation eller borde slås ihop |
| Hela mappen het (>30% av totala commits) | **Hotspot-modul** | Arkitekturproblem snarare än enskilda filer — hela ansvarsområdet är instabilt |
| Recent burst (`recent_commits_7d` är majoriteten) i fil som inte är ny | **Akut instabilitet** | Något hände nyligen — incident, refaktor, eller problem |

Multiple signals stack — a cluster can be both "spec shifting" and "tightly coupled". Say so.

### Output format

Don't dump the JSON. Don't list every file. Produce a short narrative report:

```
# Hotmess: <path> (<since>, <ext>)

<one-line summary: total commits, files, period — and the headline finding>

## Cluster 1: <name>  —  <classification>
**Files:** `a.go`, `b.go`, `c.go`  (X commits combined)
**Signal:** <the specific numbers that triggered the classification — e.g. "test_ratio 0.51, jaccard with state.go 0.75">
**Why it's a problem:** <one or two sentences explaining the consequence>
**Suggested action:** <concrete next step — split, stabilise spec, add tests, refactor coupling, etc.>

## Cluster 2: ...

## Notable individual files
(only if a single file stands out and doesn't belong to a cluster — keep to 2-3 max)

## Co-change couplings worth knowing
(only the top 3-5 jaccard pairs that aren't already covered by clusters above)
```

Keep it concise — aim for 4-6 clusters max. Skip anything that's clearly normal activity. The goal is signal, not exhaustiveness.

### What not to do

- **Do not just print the JSON.** The user asked for analysis.
- **Do not list every file.** Group into clusters first.
- **Do not classify everything as "active development".** That's the trivial answer — only use it when other signals don't apply.
- **Do not invent root causes** you can't see. If you don't know why a file is churning, say "look at git log for context" — don't speculate about specific bugs.
- **Do not over-warn.** A small new feature folder with a recent burst is fine; a long-stable file suddenly churning is not.

## Why this design

- **JSON over table**: the LLM needs structured signals it can correlate (test_ratio + jaccard + recent burst) — a flat table forces re-extraction.
- **Multiple signal sets**: directory aggregation catches modular hotspots; stem grouping catches test/code drift; co-change catches hidden coupling. No single view sees all three.
- **Heuristics in the skill, not the script**: classification is judgment — keep it in the prompt so it can adapt and combine signals, instead of hardcoding rules in code.
- **Excludes merges**: merge commits inflate churn without representing real work.
