import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from '../core/cx.ts';
import { Icon } from './Icon.tsx';

export type TableColumn = {
  id: string;
  label: string;
  align?: 'start' | 'end';
  sortable?: boolean;
};

export type TableProps = Omit<ComponentPropsWithRef<'section'>, 'children'> & {
  /** Names the table; it is also the name of the scrolling region. */
  caption: string;
  /** Hides the caption to the eye; assistive technology still reads it. */
  hideCaption?: boolean;
  columns: TableColumn[];
  /** One object per row, keyed by column id. A row with an `id` field keeps its key across sorts. */
  rows: Record<string, ReactNode>[];
  sort?: { column: string; direction: 'asc' | 'desc' };
  onSort?: (column: string) => void;
};

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

/** A row's `id` when it has one; otherwise its place in the list. */
const rowKey = (row: Record<string, ReactNode>, index: number): string => {
  const id = row.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : `row-${index}`;
};

export function Table({
  caption,
  hideCaption,
  columns,
  rows,
  sort,
  onSort,
  className,
  ...rest
}: TableProps) {
  return (
    // The box scrolls sideways, so the keyboard must be able to reach it.
    <section {...rest} className={cx('kit-table', className)} aria-label={caption} tabIndex={0}>
      <table className="kit-table__table">
        <caption className={cx('kit-table__caption', hideCaption && 'kit-visually-hidden')}>
          {caption}
        </caption>
        <thead>
          <tr>
            {columns.map((column) => {
              const sorted = sort?.column === column.id ? sort.direction : undefined;
              const ariaSort = column.sortable ? (sorted ? ARIA_SORT[sorted] : 'none') : undefined;
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={ariaSort}
                  className={cx(
                    'kit-table__head',
                    column.align === 'end' && 'kit-table__cell--end',
                  )}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      className="kit-table__sort"
                      onClick={() => onSort?.(column.id)}
                    >
                      {column.label}
                      {sorted ? (
                        <Icon name={sorted === 'asc' ? 'arrow-up' : 'arrow-down'} size={12} />
                      ) : null}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)} className="kit-table__row">
              {columns.map((column) => (
                <td
                  key={column.id}
                  className={cx(
                    'kit-table__cell',
                    column.align === 'end' && 'kit-table__cell--end',
                  )}
                >
                  {row[column.id]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
