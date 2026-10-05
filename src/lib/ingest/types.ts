export type Heading = {
  level: number;
  text: string;
  charIndex: number;
  /** 1-based page number. Only set for PDF-sourced documents. */
  page?: number;
};

export type Page = {
  pageNumber: number;
  /** Offset into `text` where this page's content starts. */
  charIndex: number;
};

export type ParsedDocument = {
  text: string;
  headings: Heading[];
  /** Empty for Markdown, since it has no concept of pages. */
  pages: Page[];
};
