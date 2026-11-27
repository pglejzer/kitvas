import type { ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonProps = {
  variant?: 'primary' | 'quiet';
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
};

export function Button({ variant = 'primary', disabled = false, onClick, children }: ButtonProps) {
  const look = variant === 'quiet' ? styles.quiet : styles.primary;
  return (
    <span className={styles.host}>
      <button
        type="button"
        className={`${styles.button} ${look}`}
        disabled={disabled}
        onClick={onClick}
      >
        <span className={styles.label}>{children}</span>
      </button>
    </span>
  );
}
