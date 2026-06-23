import puppeteer, { type Browser } from 'puppeteer';
import MarkdownIt from 'markdown-it';

// Один shared browser instance на весь процесс. Запуск Chromium тяжёлый
// (~2 секунды), поэтому держим его в памяти и переиспользуем.
// Страница создаётся под каждый запрос и закрывается после рендера.

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const browser = await browserPromise;
    if (browser.connected) return browser;
    // Соединение упало — пересоздадим.
    browserPromise = null;
  }
  browserPromise = puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  return browserPromise;
}

const md = new MarkdownIt({ html: true, linkify: true, breaks: false });

const PDF_CSS = `
  @page { margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #1f2937;
    font-size: 11pt;
    line-height: 1.55;
    margin: 0;
  }
  h1 { font-size: 22pt; margin: 0 0 0.6em; color: #111827; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.3em; }
  h2 { font-size: 15pt; margin: 1.4em 0 0.5em; color: #111827; }
  h3 { font-size: 12pt; margin: 1em 0 0.3em; color: #1f2937; }
  p { margin: 0.4em 0; }
  ul, ol { margin: 0.4em 0; padding-left: 1.4em; }
  li { margin: 0.2em 0; }
  strong { color: #111827; }
  em { color: #4b5563; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.6em 0; }
  a { color: #2563eb; text-decoration: none; word-break: break-all; }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.6em 0 1.2em;
    font-size: 10pt;
  }
  th, td {
    border: 1px solid #d1d5db;
    padding: 6px 10px;
    text-align: left;
    vertical-align: top;
  }
  th { background: #f3f4f6; font-weight: 600; }
  code { font-family: "SF Mono", Consolas, monospace; font-size: 0.92em; background: #f3f4f6; padding: 1px 4px; border-radius: 3px; }
  pre code { display: block; padding: 8px 12px; }
`;

function renderHtml(markdown: string, title: string): string {
  const body = md.render(markdown);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${PDF_CSS}</style>
</head>
<body>${body}</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function markdownToPdf(
  markdown: string,
  title = 'Preparation Doc',
): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const html = renderHtml(markdown, title);
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}

// Аккуратное закрытие browser на остановке процесса — не оставляет zombie chromium.
export async function shutdownPdfService(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  if (browser) {
    await browser.close().catch(() => {});
  }
}
