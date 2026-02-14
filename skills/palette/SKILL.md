---
name: palette
description: Generate color palettes with Tailwind-scale shades. Use when the user asks about color palettes, color schemes, Tailwind colors, or generating colors for a UI theme.
argument-hint: "[hex colors]"
---

## Prerequisites

Requires Node.js >= 18. No install needed — runs via npx:

```
npx @asynkron/palette
```

## About Palette

A zero-dependency CLI that generates complete color palettes with Tailwind-scale shades (50–950). Uses OKLCH color space for perceptually uniform shade ramps. Takes hex colors, a color wheel strategy, and a count, and outputs semantically named colors ready for use in design systems.

All colors are automatically normalized to matching lightness and chroma so the palette looks cohesive regardless of the input colors.

## Common Usage

**Random 3-color palette (no input needed):**
```
npx @asynkron/palette
```

**From a single anchor color:**
```
npx @asynkron/palette '#aa5420'
```

**Colors can be passed without # to avoid shell quoting:**
```
npx @asynkron/palette aa5420 dc5b40
```

**5 triadic colors from an anchor:**
```
npx @asynkron/palette aa5420 --count 5 --strategy triadic
```

**Two input colors, generate 3 more:**
```
npx @asynkron/palette aa5420 9b2010 --count 5
```

**Vibrant mood (high saturation):**
```
npx @asynkron/palette aa5420 --vibrant
```

**Pastel mood (soft, light):**
```
npx @asynkron/palette aa5420 --pastel
```

**Keep exact input colors (skip normalization):**
```
npx @asynkron/palette aa5420 3366ff --raw
```

## Flags

| Flag | Short | Default | Purpose |
|------|-------|---------|---------|
| `--count N` | `-c` | `max(inputs, 3)` | Total number of base colors |
| `--strategy NAME` | `-s` | `evenly-spaced` | Color wheel strategy |
| `--raw` | `-r` | off | Skip normalization, keep exact input colors |
| `--vibrant` | — | off | High saturation, punchy colors |
| `--pastel` | — | off | Soft, light, desaturated colors |
| `--help` | `-h` | — | Show help |

## Strategies

| Strategy | Description |
|----------|-------------|
| `evenly-spaced` | Equal spacing around the wheel (360°/count) — default |
| `analogous` | Adjacent colors (±30°) |
| `complementary` | Opposite colors (180°) |
| `split-complementary` | Split complement (150° and 210°) |
| `triadic` | Three-way split (120°) |
| `tetradic` | Four-way split (90°) |

## Output Format

Each base color produces 11 Tailwind-scale shades. Shade 500 is the base color:

```
primary-50: #f7eae4
primary-100: #eed6ca
primary-200: #e0b9a5
primary-300: #d0987c
primary-400: #bb724b
primary-500: #aa5420     ← input
primary-600: #8a4113
primary-700: #692d06
primary-800: #4c1c00
primary-900: #2e0b00
primary-950: #180200
```

## Semantic Naming

Colors are named based on count and position:

| Count | Names |
|-------|-------|
| 1 | `primary` |
| 2 | `primary`, `secondary` |
| 3 | `primary`, `secondary`, `accent` |
| 4 | `primary`, `secondary`, `accent`, `neutral` |
| 5 | `primary`, `secondary`, `tertiary`, `accent`, `neutral` |
| 6+ | `primary`, `secondary`, `tertiary`, `accent`, `neutral`, `accent-2`, ... |

## How It Works

1. Input hex colors are parsed. If none given, a random color is generated in OKLCH with balanced lightness and chroma.
2. Missing colors (up to `--count`) are generated using the chosen strategy, rotating hue on the color wheel.
3. All colors are normalized to the anchor's OKLCH lightness and chroma (unless `--raw`). Mood presets (`--vibrant`, `--pastel`) override the target lightness/chroma.
4. Each base color gets 11 shades generated in OKLCH space — lighter shades increase lightness and decrease chroma, darker shades decrease lightness and decrease chroma.
5. Output includes ANSI color rendering when printing to a terminal. Set `NO_COLOR=1` to disable.

## Guidelines

- Prefer passing colors without `#` prefix to avoid shell quoting issues
- Use `--vibrant` for marketing/hero sections, `--pastel` for backgrounds/subtle UI
- Use `--raw` when input colors are from an existing brand and must not be adjusted
- The first input color is the anchor — it defines the normalization target for all other colors
- When no mood is set, all generated and secondary colors are normalized to the anchor's energy level
