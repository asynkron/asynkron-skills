#!/usr/bin/env python3
"""hotmess analyze — emit structured churn signals as JSON for LLM analysis.

Output sections:
  files       per-file churn (commits, lines, recency, authors)
  directories aggregated churn per parent directory (depth 1..3)
  stems       basename-stem groups (e.g. foo.go + foo_test.go) with test_ratio
  cochange    pairs of files often modified in the same commit (jaccard >= threshold)
"""
import argparse
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from itertools import combinations

DEFAULT_EXTS = {
    ".go", ".py", ".ts", ".tsx", ".js", ".jsx", ".rs", ".java", ".kt", ".swift",
    ".c", ".h", ".cpp", ".hpp", ".cc", ".cs", ".rb", ".php", ".scala", ".clj",
    ".ex", ".exs", ".erl", ".hs", ".ml", ".lua", ".sh", ".bash", ".zsh",
    ".ps1", ".sql", ".vue", ".svelte", ".dart", ".m", ".mm",
}

TEST_PAT = re.compile(r"(_test|_bench|_mock|\.test|\.spec)$")
TEST_FILE_PAT = re.compile(r"(_test\.|_bench\.|_mock\.|\.test\.|\.spec\.|/tests?/)")


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("path")
    p.add_argument("--since", default="30 days ago")
    p.add_argument("--ext", default=None,
                   help="comma-separated extensions (e.g. .go,.ts); default = auto code")
    p.add_argument("--top", type=int, default=30,
                   help="cap for each section")
    p.add_argument("--cochange-min", type=int, default=3,
                   help="minimum times two files must change together")
    p.add_argument("--cochange-jaccard", type=float, default=0.3,
                   help="minimum jaccard overlap for a co-change pair")
    p.add_argument("--html", default=None,
                   help="also write a standalone HTML report with a Mermaid module map")
    p.add_argument("--quiet", action="store_true",
                   help="suppress JSON to stdout (useful with --html)")
    return p.parse_args()


def get_extensions(arg):
    if not arg:
        return DEFAULT_EXTS, "auto"
    out = set()
    for e in arg.replace(",", " ").split():
        if not e.startswith("."):
            e = "." + e
        out.add(e)
    return out, ",".join(sorted(out))


def file_matches(path, exts):
    _, ext = os.path.splitext(path)
    return ext in exts


def run_git(args):
    try:
        return subprocess.check_output(["git"] + args, text=True, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as e:
        sys.stderr.write(e.stderr)
        sys.exit(1)


def iter_commits(path, since):
    raw = run_git([
        "log", f"--since={since}", "--no-merges",
        "--pretty=format:COMMIT\t%H\t%an\t%aI",
        "--numstat", "--", path,
    ])
    cur = None
    files = []
    for line in raw.splitlines():
        if line.startswith("COMMIT\t"):
            if cur:
                yield (*cur, files)
            parts = line.split("\t")
            cur = (parts[1], parts[2], parts[3])
            files = []
        elif line.strip() and cur:
            parts = line.split("\t")
            if len(parts) >= 3:
                add_s, del_s = parts[0], parts[1]
                f = "\t".join(parts[2:])
                add = 0 if add_s == "-" else int(add_s)
                dl = 0 if del_s == "-" else int(del_s)
                files.append((add, dl, f))
    if cur:
        yield (*cur, files)


def stem_of(path):
    d = os.path.dirname(path)
    base, _ = os.path.splitext(os.path.basename(path))
    base = TEST_PAT.sub("", base)
    return d, base


def is_test(path):
    return bool(TEST_FILE_PAT.search(path))


def main():
    args = parse_args()
    exts, ext_label = get_extensions(args.ext)

    if not run_git(["rev-parse", "--show-toplevel"]).strip():
        sys.exit(1)

    now = datetime.now(timezone.utc)
    recent_cutoff = (now - timedelta(days=7)).isoformat()

    file_commits = Counter()
    file_add = Counter()
    file_del = Counter()
    file_last = {}
    file_authors = defaultdict(set)
    file_recent = Counter()

    dir_commits = Counter()
    dir_add = Counter()
    dir_del = Counter()
    dir_files = defaultdict(set)

    cochange = Counter()

    total_commits = 0
    total_add = 0
    total_del = 0

    for sha, author, date, files in iter_commits(args.path, args.since):
        kept = [(a, d, f) for (a, d, f) in files if file_matches(f, exts)]
        if not kept:
            continue
        total_commits += 1
        for a, d, f in kept:
            file_commits[f] += 1
            file_add[f] += a
            file_del[f] += d
            total_add += a
            total_del += d
            if f not in file_last or date > file_last[f]:
                file_last[f] = date
            file_authors[f].add(author)
            if date >= recent_cutoff:
                file_recent[f] += 1

            d_path = os.path.dirname(f)
            parts = d_path.split("/") if d_path else []
            for i in range(1, min(len(parts), 3) + 1):
                dpath = "/".join(parts[:i])
                dir_commits[dpath] += 1
                dir_add[dpath] += a
                dir_del[dpath] += d
                dir_files[dpath].add(f)

        if 2 <= len(kept) <= 50:
            paths = sorted({f for _, _, f in kept})
            for a, b in combinations(paths, 2):
                cochange[(a, b)] += 1

    files_out = []
    for f in sorted(file_commits, key=lambda x: -file_commits[x]):
        files_out.append({
            "file": f,
            "commits": file_commits[f],
            "add": file_add[f],
            "del": file_del[f],
            "last": file_last[f][:10],
            "authors": len(file_authors[f]),
            "recent_commits_7d": file_recent[f],
            "is_test": is_test(f),
        })

    dirs_out = []
    for d in sorted(dir_commits, key=lambda x: -dir_commits[x]):
        if dir_commits[d] < 3 or "/" not in d:
            continue
        dirs_out.append({
            "path": d,
            "commits": dir_commits[d],
            "add": dir_add[d],
            "del": dir_del[d],
            "files": len(dir_files[d]),
        })

    stems = defaultdict(list)
    for f in file_commits:
        d, s = stem_of(f)
        stems[(d, s)].append(f)

    stems_out = []
    for (d, s), members in stems.items():
        if len(members) < 2:
            continue
        commits = sum(file_commits[m] for m in members)
        if commits < 3:
            continue
        test_commits = sum(file_commits[m] for m in members if is_test(m))
        stems_out.append({
            "stem": f"{d}/{s}" if d else s,
            "members": sorted(members),
            "commits": commits,
            "add": sum(file_add[m] for m in members),
            "del": sum(file_del[m] for m in members),
            "test_ratio": round(test_commits / commits, 2) if commits else 0.0,
        })
    stems_out.sort(key=lambda x: -x["commits"])

    cc_out = []
    for (a, b), together in cochange.items():
        a_total = file_commits[a]
        b_total = file_commits[b]
        if together < args.cochange_min:
            continue
        union = a_total + b_total - together
        jaccard = together / union if union else 0
        if jaccard < args.cochange_jaccard:
            continue
        cc_out.append({
            "a": a, "b": b,
            "together": together,
            "a_total": a_total,
            "b_total": b_total,
            "jaccard": round(jaccard, 2),
        })
    cc_out.sort(key=lambda x: (-x["jaccard"], -x["together"]))

    out = {
        "scope": {
            "path": args.path,
            "since": args.since,
            "ext": ext_label,
            "recent_window_days": 7,
        },
        "totals": {
            "commits": total_commits,
            "files": len(file_commits),
            "add": total_add,
            "del": total_del,
        },
        "files": files_out[:args.top],
        "directories": dirs_out[:args.top],
        "stems": stems_out[:args.top],
        "cochange": cc_out[:args.top],
    }

    if args.html:
        write_html(args.html, out)

    if not args.quiet:
        print(json.dumps(out, indent=2))


def classify_dir(d, totals, stems_by_dir):
    """Lightweight classification used to color blocks in the diagram.
    The narrative skill output may add nuance — this is only for visual hint."""
    commits = d["commits"]
    pct = commits / max(totals["commits"], 1)
    add, dl = d["add"], d["del"]
    del_ratio = dl / max(add + dl, 1)

    # average test_ratio across stems in this directory
    stems = stems_by_dir.get(d["path"], [])
    avg_test_ratio = sum(s["test_ratio"] for s in stems) / len(stems) if stems else 0

    if pct >= 0.30 and commits >= 30:
        return "hotspot"
    if avg_test_ratio >= 0.45 and commits >= 15:
        return "unstable"
    if del_ratio >= 0.20 and commits >= 10:
        return "rewrite"
    if commits >= 8 and del_ratio < 0.10:
        return "active"
    return "stable"


CLASS_LABEL = {
    "hotspot": "HOTSPOT",
    "unstable": "spec-drift",
    "rewrite": "rewriting",
    "active": "active dev",
    "stable": "steady",
}


def write_html(path, data):
    totals = data["totals"]
    scope = data["scope"]
    dirs = data["directories"]
    stems = data["stems"]
    cochange = data["cochange"]

    # Filter dirs: keep depth==2 ("internal/worker") and skip rename artifacts
    dirs = [d for d in dirs if d["path"].count("/") == 1
            and not d["path"].startswith("{")
            and not d["path"].startswith("golang/")]
    dirs = sorted(dirs, key=lambda x: -x["commits"])[:14]
    keep_dirs = {d["path"] for d in dirs}

    stems_by_dir = defaultdict(list)
    for s in stems:
        parts = s["stem"].rsplit("/", 1)
        if len(parts) == 2:
            stems_by_dir[parts[0]].append(s)

    # Aggregate co-change to directory-level (cross-dir only)
    dir_pair = Counter()
    for cc in cochange:
        da = os.path.dirname(cc["a"])
        db = os.path.dirname(cc["b"])
        # collapse to depth==2
        def top2(p):
            ps = p.split("/")
            return "/".join(ps[:2]) if len(ps) >= 2 else p
        da, db = top2(da), top2(db)
        if da == db or da not in keep_dirs or db not in keep_dirs:
            continue
        key = tuple(sorted([da, db]))
        dir_pair[key] += cc["together"]

    # Build Mermaid
    def node_id(p):
        return "n_" + re.sub(r"[^a-zA-Z0-9]", "_", p)

    lines = ["graph LR"]
    cls_for = {}
    for d in dirs:
        nid = node_id(d["path"])
        cls = classify_dir(d, totals, stems_by_dir)
        cls_for[d["path"]] = cls
        label = (
            f"<b>{d['path']}</b><br/>"
            f"{d['commits']} commits · {d['files']} files<br/>"
            f"+{d['add']} / -{d['del']}<br/>"
            f"<i>{CLASS_LABEL[cls]}</i>"
        )
        lines.append(f'  {nid}["{label}"]:::{cls}')

    # edges
    if dir_pair:
        # normalize for thickness
        max_w = max(dir_pair.values())
        for (a, b), w in sorted(dir_pair.items(), key=lambda x: -x[1])[:20]:
            ratio = w / max_w
            arrow = "==>" if ratio >= 0.66 else ("-->" if ratio >= 0.33 else "-.->")
            lines.append(f'  {node_id(a)} {arrow}|"{w} co-changes"| {node_id(b)}')

    lines += [
        "  classDef hotspot  fill:#ff6b6b,stroke:#c92a2a,color:#fff,font-weight:bold",
        "  classDef unstable fill:#ffa94d,stroke:#e8590c,color:#000",
        "  classDef rewrite  fill:#ffd43b,stroke:#f08c00,color:#000",
        "  classDef active   fill:#4dabf7,stroke:#1864ab,color:#fff",
        "  classDef stable   fill:#adb5bd,stroke:#495057,color:#000",
    ]
    mermaid_src = "\n".join(lines)

    # Top stems table (compact)
    top_stems = sorted(stems, key=lambda x: -x["commits"])[:10]
    stems_rows = "".join(
        f"<tr><td><code>{s['stem']}</code></td><td class='num'>{s['commits']}</td>"
        f"<td class='num'>+{s['add']}</td><td class='num'>-{s['del']}</td>"
        f"<td class='num'>{s['test_ratio']:.2f}</td></tr>"
        for s in top_stems
    )

    # Top co-change file pairs (raw, not aggregated)
    top_cc = cochange[:12]
    cc_rows = "".join(
        f"<tr><td><code>{c['a']}</code></td><td><code>{c['b']}</code></td>"
        f"<td class='num'>{c['together']}</td><td class='num'>{c['jaccard']:.2f}</td></tr>"
        for c in top_cc
    )

    legend_items = "".join(
        f"<span class='chip {k}'>{CLASS_LABEL[k]}</span>" for k in
        ["hotspot", "unstable", "rewrite", "active", "stable"]
    )

    html = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>hotmess — {scope['path']}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<style>
  :root {{ color-scheme: dark; }}
  body {{ font-family: -apple-system, system-ui, sans-serif; background: #0d1117; color: #c9d1d9; margin: 0; padding: 24px; }}
  h1 {{ margin: 0 0 4px 0; font-size: 22px; }}
  .meta {{ color: #8b949e; font-size: 13px; margin-bottom: 24px; }}
  .totals {{ display: flex; gap: 24px; margin-bottom: 24px; flex-wrap: wrap; }}
  .totals div {{ background: #161b22; padding: 10px 16px; border-radius: 6px; border: 1px solid #30363d; }}
  .totals span {{ display:block; font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em; }}
  .totals strong {{ font-size: 20px; color: #f0f6fc; }}
  .legend {{ margin: 12px 0 24px 0; }}
  .chip {{ display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; margin-right: 6px; }}
  .chip.hotspot  {{ background: #ff6b6b; color: #fff; }}
  .chip.unstable {{ background: #ffa94d; color: #000; }}
  .chip.rewrite  {{ background: #ffd43b; color: #000; }}
  .chip.active   {{ background: #4dabf7; color: #fff; }}
  .chip.stable   {{ background: #adb5bd; color: #000; }}
  .diagram {{ background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin-bottom: 24px; overflow: auto; }}
  details {{ background: #161b22; border: 1px solid #30363d; border-radius: 8px; margin-bottom: 16px; }}
  summary {{ padding: 12px 16px; cursor: pointer; font-weight: 600; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th, td {{ padding: 6px 12px; text-align: left; border-top: 1px solid #30363d; font-size: 13px; }}
  th {{ background: #21262d; font-weight: 600; }}
  td.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
  code {{ font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: #c9d1d9; }}
</style>
</head><body>
<h1>hotmess — <code>{scope['path']}</code></h1>
<div class="meta">since <strong>{scope['since']}</strong> · ext <strong>{scope['ext']}</strong> · recent window <strong>{scope['recent_window_days']}d</strong></div>

<div class="totals">
  <div><span>commits</span><strong>{totals['commits']}</strong></div>
  <div><span>files</span><strong>{totals['files']}</strong></div>
  <div><span>+lines</span><strong>{totals['add']:,}</strong></div>
  <div><span>-lines</span><strong>{totals['del']:,}</strong></div>
</div>

<div class="legend">{legend_items}</div>

<div class="diagram">
<pre class="mermaid">
{mermaid_src}
</pre>
</div>

<details open><summary>Top file-stem groups (code + test combined)</summary>
<table>
<thead><tr><th>Stem</th><th class='num'>Commits</th><th class='num'>+lines</th><th class='num'>-lines</th><th class='num'>test ratio</th></tr></thead>
<tbody>{stems_rows}</tbody>
</table>
</details>

<details><summary>Top co-change file pairs</summary>
<table>
<thead><tr><th>File A</th><th>File B</th><th class='num'>Together</th><th class='num'>Jaccard</th></tr></thead>
<tbody>{cc_rows}</tbody>
</table>
</details>

<script>mermaid.initialize({{ startOnLoad: true, theme: 'dark', securityLevel: 'loose', flowchart: {{ htmlLabels: true, curve: 'basis' }} }});</script>
</body></html>
"""
    with open(path, "w") as f:
        f.write(html)
    sys.stderr.write(f"hotmess: wrote {path}\n")


if __name__ == "__main__":
    main()
