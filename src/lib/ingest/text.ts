// Windows (\r\n) and classic Mac (\r) line endings become \n. Applied once,
// to the raw text of every upload before anything else looks at it, so
// heading positions, chunk offsets (charStart/charEnd), and the stored
// raw_text are all measured on exactly the same string. Otherwise a spec
// saved on Windows would get offsets one character off per line.
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
