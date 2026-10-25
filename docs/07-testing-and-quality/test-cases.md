# Test Cases

| ID | Scenario | Expected result |
|---|---|---|
| TC-001 | Factor score is 0 or 6 | Reject validation |
| TC-002 | Safety score is 5 | Final category is Critical |
| TC-003 | Environment score is 4 and weighted band is Low | Final category is at least High |
| TC-004 | Index is exactly 60.0 | Base band is High |
| TC-005 | Score 4/5 lacks rationale | Reject or mark incomplete |
| TC-006 | Two assessments marked current for one asset | Constraint violation |
| TC-007 | Synthetic example imported | Origin remains Synthetic Scenario |
| TC-008 | Retrieval has no sufficient evidence | Abstain or request clarification |
