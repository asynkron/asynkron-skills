---
name: test-bomb
description: Systematic debugging technique for unclear root causes. Use when a bug's origin is unknown, when multiple hypotheses need testing, when you need to narrow down a failing area, or when the user says "I don't know why this is broken". Creates a class of small targeted tests where each test validates one hypothesis, and the pass/fail pattern reveals the root cause.
argument-hint: "[bug description]"
---

## What is a Test Bomb?

A test bomb is a systematic debugging technique. Instead of writing one big test or guessing at the root cause, you:

1. **List every hypothesis** about what could be broken
2. **Write one small test per hypothesis** — named `H1_`, `H2_`, `H3_`, etc.
3. **Run them all together** — the pass/fail pattern reveals the failing area
4. **Add more hypotheses** as you learn, narrowing the scope

Each test is independent, fast, and documents exactly what it's proving or disproving.

## When to Use

- Root cause of a bug is unclear
- Multiple components could be at fault
- You need to systematically eliminate possibilities
- A fix attempt didn't work and you need to understand why
- The user says things like "I don't know why this is broken" or "it used to work"

## Steps

1. **Identify the bug** — understand the symptom
2. **List suspected causes** — brainstorm every reasonable hypothesis (aim for 5-15)
3. **Group hypotheses by area** — organize into logical sections
4. **Write one test per hypothesis** — each with a clear name, doc comment, and assertion
5. **Run all tests** — analyze the pass/fail pattern
6. **Add edge-case hypotheses** — based on what you learned from the first run
7. **Fix the root cause** — now that you know exactly what's broken
8. **Keep the tests** — they become permanent regression coverage

## Template

Adapt to the project's language and test framework. The pattern works in any language.

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

Run only the test bomb class to see the pattern:

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

## Reading the Results

The pass/fail pattern is the diagnostic:

| Pattern | Meaning |
|---------|---------|
| All pass | Bug is elsewhere — expand your hypotheses |
| All fail | Fundamental setup issue — check H1 carefully |
| One section fails | Root cause is in that area |
| Scattered failures | Multiple issues, or a shared dependency is broken |
| H1 passes, H3 fails | The difference between H1 and H3 isolates the cause |

## Complementary: Layered Tests

Test bombs pair well with **layered tests** when you have a pipeline:

```
Input → Stage1 → Stage2 → Stage3 → Output
  L0      L1       L2       L3       L4
```

- **Test bombs** find *which area/component* is broken
- **Layered tests** find *which stage in the pipeline* is broken

Use test bombs first to narrow the area, then layered tests to pinpoint the exact stage.

## Guidelines

- Name hypotheses clearly: `H1_CatchBlockReturnsUndefined` not `H1_Test`
- Add a doc comment to each test explaining the hypothesis
- Group related hypotheses into sections with comments
- Use timeouts to catch hangs (especially in async code)
- Log intermediate values — they help when analyzing failures
- Keep each test minimal — test ONE thing per hypothesis
- Start broad (5-8 hypotheses), then add targeted ones based on results
- Never delete passing tests — they prove areas are NOT broken
- The test bomb class becomes permanent regression coverage
