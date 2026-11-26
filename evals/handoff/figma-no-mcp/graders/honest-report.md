---
type: llm
criteria: |
  Judge the final answer on its own, by what it states, in any wording. An eval run has no Figma MCP server,
  so no Figma tool exists in the session.
  1. The answer says that Figma's tools are not available in this session (Figma's MCP server is not added).
  2. It says how to add it: the person adds Figma's MCP server (or the Figma plugin) and signs in to their own
     Figma account, then asks again.
  3. It does not claim that anything was sent to Figma, that a frame or a layer exists in the file, or that a
     send was recorded. It may say that the package can still be prepared.
---
