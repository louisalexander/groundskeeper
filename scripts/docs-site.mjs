// Pure helpers for the docs site build (see scripts/build-docs.mjs for the IO).

/** Title for a doc: its first level-1 heading, stripped of inline markdown. */
export function docTitle(markdown, fallback) {
  const m = markdown.match(/^#\s+(.+)$/m);
  if (!m) return fallback;
  return m[1]
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim();
}

/** Published path for a source doc path: `a/b.md` -> `a/b.html`. */
export function toDocHref(path) {
  return path.endsWith('.md') ? `${path.slice(0, -3)}.html` : path;
}

/** Resolve a relative href against a directory, posix-style. Returns null if it escapes the root. */
function resolveWithin(fromDir, href) {
  const parts = [...(fromDir ? fromDir.split('/') : []), ...href.split('/')];
  const out = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

/**
 * Rewrite in-tree markdown links to their published .html counterparts.
 * `from` is the doc's directory relative to the docs root; `published` is the
 * set of doc-root-relative .md paths that actually get published.
 */
export function rewriteMdLinks(html, { from = '', published = new Set() } = {}) {
  return html.replace(/href="([^"]+)"/g, (whole, href) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('/') || href.startsWith('#')) return whole;
    const [path, frag] = href.split('#');
    if (!path.endsWith('.md')) return whole;
    const target = resolveWithin(from, path);
    if (!target || !published.has(target)) return whole;
    return `href="${path.slice(0, -3)}.html${frag ? `#${frag}` : ''}"`;
  });
}
