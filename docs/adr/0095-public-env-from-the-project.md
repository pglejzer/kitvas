# 0095. Public environment variables from the project

Date: 2026-11-28. Status: accepted.

## Context

kitvas bundles a project's components with `process.env` set to `{}`. A real Next.js app on Tailwind 3 failed every example in `kit verify`: its `cn()` helper sits in a file that imports the app's `env.mjs`, which checks `NEXT_PUBLIC_APP_URL` when it is imported and throws without it. The app's own bundler puts such public variables into the browser code from its env files, so in the app the check passes. A component library that reads a public variable when it is imported is common: env schemas (`@t3-oss/env-nextjs`), API clients, analytics keys.

## Decision

- **The project's public variables, as its bundler puts them.** Every bundle of a project's code holds, in `process.env` and in `import.meta.env`, the variables of the project's `.env`, `.env.development`, `.env.local` and `.env.development.local`, a later file winning (Next.js's order). The files are parsed with Node's own `util.parseEnv`.
- **Public names only.** A name is read only when it starts with a prefix that a bundler sends to the browser anyway: `NEXT_PUBLIC_`, `VITE_`, `REACT_APP_`, `GATSBY_`, `EXPO_PUBLIC_` or `PUBLIC_`. Every other name may be a secret; it is never read into a bundle.
- **The env files count for a build's key**, so a variable set after a failed verify is used by the next one.
- **A variable that is still missing is the person's to set.** The learn skill names it from the render error and asks for it in `.env.local`; kitvas and its agents never write an env file.

## Turned down

- **An `env` block in kit.json** that the learner fills (for example from `.env.example`). The learner would invent values, they would go stale beside the project's own files, and the project already says them.
- **A stub module in place of the project's env file** (`resolve.alias`). It works for one project, and a component that really uses the value gets a made-up one.

## Consequences

A project whose code reads its public variables when imported is learned, built and checked as it runs in the app. kitvas reads the env files of a project, but only the public names: what it puts into a bundle is what the project's own bundler already puts into the browser. Variable expansion (`$OTHER`) and the shell's own environment are not read; a value that needs them stays as written.
