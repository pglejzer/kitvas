import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const variants = {
  default: 'bg-primary text-primary-foreground hover:opacity-90',
  brand: 'bg-brand text-primary-foreground',
} as const;

const sizes = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 px-3',
} as const;

export type ButtonProps = {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
  children: ReactNode;
};

export function Button({
  variant = 'default',
  size = 'default',
  className,
  children,
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center rounded-lg text-sm font-medium',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
}
