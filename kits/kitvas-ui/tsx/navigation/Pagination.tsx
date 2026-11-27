import type { ComponentPropsWithoutRef } from 'react';
import { IconButton } from '../action/IconButton.tsx';
import { cx } from '../core/cx.ts';

export type PaginationProps = Omit<ComponentPropsWithoutRef<'nav'>, 'onChange'> & {
  /** The current page, counted from 1. */
  page: number;
  pages: number;
  onChange?: (page: number) => void;
  /** The accessible name of the navigation. */
  label: string;
};

/** The page numbers to show: the first, the last and the current with one on each side, and gaps. */
function visiblePages(page: number, pages: number): (number | 'gap-start' | 'gap-end')[] {
  if (pages <= 5) return Array.from({ length: pages }, (_, index) => index + 1);
  const from = Math.max(2, Math.min(page - 1, pages - 3));
  const to = Math.min(pages - 1, Math.max(page + 1, 4));
  const out: (number | 'gap-start' | 'gap-end')[] = [1];
  if (from > 2) out.push('gap-start');
  for (let number = from; number <= to; number += 1) out.push(number);
  if (to < pages - 1) out.push('gap-end');
  out.push(pages);
  return out;
}

export function Pagination({ page, pages, onChange, label, className, ...rest }: PaginationProps) {
  return (
    <nav {...rest} aria-label={label} className={cx('kit-pagination', className)}>
      <ul className="kit-pagination__list">
        <li>
          <IconButton
            icon="chevron-left"
            label="Previous page"
            disabled={page <= 1}
            onClick={() => onChange?.(page - 1)}
          />
        </li>
        {visiblePages(page, pages).map((entry) =>
          typeof entry === 'string' ? (
            <li key={entry} className="kit-pagination__gap" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={entry}>
              <button
                type="button"
                className="kit-pagination__page"
                aria-current={entry === page ? 'page' : undefined}
                aria-label={`Page ${entry}`}
                onClick={() => onChange?.(entry)}
              >
                {entry}
              </button>
            </li>
          ),
        )}
        <li>
          <IconButton
            icon="chevron-right"
            label="Next page"
            disabled={page >= pages}
            onClick={() => onChange?.(page + 1)}
          />
        </li>
      </ul>
    </nav>
  );
}
