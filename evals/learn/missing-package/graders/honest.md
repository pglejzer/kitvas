---
type: llm
criteria: |
  The package @acme/ui is listed in package.json but is not installed in node_modules.
  1. The agent found this out (from `kit new` or by looking) and told the user that the package is not installed.
  2. The agent did not install it, did not write kit files by hand, and did not claim a kit was learned or verified.
  3. The final answer tells the user what to do (install the package in the project, then ask again).
---
