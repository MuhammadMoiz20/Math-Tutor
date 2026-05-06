/**
 * Heuristic: returns true if `text` looks like a full canonical mathematical
 * solution — i.e. a long contiguous derivation that ends in a final-answer
 * phrase. This is intentionally permissive: false positives (occasionally
 * blocking a long but legitimate hint) are cheaper than leaking a solution.
 *
 * The rule:
 *  - Either a display-math block ($$...$$) with at least 200 characters of
 *    body, OR a stretch of inline-math sequences whose combined math content
 *    is at least 200 characters,
 *  - AND the buffer contains a final-answer / closing phrase
 *    ("therefore", "hence", "the answer is", "we conclude", "Q.E.D.", "□").
 */

const FINAL_ANSWER_PHRASES = [
  /\btherefore\b/i,
  /\bhence\b/i,
  /\bthe\s+answer\s+is\b/i,
  /\bwe\s+conclude\b/i,
  /\bQ\.?E\.?D\.?\b/,
  /□/,
  /∎/,
];

const MIN_MATH_CHARS = 200;

function longestDisplayBlock(text: string): number {
  const re = /\$\$([\s\S]*?)\$\$/g;
  let max = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1].length > max) max = m[1].length;
  }
  return max;
}

function totalInlineMath(text: string): number {
  // Strip display blocks first to avoid double counting.
  const stripped = text.replace(/\$\$[\s\S]*?\$\$/g, "");
  // Match $...$ (non-greedy, no embedded $).
  const re = /\$([^$\n]+?)\$/g;
  let total = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped))) {
    total += m[1].length;
  }
  return total;
}

export function looksLikeFullSolution(text: string): boolean {
  const hasFinalPhrase = FINAL_ANSWER_PHRASES.some((re) => re.test(text));
  if (!hasFinalPhrase) return false;
  const display = longestDisplayBlock(text);
  if (display >= MIN_MATH_CHARS) return true;
  const inline = totalInlineMath(text);
  return inline >= MIN_MATH_CHARS;
}
