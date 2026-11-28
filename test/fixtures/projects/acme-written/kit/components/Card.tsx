import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  children: ReactNode;
};

export function Card({ title, children, ...rest }: CardProps) {
  return (
    <div className={styles.card} {...rest}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.text}>{children}</p>
    </div>
  );
}
