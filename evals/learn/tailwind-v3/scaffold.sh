#!/usr/bin/env bash
# Makes a project whose own components are styled with Tailwind 3: two small components, a tailwind.config.js
# with a colour from a CSS variable and one literal, the CSS entry with the three @tailwind lines, and a
# tailwindcss folder in node_modules that holds only its version (the eval installs nothing and has no browser).
# Runs in the case workspace. Needs the plugin folder to find bin/kitvas.ts.
# The eval gives a scaffold no CLAUDE_PLUGIN_ROOT, so the folder is found from this script's own path.
set -euo pipefail

ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
if [ -z "$ROOT" ] || [ ! -f "$ROOT/bin/kitvas.ts" ]; then
  echo "scaffold: cannot find bin/kitvas.ts three folders above this script; set CLAUDE_PLUGIN_ROOT to the kitvas plugin folder" >&2
  exit 1
fi

# The eval's sandbox hides files esbuild reads above the project; see evals/lib/sandbox.sh.
. "$(dirname "${BASH_SOURCE[0]}")/../../lib/sandbox.sh"
prepare_home

cat > package.json <<'JSON'
{
  "name": "bike-shop",
  "private": true,
  "dependencies": { "react": "19.3.1", "react-dom": "19.3.1", "tailwindcss": "3.4.19" }
}
JSON

mkdir -p src/components/ui src/styles node_modules/tailwindcss
cat > node_modules/tailwindcss/package.json <<'JSON'
{ "name": "tailwindcss", "version": "3.4.19" }
JSON

# The components import React, which a real project has installed. Copy it, with the package react-dom needs,
# from the plugin's own packages.
for pkg in react react-dom scheduler; do
  if [ -d "$ROOT/node_modules/$pkg" ]; then
    cp -R "$ROOT/node_modules/$pkg" "node_modules/$pkg"
  fi
done

cat > tailwind.config.js <<'JS'
module.exports = {
  content: ['./src/**/*.tsx'],
  theme: {
    extend: {
      colors: { primary: 'hsl(var(--primary))', brand: '#1f5fd0' },
      borderRadius: { md: 'var(--radius)' },
    },
  },
};
JS

cat > src/styles/globals.css <<'CSS'
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --primary: 222 80% 45%;
  --radius: 0.5rem;
}
CSS

cat > src/components/ui/button.tsx <<'TSX'
import type { ReactNode } from 'react';

type ButtonProps = {
  children: ReactNode;
  variant?: 'solid' | 'outline';
};

export function Button({ children, variant = 'solid' }: ButtonProps) {
  const look = variant === 'solid' ? 'bg-primary text-white' : 'border border-brand text-brand';
  return <button className={`rounded-md px-4 py-2 text-sm font-medium ${look}`}>{children}</button>;
}
TSX

cat > src/components/ui/badge.tsx <<'TSX'
import type { ReactNode } from 'react';

type BadgeProps = {
  children: ReactNode;
  tone?: 'plain' | 'brand';
};

export function Badge({ children, tone = 'plain' }: BadgeProps) {
  const look = tone === 'brand' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-800';
  return <span className={`rounded-md px-2 py-0.5 text-xs ${look}`}>{children}</span>;
}
TSX

node "$ROOT/bin/kitvas.ts" init --json
