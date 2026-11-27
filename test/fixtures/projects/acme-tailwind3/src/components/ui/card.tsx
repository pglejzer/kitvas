import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type CardProps = {
  className?: string;
  children: ReactNode;
};

export function Card({ className, children }: CardProps) {
  return (
    <div className={cn('rounded-lg border border-primary bg-primary-foreground p-6', className)}>
      {children}
    </div>
  );
}
