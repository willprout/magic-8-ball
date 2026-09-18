import { FORTUNE_QUESTION, isAnswer } from "./answers.ts";
import { MAX_QUESTION_LENGTH, MAX_BODY_BYTES, UPSTREAM_TIMEOUT_MS } from "./constants.ts";

interface RateLimiter {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  TYPESAFE_API_KEY?: string;
  ASK_RATE_LIMITER?: RateLimiter;
  GLOBAL_RATE_LIMITER?: RateLimiter;
  // Set only for local development. Production must always have both bindings.
  LOCAL_DEV?: string;
}

const MAX_UPSTREAM_BYTES = 32768;
const PRODUCTION_ORIGIN = "https://willprout.github.io";
const TYPESAFE_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

class BodyTooLarge extends Error {}

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("origin");
  if (origin === PRODUCTION_ORIGIN) return origin;
  if (env.LOCAL_DEV !== "true" || !origin) return null;
  try {
    const url = new URL(origin);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return local && url.protocol === "http:" && url.origin === origin ? origin : null;
  } catch {
    return null;
  }
}

function respond(
  origin: string | null,
  status: number,
  body: Record<string, unknown> | null,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
    ...extraHeaders,
  });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new BodyTooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

function parseQuestion(text: string): string | null {
  const payload: unknown = JSON.parse(text);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const question = (payload as Record<string, unknown>).question;
  if (typeof question !== "string") return null;
  const trimmed = question.trim();
  return trimmed.length > 0 && question.length <= MAX_QUESTION_LENGTH ? trimmed : null;
}

async function ask(request: Request, env: Env): Promise<Response> {
  const origin = allowedOrigin(request, env);
  if (!origin) return respond(null, 403, { error: "This origin is not allowed." });
  if (new URL(request.url).pathname !== "/ask") {
    return respond(origin, 404, { error: "Not found." });
  }
  if (request.method === "OPTIONS") {
    return respond(origin, 204, null, {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    });
  }
  if (request.method !== "POST") {
    return respond(origin, 405, { error: "Use POST to ask a question." }, { Allow: "POST, OPTIONS" });
  }
  if (request.signal.aborted) return respond(origin, 499, { error: "Request cancelled." });

  // text/plain carries JSON without a browser preflight, saving a network round trip.
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "text/plain" && contentType !== "application/json") {
    return respond(origin, 415, { error: "Send a JSON question as text/plain." });
  }
  const declaredSize = request.headers.get("content-length");
  if (declaredSize && Number(declaredSize) > MAX_BODY_BYTES) {
    return respond(origin, 413, { error: "That question is too long." });
  }

  let question: string | null;
  try {
    question = parseQuestion(await readBoundedBody(request.body, MAX_BODY_BYTES));
  } catch (error) {
    if (request.signal.aborted) return respond(origin, 499, { error: "Request cancelled." });
    return respond(origin, error instanceof BodyTooLarge ? 413 : 400, {
      error: error instanceof BodyTooLarge ? "That question is too long." : "Send a valid question.",
    });
  }
  if (!question) {
    return respond(origin, 400, { error: "Ask a question using 1–500 characters." });
  }
  if (!env.TYPESAFE_API_KEY) {
    return respond(origin, 503, { error: "The ball is not connected yet." });
  }
  if ((!env.ASK_RATE_LIMITER || !env.GLOBAL_RATE_LIMITER) && env.LOCAL_DEV !== "true") {
    return respond(origin, 503, { error: "The ball is temporarily unavailable." });
  }

  try {
    // Counters are local to a Cloudflare location and eventually consistent.
    // This is a soft abuse ceiling, not a hard global spend limit.
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const perPerson = env.ASK_RATE_LIMITER
      ? await env.ASK_RATE_LIMITER.limit({ key: `ask:${ip}` })
      : { success: true };
    if (!perPerson.success) {
      return respond(origin, 429, { error: "Give the ball a moment. Try again soon." }, { "Retry-After": "60" });
    }
    const overall = env.GLOBAL_RATE_LIMITER
      ? await env.GLOBAL_RATE_LIMITER.limit({ key: "ask:all" })
      : { success: true };
    if (!overall.success) {
      return respond(origin, 429, { error: "The ball is busy. Try again soon." }, { "Retry-After": "60" });
    }
  } catch {
    return respond(origin, 503, { error: "The ball is temporarily unavailable." });
  }
  if (request.signal.aborted) return respond(origin, 499, { error: "Request cancelled." });

  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  request.signal.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, UPSTREAM_TIMEOUT_MS);
  try {
    const startedAt = performance.now();
    const upstream = await fetch(TYPESAFE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.TYPESAFE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "jev-latest",
        state: { question },
        questions: { fortune: FORTUNE_QUESTION },
      }),
      signal: controller.signal,
      redirect: "manual",
    });
    if (!upstream.ok) {
      // Never return an upstream error body: it may contain private details.
      await upstream.body?.cancel();
      if (upstream.status === 429 || upstream.status === 529) {
        return respond(origin, 503, { error: "Jev is busy. Please try again soon." }, { "Retry-After": "5" });
      }
      return respond(origin, 502, { error: "The ball couldn't connect. Please try again." });
    }
    const text = await readBoundedBody(upstream.body, MAX_UPSTREAM_BYTES);
    // Includes the complete upstream response body, not only the initial headers.
    const inferenceMs = Math.round((performance.now() - startedAt) * 10) / 10;
    const payload = JSON.parse(text);
    const fortune = payload?.answers?.fortune;
    if (fortune?.type !== "choice" || !isAnswer(fortune?.choice)) {
      return respond(origin, 502, { error: "The ball couldn't read its answer. Please try again." });
    }
    if (controller.signal.aborted) {
      return respond(origin, timedOut ? 504 : 499, {
        error: timedOut ? "Jev took too long. Please try again." : "Request cancelled.",
      });
    }
    return respond(origin, 200, { answer: fortune.choice, inferenceMs });
  } catch {
    if (controller.signal.aborted) {
      return respond(origin, timedOut ? 504 : 499, {
        error: timedOut ? "Jev took too long. Please try again." : "Request cancelled.",
      });
    }
    return respond(origin, 502, { error: "The ball couldn't connect. Please try again." });
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", onAbort);
  }
}

export default { fetch: ask };
