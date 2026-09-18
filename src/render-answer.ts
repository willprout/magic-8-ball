import { layoutAnswer, type AnswerLayout } from './answer-layout';

const canvas = document.createElement('canvas');
const context = canvas.getContext('2d')!;
context.textAlign = 'center';
const layouts = new Map<string, AnswerLayout>();

function getLayout(answer: string) {
  let layout = layouts.get(answer);
  if (!layout) {
    layout = layoutAnswer(answer, (text, fontSize) => {
      context.font = `600 ${fontSize}px "DM Sans", sans-serif`;
      const metrics = context.measureText(text);
      // Advance width and actual glyph overhangs both need to fit.
      return Math.max(metrics.width, 2 * metrics.actualBoundingBoxLeft,
        2 * metrics.actualBoundingBoxRight);
    });
    layouts.set(answer, layout);
  }
  return layout;
}

export function prepareAnswers(answers: readonly string[]) {
  layouts.clear();
  answers.forEach(getLayout);
}

export function renderAnswer(element: SVGTextElement, answer: string) {
  const layout = getLayout(answer);
  element.setAttribute('font-size', String(layout.fontSize));
  element.replaceChildren(...layout.lines.map(({ text, y }) => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    line.setAttribute('x', '100');
    line.setAttribute('y', String(y));
    line.textContent = text;
    return line;
  }));
}
