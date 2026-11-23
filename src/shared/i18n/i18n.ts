// Messages for people: loaded from locales/<language>.json, English as the base.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Messages = Record<string, string>;
export type Translate = (key: string, params?: Record<string, string | number>) => string;

export function createTranslator(messages: Messages): Translate {
  return (key, params = {}) => {
    const template = messages[key];
    if (template === undefined) throw new Error(`Missing message: ${key}`);
    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
      name in params ? String(params[name]) : whole,
    );
  };
}

function readMessages(file: string): Messages {
  return JSON.parse(readFileSync(file, 'utf8')) as Messages;
}

export function loadMessages(localesDir: string, language: string): Messages {
  const base = readMessages(join(localesDir, 'en.json'));
  if (language === 'en') return base;
  try {
    return { ...base, ...readMessages(join(localesDir, `${language}.json`)) };
  } catch {
    return base;
  }
}
