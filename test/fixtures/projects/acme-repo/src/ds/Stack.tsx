import type { ReactNode } from 'react';

export type StackProps = {
  gap?: 'tight' | 'normal';
  children: ReactNode;
};

export function Stack({ gap = 'normal', children }: StackProps) {
  const size = gap === 'tight' ? '4px' : 'var(--ds-gap)';
  return <div style={{ display: 'flex', flexDirection: 'column', gap: size }}>{children}</div>;
}
