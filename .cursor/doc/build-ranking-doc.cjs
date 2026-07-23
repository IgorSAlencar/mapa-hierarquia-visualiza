/**
 * Converte o markdown do ranking em HTML com fórmulas KaTeX já renderizadas,
 * e gera PDF via Microsoft Edge (headless).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const katex = require('katex');
const { marked } = require('marked');

const DOC_DIR = path.join(__dirname);
const MD_PATH = path.join(DOC_DIR, 'ranking-roteiro-desvio-e-ordenacao.md');
const HTML_PATH = path.join(DOC_DIR, 'ranking-roteiro-desvio-e-ordenacao.html');
const PDF_PATH = path.join(DOC_DIR, 'ranking-roteiro-desvio-e-ordenacao.pdf');

function renderMath(tex, displayMode) {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: true,
    });
  } catch (err) {
    return `<code>${tex}</code>`;
  }
}

/** Extrai e renderiza blocos \[...\] e inline \(...\) antes do marked. */
function preprocessMath(md) {
  const blocks = [];
  let text = md.replace(/\\\[([\s\S]*?)\\\]/g, (_, tex) => {
    const key = `@@MATHBLOCK${blocks.length}@@`;
    blocks.push(renderMath(tex.trim(), true));
    return key;
  });
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, tex) => {
    const key = `@@MATHINLINE${blocks.length}@@`;
    blocks.push(renderMath(tex.trim(), false));
    return key;
  });
  return { text, blocks };
}

function restoreMath(html, blocks) {
  return html.replace(/@@MATH(?:BLOCK|INLINE)(\d+)@@/g, (_, i) => blocks[Number(i)]);
}

const md = fs.readFileSync(MD_PATH, 'utf8');
const { text, blocks } = preprocessMath(md);
let body = marked.parse(text, { gfm: true, breaks: false });
body = restoreMath(body, blocks);

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ranking inteligente do roteiro — desvio e ordenação</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
  <style>
    :root {
      --ink: #1e293b;
      --muted: #64748b;
      --line: #e2e8f0;
      --accent: #5b21b6;
      --bg: #ffffff;
      --soft: #f8fafc;
    }
    @page { margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0 auto;
      max-width: 820px;
      padding: 32px 28px 64px;
      font-family: "Segoe UI", Calibri, system-ui, sans-serif;
      font-size: 11.5pt;
      line-height: 1.55;
      color: var(--ink);
      background: var(--bg);
    }
    h1 {
      font-size: 1.75rem;
      line-height: 1.25;
      margin: 0 0 0.6em;
      color: #0f172a;
      border-bottom: 3px solid var(--accent);
      padding-bottom: 0.35em;
    }
    h2 {
      font-size: 1.25rem;
      margin: 1.8em 0 0.55em;
      color: var(--accent);
      page-break-after: avoid;
    }
    h3 {
      font-size: 1.05rem;
      margin: 1.35em 0 0.4em;
      color: #312e81;
      page-break-after: avoid;
    }
    p, li { orphans: 3; widows: 3; }
    a { color: #4c1d95; }
    hr {
      border: 0;
      border-top: 1px solid var(--line);
      margin: 1.6em 0;
    }
    code {
      font-family: Consolas, "Cascadia Mono", monospace;
      font-size: 0.88em;
      background: #f1f5f9;
      padding: 0.1em 0.35em;
      border-radius: 4px;
    }
    pre {
      background: #0f172a;
      color: #e2e8f0;
      padding: 14px 16px;
      border-radius: 10px;
      overflow-x: auto;
      font-size: 0.82rem;
      line-height: 1.4;
    }
    pre code { background: transparent; color: inherit; padding: 0; }
    blockquote {
      margin: 1em 0;
      padding: 0.75em 1em;
      border-left: 4px solid #a78bfa;
      background: #f5f3ff;
      color: #334155;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1em 0 1.4em;
      font-size: 0.95em;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid var(--line);
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #ede9fe; color: #312e81; }
    tr:nth-child(even) td { background: var(--soft); }
    .katex-display {
      margin: 1em 0;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 0.35em 0;
      page-break-inside: avoid;
    }
    .meta {
      color: var(--muted);
      font-size: 0.92em;
      margin-bottom: 1.2em;
    }
    @media print {
      body { padding: 0; max-width: none; }
      a { text-decoration: none; color: inherit; }
      pre { white-space: pre-wrap; }
    }
  </style>
</head>
<body>
${body}
</body>
</html>
`;

fs.writeFileSync(HTML_PATH, html, 'utf8');
console.log('HTML gerado:', HTML_PATH);

const edgeCandidates = [
  process.env.EDGE_PATH,
  'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
  'C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
  'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
  'C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
].filter(Boolean);

const browser = edgeCandidates.find((p) => fs.existsSync(p));
if (!browser) {
  console.error('Nenhum Edge/Chrome encontrado para gerar PDF.');
  process.exit(1);
}

const fileUrl = 'file:///' + HTML_PATH.replace(/\\\\/g, '/');
try {
  execFileSync(browser, [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${PDF_PATH}`,
    fileUrl,
  ], { stdio: 'inherit', timeout: 60000 });
  console.log('PDF gerado:', PDF_PATH);
} catch (err) {
  console.error('Falha ao gerar PDF:', err.message);
  process.exit(1);
}
