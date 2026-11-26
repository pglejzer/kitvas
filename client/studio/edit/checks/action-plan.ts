// Which actions a finding's card shows (mock v10, Checks): at most two text buttons. The fix, when
// there is one ("Use <token>"), else "Ask Claude", leads; "Show on canvas" follows when the finding
// has an element. With a fix, Ask Claude stays reachable as an icon button beside Dismiss. No DOM.

export type ActionPlan = {
  /** The text button that leads: the fix when there is one, else Ask Claude. */
  lead: 'use' | 'ask';
  /** Ask Claude as an icon button in the card's head: only when the fix leads. */
  askIcon: boolean;
  /** "Show on canvas" as the second text button. */
  show: boolean;
};

export function planActions(input: { fix: boolean; element: string | null }): ActionPlan {
  return {
    lead: input.fix ? 'use' : 'ask',
    askIcon: input.fix,
    show: input.element !== null,
  };
}
