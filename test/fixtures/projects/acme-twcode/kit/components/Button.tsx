import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  variant?: 'primary' | 'quiet';
  className?: string;
  children: ReactNode;
};

export function Button({ variant = 'primary', className, children, ...rest }: ButtonProps) {
  const look = variant === 'quiet' ? styles.quiet : styles.primary;
  const classes = [styles.button, look, className].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
