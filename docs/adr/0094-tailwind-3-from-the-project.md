# 0094. Tailwind 3 from the project

Date: 2026-11-27. Status: accepted. Changes in part `0034-tailwind-v4-from-project.md` and `0030-project-kits.md`. Spec: `docs/specs/2026-11-27-kitvas-tailwind-3-design.md`.

## Context

ADR 0034 learns a Tailwind 4 project and refuses a Tailwind 3 one with `KIT_SOURCE_INVALID`, "it comes later". Tailwind 3 is still the version of most existing apps that use Tailwind, and kitvas takes a project as it is. A trial with Tailwind 3.4.19 showed that the project's own Tailwind, its config loader and its PostCSS can build the classes of a draft in about 100 ms, with a config written in JavaScript or TypeScript.

## Decision

- **The project's own Tailwind of either major.** The build worker reads the major of the project's `tailwindcss` and runs the Tailwind 4 build or a new Tailwind 3 build. The Tailwind 3 build loads `tailwindcss`, its config loader and `resolveConfig`, and `postcss` and `postcss-import` from Tailwind's own folder, never kitvas's copies. Tailwind 2 or older is `KIT_SOURCE_INVALID`, with the version named.
- **The config is the project's.** It is found as Tailwind finds it (an `@config` line in the entry, else `tailwind.config.{js,cjs,mjs,ts}`); kitvas replaces only `content`. Running it means running the project's own JavaScript, inside the child process ADR 0034 already has, with the same limits; `docs/security.md` row D says so.
- **Tokens map onto theme paths.** Tailwind 3 has no theme variables, and a config may hold a literal colour. In `css-var-map.json` a token of a Tailwind 3 kit may map to a path written `theme(colors.primary)`; kitvas defines one variable per path from the project's Tailwind, and `kit verify` reads it in the page like any mapped variable. A Tailwind 4 kit keeps mapping onto theme variables.
- **The contract does not change**: `runtime.styles.tailwind.entry` is the CSS file with the `@tailwind` lines for Tailwind 3. Makers, the editor and the hand-off get the project's version and prefix and write classes of that version.

## Turned down

- **Converting the Tailwind 3 config to a Tailwind 4 `@theme` and building with kitvas's Tailwind 4.** The two versions paint differently (renamed utilities, the default border colour, the ring width), plugins written for Tailwind 3 do not run in 4, and a draft would look right in kitvas and different in the app.
- **Keeping the refusal and asking the person to upgrade.** kitvas takes a project as it is; most existing Tailwind projects are on 3.

## Consequences

A Tailwind 3 project is learned, drafted, checked and edited like a Tailwind 4 one. ADR 0034's other decisions stand: the project's own compiler, the child process and its limits, the unknown-class findings. What changes is that kitvas now executes a project's config file when it builds, which a person already does with their own build. A project on Tailwind 2 or older is still refused.
