---
name: api-dog-food
description: Evaluate and improve an API by inventing real, valuable tasks, attempting them through the public API, measuring the usefulness of its features and data, and turning failures into verified fixes or evidence-backed retirement proposals. Use when asked to dogfood, audit, rationalize, improve, simplify, or find value in an API; assess whether endpoints or features produce useful information; or decide what to keep, fix, combine, document, or retire.
---

# API Dog Food

## Objective

Use the API as a real consumer with real questions. Discover which capabilities help complete meaningful work, which create friction or noise, and which need implementation, contract, data, documentation, or product changes.

Do not treat a successful HTTP response as success. The API succeeds only when it helps produce a correct, timely, actionable outcome at reasonable effort.

## Establish the Boundary

1. Identify the target API, base URL, authentication, contract or discovery surface, and allowed mutation scope.
2. Check live reachability and read the current contract when available. Prefer OpenAPI, schema discovery, or first-party API documentation over inferred routes.
3. Time-box discovery. Use the contract to find task-relevant entry points; do not turn the exercise into an exhaustive endpoint inventory before attempting useful work.
4. Treat the public API as the primary interface. Do not answer the task from internal files, databases, or implementation details before making the API attempt.
5. Use independent truth sources only afterward to validate correctness, completeness, and freshness.
6. Keep the first pass read-only unless the user explicitly authorizes mutations. Never use destructive or production mutations merely to exercise a feature.

## Build a Real Task Portfolio

Before calling feature endpoints, write 5-8 bounded tasks whose answers would matter to an actual operator, developer, or decision-maker. Derive them from the API's advertised information and the user's current context.

Cover several forms of value when the surface supports them:

- locate a specific current fact;
- summarize or prioritize a meaningful set;
- explain why something happened;
- correlate information across resources;
- detect a change, anomaly, risk, or stale state;
- choose a next action;
- perform and verify a safe mutation when authorized.

For each task, define the desired outcome and success evidence before making calls. Avoid toy queries that merely mirror endpoint names. Include at least one task that tests whether the API provides unique value beyond easier existing sources.

## Execute API-First

For each task:

1. Record the task, expected outcome, and likely API feature without assuming that feature is sufficient.
2. Attempt the task using only documented or discoverable public API surfaces.
3. Preserve reproducible evidence: request shape, relevant response excerpt or summary, errors, pagination, latency when material, and number of calls or manual joins.
4. Produce the best answer possible from the API response.
5. Cross-check that answer against an independent source of truth.
6. Record missing fields, ambiguous semantics, stale data, noise, awkward composition, undocumented behavior, and workarounds.
7. Decide whether the task was completed, partially completed, or blocked.

Do not hide API friction by silently switching to repository searches, direct database queries, UI scraping, or guessed internal routes. A workaround may validate the expected answer, but it remains evidence that the API did not complete the task.

## Score the Evidence

Score each dimension from 0 to 3 and retain the supporting evidence:

| Dimension | 0 | 1 | 2 | 3 |
| --- | --- | --- | --- | --- |
| Completion | blocked | weak fragment | usable with work | complete |
| Correctness | wrong | materially suspect | mostly correct | verified |
| Signal | mostly noise | low signal | focused enough | concise and relevant |
| Freshness | stale | unclear | acceptable | current and explicit |
| Discoverability | hidden | hard to infer | learnable | obvious |
| Actionability | none | context only | suggests action | directly enables action |
| Unique value | redundant | marginal | useful advantage | otherwise difficult |

Do not collapse the dimensions into a single average when one fatal weakness matters. A feature that is uniquely valuable but poorly shaped is a strong improvement candidate, not a retirement candidate.

Classify each observed problem by likely layer:

- contract or response design;
- implementation defect;
- source-data quality or coverage;
- freshness or caching;
- documentation or discoverability;
- task-to-feature mismatch;
- missing composition or aggregation;
- genuinely low product value.

## Turn Findings into Improvements

Rank findings by user value, recurrence across tasks, severity, and repair cost. Prefer fixes that unlock several tasks or remove repeated manual stitching.

When the request includes implementation and the code is available:

1. Capture a minimal failing API reproduction.
2. Trace the failure to the correct layer without changing the expected result to match current behavior.
3. Implement the smallest coherent fix to the public surface, data production, documentation, or observability.
4. Add focused contract and behavior tests.
5. Repeat the exact dogfood task and compare before/after evidence.

Keep speculative redesigns separate from proven defects. Do not broaden a narrow defect into an API rewrite without evidence.

## Decide Keep, Improve, Combine, or Retire

- **Keep:** repeatedly completes valuable tasks with strong evidence and acceptable effort.
- **Improve:** contains useful or unique information but has fixable correctness, shape, freshness, noise, documentation, or composition problems.
- **Combine:** overlaps another surface and would be clearer as one coherent resource or query.
- **Retire:** repeatedly fails to provide meaningful or unique value, has a viable replacement, and has no justified consumers.

Require more than a poor dogfood result before proposing retirement. Check usage telemetry, known consumers, replacement coverage, compatibility cost, and whether the failure is actually caused by bad source data or discoverability. State when usage evidence is unavailable.

## Report the Outcome

Lead with what the API enabled and what should change. Include:

1. the task portfolio and completion status;
2. an evidence matrix with features used, scores, and concrete friction;
3. cross-check results and confidence;
4. prioritized keep/improve/combine/retire decisions;
5. implemented fixes and before/after reruns, when authorized;
6. a backlog of remaining changes with acceptance criteria;
7. coverage limits, including untested mutations, permissions, or unavailable telemetry.

Make every recommendation traceable to at least one real task. Preserve useful negative results: discovering that a feature returns mostly low-value data is an outcome, not a failed evaluation.
