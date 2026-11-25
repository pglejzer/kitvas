// Sketch A of the logo KitvasLogo. Idea: the pointer. The editor's pointer grabs a solid part at its
// corner, and the v of the word is that same pointer shape, turned to point down.
// Mark box 64 x 64; lock-up viewBox 245 x 64; below 24 px the mark stands alone.
// Letters: stem 8, x-height 34 (y 20 to 54), ascender top y 8, round letters overshoot by 1.

export type KitvasLogoAProps = {
  size?: number;
  /** Gives the graphic an accessible name; without it the graphic is hidden from assistive tech. */
  title?: string;
  tone?: 'colour' | 'mono';
};

// One shape, used twice: the v of the word and, turned by 135 degrees, the pointer of the mark.
const POINTER = 'M0 0H9L16 15.3L23 0H32L16 35Z';
// The part: a square whose corner is cut back 4 units clear of the pointer's two edges.
const PART = 'M0 0H44V33.46L27.2 27.2L33.46 44H0Z';

const K = 'M0 8H8V31L19 20H30L13 37L30 54H19L8 43V54H0Z';
const I = 'M0 8H8V16H0ZM0 20H8V54H0Z';
const T = 'M6 8H14V20H20V28H14V54H6V28H0V20H6Z';
const A =
  'M28 20H36V54H28V51.97A18 18 0 1 1 28 22.03ZM28 37A10 10 0 1 0 8 37A10 10 0 1 0 28 37Z';
const S =
  'M27 19H11A11 11 0 0 0 11 41H17A3 3 0 0 1 17 47H1V55H17A11 11 0 0 0 17 33H11A3 3 0 0 1 11 27H27Z';

export function KitvasLogo({ size = 64, title, tone = 'colour' }: KitvasLogoAProps) {
  const small = size < 24;
  return (
    <svg
      viewBox={small ? '0 0 64 64' : '0 0 245 64'}
      width={small ? size : (size * 245) / 64}
      height={size}
      fill="currentColor"
      data-craft-tone={tone}
      role={title === undefined ? undefined : 'img'}
      aria-label={title}
      aria-hidden={title === undefined ? true : undefined}
    >
      <path d={PART} />
      <path d={POINTER} transform="translate(34 34) rotate(135) scale(0.83) translate(-16 -35)" />
      {small ? null : (
        <g transform="translate(76 1)">
          <path d={K} />
          <path d={I} transform="translate(35 0)" />
          <path d={T} transform="translate(47 0)" />
          <path d={POINTER} transform="translate(70 20)" />
          <path d={A} fillRule="evenodd" transform="translate(101 0)" />
          <path d={S} transform="translate(141 0)" />
        </g>
      )}
    </svg>
  );
}
