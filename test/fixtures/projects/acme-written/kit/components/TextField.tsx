import { useId } from 'react';
import styles from './TextField.module.css';

export type TextFieldProps = {
  label: string;
  placeholder?: string;
};

export function TextField({ label, placeholder }: TextFieldProps) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" placeholder={placeholder} className={styles.input} />
    </div>
  );
}
