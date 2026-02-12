---
name: systematic-debug
description: Systematic debugging techniques for unclear root causes. Use when a bug's origin is unknown, multiple hypotheses need testing, you need to narrow down a failing area, end-to-end tests fail but you can't tell where, or the user says "I don't know why this is broken". Includes test bombs (hypothesis elimination) and layered tests (pipeline stage isolation).
argument-hint: "[bug description]"
---

## Choose Your Technique

| Technique | Use when | Finds |
|-----------|----------|-------|
| **Test Bomb** | Root cause is unclear, multiple suspects | *Which component/area* is broken |
| **Layered Test** | System has a pipeline, output is wrong but stage is unclear | *Which pipeline stage* is broken |
| **Both together** | Complex bug in a pipeline system | Test bomb narrows the component, layered test pinpoints the stage |

---

# Test Bombs

## What is a Test Bomb?

A test bomb is a systematic debugging technique. Instead of writing one big test or guessing at the root cause, you:

1. **List every hypothesis** about what could be broken
2. **Write one small test per hypothesis** — named `H1_`, `H2_`, `H3_`, etc.
3. **Run them all together** — the pass/fail pattern reveals the failing area
4. **Add more hypotheses** as you learn, narrowing the scope

Each test is independent, fast, and documents exactly what it's proving or disproving.

## When to Use Test Bombs

- Root cause of a bug is unclear
- Multiple components could be at fault
- You need to systematically eliminate possibilities
- A fix attempt didn't work and you need to understand why
- The user says things like "I don't know why this is broken" or "it used to work"

## Test Bomb Steps

1. **Identify the bug** — understand the symptom
2. **List suspected causes** — brainstorm every reasonable hypothesis (aim for 5-15)
3. **Group hypotheses by area** — organize into logical sections
4. **Write one test per hypothesis** — each with a clear name, doc comment, and assertion
5. **Run all tests** — analyze the pass/fail pattern
6. **Add edge-case hypotheses** — based on what you learned from the first run
7. **Fix the root cause** — now that you know exactly what's broken
8. **Keep the tests** — they become permanent regression coverage

## Test Bomb Templates

### C# (xUnit)

```csharp
/// TEST BOMB: Systematic elimination of suspected causes for [BUG DESCRIPTION].
public class [BugName]TestBomb(ITestOutputHelper output)
{
    private readonly ITestOutputHelper _output = output;

    // --- Section 1: [Area Name] ---

    /// H1: [describe what you're testing and what pass/fail means]
    [Fact(Timeout = 10000)]
    public async Task H1_FirstHypothesis()
    {
        // Arrange — minimal setup for this one hypothesis
        // Act — trigger the specific behavior
        // Assert — one clear assertion
        _output.WriteLine($"H1 Result: {result}");
        Assert.Equal(expected, actual);
    }

    /// H2: [describe what you're testing]
    [Fact(Timeout = 10000)]
    public async Task H2_SecondHypothesis()
    {
        // ...
    }

    // --- Section 2: [Next Area] ---

    /// H3: [describe what you're testing]
    [Fact(Timeout = 10000)]
    public async Task H3_ThirdHypothesis()
    {
        // ...
    }
}
```

### TypeScript (vitest/jest)

```typescript
// TEST BOMB: Systematic elimination of suspected causes for [BUG].
describe('[BugName] Test Bomb', () => {

  // --- Section 1: [Area Name] ---

  // H1: [describe hypothesis]
  test('H1_FirstHypothesis', async () => {
    // ...
    expect(actual).toBe(expected);
  });

  // H2: [describe hypothesis]
  test('H2_SecondHypothesis', async () => {
    // ...
  });
});
```

### Python (pytest)

```python
# TEST BOMB: Systematic elimination of suspected causes for [BUG].

class TestBugNameTestBomb:
    """Systematic elimination of suspected causes for [BUG]."""

    def test_h1_first_hypothesis(self):
        """H1: [describe hypothesis]"""
        # ...
        assert actual == expected

    def test_h2_second_hypothesis(self):
        """H2: [describe hypothesis]"""
        # ...
```

### Go

```go
// TEST BOMB: Systematic elimination of suspected causes for [BUG].

func TestH1_FirstHypothesis(t *testing.T) {
    // H1: [describe hypothesis]
    // ...
    if actual != expected {
        t.Errorf("H1: got %v, want %v", actual, expected)
    }
}

func TestH2_SecondHypothesis(t *testing.T) {
    // H2: [describe hypothesis]
    // ...
}
```

## Running Test Bombs

```bash
# C# / .NET
dotnet test --filter "FullyQualifiedName~TestBomb"

# TypeScript
npx vitest run --grep "Test Bomb"

# Python
pytest -k "TestBomb" -v

# Go
go test -run "TestH[0-9]+" -v ./...
```

## Reading Test Bomb Results

| Pattern | Meaning |
|---------|---------|
| All pass | Bug is elsewhere — expand your hypotheses |
| All fail | Fundamental setup issue — check H1 carefully |
| One section fails | Root cause is in that area |
| Scattered failures | Multiple issues, or a shared dependency is broken |
| H1 passes, H3 fails | The difference between H1 and H3 isolates the cause |

---

# Layered Tests

## What is a Layered Test?

A layered test isolates bugs in systems that process data through sequential stages. Instead of only testing the final output, you test each intermediate stage independently — so you know exactly where the pipeline breaks.

```
Input → Stage1 → Stage2 → Stage3 → Stage4 → Output
  L0      L1       L2       L3       L4       L5
```

If L3 fails but L1 and L2 pass, the bug is in Stage3.

## When to Use Layered Tests

- Bug shows up at runtime/output but the failing stage is unclear
- System has a pipeline architecture (compiler, parser, HTTP middleware, data pipeline, ETL, etc.)
- You need to inspect intermediate state between stages
- End-to-end tests fail but you can't tell where

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

## Layered Test Steps

1. **Map the pipeline** — identify every processing stage from input to output
2. **Label the layers** — L0 (input), L1 (first stage), L2 (second stage), ... LN (final output)
3. **Write tests per layer** — each test asserts the output of one specific stage
4. **Start from L1, work forward** — find the first layer that fails
5. **Compare passing vs failing** — run a passing and failing case side-by-side at the broken layer to see the exact difference

## Layered Test Templates

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
    expect(intermediate).toMatchObject(expected);
  });

  // --- Layer 2: [Second Stage] ---

  test('L2_A_Description', () => {
    const intermediate = stage2(stage1(input));
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

## Reading Layered Test Results

| Pattern | Meaning |
|---------|---------|
| All layers pass | Bug is in integration between stages, not individual stages |
| L1 fails | Problem is at the first stage — likely input parsing |
| L1-L2 pass, L3 fails | Bug is in stage 3 — inspect L2 output going into L3 |
| Only last layer fails | All stages work individually — check final assembly |
| Intermittent failures | Likely state leaking between stages or timing issue |

---

# Combining Both Techniques

## Workflow

1. Run a **test bomb** to narrow down which component is at fault
2. Run a **layered test** on that component to find the exact failing stage
3. Fix the bug at the identified stage
4. Keep both test classes as permanent regression coverage

## Guidelines

**Test bombs:**
- Name hypotheses clearly: `H1_CatchBlockReturnsUndefined` not `H1_Test`
- Add a doc comment to each test explaining the hypothesis
- Group related hypotheses into sections with comments
- Use timeouts to catch hangs (especially in async code)
- Log intermediate values — they help when analyzing failures
- Keep each test minimal — test ONE thing per hypothesis
- Start broad (5-8 hypotheses), then add targeted ones based on results
- Never delete passing tests — they prove areas are NOT broken

**Layered tests:**
- Always map the full pipeline before writing tests — missing a layer means missing a potential failure point
- Test each layer in isolation — don't let later stages mask earlier failures
- Log intermediate state at each layer — the comparison between passing and failing cases is the key diagnostic
- Include a side-by-side comparison test (passing vs failing input at the broken layer)
- Name tests with layer prefix: `L1_A_`, `L2_A_`, etc. — makes the progression obvious
- Start from L1 and work forward — find the *first* layer that fails
- Keep the tests after fixing — they're permanent regression coverage for each pipeline stage
