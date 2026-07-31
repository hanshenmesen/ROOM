import { extractLinks, extractText, getDocumentProxy } from "unpdf";

const MAX_PREPARSED_CHARACTERS = 120_000;
const PDF_PARSE_TIMEOUT_MS = 12_000;

export type PdfPreparseResult = {
  pageCount: number;
  text: string;
  links: string[];
  hasTextLayer: boolean;
};

function withTimeout<T>(promise: Promise<T>) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const timeout = setTimeout(() => reject(new Error("PDF 结构化预解析超时。")), PDF_PARSE_TIMEOUT_MS);
      timeout.unref?.();
    }),
  ]);
}

function compactPageText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatPdfEvidence(pages: string[], links: string[]) {
  const pageEvidence = pages.map((page, index) => (
    `[PDF page ${index + 1}]\n${compactPageText(page) || "(no extractable text layer)"}`
  ));
  const linkEvidence = links.length
    ? [`[PDF embedded links]\n${[...new Set(links)].join("\n")}`]
    : [];
  return [...pageEvidence, ...linkEvidence].join("\n\n").slice(0, MAX_PREPARSED_CHARACTERS);
}

export async function preparsePdf(bytes: Uint8Array): Promise<PdfPreparseResult> {
  const pdf = await withTimeout(getDocumentProxy(bytes));
  const [{ totalPages, text }, linkResult] = await withTimeout(Promise.all([
    extractText(pdf),
    extractLinks(pdf),
  ]));
  const pages = Array.isArray(text) ? text : [text];
  const links = [...new Set(linkResult.links)].slice(0, 100);
  return {
    pageCount: totalPages,
    text: formatPdfEvidence(pages, links),
    links,
    hasTextLayer: pages.some((page) => compactPageText(page).length > 0),
  };
}
