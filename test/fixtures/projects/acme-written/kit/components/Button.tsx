import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function Button({ children, ...rest }: ButtonProps) {
  return (
    <button type="button" className={styles.button} {...rest}>
      {children}
    </button>
  );
}
