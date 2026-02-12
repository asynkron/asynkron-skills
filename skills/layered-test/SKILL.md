---
name: layered-test
description: Isolate bugs in multi-stage pipelines by testing each layer independently. Use when a bug manifests at the output but the failing stage is unclear, when debugging compilers, parsers, data pipelines, request pipelines, middleware chains, or any system with sequential processing stages.
argument-hint: "[bug description]"
---

## What is a Layered Test?

A layered test isolates bugs in systems that process data through sequential stages. Instead of only testing the final output, you test each intermediate stage independently — so you know exactly where the pipeline breaks.

```
Input → Stage1 → Stage2 → Stage3 → Stage4 → Output
  L0      L1       L2       L3       L4       L5
```

If L3 fails but L1 and L2 pass, the bug is in Stage3.

## When to Use

- Bug shows up at runtime/output but the failing stage is unclear
- System has a pipeline architecture (compiler, parser, HTTP middleware, data pipeline, ETL, etc.)
- You need to inspect intermediate state between stages
- End-to-end tests fail but you can't tell where
- Complements test bombs: use test bombs to find *which component*, layered tests to find *which stage*

## Steps

1. **Map the pipeline** — identify every processing stage from input to output
2. **Label the layers** — L0 (input), L1 (first stage), L2 (second stage), ... LN (final output)
3. **Write tests per layer** — each test asserts the output of one specific stage
4. **Start from L1, work forward** — find the first layer that fails
5. **Compare passing vs failing** — run a passing and failing case side-by-side at the broken layer to see the exact difference

## Common Pipeline Types

### Compiler / Interpreter
```
Source → Lexer → Parser → AST → Semantic Analysis → Code Gen → Output
  L0      L1       L2      L3         L4               L5       L6
```

### HTTP Request Pipeline
```
Request → Auth → Validation → Business Logic → Serialization → Response
  L0       L1       L2            L3               L4            L5
```

### Data Pipeline / ETL
```
Raw Data → Extract → Transform → Validate → Load → Query Result
   L0        L1         L2          L3        L4       L5
```

### ML Pipeline
```
Raw Data → Preprocessing → Feature Engineering → Model → Post-processing → Output
   L0          L1                L2                L3          L4            L5
```

### Build System
```
Source → Dependency Resolution → Compilation → Linking → Packaging → Artifact
  L0            L1                   L2          L3         L4         L5
```

## Template

Adapt to your language and pipeline. The key is: one test per layer, progressive depth.

### C# (xUnit)

```csharp
/// LAYERED TESTS: Isolate which pipeline stage causes [BUG].
///
/// L1: [First stage] - does it produce correct intermediate output?
/// L2: [Second stage] - does it transform correctly?
/// L3: [Third stage] - does it handle the edge case?
/// L4: [Final stage] - full end-to-end assertion
/// L5: Side-by-side comparison of passing vs failing case
public class [BugName]LayeredTest(ITestOutputHelper output)
{
    // ================================================================
    // LAYER 1: [First Stage Name]
    // ================================================================

    /// L1_A: [what you're checking at this stage]
    [Fact(Timeout = 10000)]
    public async Task L1_A_Description()
    {
        // Get the intermediate output after stage 1
        // Assert its structure/content is correct
    }

    // ================================================================
    // LAYER 2: [Second Stage Name]
    // ================================================================

    /// L2_A: [what you're checking at this stage]
    [Fact(Timeout = 10000)]
    public async Task L2_A_Description()
    {
        // Get the intermediate output after stage 2
        // Assert its structure/content is correct
    }

    // ================================================================
    // LAYER N: Side-by-side comparison
    // ================================================================

    /// LN: Compare passing vs failing case at the broken layer
    [Fact(Timeout = 10000)]
    public async Task LN_ComparePassingVsFailing()
    {
        output.WriteLine("=== PASSING CASE ===");
        // Run the passing input through the pipeline, log intermediate state

        output.WriteLine("=== FAILING CASE ===");
        // Run the failing input through the pipeline, log intermediate state

        output.WriteLine("Compare the traces above to see the difference!");
    }
}
```

### TypeScript (vitest/jest)

```typescript
// LAYERED TESTS: Isolate which pipeline stage causes [BUG].
describe('[BugName] Layered Test', () => {

  // --- Layer 1: [First Stage] ---

  test('L1_A_Description', () => {
    const intermediate = stage1(input);
    // Assert intermediate state
    expect(intermediate).toMatchObject(expected);
  });

  // --- Layer 2: [Second Stage] ---

  test('L2_A_Description', () => {
    const intermediate = stage2(stage1(input));
    // Assert intermediate state
    expect(intermediate).toMatchObject(expected);
  });

  // --- Comparison ---

  test('LN_ComparePassingVsFailing', () => {
    console.log('=== PASSING CASE ===');
    const passing = runPipeline(passingInput);
    console.log(JSON.stringify(passing, null, 2));

    console.log('=== FAILING CASE ===');
    const failing = runPipeline(failingInput);
    console.log(JSON.stringify(failing, null, 2));
  });
});
```

### Python (pytest)

```python
# LAYERED TESTS: Isolate which pipeline stage causes [BUG].

class TestBugNameLayered:
    """Isolate which pipeline stage causes [BUG]."""

    # --- Layer 1: [First Stage] ---

    def test_l1_a_description(self):
        """L1_A: [what you're checking]"""
        intermediate = stage1(input_data)
        assert intermediate == expected

    # --- Layer 2: [Second Stage] ---

    def test_l2_a_description(self):
        """L2_A: [what you're checking]"""
        intermediate = stage2(stage1(input_data))
        assert intermediate == expected
```

## Reading the Results

| Pattern | Meaning |
|---------|---------|
| All layers pass | Bug is in integration between stages, not individual stages |
| L1 fails | Problem is at the first stage — likely input parsing |
| L1-L2 pass, L3 fails | Bug is in stage 3 — inspect L2 output going into L3 |
| Only last layer fails | All stages work individually — check final assembly |
| Intermittent failures | Likely state leaking between stages or timing issue |

## Combining with Test Bombs

Test bombs and layered tests solve different problems:

| Technique | Finds |
|-----------|-------|
| **Test bomb** | *Which component/area* is broken (horizontal) |
| **Layered test** | *Which pipeline stage* is broken (vertical) |

Typical workflow:
1. Run a **test bomb** to narrow down which component is at fault
2. Run a **layered test** on that component to find the exact failing stage
3. Fix the bug at the identified stage
4. Keep both test classes as regression coverage

## Guidelines

- Always map the full pipeline before writing tests — missing a layer means missing a potential failure point
- Test each layer in isolation — don't let later stages mask earlier failures
- Log intermediate state at each layer — the comparison between passing and failing cases is the key diagnostic
- Include a side-by-side comparison test (passing vs failing input at the broken layer)
- Name tests with layer prefix: `L1_A_`, `L2_A_`, etc. — makes the progression obvious
- Start from L1 and work forward — find the *first* layer that fails
- Keep the tests after fixing — they're permanent regression coverage for each pipeline stage
