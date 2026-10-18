// Upload checks, before anything is parsed or stored. The extension says
// what a file claims to be; the first bytes say what it is. Both must
// agree, so a renamed executable, image, or archive is refused with a
// clear message instead of failing somewhere deep in a parser.

export const MAX_SPEC_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_PDF_PAGES = 50;

// A problem with the uploaded file itself. The message is written for the
// person who uploaded it and is safe to show them.
export class IngestInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestInputError";
  }
}

export type SpecKind = { mimeType: "application/pdf" | "text/markdown" };

function startsWith(data: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, i) => data[i] === byte);
}

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
// Common binary formats that might be renamed to .md by mistake.
const BINARY_SIGNATURES: { name: string; bytes: number[] }[] = [
  { name: "a ZIP archive or Office document", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { name: "a PNG image", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { name: "a JPEG image", bytes: [0xff, 0xd8, 0xff] },
  { name: "a GIF image", bytes: [0x47, 0x49, 0x46, 0x38] },
  { name: "a Windows program", bytes: [0x4d, 0x5a] },
];

export function validateSpecFile(filename: string, data: Uint8Array): SpecKind {
  const name = filename.toLowerCase();
  const isPdf = name.endsWith(".pdf");
  const isMarkdown = name.endsWith(".md");

  if (!isPdf && !isMarkdown) {
    throw new IngestInputError("Only Markdown (.md) and PDF (.pdf) files are supported.");
  }
  if (data.length === 0) {
    throw new IngestInputError("The file is empty.");
  }
  if (data.length > MAX_SPEC_BYTES) {
    throw new IngestInputError("The file is larger than the 10 MB limit.");
  }

  if (isPdf) {
    if (!startsWith(data, PDF)) {
      throw new IngestInputError("This file is named .pdf but isn't a PDF. Export it as a PDF and try again.");
    }
    return { mimeType: "application/pdf" };
  }

  if (startsWith(data, PDF)) {
    throw new IngestInputError("This file is a PDF with a .md name. Rename it to .pdf and upload it again.");
  }
  const binary = BINARY_SIGNATURES.find((signature) => startsWith(data, signature.bytes));
  if (binary) {
    throw new IngestInputError(`This file is named .md but is ${binary.name}, not text.`);
  }

  let text: string;
  try {
    // fatal: refuse invalid UTF-8 instead of silently replacing bytes.
    text = new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    throw new IngestInputError("This file isn't readable UTF-8 text. Save it as UTF-8 Markdown and try again.");
  }
  if (text.includes("\u0000")) {
    throw new IngestInputError("This file is named .md but contains binary data, not text.");
  }
  if (text.trim() === "") {
    throw new IngestInputError("The file has no text in it.");
  }
  return { mimeType: "text/markdown" };
}
