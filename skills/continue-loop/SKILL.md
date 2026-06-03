---
name: continue-loop
description: Keep iterating on the next logical step in a project until a clear stop condition is reached. Use when the user says `/continue-loop`, asks to "keep going", "continue iterating", or wants Codex to repeatedly choose the highest-leverage next task, execute it, verify it, and then continue. Good for open-ended cleanup, refactoring, polish, debt burn-down, and project advancement where the next step should be discovered from the current repo state instead of handed over explicitly.
---

# Continue Loop

Use this skill to keep making progress without waiting for the user to spell out every step. Treat the loop as a sequence of small, verified passes, not a license to thrash.

## Workflow

1. Establish the bounds.
   - Respect any explicit scope, count, stop condition, or quality bar from the user.
   - If the user gave no bound, keep going until you hit a real blocker, diminishing returns, or a clean handoff point worth surfacing.
2. Initialize or resume the loop state.
   - Resolve `SKILL_DIR` to the directory containing this `SKILL.md`.
   - Run:

```bash
python3 "$SKILL_DIR/scripts/continue_loop.py" start --cwd "$PWD"
```

   - Add `--goal "..."` when the user gave a concrete objective worth preserving.
   - Reuse the existing state file unless the user clearly wants a fresh loop.
3. Ask the core question.
   - Run:

```bash
python3 "$SKILL_DIR/scripts/continue_loop.py" next --cwd "$PWD"
```

   - Answer: `What is the next logical step to focus on next?`
   - Consider only a few concrete candidates. Pick the step that best matches user intent, dependency order, and narrow verification.
4. Do the work.
   - Read the relevant code, tests, docs, and repo instructions first.
   - Implement the chosen step fully enough to verify it.
   - Prefer finishing one seam cleanly over opening several half-done branches.
5. Verify before claiming progress.
   - Run the smallest meaningful proof for the area you changed.
   - If the repo requires screenshots for UI work, take them.
6. Record the pass.
   - Run:

```bash
python3 "$SKILL_DIR/scripts/continue_loop.py" record \
  --cwd "$PWD" \
  --focus "Short name of the step you just completed" \
  --summary "What changed and why" \
  --verification "Exact command(s) or checks you ran"
```

   - Add `--next-hint "..."` if the current pass revealed an obvious follow-up.
   - Use `--status blocked` only when you truly cannot proceed safely.
7. Decide whether to continue.
   - Continue immediately when there is another clear, valuable step.
   - Stop when the next step would be speculative, too risky for reasonable assumptions, or requires a user decision.
   - When stopping, run:

```bash
python3 "$SKILL_DIR/scripts/continue_loop.py" stop \
  --cwd "$PWD" \
  --reason "Why the loop should stop here"
```

## Choosing The Next Step

Rank candidate steps against:

- dependency order
- user-stated goals
- architectural leverage
- likelihood of unblocking later work
- risk of breaking unrelated behavior
- cost of focused verification
- signal from failing tests, TODOs, logs, profiler output, or unfinished seams

Prefer:

- steps that unblock more work later
- deleting dead paths over adding compatibility or fallback layers
- finishing an in-flight change before hopping elsewhere
- narrow proofs over broad "maybe everything still works" runs
- small passes that can be explained in one or two sentences

Avoid:

- bouncing between unrelated areas
- speculative rewrites without evidence
- analysis-only loops when you can implement
- broad validation churn before the local change is stable
- infinite looping after the work has clearly reached a pause point

## Script Notes

- The helper script stores loop state under `$CODEX_HOME/state/continue-loop` by default so the repo stays clean.
- Override the location with `--state-file /path/to/state.json` when you want an explicit shared log.
- Use `status` to inspect the current loop summary:

```bash
python3 "$SKILL_DIR/scripts/continue_loop.py" status --cwd "$PWD"
```

- The state log is there to keep the loop honest. It should help you avoid repeating the same step or forgetting why the last pass stopped.
