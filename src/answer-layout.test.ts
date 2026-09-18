import assert from "node:assert/strict";
import { test } from "node:test";
import { ANSWERS } from "../worker/answers.ts";
import { layoutAnswer } from "./answer-layout.ts";

const slope = 76 / 138;
const padding = 7;
// Deliberately generous synthetic glyph widths exercise fitting independently of DOM/fonts.
const measureText = (text: string, fontSize: number) => text.length * fontSize * 0.61;

test("preserves each complete reply and keeps every line inside the padded triangle", () => {
  for (const answer of ANSWERS) {
    const layout = layoutAnswer(answer, measureText);
    assert.equal(layout.lines.map(({ text }) => text).join(" "), answer);
    assert.ok(layout.fontSize >= 8 && layout.fontSize <= 17, `${answer}: ${layout.fontSize}`);
    assert.ok(layout.lines.length >= 2 && layout.lines.length <= 4);
    for (const line of layout.lines) {
      const top = line.y - layout.fontSize;
      const halfWidth = measureText(line.text, layout.fontSize) / 2;
      const normalDistance = (slope * (top - 16) - halfWidth) / Math.sqrt(1 + slope ** 2);
      assert.ok(normalDistance >= padding - 1e-9, `${answer}: ${line.text} clips side`);
      assert.ok(line.y + layout.fontSize * 0.25 <= 154 - padding + 1e-9);
    }
  }
});

test("shrinks long answers while handling empty and single-word text", () => {
  assert.deepEqual(layoutAnswer("", measureText).lines, []);
  assert.equal(layoutAnswer("Yes.", measureText).lines[0].text, "Yes.");
  const short = layoutAnswer("Yes. Stop asking.", measureText);
  const long = layoutAnswer("That's the wrong question. Ask the one behind it.", measureText);
  assert.ok(long.fontSize < short.fontSize);
  const word = "x".repeat(1000);
  const fallback = layoutAnswer(word, measureText);
  assert.equal(fallback.lines[0].text, word);
  assert.ok(Number.isFinite(fallback.fontSize) && fallback.fontSize > 0);
});
