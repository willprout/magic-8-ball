# Magic-8-Jev · powered by Jev

A minimal, tactile Magic 8 Ball with a little attitude. Ask a question; [Jev](https://typesafe.ai) chooses the most fitting of twenty witty replies. The result appears in the ball immediately, with measured click-to-answer latency.

**Demo:** https://willprout.github.io/magic-8-ball/

## How it works

- GitHub Pages serves a tiny Vite/TypeScript frontend. The dimensional ball is CSS: no WebGL engine, model downloads, or render loop.
- A Cloudflare Worker sends one `choice` question to `https://api.typesafe.ai/v1/systemone`, with `jev-latest` and all 20 faces in `criteria`.
- The Worker returns Jev's selected face. There is no random fallback, answer cache, fake timer, forced animation delay, or automatic retry.
- The displayed time measures the complete click-to-DOM-update journey, including the network and backend. The status tooltip also shows the backend-to-Jev HTTP round trip; it is not pure model inference time.
- Fonts are self-hosted. Answer text is measured and wrapped within the triangular face; longer replies use smaller type. Layouts are precomputed after fonts load, without delaying requests. The question field grows as text wraps, up to ten lines before scrolling. Enter adds a line; Ctrl/Command+Enter submits. Screen-reader announcements, reduced motion, and mobile layouts are supported.

The [live TypeSafe API reference](https://docs.typesafe.ai/api) and [Choice guide](https://docs.typesafe.ai/primitives/choice) define the integration. The twenty custom replies and exact Jev instructions live in `worker/answers.ts`.

## Local development

Use Node 22.18+ and Python 3.

```sh
npm ci
npm run key
npm run dev:api
```

In a second terminal:

```sh
npm run dev
```

Open http://127.0.0.1:5173/magic-8-ball/. Vite forwards `/api/ask` to the local Worker on port 8787. The key prompt does not echo; it writes `.dev.vars` with permissions `0600`. That file is Git-ignored. The helper refuses to overwrite an existing key file.

```sh
npm test
npm run build
```

Tests cover response membership, exactly one Jev call, CORS, input limits, rate limits, failure handling, redirects, timeouts, and cancellation. Test calls are mocked and never consume Jev usage.

Triangle layout tests check all twenty replies. During local development, `/magic-8-ball/qa/answers.html` renders every face with the production typography for visual and browser geometry checks. This fixture makes no API calls and is excluded from the production build.

## Deploy

1. Sign in with `npx wrangler login`.
2. Run `npm run deploy:api` to create or update the Worker.
3. Run `node scripts/publish-jev-key.mjs` to upload the local key directly to the Worker's encrypted `TYPESAFE_API_KEY` secret. It travels through stdin, never a command argument.
4. Set the repository **variable** `VITE_API_URL` to the public Worker URL. It is an endpoint URL, not a secret.
5. Set GitHub Pages' source to **GitHub Actions**, then push `main`. The Pages workflow runs tests, builds, and publishes `dist/` only.

Never put the Jev key in a `VITE_*` variable, a public config file, a GitHub Pages artifact, or browser storage. Worker changes deploy separately from the Pages workflow via `npm run deploy:api`.

## Traffic and cost controls

The frontend is static and CDN-hosted. The Worker validates requests before making a Jev call, bounds questions to 2,000 characters (roughly 500 tokens of ordinary English), accepts browser origins only from `https://willprout.github.io` in production, and aborts upstream requests after 8 seconds. The character cap is an approximation, not an exact tokenizer limit; instructions and answer choices also count toward billable input tokens. It does not log questions or keys, and it does not persist user questions.

Native Cloudflare rate-limit bindings allow 15 requests per IP per minute and 300 requests per Cloudflare location per minute. Requests above those limits receive a retry message. Both bindings must exist in production; otherwise the Worker fails closed. Local development explicitly opts into localhost support with `LOCAL_DEV=true`.

**These are approximate, per-location abuse limits, not a global spending cap or authentication.** Origin headers can be forged outside a browser. Every admitted request can consume TypeSafe usage. For a large launch, set any available account-level budget/rate limits in TypeSafe, monitor usage, and adjust the demo limits deliberately. The Worker can be disabled by removing its `TYPESAFE_API_KEY` secret. Never enable `LOCAL_DEV` in production.

Cloudflare's [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [rate-limit semantics](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) are the source of truth. Free-tier exhaustion should mean temporary unavailability rather than silently changing to a paid plan; no paid subscription is configured by this project.

## Fonts

DM Sans and Source Serif 4 are distributed under the SIL Open Font License; their licenses are included in `public/fonts/`. Both are self-hosted; the Source Serif 4 heading uses true italic at weight 400 and optical size 48.
