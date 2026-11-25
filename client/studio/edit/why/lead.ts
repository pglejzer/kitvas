// The first words of a reason, set in bold in the Why card as in the mock ("Three plans. The brief
// names…"). Pure: the first sentence when there is more after it, else the first clause up to a
// colon, semicolon or comma; a short line with neither has no lead and stays plain.

/** A lead longer than this is not a lead: a bold paragraph says nothing. */
const MAX_LEAD = 80;
const MAX_CLAUSE = 70;

export function splitLead(line: string): { lead: string; rest: string } {
  const text = line.trim();
  const sentence = /^(.+?[.!?])\s+(\S[\s\S]*)$/.exec(text);
  const first = sentence?.[1];
  if (sentence && first !== undefined && first.length <= MAX_LEAD) {
    return { lead: first, rest: sentence[2] ?? '' };
  }
  const clause = new RegExp(`^([^:;,]{3,${MAX_CLAUSE}}[:;,])\\s+(\\S[\\s\\S]*)$`).exec(text);
  if (clause) return { lead: clause[1] ?? '', rest: clause[2] ?? '' };
  return { lead: '', rest: text };
}
