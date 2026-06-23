import { marked } from 'marked';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

marked.setOptions({ gfm: true, breaks: false });

export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
});
turndown.use(gfm);
// Keep <br> literal so multi-line table cells survive the round-trip.
turndown.addRule('keepHardBreak', { filter: 'br', replacement: () => '<br>' });

export function htmlToMarkdown(html: string): string {
  // TipTap wraps cell content in <p>; turndown's gfm table plugin can't handle
  // block content inside cells, so flatten each cell to inline + <br>.
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('td, th').forEach((cell) => {
    const paragraphs = Array.from(cell.children).filter((c) => c.tagName === 'P');
    if (paragraphs.length > 0) {
      cell.innerHTML = paragraphs.map((p) => p.innerHTML.trim()).join('<br>');
    }
  });
  return turndown.turndown(doc.body.innerHTML).trim() + '\n';
}
