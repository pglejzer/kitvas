---
type: llm
focus: trace
criteria: |
  The truth is what `doctor` printed in the trace: each check with its status and, when the status is not
  `ok`, what to do about it.
  1. The final answer names every check whose status is not `ok` and says what `doctor` tells to do about it.
     When every check is `ok`, the answer says that kitvas found nothing wrong.
  2. It does not say that a check passed which the output marks `warn` or `fail`.
  A remark about a check that is `ok` (what its detail line says, or when it could matter) is allowed and is
  not a problem named by the answer.
---
