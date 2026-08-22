// Render docs/**/*.md into a small static docs site under dist/docs/.
// Run after `vite build`; the Pages workflow publishes dist/ as a whole.
//
// Only markdown is published — the legacy app and survey imagery in docs/ are
// deliberately left out of the generated site.

import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { docTitle, toDocHref, rewriteMdLinks } from './docs-site.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'docs');
const outDir = join(root, 'dist', 'docs');
const base = process.env.DOCS_BASE ?? '/';

const SECTIONS = [
  { dir: 'superpowers/specs', label: 'Design spec' },
  { dir: 'superpowers/plans', label: 'Milestone plans' },
];

async function markdownFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await markdownFiles(full)));
    else if (entry.name.endsWith('.md')) out.push(relative(srcDir, full));
  }
  return out.sort();
}

const slug = (s) =>
  s.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');

marked.use({
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const id = slug(text);
      const anchor = depth > 1 ? `<a class="anchor" href="#${id}" aria-label="Permalink">#</a>` : '';
      return `<h${depth} id="${id}">${text}${anchor}</h${depth}>\n`;
    },
  },
});

const up = (path) => '../'.repeat(path.split('/').length - 1);

function shell({ title, body, nav, prefix, isIndex }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Groundskeeper docs</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌳</text></svg>">
<style>
:root{--bg:#fbfaf7;--panel:#fff;--ink:#1f2420;--muted:#5f6b62;--line:#e3e2dc;--accent:#2f7d4f;--code-bg:#f3f2ed}
@media (prefers-color-scheme:dark){:root{--bg:#141712;--panel:#1b1f1c;--ink:#e8ece8;--muted:#9aa79e;--line:#2b312d;--accent:#6fca92;--code-bg:#20251f}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;-webkit-text-size-adjust:100%}
a{color:var(--accent)}
.wrap{display:grid;grid-template-columns:260px minmax(0,1fr);gap:2.5rem;max-width:1180px;margin:0 auto;padding:2rem 1.25rem 5rem}
aside{position:sticky;top:2rem;align-self:start}
.brand{display:flex;align-items:center;gap:.5rem;font-weight:700;font-size:1.05rem;text-decoration:none;color:var(--ink);margin-bottom:1.25rem}
nav h4{margin:1.4rem 0 .4rem;font-size:.72rem;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
nav a{display:block;padding:.3rem .55rem;margin-left:-.55rem;border-radius:6px;text-decoration:none;color:var(--ink);font-size:.92rem}
nav a:hover{background:var(--code-bg)}
nav a[aria-current]{background:var(--code-bg);color:var(--accent);font-weight:600}
.links{margin-top:1.75rem;padding-top:1rem;border-top:1px solid var(--line);font-size:.86rem}
.links a{display:block;padding:.2rem 0;color:var(--muted);text-decoration:none}
.links a:hover{color:var(--accent)}
main{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:2.5rem 3rem;min-width:0}
main>:first-child{margin-top:0}
h1,h2,h3,h4{line-height:1.25;scroll-margin-top:1.5rem}
h1{font-size:2rem;letter-spacing:-.02em}
h2{font-size:1.35rem;margin-top:2.4rem;padding-top:.6rem;border-top:1px solid var(--line)}
h3{font-size:1.08rem;margin-top:1.8rem}
.anchor{margin-left:.4rem;opacity:0;text-decoration:none;font-weight:400}
h2:hover .anchor,h3:hover .anchor,h4:hover .anchor{opacity:.45}
code{background:var(--code-bg);padding:.15em .38em;border-radius:5px;font-size:.88em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
pre{background:var(--code-bg);border:1px solid var(--line);border-radius:10px;padding:1rem;overflow-x:auto}
pre code{background:none;padding:0;font-size:.85em;line-height:1.5}
blockquote{margin:1.2rem 0;padding:.1rem 1.1rem;border-left:3px solid var(--accent);color:var(--muted)}
table{border-collapse:collapse;width:100%;display:block;overflow-x:auto;font-size:.93em;margin:1.2rem 0}
th,td{border:1px solid var(--line);padding:.5rem .7rem;text-align:left;vertical-align:top}
th{background:var(--code-bg)}
hr{border:0;border-top:1px solid var(--line);margin:2rem 0}
img{max-width:100%}
.cards{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));padding:0;list-style:none;margin:1.5rem 0 0}
.cards a{display:block;height:100%;padding:1rem 1.1rem;border:1px solid var(--line);border-radius:10px;text-decoration:none;color:var(--ink)}
.cards a:hover{border-color:var(--accent)}
.cards strong{display:block;color:var(--accent);font-size:1rem}
.cards span{color:var(--muted);font-size:.85rem}
.lede{color:var(--muted);font-size:1.05rem}
@media (max-width:860px){.wrap{grid-template-columns:1fr;gap:1.25rem;padding-top:1.25rem}aside{position:static}main{padding:1.5rem 1.25rem;border-radius:10px}}
</style>
</head>
<body>
<div class="wrap">
<aside>
  <a class="brand" href="${prefix}index.html">🌳 Groundskeeper <span style="color:var(--muted);font-weight:500">docs</span></a>
  ${nav}
  <div class="links">
    <a href="${base}">🗺 Live demo</a>
    <a href="https://github.com/louisalexander/groundskeeper">📦 Repository</a>
  </div>
</aside>
<main${isIndex ? ' class="index"' : ''}>
${body}
</main>
</div>
</body>
</html>
`;
}

const files = await markdownFiles(srcDir);
const published = new Set(files);

const docs = await Promise.all(
  files.map(async (path) => {
    const markdown = await readFile(join(srcDir, path), 'utf8');
    return { path, markdown, title: docTitle(markdown, path.split('/').pop().replace(/\.md$/, '')) };
  })
);

const sectionsFor = (docs) =>
  SECTIONS.map((s) => ({ ...s, docs: docs.filter((d) => dirname(d.path) === s.dir) }))
    .concat([{ label: 'Other', docs: docs.filter((d) => !SECTIONS.some((s) => s.dir === dirname(d.path))) }])
    .filter((s) => s.docs.length);

const sections = sectionsFor(docs);

const navFor = (current, prefix) =>
  `<nav>${sections
    .map(
      (s) =>
        `<h4>${s.label}</h4>` +
        s.docs
          .map(
            (d) =>
              `<a href="${prefix}${toDocHref(d.path)}"${d.path === current ? ' aria-current="page"' : ''}>${d.title}</a>`
          )
          .join('')
    )
    .join('')}</nav>`;

await mkdir(outDir, { recursive: true });

for (const doc of docs) {
  const html = rewriteMdLinks(marked.parse(doc.markdown), { from: dirname(doc.path), published });
  const outPath = join(outDir, toDocHref(doc.path));
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(
    outPath,
    shell({ title: doc.title, body: html, nav: navFor(doc.path, up(doc.path)), prefix: up(doc.path) })
  );
}

const indexBody = `<h1>🌳 Groundskeeper docs</h1>
<p class="lede">Design and planning documents for <a href="https://github.com/louisalexander/groundskeeper">Groundskeeper</a> —
survey-grade yard mapping for irrigation heads, plants and sensors, built to drive a live Home Assistant dashboard.</p>
${sections
  .map(
    (s) => `<h2>${s.label}</h2><ul class="cards">${s.docs
      .map(
        (d) =>
          `<li><a href="${toDocHref(d.path)}"><strong>${d.title}</strong><span>${d.path}</span></a></li>`
      )
      .join('')}</ul>`
  )
  .join('\n')}`;

await writeFile(join(outDir, 'index.html'), shell({ title: 'Docs', body: indexBody, nav: navFor(null, ''), prefix: '', isIndex: true }));

console.log(`docs site: ${docs.length + 1} pages -> ${relative(root, outDir)}/`);
