import type { ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonProps = {
  tone?: 'primary' | 'quiet';
  children: ReactNode;
};

export function Button({ tone = 'primary', children }: ButtonProps) {
  return (
    <button type="button" className={`${styles.button} ${styles[tone]}`}>
      {children}
    </button>
  );
}
