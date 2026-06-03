#!/usr/bin/env python3
"""Persist small autonomous improvement loops for the current project."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def default_codex_home() -> Path:
    return Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex"))).expanduser().resolve()


def normalize_path_key(path: Path) -> str:
    resolved = str(path.resolve())
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", resolved).strip("-").lower()
    cleaned = re.sub(r"-{2,}", "-", cleaned)
    digest = hashlib.sha1(resolved.encode("utf-8")).hexdigest()[:10]
    base = cleaned[:80].strip("-") or "project"
    return f"{base}-{digest}.json"


def default_state_file(cwd: Path) -> Path:
    return default_codex_home() / "state" / "continue-loop" / normalize_path_key(cwd)


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"State file not found: {path}")
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    state["updated_at"] = utc_now()
    with path.open("w", encoding="utf-8") as handle:
        json.dump(state, handle, indent=2, sort_keys=True)
        handle.write("\n")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--cwd", default=os.getcwd(), help="Project working directory. Defaults to the current directory.")
    common.add_argument("--state-file", help="Explicit state file path. Overrides the default CODEX_HOME-backed location.")

    start = subparsers.add_parser("start", parents=[common], help="Create or resume a loop state file.")
    start.add_argument("--goal", help="Optional persistent project goal for this loop.")
    start.add_argument("--reset", action="store_true", help="Create a fresh state file even if one already exists.")
    start.set_defaults(func=cmd_start)

    nxt = subparsers.add_parser("next", parents=[common], help="Print the next-iteration prompt frame.")
    nxt.set_defaults(func=cmd_next)

    record = subparsers.add_parser("record", parents=[common], help="Append a completed or blocked iteration.")
    record.add_argument("--focus", required=True, help="Short label for the step that was worked on.")
    record.add_argument("--summary", required=True, help="What changed and why.")
    record.add_argument("--verification", default="", help="Exact checks or commands used to verify the work.")
    record.add_argument("--next-hint", default="", help="Optional hint about the most likely next step.")
    record.add_argument(
        "--status",
        choices=("completed", "blocked"),
        default="completed",
        help="Whether the iteration finished cleanly or hit a blocker.",
    )
    record.set_defaults(func=cmd_record)

    status = subparsers.add_parser("status", parents=[common], help="Show the current loop summary.")
    status.set_defaults(func=cmd_status)

    stop = subparsers.add_parser("stop", parents=[common], help="Mark the loop as stopped.")
    stop.add_argument("--reason", required=True, help="Why the loop is stopping.")
    stop.set_defaults(func=cmd_stop)

    return parser


def resolve_paths(args: argparse.Namespace) -> tuple[Path, Path]:
    cwd = Path(args.cwd).expanduser().resolve()
    state_file = Path(args.state_file).expanduser().resolve() if args.state_file else default_state_file(cwd)
    return cwd, state_file


def create_state(cwd: Path, goal: str | None) -> dict[str, Any]:
    timestamp = utc_now()
    return {
        "version": 1,
        "cwd": str(cwd),
        "goal": goal or "",
        "created_at": timestamp,
        "updated_at": timestamp,
        "stopped_at": "",
        "stop_reason": "",
        "iterations": [],
    }


def render_recent_iterations(iterations: list[dict[str, Any]], limit: int = 5) -> str:
    if not iterations:
        return "Recent iterations: none yet."

    lines = ["Recent iterations:"]
    for item in iterations[-limit:]:
        line = f"- #{item['index']} [{item['status']}] {item['focus']}: {item['summary']}"
        lines.append(line)
        if item.get("verification"):
            lines.append(f"  verification: {item['verification']}")
        if item.get("next_hint"):
            lines.append(f"  next hint: {item['next_hint']}")
    return "\n".join(lines)


def print_state_header(state_file: Path, state: dict[str, Any]) -> None:
    iterations = state["iterations"]
    print(f"State file: {state_file}")
    print(f"Project cwd: {state['cwd']}")
    print(f"Goal: {state['goal'] or '(not set)'}")
    print(f"Iterations recorded: {len(iterations)}")
    if state.get("stopped_at"):
        print(f"Stopped: {state['stopped_at']} ({state.get('stop_reason') or 'no reason recorded'})")


def cmd_start(args: argparse.Namespace) -> int:
    cwd, state_file = resolve_paths(args)

    if state_file.exists() and not args.reset:
        state = load_state(state_file)
        if args.goal and args.goal != state.get("goal", ""):
            state["goal"] = args.goal
            save_state(state_file, state)
        print("Resumed existing continue-loop state.")
        print_state_header(state_file, state)
        return 0

    state = create_state(cwd, args.goal)
    save_state(state_file, state)
    print("Created new continue-loop state.")
    print_state_header(state_file, state)
    return 0


def cmd_next(args: argparse.Namespace) -> int:
    cwd, state_file = resolve_paths(args)
    state = load_state(state_file)
    next_index = len(state["iterations"]) + 1
    script_path = Path(__file__).resolve()

    print_state_header(state_file, state)
    print(f"Next iteration: {next_index}")
    print()
    print("Core question:")
    print("What is the next logical step to focus on next?")
    print()
    print("Selection guide:")
    print("1. List up to 3 concrete candidate steps.")
    print("2. Prefer the step with the best leverage, ordering, and narrow verification.")
    print("3. Keep the pass small enough to complete and prove now.")
    print("4. Record the result as soon as the pass is done.")
    print()
    print(render_recent_iterations(state["iterations"]))
    print()
    print("Example record command:")
    print(
        f"python3 {shell_quote(str(script_path))} "
        f"record --cwd {shell_quote(str(cwd))} "
        "--focus '...' --summary '...' --verification '...'"
    )
    return 0


def cmd_record(args: argparse.Namespace) -> int:
    _, state_file = resolve_paths(args)
    state = load_state(state_file)

    if state.get("stopped_at"):
        print("Cannot record a new iteration after the loop has been stopped.", file=sys.stderr)
        return 1

    iterations = state["iterations"]
    index = len(iterations) + 1
    iterations.append(
        {
            "index": index,
            "completed_at": utc_now(),
            "focus": args.focus,
            "summary": args.summary,
            "verification": args.verification,
            "next_hint": args.next_hint,
            "status": args.status,
        }
    )
    save_state(state_file, state)
    print(f"Recorded iteration #{index} [{args.status}].")
    print_state_header(state_file, state)
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    _, state_file = resolve_paths(args)
    state = load_state(state_file)
    print_state_header(state_file, state)
    print(render_recent_iterations(state["iterations"], limit=10))
    return 0


def cmd_stop(args: argparse.Namespace) -> int:
    _, state_file = resolve_paths(args)
    state = load_state(state_file)
    state["stopped_at"] = utc_now()
    state["stop_reason"] = args.reason
    save_state(state_file, state)
    print("Stopped continue-loop state.")
    print_state_header(state_file, state)
    return 0


def shell_quote(value: str) -> str:
    if not value:
        return "''"
    return "'" + value.replace("'", "'\"'\"'") + "'"


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.func(args)
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except json.JSONDecodeError as exc:
        print(f"Invalid JSON in state file: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
