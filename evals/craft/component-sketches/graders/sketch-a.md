---
type: regex
target: { source: file, path: '.kitvas/drafts/checkout-stepper/v1/src/tsx/sketches/A.tsx' }
pattern: '^(?![\s\S]*Replace the body)(?=[\s\S]*(?:@kit|--kit-))[\s\S]*export function StepperAExample\('
match: contains
---

Sketch A is written: the starting file's placeholder line is gone, it is built from the kit, and its example is
exported under its name.
