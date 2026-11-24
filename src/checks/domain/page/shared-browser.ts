// How a check process finds the studio's browser: two variables the studio sets for check jobs.

export const SHARED_BROWSER_ENV = {
  endpoint: 'KITVAS_BROWSER_WS',
  name: 'KITVAS_BROWSER_NAME',
} as const;
