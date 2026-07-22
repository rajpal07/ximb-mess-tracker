import puppeteer from 'puppeteer';
import { marked } from 'marked';
import fs from 'fs';

function unescapeHtml(html) {
  return html
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function processMermaidInHtml(html) {
  // Replace <pre><code class="language-mermaid">...</code></pre> with clean <div class="mermaid">...</div>
  return html.replace(
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/gi,
    (match, code) => {
      const cleanCode = unescapeHtml(code.trim());
      return `<div class="mermaid">\n${cleanCode}\n</div>`;
    }
  );
}

async function generatePdf(inputFile, outputFile) {
  console.log(`[Puppeteer] Converting ${inputFile} -> ${outputFile}...`);
  const rawMarkdown = fs.readFileSync(inputFile, 'utf-8');
  const rawHtml = marked.parse(rawMarkdown);
  const bodyHtml = processMermaidInHtml(rawHtml);
  const css = fs.readFileSync('pdf-style.css', 'utf-8');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${css}
    .mermaid {
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 18px 0;
      background: #fdfbf5;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid #d9d1bc;
      page-break-inside: avoid;
    }
    .mermaid svg {
      max-width: 100% !important;
      height: auto !important;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
</head>
<body class="markdown-body">
  ${bodyHtml}
  <script>
    document.addEventListener('DOMContentLoaded', async () => {
      mermaid.initialize({
        startOnLoad: true,
        theme: 'neutral',
        securityLevel: 'loose'
      });
      await mermaid.run();
    });
  </script>
</body>
</html>
  `;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('PAGE ERROR:', msg.text());
  });

  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

  // Wait for all mermaid diagrams to render SVGs
  try {
    await page.waitForSelector('.mermaid svg', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 1000));
  } catch (e) {
    console.warn('Warning: No mermaid SVG selector found or timeout waiting for mermaid');
  }

  await page.pdf({
    path: outputFile,
    format: 'A4',
    margin: { top: '15mm', bottom: '15mm', left: '18mm', right: '18mm' },
    printBackground: true,
  });

  await browser.close();
  const stats = fs.statSync(outputFile);
  console.log(`[Puppeteer] Successfully generated ${outputFile}! Size: ${stats.size} bytes`);
}

async function main() {
  await generatePdf('README.md', 'README.pdf');
  await generatePdf('PRD.md', 'PRD.pdf');
}

main().catch((err) => {
  console.error('Error generating PDF:', err);
  process.exit(1);
});
