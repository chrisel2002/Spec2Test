// Bump this whenever a prompt in this folder changes in a way that could
// change the model's output. Eval results record it (alongside a hash of
// the prompt text, which catches a forgotten bump), so comparing two
// results shows whether a prompt change helped or hurt.
export const PROMPT_VERSION = "v1";
