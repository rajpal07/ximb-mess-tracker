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
    :root {
      --green-dark: #16321e;
      --green-mid: #2a4a2e;
      --green-light: #4c8a3f;
      --cream: #fdfbf5;
      --cream-dark: #f4efe4;
      --text-primary: #1f2a1c;
      --text-secondary: #5c6a54;
      --border: #d9d1bc;
      --accent: #e08a2e;
      --card-bg: #ffffff;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 16px;
      line-height: 1.7;
      color: var(--text-primary);
      background-color: var(--cream);
      padding: 40px 20px;
    }

    .container {
      max-width: 920px;
      margin: 0 auto;
      background: var(--card-bg);
      padding: 56px 64px;
      border-radius: 16px;
      border: 1px solid var(--border);
      box-shadow: 0 10px 30px rgba(22, 50, 30, 0.05);
    }

    /* Typography */
    h1 {
      font-size: 32px;
      font-weight: 800;
      color: var(--green-dark);
      margin-top: 0;
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 3px solid var(--green-dark);
      letter-spacing: -0.5px;
    }

    h2 {
      font-size: 22px;
      font-weight: 700;
      color: var(--green-dark);
      margin-top: 44px;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1.5px solid var(--border);
      letter-spacing: -0.3px;
    }

    h3 {
      font-size: 18px;
      font-weight: 600;
      color: var(--green-mid);
      margin-top: 32px;
      margin-bottom: 12px;
    }

    h4 {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
      margin-top: 24px;
      margin-bottom: 8px;
    }

    p {
      margin-bottom: 16px;
    }

    strong {
      font-weight: 700;
      color: var(--text-primary);
    }

    a {
      color: var(--green-light);
      text-decoration: none;
      font-weight: 500;
    }

    a:hover {
      text-decoration: underline;
    }

    /* Blockquotes & Callouts */
    blockquote {
      border-left: 4px solid var(--green-light);
      background: var(--cream);
      margin: 24px 0;
      padding: 18px 24px;
      border-radius: 0 10px 10px 0;
      font-size: 15px;
      color: var(--text-secondary);
    }

    blockquote p {
      margin-bottom: 8px;
    }

    blockquote p:last-child {
      margin-bottom: 0;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin: 24px 0;
      font-size: 14px;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid var(--border);
    }

    thead {
      background: var(--green-dark);
      color: #ffffff;
    }

    th {
      padding: 12px 18px;
      text-align: left;
      font-weight: 600;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    td {
      padding: 12px 18px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
      background: var(--card-bg);
    }

    tbody tr:last-child td {
      border-bottom: none;
    }

    tbody tr:nth-child(even) td {
      background: var(--cream);
    }

    /* Code & Pre */
    code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13.5px;
      background: var(--cream-dark);
      padding: 3px 6px;
      border-radius: 5px;
      color: var(--green-dark);
      font-weight: 500;
    }

    pre {
      background: #1e1e2e;
      color: #cdd6f4;
      padding: 20px 24px;
      border-radius: 12px;
      overflow-x: auto;
      font-size: 13.5px;
      line-height: 1.6;
      margin: 20px 0;
      border: 1px solid #313244;
    }

    pre code {
      background: none;
      padding: 0;
      border-radius: 0;
      color: inherit;
      font-weight: 400;
    }

    /* Lists */
    ul, ol {
      padding-left: 28px;
      margin: 16px 0;
    }

    li {
      margin-bottom: 8px;
    }

    li::marker {
      color: var(--green-light);
      font-weight: 700;
    }

    hr {
      border: none;
      height: 1px;
      background: linear-gradient(to right, var(--border), transparent);
      margin: 40px 0;
    }

    /* Mermaid Diagrams */
    .mermaid {
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 32px 0;
      background: var(--cream);
      padding: 24px;
      border-radius: 12px;
      border: 1px solid var(--border);
      overflow-x: auto;
    }

    .mermaid svg {
      max-width: 100% !important;
      height: auto !important;
    }

    /* Responsive */
    @media (max-width: 768px) {
      body {
        padding: 16px 10px;
      }
      .container {
        padding: 28px 20px;
        border-radius: 12px;
      }
      h1 { font-size: 26px; }
      h2 { font-size: 19px; }
    }
  </style>
</head>
<body>
  <div class="container">
    ${bodyHtml}
  </div>

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
