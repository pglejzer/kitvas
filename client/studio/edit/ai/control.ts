// What the Claude tab lets the tools on the canvas do (redesign spec, goals 10 and 11; plan 19):
// the ask bar sends through it, the variant pill shows and applies through it. The tab fills it
// when it mounts (`setAiControl`); a tool that finds none (the tab is not on the page) is off.

/** One variant of an answered request, as the pill names it. */
export type VariantRef = {
  /** `variantKey(request, index)` of `requests.ts`. */
  key: string;
  request: string;
  index: number;
  label: string;
  /** It can be shown and applied now: built, not out of date, not blocked. */
  ready: boolean;
  /** The card's words for why it cannot be applied now; `null` or absent while it can. */
  reason?: string | null;
};

export type AiControl = {
  /** Sends a `say` request about the selection. False when nothing was sent. */
  send(words: string): Promise<boolean>;
  /** Sends an `improve` request about the selection. False when nothing was sent. */
  improve(): Promise<boolean>;
  /** The variants of the newest open answered request that names `selection[0]`; `[]` with none. */
  variantsFor(selection: readonly string[]): VariantRef[];
  /** Holds a variant on the canvas until `show(null)`, an apply, or a change of the selection. */
  show(key: string | null): void;
  /** Applies a variant as one gesture. False when it was not applied. */
  apply(key: string): Promise<boolean>;
  /** Hears every change of what `variantsFor` answers and of what the canvas shows. */
  onChange(listener: () => void): () => void;
};

let control: AiControl | null = null;

export function setAiControl(next: AiControl | null): void {
  control = next;
}

/** The Claude tab's control; `null` until the tab has mounted. */
export function aiControl(): AiControl | null {
  return control;
}
