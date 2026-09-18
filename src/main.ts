import './style.css';
import { ANSWERS } from '../worker/answers';
import { MAX_QUESTION_LENGTH } from '../worker/constants';

const form = document.querySelector<HTMLFormElement>('#ask-form')!;
const input = document.querySelector<HTMLTextAreaElement>('#question')!;
const inputDetails = document.querySelector<HTMLElement>('#input-details')!;
const characterCount = document.querySelector<HTMLElement>('#character-count')!;
const button = document.querySelector<HTMLButtonElement>('#ask-button')!;
const buttonLabel = document.querySelector<HTMLElement>('#button-label')!;
const status = document.querySelector<HTMLElement>('#status')!;
const ball = document.querySelector<HTMLElement>('#ball')!;
const ballWrap = document.querySelector<HTMLElement>('#ball-wrap')!;
const answerText = document.querySelector<HTMLElement>('#ball-answer')!;
const announcement = document.querySelector<HTMLElement>('#answer-announcement')!;
const examples = document.querySelectorAll<HTMLButtonElement>('[data-question]');
const apiBase = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '/api' : '')).replace(/\/$/, '');
let pending = false;
input.maxLength = MAX_QUESTION_LENGTH;

function capQuestion() {
  if (input.value.length > MAX_QUESTION_LENGTH) {
    // Keep paste/autofill within the same cap, without splitting an emoji pair.
    input.value = input.value.slice(0, MAX_QUESTION_LENGTH).replace(/[\uD800-\uDBFF]$/, '');
  }
}

function resizeQuestion() {
  // Grow as text wraps, then scroll within the field so Ask remains reachable.
  input.style.height = 'auto';
  const style = getComputedStyle(input);
  const oneLine = Math.ceil(parseFloat(style.lineHeight) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom));
  const contentHeight = input.scrollHeight;
  input.style.height = `${Math.min(contentHeight, 240)}px`;
  input.style.overflowY = contentHeight > 240 ? 'auto' : 'hidden';
  characterCount.textContent = `${input.value.length.toLocaleString()} / ${MAX_QUESTION_LENGTH.toLocaleString()}`;
  inputDetails.hidden = contentHeight <= Math.max(46, oneLine) + 1 && input.value.length < MAX_QUESTION_LENGTH * 0.8;
}

let inputWidth = 0;
new ResizeObserver(([entry]) => {
  if (entry.contentRect.width !== inputWidth) {
    inputWidth = entry.contentRect.width;
    resizeQuestion();
  }
}).observe(input);
void document.fonts.ready.then(resizeQuestion);
resizeQuestion();

if (apiBase.startsWith('https://')) {
  const connection = document.createElement('link');
  connection.rel = 'preconnect';
  connection.href = new URL(apiBase).origin;
  connection.crossOrigin = 'anonymous';
  document.head.append(connection);
}

const setStatus = (message: string, error = false) => {
  status.textContent = message;
  status.removeAttribute('title');
  status.classList.toggle('is-error', error);
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pending) return;
  const question = input.value.trim();
  if (!question) {
    setStatus('First, give the universe a question.', true);
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return;
  }
  if (input.value.length > MAX_QUESTION_LENGTH) {
    setStatus(`Keep your question within ${MAX_QUESTION_LENGTH.toLocaleString()} characters.`, true);
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return;
  }
  if (!apiBase) {
    setStatus('The oracle is getting connected. Please come back shortly.', true);
    return;
  }

  // Start the request immediately. Motion never delays sending or revealing an answer.
  const started = performance.now();
  pending = true;
  button.disabled = true;
  buttonLabel.textContent = 'Asking';
  input.readOnly = true;
  examples.forEach((example) => { example.disabled = true; });
  input.removeAttribute('aria-invalid');
  ball.dataset.state = 'thinking';
  ball.setAttribute('aria-label', 'The magic eight ball is consulting Jev');
  answerText.textContent = '';
  announcement.textContent = '';
  setStatus('A moment with the universe…');

  try {
    const response = await fetch(`${apiBase}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ question }),
      credentials: 'omit',
      signal: AbortSignal.timeout(12_000),
    });
    const result = await response.json() as { answer?: string; error?: string; inferenceMs?: number };
    if (!response.ok) {
      throw new Error(response.status === 429
        ? 'A lot of curiosity right now. Give it a minute, then ask again.'
        : 'The connection went a little cosmic. Please try again.');
    }
    if (typeof result.answer !== 'string' || !(ANSWERS as readonly string[]).includes(result.answer)) {
      throw new Error('The answer got lost in the ether. Please try again.');
    }
    answerText.textContent = result.answer;
    ball.dataset.state = 'answered';
    ball.setAttribute('aria-label', `The magic eight ball says: ${result.answer}`);
    announcement.textContent = `${question} ${result.answer}`;
    const elapsed = Math.round(performance.now() - started);
    status.classList.remove('is-error');
    status.replaceChildren();
    const dot = document.createElement('span');
    dot.className = 'answer-dot';
    dot.setAttribute('aria-hidden', 'true');
    const timing = document.createElement('span');
    timing.textContent = `${elapsed.toLocaleString()} ms`;
    timing.className = 'timing';
    status.append(dot, document.createTextNode('An instinct from Jev'), document.createTextNode(' · '), timing, document.createTextNode(' click to answer'));
    status.title = typeof result.inferenceMs === 'number' ? `Jev API round trip: ${Math.round(result.inferenceMs)} ms. Total includes your network and the backend.` : 'Total time from pressing Ask to displaying the answer.';
  } catch (error) {
    ball.dataset.state = 'idle';
    ball.setAttribute('aria-label', 'The magic eight ball is waiting for you to try again');
    setStatus(error instanceof Error && error.name === 'Error'
      ? error.message
      : 'The universe is taking its time. Please try again.', true);
  } finally {
    pending = false;
    button.disabled = false;
    buttonLabel.textContent = 'Ask';
    input.readOnly = false;
    examples.forEach((example) => { example.disabled = false; });
  }
});

examples.forEach((example) => {
  example.addEventListener('click', () => {
    if (pending) return;
    input.value = example.dataset.question!;
    resizeQuestion();
    form.requestSubmit();
  });
});

input.addEventListener('input', (event) => {
  if (!(event as InputEvent).isComposing) capQuestion();
  input.removeAttribute('aria-invalid');
  resizeQuestion();
});
input.addEventListener('compositionend', () => {
  capQuestion();
  resizeQuestion();
});
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});

// Small pointer-based perspective is purely decorative; keyboard/touch need no motion.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(pointer: fine)');
ballWrap.addEventListener('pointermove', (event) => {
  if (reducedMotion.matches || !finePointer.matches) return;
  const rect = ballWrap.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  ball.style.setProperty('--tilt-x', `${-y * 10}deg`);
  ball.style.setProperty('--tilt-y', `${x * 12}deg`);
});
ballWrap.addEventListener('pointerleave', () => {
  ball.style.setProperty('--tilt-x', '0deg');
  ball.style.setProperty('--tilt-y', '0deg');
});
