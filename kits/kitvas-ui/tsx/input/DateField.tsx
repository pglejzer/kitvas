import type { ComponentProps } from 'react';
import { Input } from './Input.tsx';

export type DateFieldProps = Omit<ComponentProps<typeof Input>, 'type'> & {
  /** The earliest day, as `YYYY-MM-DD`. */
  min?: string | undefined;
  /** The latest day, as `YYYY-MM-DD`. */
  max?: string | undefined;
};

/** A native date input in the kit's field. The picker itself is the browser's own. */
export function DateField(props: DateFieldProps) {
  return <Input {...props} type="date" />;
}
