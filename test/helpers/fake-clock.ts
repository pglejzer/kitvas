// A clock whose time moves only when a test moves it; due timers run in time order as it does.

export type FakeClock = {
  now(): number;
  /** Calls `fn` once after `ms` of fake time; the function it returns cancels that call. */
  after(ms: number, fn: () => void): () => void;
  /** Moves time on by `ms`, running every timer that falls due on the way, at its own time. */
  advance(ms: number): void;
  /** Timers that have not run and were not cancelled. */
  pending(): number;
};

export function fakeClock(start = 0): FakeClock {
  let time = start;
  let made = 0;
  let timers: { id: number; at: number; fn: () => void }[] = [];
  return {
    now: () => time,
    after(ms, fn) {
      made += 1;
      const id = made;
      timers.push({ id, at: time + ms, fn });
      return () => {
        timers = timers.filter((timer) => timer.id !== id);
      };
    },
    advance(ms) {
      const end = time + ms;
      for (;;) {
        const due = timers.filter((timer) => timer.at <= end);
        const next = due.sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!next) break;
        timers = timers.filter((timer) => timer.id !== next.id);
        time = next.at;
        next.fn();
      }
      time = end;
    },
    pending: () => timers.length,
  };
}
