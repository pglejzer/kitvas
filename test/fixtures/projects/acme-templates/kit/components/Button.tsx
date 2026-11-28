import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: 'primary' | 'quiet';
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
};

export function Button({
  variant = 'primary',
  disabled = false,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const look = variant === 'quiet' ? styles.quiet : styles.primary;
  return (
    <span className={styles.host} {...rest}>
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
