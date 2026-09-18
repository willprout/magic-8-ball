// About 500 tokens for ordinary English; this is a character cap, not a tokenizer.
export const MAX_QUESTION_LENGTH = 2000;
// Allow UTF-8 and JSON escaping for every supported character within the cap.
export const MAX_BODY_BYTES = 16 * 1024;
export const UPSTREAM_TIMEOUT_MS = 8000;
