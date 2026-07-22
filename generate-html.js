import puppeteer from 'puppeteer';
import { marked } from 'marked';
import fs from 'fs';

async function preRenderMermaidToSvg(markdown) {
  console.log('[Mermaid] Pre-rendering diagrams to static inline SVG...');

  // Extract all mermaid code blocks
  const mermaidBlocks = [];
  const placeholderMarkdown = markdown.replace(/```mermaid\r?\n([\s\S]*?)```/g, (match, code) => {
    const id = `MERMAID_PLACEHOLDER_${mermaidBlocks.length}`;
    mermaidBlocks.push(code.trim());
    return `<div class="${id}"></div>`;
  });

  if (mermaidBlocks.length === 0) {
    return marked.parse(markdown);
  }

  // Launch headless browser to render diagrams to SVG strings via Mermaid library
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();

  const renderHtml = `
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
</head>
<body>
  <script>
    mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' });
    async function renderDiagram(id, code) {
      try {
        const { svg } = await mermaid.render(id, code);
        return svg;
      } catch (err) {
        return '<div class="mermaid-error">Error rendering diagram</div>';
      }
    }
  </script>
</body>
</html>
  `;

  await page.setContent(renderHtml, { waitUntil: 'networkidle0' });

  // Render each diagram to static SVG
  const renderedSvgs = [];
  for (let i = 0; i < mermaidBlocks.length; i++) {
    const code = mermaidBlocks[i];
    const svg = await page.evaluate((idx, mCode) => {
      return window.renderDiagram(`diag_${idx}`, mCode);
    }, i, code);
    renderedSvgs.push(svg);
  }

  await browser.close();

  // Convert markdown to HTML
  let html = marked.parse(placeholderMarkdown);

  // Replace placeholders with clean static SVGs
  renderedSvgs.forEach((svg, idx) => {
    const placeholder = `<div class="MERMAID_PLACEHOLDER_${idx}"></div>`;
    const wrappedSvg = `<div class="mermaid-static-container">${svg}</div>`;
    html = html.replace(placeholder, wrappedSvg);
    // Also handle case where marked wrapped it in <p>
    html = html.replace(`<p>${placeholder}</p>`, wrappedSvg);
  });

  return html;
}

async function createStaticHtmlAndPdf(inputFile, htmlFile, pdfFile, title) {
  console.log(`\nProcessing ${inputFile}...`);
  const rawMarkdown = fs.readFileSync(inputFile, 'utf-8');
  const bodyHtml = await preRenderMermaidToSvg(rawMarkdown);
  const css = fs.readFileSync('pdf-style.css', 'utf-8');

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    ${css}
    .mermaid-static-container {
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 28px 0;
      background: var(--cream);
      padding: 20px;
      border-radius: 12px;
      border: 1px solid var(--border);
      overflow-x: auto;
      page-break-inside: avoid;
    }
    .mermaid-static-container svg {
      max-width: 100% !important;
      height: auto !important;
    }
  </style>
</head>
<body class="markdown-body">
  <div class="container">
    ${bodyHtml}
  </div>
</body>
</html>`;

  // Write static HTML
  fs.writeFileSync(htmlFile, fullHtml);
  console.log(`Saved static ${htmlFile} (Pure HTML + Static inline SVG, NO JS)!`);

  // Generate PDF from static HTML
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

  await page.pdf({
    path: pdfFile,
    format: 'A4',
    margin: { top: '15mm', bottom: '15mm', left: '18mm', right: '18mm' },
    printBackground: true,
  });

  await browser.close();
  const stats = fs.statSync(pdfFile);
  console.log(`Saved static ${pdfFile}! Size: ${stats.size} bytes`);
}

async function main() {
  await createStaticHtmlAndPdf(
    'PRD.md',
    'PRD.html',
    'PRD.pdf',
    'XIMB Mess Tracker - Product Requirements Document'
  );
  await createStaticHtmlAndPdf(
    'README.md',
    'README.html',
    'README.pdf',
    'XIMB Mess Tracker - Documentation'
  );
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
