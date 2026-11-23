import type { ReactNode } from 'react';
import styles from './Card.module.css';

export type CardProps = {
  title: string;
  children: ReactNode;
};

export function Card({ title, children }: CardProps) {
  return (
    <div className={styles.card}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.text}>{children}</p>
    </div>
  );
}
