export type AnswerLayout = {
  fontSize: number;
  lines: Array<{ text: string; y: number }>;
};

type MeasureText = (text: string, fontSize: number) => number;
type WrappedLines = { lines: string[]; cost: number };

const MAX_FONT_SIZE = 17;
const EDGE_PADDING = 7;
const TRIANGLE_SLOPE = 76 / 138;
// Convert the normal distance to a sloping edge into horizontal clearance.
const SIDE_INSET = EDGE_PADDING * Math.sqrt(1 + TRIANGLE_SLOPE ** 2);

function availableWidth(baseline: number, fontSize: number): number {
  // One em above the baseline safely includes capitals, accents, and punctuation.
  return 2 * (TRIANGLE_SLOPE * (baseline - fontSize - 16) - SIDE_INSET);
}

function wrapWords(words: string[], widths: number[], fontSize: number, measureText: MeasureText): WrappedLines | null {
  const memo = new Map<string, WrappedLines | null>();

  function visit(wordIndex: number, lineIndex: number): WrappedLines | null {
    if (lineIndex === widths.length) return wordIndex === words.length ? { lines: [], cost: 0 } : null;
    const key = `${wordIndex}:${lineIndex}`;
    if (memo.has(key)) return memo.get(key)!;
    const remainingLines = widths.length - lineIndex - 1;
    let best: WrappedLines | null = null;

    for (let end = wordIndex + 1; end <= words.length - remainingLines; end++) {
      const text = words.slice(wordIndex, end).join(" ");
      const width = measureText(text, fontSize);
      if (width > widths[lineIndex]) break;
      const tail = visit(end, lineIndex + 1);
      if (!tail) continue;
      // Penalize very sparse lines while allowing naturally narrower upper rows.
      const fullness = width / widths[lineIndex];
      const cost = (1 - fullness) ** 2 + tail.cost;
      if (!best || cost < best.cost) best = { lines: [text, ...tail.lines], cost };
    }
    memo.set(key, best);
    return best;
  }

  return visit(0, 0);
}

/** Fit whole words inside the triangle with vertices (100,16), (24,154), (176,154). */
export function layoutAnswer(answer: string, measureText: MeasureText): AnswerLayout {
  const words = answer.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return { fontSize: MAX_FONT_SIZE, lines: [] };

  // A quarter-unit step keeps the visual sizes smooth without delaying display.
  for (let fontSize = MAX_FONT_SIZE; fontSize >= 4; fontSize -= 0.25) {
    for (let count = Math.min(2, words.length); count <= Math.min(4, words.length); count++) {
      const lineHeight = fontSize * 1.16;
      const lastBaseline = 154 - EDGE_PADDING - fontSize * 0.25;
      const baselines = Array.from({ length: count }, (_, index) => lastBaseline - (count - index - 1) * lineHeight);
      const widths = baselines.map((baseline) => availableWidth(baseline, fontSize));
      if (widths[0] <= 0) continue;
      const wrapped = wrapWords(words, widths, fontSize, measureText);
      if (!wrapped) continue;

      // Lift the block toward the triangle's visual center when spare width permits.
      // Moving up shrinks each allowed row by 2 * TRIANGLE_SLOPE per unit.
      const clearance = Math.min(...wrapped.lines.map((line, index) =>
        (widths[index] - measureText(line, fontSize)) / (2 * TRIANGLE_SLOPE)));
      const top = baselines[0] - fontSize;
      const bottom = lastBaseline + fontSize * 0.25;
      const centerOffset = Math.max(0, (top + bottom) / 2 - 111);
      const lift = Math.min(clearance, centerOffset);
      return {
        fontSize,
        lines: wrapped.lines.map((text, index) => ({ text, y: baselines[index] - lift })),
      };
    }
  }

  // Extremely long unbroken words still stay inside the face; the curated replies
  // all fit the normal two-to-four-line path above at readable sizes.
  const text = words.join(" ");
  const baseline = 128;
  const widthAtOne = measureText(text, 1);
  const fontSize = Math.min(4, availableWidth(baseline, 4) / Math.max(widthAtOne, 1));
  return { fontSize, lines: [{ text, y: baseline }] };
}
