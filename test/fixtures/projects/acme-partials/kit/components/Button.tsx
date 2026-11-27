import type { ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonProps = {
  variant?: 'primary' | 'quiet';
  disabled?: boolean;
  className?: string;
  children: ReactNode;
};

export function Button({
  variant = 'primary',
  disabled = false,
  className,
  children,
}: ButtonProps) {
  const look = variant === 'quiet' ? styles.quiet : styles.primary;
  const classes = [styles.button, look, className].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} disabled={disabled}>
      <span className={styles.label}>{children}</span>
    </button>
  );
}
