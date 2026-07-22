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
  return html.replace(
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/gi,
    (match, code) => {
      const cleanCode = unescapeHtml(code.trim());
      return `<div class="mermaid">\n${cleanCode}\n</div>`;
    }
  );
}

function createStandaloneHtml(title, markdownContent) {
  const rawHtml = marked.parse(markdownContent);
  const bodyHtml = processMermaidInHtml(rawHtml);
  const css = fs.readFileSync('pdf-style.css', 'utf-8');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    ${css}
    
    body {
      max-width: 960px;
      margin: 0 auto;
      padding: 40px 24px;
      background: #ffffff;
    }
  </style>
</head>
<body>
  ${bodyHtml}

  <script>
    document.addEventListener('DOMContentLoaded', async () => {
      mermaid.initialize({
        startOnLoad: true,
        theme: 'neutral',
        securityLevel: 'loose',
        flowchart: { curve: 'basis' }
      });
      await mermaid.run();
    });
  </script>
</body>
</html>`;
}

function main() {
  console.log('Generating PRD.html...');
  const prdMd = fs.readFileSync('PRD.md', 'utf-8');
  const prdHtml = createStandaloneHtml('XIMB Mess Tracker - Product Requirements Document', prdMd);
  fs.writeFileSync('PRD.html', prdHtml);
  console.log('PRD.html generated successfully!');

  console.log('Generating README.html...');
  const readmeMd = fs.readFileSync('README.md', 'utf-8');
  const readmeHtml = createStandaloneHtml('XIMB Mess Tracker - Documentation', readmeMd);
  fs.writeFileSync('README.html', readmeHtml);
  console.log('README.html generated successfully!');
}

main();
