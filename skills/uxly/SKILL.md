---
name: uxly
description: Scan web pages for UI consistency issues — misalignment, bad contrast, near-miss colors, inconsistent spacing, and more. Requires Chrome DevTools MCP. Use when the user asks to "check the UI", "scan for design issues", "run UXly", or "audit the page".
disable-model-invocation: true
argument-hint: "[URL to scan, or 'all' to scan multiple pages]"
---

## Prerequisites

This skill requires:
1. **Chrome DevTools MCP** connected (chrome-devtools or claude-in-chrome)
2. **A local HTTP server** to serve the scanner script (auto-started by this skill)
3. The target page must be open or navigable in Chrome

Check that the MCP tools are available:
```
mcp__chrome-devtools__list_pages (or mcp__claude-in-chrome__tabs_context_mcp)
```

If not available, the user needs to add the chrome-devtools MCP server to their Claude Code config.

## About

UXly is a comprehensive UI consistency scanner that detects ~40 categories of design issues:

- **Color**: near-miss colors, color sprawl, palette harmony, WCAG contrast failures
- **Typography**: inconsistent font sizes/weights across same-role elements, mixed fonts
- **Spacing**: misaligned siblings, inconsistent gaps, cramped text/padding
- **Layout**: nested panels, adjacent panels without spacing, nested scroll containers
- **Accessibility**: missing labels, tiny tap targets, blocked interactive elements
- **Icons**: inconsistent sizes, misaligned with text labels
- **Components**: too many button variants, inconsistent border radii

The scanner script is at `skills/uxly/uxly-scanner.js` in this repository.

## Setup: Start Local Server

The scanner script needs to be served via HTTP so it can be injected into pages. Start a CORS-enabled server:

```bash
# Find the skill directory containing uxly-scanner.js
UXLY_DIR="$(find /Users/rogerjohansson/git/asynkron/Skills/skills/uxly -name 'uxly-scanner.js' -exec dirname {} \; | head -1)"

# Kill any existing server on port 8765
lsof -ti:8765 | xargs kill -9 2>/dev/null; sleep 1

# Start CORS-enabled HTTP server
python3 -c "
import http.server, os
class CORSHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        super().end_headers()
os.chdir('$UXLY_DIR')
http.server.test(HandlerClass=CORSHandler, port=8765, bind='127.0.0.1')
" &
```

Verify the server is running:
```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8765/uxly-scanner.js
```
Expected: `200`

## Workflow A: Basic Page Scan

For each page to scan:

### Step 1: Navigate to the page

Use `mcp__chrome-devtools__navigate_page` or `mcp__chrome-devtools__select_page` to ensure the target page is selected.

### Step 2: Inject and run the scanner

```javascript
// Use mcp__chrome-devtools__evaluate_script with this function:
async () => {
  document.querySelectorAll('script[src*="8765"]').forEach(s => s.remove());
  delete window.uxlyResult;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'http://127.0.0.1:8765/uxly-scanner.js?' + Date.now();
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  const r = window.uxlyResult;
  if (!r) return { error: 'No result' };
  return {
    url: r.url,
    score: r.score,
    total: r.findings.length,
    counts: r.summary.findingCounts,
    findings: r.findings.map(f => ({
      sev: f.severity,
      cat: f.category,
      msg: f.message
    }))
  };
}
```

### Step 3: Analyze results

- **Score 90+**: Good — only minor cosmetic issues
- **Score 70-89**: Acceptable — some inconsistencies worth fixing
- **Score 50-69**: Needs work — significant design system violations
- **Score < 50**: Poor — major consistency problems

Focus on **errors first**, then **warnings**. Info items are suggestions.

### Step 4: Fix issues

For each actionable finding:
1. Identify which CSS file contains the problematic styles
2. Fix using design tokens (CSS custom properties) wherever possible
3. Prefer shared utility classes over inline styles
4. Build and verify the fix

## Workflow B: Pixel-Accurate Contrast Analysis

For pages with semi-transparent layers, gradients, or stacked backgrounds, use the pixel-sampling workflow for accurate contrast measurement:

### Step 1: Inject scanner (same as Workflow A, Step 2)

### Step 2: Hide text for clean background screenshot

```javascript
// mcp__chrome-devtools__evaluate_script:
() => {
  const count = window.uxlyHideText();
  return { hidden: count };
}
```

### Step 3: Take screenshot (text is now invisible)

Use `mcp__chrome-devtools__take_screenshot` to save a JPEG to the server directory:
```
filePath: <UXLY_DIR>/uxly_bg_screenshot.jpg
format: jpeg
quality: 50
```

### Step 4: Restore text and run pixel sampling

```javascript
// mcp__chrome-devtools__evaluate_script:
async () => {
  window.uxlyRestoreText();
  const resp = await fetch('http://127.0.0.1:8765/uxly_bg_screenshot.jpg?' + Date.now());
  const blob = await resp.blob();
  const dataUrl = await new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  const refined = await window.uxlyRefineWithScreenshot(dataUrl);
  return {
    score: refined.score,
    contrastMethod: refined.contrastMethod,
    contrastIssues: refined.analyses.contrast.length,
    findings: refined.findings.map(f => ({ sev: f.severity, cat: f.category, msg: f.message }))
  };
}
```

## Workflow C: Multi-Page Site Audit

### Step 1: Discover pages

After injecting the scanner on any page, extract navigation links:

```javascript
// mcp__chrome-devtools__evaluate_script:
() => {
  const links = document.querySelectorAll('a[href]');
  return [...links]
    .filter(l => l.href.includes(location.host))
    .map(l => ({ href: l.getAttribute('href'), text: l.textContent.trim() }))
    .filter((v, i, a) => a.findIndex(x => x.href === v.href) === i);
}
```

### Step 2: Scan each page

Navigate to each URL and run Workflow A. Collect scores.

### Step 3: Report summary

Present a table of page scores and highlight cross-page patterns:
- Issues that appear on **every page** are likely in shared CSS (tokens, components, overrides)
- Issues on **specific pages** are in scoped component CSS

## Common Issue → Fix Mapping

| Issue Category | Typical Fix |
|---|---|
| `near-miss-color` | Unify to single design token (check tokens.css dark theme) |
| `low-contrast` | Darken bg with `color-mix(in srgb, var(--color) X%, black)` or use white text |
| `too-many-sizes` | Set explicit `font-size: var(--app-type-*)` on component |
| `inconsistent-padding` | Standardize to spacing scale (8, 12, 16, 20, 24px) |
| `misaligned-siblings` | Check `align-items` on flex parent, remove stray `margin-top` |
| `inconsistent-icon-size` | Set explicit `width`/`height` on SVG icons in same context |
| `misaligned-icon` | Use `align-items: center` on flex parent |
| `nested-panel` | Remove inner border/shadow or flatten to single container |
| `blocked-interactive` | Fix z-index stacking or remove overlay |
| `missing-label` | Add `aria-label` or `<label>` element |
| `tiny-tap-target` | Increase to minimum 24x24px, or wrap in larger clickable area |
| `cramped-padding` | Increase padding to at least 50% of font-size |

## Blazor-Specific Notes

- **Scoped CSS and `::deep`**: Blazor scoped CSS (`.razor.css`) only applies to elements rendered directly in that component. Labels/inputs inside child components (e.g., MudBlazor `MudSelect`) need `::deep` to pierce the boundary.
- **MudBlazor overrides**: MudBlazor sets its own font sizes, padding, and colors. Override in `overrides.css` with `!important` and design tokens.
- **Design tokens**: Always prefer `var(--app-type-*)` over hard-coded pixel sizes. The full type scale: `--app-type-2xs` (10px), `--app-type-xs` (11px), `--app-type-sm` (12px), `--app-type-md` (13px), `--app-type-base` (14px), `--app-type-lg` (15px), `--app-type-xl` (16px), `--app-type-2xl` (18px).

## Finding Severity Guide

- **error**: Must fix — contrast failures, blocked elements, near-miss colors that indicate token drift
- **warn**: Should fix — inconsistent sizes/padding/weights, nested panels, cramped spacing
- **info**: Nice to fix — crowded tap targets, long lines, palette harmony suggestions
