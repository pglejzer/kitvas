// The project's Tailwind 3 config, written in TypeScript: colours from CSS variables and one
// literal, a screen of its own, dark by class and a plugin of its own.
import type { Config } from 'tailwindcss';

type PluginApi = {
  addUtilities: (utilities: Record<string, Record<string, string>>) => void;
};

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'hsl(var(--primary))',
        'primary-foreground': 'hsl(var(--primary-foreground))',
        brand: '#1f5fd0',
      },
      borderRadius: {
        lg: 'var(--radius)',
      },
      screens: {
        tablet: '700px',
      },
    },
  },
  plugins: [
    ({ addUtilities }: PluginApi) => {
      addUtilities({ '.edge-dashed': { 'border-style': 'dashed' } });
    },
  ],
};

export default config;
