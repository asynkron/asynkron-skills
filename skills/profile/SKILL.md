---
name: profile
description: Profile .NET applications for CPU performance, memory allocations, lock contention, exceptions, heap analysis, and JIT inlining. Use when the user asks about performance bottlenecks, memory leaks, high CPU, slow code, lock contention, excessive exceptions, GC pressure, heap growth, or JIT compilation in .NET projects.
argument-hint: "[--cpu|--memory|--contention|--exception|--heap] [path]"
---

## Prerequisites

This tool requires .NET 10+ SDK (for `dnx` support).

Check if `dnx` is available:
```
dnx --help
```

The profiler also depends on `dotnet-trace` and `dotnet-gcdump`. Install them if missing:
```
dotnet tool install -g dotnet-trace
dotnet tool install -g dotnet-gcdump
```

## About Asynkron.Profiler

A CLI profiler for .NET that outputs structured text — no GUI needed. Designed for both human inspection and AI-assisted analysis. It wraps `dotnet-trace` and `dotnet-gcdump` and presents call trees, hot functions, allocation tables, and contention rankings as plain text.

Results are written to `profile-output/` in the current directory.

## Running via dnx (no install needed)

```
dnx asynkron-profiler [flags] -- [target]
```

On first run, `dnx` will prompt to download the package.

## Profiling Modes

### CPU Profiling (`--cpu`)
Sampled CPU profiling. Shows call trees and hot function tables.
```
dnx asynkron-profiler --cpu -- ./MyApp.csproj
dnx asynkron-profiler --cpu -- ./bin/Release/net10.0/MyApp
```

### Memory Allocation Profiling (`--memory`)
Tracks GC allocation tick events. Shows per-type allocation call trees and allocation sources.
```
dnx asynkron-profiler --memory -- ./MyApp.csproj
```

### Lock Contention Profiling (`--contention`)
Shows wait-time call trees and contended method rankings. Use for diagnosing lock congestion and thread starvation.
```
dnx asynkron-profiler --contention -- ./MyApp.csproj
```

### Exception Profiling (`--exception`)
Counts thrown exceptions, shows throw-site call trees. Filter by type with `--exception-type`.
```
dnx asynkron-profiler --exception -- ./MyApp.csproj
dnx asynkron-profiler --exception --exception-type InvalidOperationException -- ./MyApp.csproj
```

### Heap Snapshot (`--heap`)
Takes a GC heap snapshot using `dotnet-gcdump`. Shows retained objects by type and size.
```
dnx asynkron-profiler --heap -- ./MyApp.csproj
```

### JIT / Inlining Analysis
The profiler can capture JIT-to-native compilation events, showing what methods get JIT compiled and which calls get inlined. This is useful for understanding runtime code generation and verifying that hot paths are being optimized by the JIT.

## Analyzing Existing Traces

You can analyze previously captured trace files without re-running the app:
```
dnx asynkron-profiler --input /path/to/trace.nettrace
dnx asynkron-profiler --input /path/to/trace.speedscope.json --cpu
dnx asynkron-profiler --input /path/to/heap.gcdump --heap
```

## Key Flags

| Flag | Purpose |
|------|---------|
| `--cpu` | CPU profiling |
| `--memory` | Memory allocation profiling |
| `--contention` | Lock contention analysis |
| `--exception` | Exception profiling |
| `--heap` | Heap snapshot |
| `--root <text>` | Root call tree at first matching method |
| `--filter <text>` | Filter function tables by substring |
| `--exception-type <text>` | Filter exceptions by type name |
| `--calltree-depth <n>` | Max call tree depth (default: 30) |
| `--calltree-width <n>` | Max children per node (default: 4) |
| `--calltree-self` | Include self-time tree |
| `--calltree-sibling-cutoff <n>` | Hide siblings below X% (default: 5) |
| `--include-runtime` | Include runtime/framework frames |
| `--input <path>` | Analyze existing trace file |
| `--tfm <tfm>` | Target framework for .csproj/.sln |

## Supported Input Formats

| Mode | Formats |
|------|---------|
| CPU | `.speedscope.json`, `.nettrace` |
| Memory | `.nettrace`, `.etlx` |
| Exceptions | `.nettrace`, `.etlx` |
| Contention | `.nettrace`, `.etlx` |
| Heap | `.gcdump` |

---

## Profiling Methodology

Profiling is iterative. Follow this workflow to systematically identify and eliminate bottlenecks.

### Step 1: Build Release First

Always build Release before profiling. Debug builds have disabled optimizations, extra checks, and no inlining — profiling them gives misleading results.

```
dotnet build -c Release
```

### Step 2: Choose the Right Mode

| Symptom | Start with |
|---------|------------|
| High CPU / slow execution | `--cpu` |
| High memory / GC pressure | `--memory` |
| High latency but low CPU | `--contention` |
| Too many exceptions in logs | `--exception` |
| Memory keeps growing (leak) | `--heap` |
| Want to verify JIT optimization | JIT/inlining analysis |

### Step 3: Read the Hot Function Table

The profiler outputs a hot function table showing where time or allocations are concentrated:

```
=== HOT FUNCTIONS ===
   Time (ms)      Calls  Function
-------------------------------------------------
    38805.39      19533  MyApp.Core.ProcessItem...
    19769.23       9897  MyApp.Core.TransformData...
```

Focus on the top 3-5 entries. These are your optimization targets.

### Step 4: Read the Allocation Call Graph

For memory profiling, the allocation call graph shows *where* allocations originate:

```
CreateEnvironment
  Calls: 1048
  Allocated by:
    <- ProcessLoop (1048x, 100%)
         <- RunMain (4x)
```

This traces allocations back to their source — the method that triggered them, not just where `new` was called.

### Step 5: Iterate

1. Profile to find the top bottleneck
2. Fix it (optimize hot path, reduce allocations, remove contention)
3. Profile again to measure improvement
4. Repeat until performance targets are met

Track progress across rounds:
```
Round 1: 322 MB, 172 ms
Round 2: 173 MB, 150 ms  (pooling)
Round 3: 107 MB, 116 ms  (fast paths)
```

### Step 6: Use Manual Tracing for Deep Dives

When the profiler summary isn't enough, capture a detailed trace for manual analysis:

```bash
# Capture detailed GC trace
dotnet-trace collect \
  --profile gc-verbose \
  --format NetTrace \
  -o trace.nettrace \
  -- dotnet run -c Release --project ./MyApp

# Analyze with the profiler
dnx asynkron-profiler --input trace.nettrace --memory

# Or convert for external tools
dotnet-trace convert trace.nettrace --format Speedscope
```

### Common Optimization Patterns

**Reduce allocations in hot loops:**
- Use object pooling for frequently created/disposed objects
- Use `Span<T>` / `stackalloc` for short-lived buffers
- Avoid boxing value types (use generic overloads)

**Reduce CPU in hot paths:**
- Use `[MethodImpl(MethodImplOptions.AggressiveInlining)]` on small hot methods
- Split into fast path (inlined, common case) and slow path (`NoInlining`, rare case)
- Cache computed values instead of recomputing

**Reduce contention:**
- Use lock-free patterns (`Interlocked`, `ConcurrentDictionary`)
- Reduce lock scope — hold locks for the shortest time possible
- Use `ReaderWriterLockSlim` for read-heavy workloads

**Reduce exceptions:**
- Use `TryParse` / `TryGet` patterns instead of catching exceptions
- Exceptions are expensive — never use them for control flow

---

## Guidelines

- Always build Release first (`dotnet build -c Release`) before profiling — profiling Debug builds gives misleading results
- Profile the compiled binary directly rather than via `dotnet run` for accurate measurements
- Use `--root` to focus on a specific call path when the tree is too broad
- Use `--filter` to narrow function tables to your own code, excluding framework noise
- Use `--calltree-sibling-cutoff` to hide insignificant branches
- For memory issues, start with `--memory` to find allocation sources, then `--heap` for retained object analysis
- For performance, start with `--cpu`, then drill into contention if CPU usage is low but latency is high
- For exception-heavy apps, use `--exception` with `--exception-type` to focus on specific exception categories
- Profile iteratively — fix one bottleneck at a time and measure the improvement before moving on
