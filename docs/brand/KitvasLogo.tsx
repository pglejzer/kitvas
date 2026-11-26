// The logo of kitvas: an icon of two kit parts joined by a dovetail, the word kitvas, and two loose
// kit parts (small rounded squares turned -15 degrees) as the dot of the i and a full stop.
// Icon box 34 x 34; full logo viewBox 180 x 46; below 24 px the icon stands alone.
// The strings equal the paths of kitvas-logo.svg.

export type KitvasLogoProps = {
  size?: number;
  /** Gives the graphic an accessible name; without it the graphic is hidden from assistive tech. */
  title?: string;
  tone?: 'colour' | 'mono';
};

const COPPER = '#b4571a';

const ICON_LEFT =
  'M3 0H12V13L22 10V24L12 21V34H3A3 3 0 0 1 0 31V3A3 3 0 0 1 3 0Z';
const ICON_RIGHT =
  'M16 0H31A3 3 0 0 1 34 3V31A3 3 0 0 1 31 34H16V26.4L26 29.4V4.6L16 7.6Z';
const PART =
  'M-1.5 -3.5H1.5A2 2 0 0 1 3.5 -1.5V1.5A2 2 0 0 1 1.5 3.5H-1.5A2 2 0 0 1 -3.5 1.5V-1.5A2 2 0 0 1 -1.5 -3.5Z';

const K =
  'M0 9A3 3 0 0 1 6 9V37A3 3 0 0 1 0 37ZM.88 28.88L10.88 18.88A3 3 0 0 1 15.12 23.12L5.12 33.12ZM9.62 24.88L19.62 34.88A3 3 0 0 1 15.38 39.12L5.38 29.12Z';
const I = 'M24 21A3 3 0 0 1 30 21V37A3 3 0 0 1 24 37Z';
const T =
  'M35.5 12A3 3 0 0 1 41.5 12V37A3 3 0 0 1 35.5 37ZM35.5 18H42.5A3 3 0 0 1 42.5 24H35.5A3 3 0 0 1 35.5 18Z';
const V =
  'M53.25 19.8L60.25 35.8A3 3 0 0 1 54.75 38.2L47.75 22.2A3 3 0 0 1 53.25 19.8ZM61.75 19.8A3 3 0 0 1 67.25 22.2L60.25 38.2A3 3 0 0 1 54.75 35.8Z';
const A =
  'M69 29A11 11 0 1 1 91 29A11 11 0 1 1 69 29ZM75 29A5 5 0 1 0 85 29A5 5 0 1 0 75 29ZM85 21A3 3 0 0 1 91 21V37A3 3 0 0 1 85 37Z';
const S =
  'M101.88 18H109.25A2.5 2.5 0 0 1 109.25 23H101.88A1.75 1.75 0 0 0 101.88 26.5H105.12A6.75 6.75 0 0 1 105.12 40H97.75A2.5 2.5 0 0 1 97.75 35H105.12A1.75 1.75 0 0 0 105.12 31.5H101.88A6.75 6.75 0 0 1 101.88 18Z';

export function KitvasLogo({ size = 64, title, tone = 'colour' }: KitvasLogoProps) {
  const small = size < 24;
  const accent = tone === 'colour' ? COPPER : 'currentColor';
  return (
    <svg
      viewBox={small ? '0 0 34 34' : '0 0 180 46'}
      width={small ? size : (size * 180) / 46}
      height={size}
      role={title === undefined ? undefined : 'img'}
      aria-label={title}
      aria-hidden={title === undefined ? true : undefined}
    >
      {small ? (
        <>
          <path fill={accent} d={ICON_LEFT} />
          <path fill={accent} d={ICON_RIGHT} />
        </>
      ) : (
        <>
          <g fill={accent} transform="translate(2 6)">
            <path d={ICON_LEFT} />
            <path d={ICON_RIGHT} />
          </g>
          <g transform="translate(47 0)">
            <g fill="currentColor">
              <path d={K} />
              <path d={I} transform="translate(1 0)" />
              <path d={T} transform="translate(2.5 0)" />
              <path d={V} transform="translate(4 0)" />
              <path d={A} transform="translate(6 0)" />
              <path d={S} transform="translate(6.5 0)" />
            </g>
            <g fill={accent}>
              <path d={PART} transform="translate(28 10.2) rotate(-15)" />
              <path d={PART} transform="translate(127.3 36.2) rotate(-15)" />
            </g>
          </g>
        </>
      )}
    </svg>
  );
}
