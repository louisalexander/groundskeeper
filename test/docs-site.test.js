import { describe, it, expect } from 'vitest';
import { docTitle, toDocHref, rewriteMdLinks } from '../scripts/docs-site.mjs';

describe('docTitle', () => {
  it('uses the first level-1 heading', () => {
    expect(docTitle('# Design Spec\n\nbody', 'fallback')).toBe('Design Spec');
  });

  it('ignores deeper headings and falls back', () => {
    expect(docTitle('## Section\n\ntext', 'my-plan')).toBe('my-plan');
  });

  it('strips inline markdown from the heading', () => {
    expect(docTitle('# Groundskeeper — `geometry.js` **notes**', 'x'))
      .toBe('Groundskeeper — geometry.js notes');
  });
});

describe('toDocHref', () => {
  it('maps a markdown path to its published html path', () => {
    expect(toDocHref('superpowers/specs/design.md')).toBe('superpowers/specs/design.html');
  });

  it('leaves non-markdown paths alone', () => {
    expect(toDocHref('assets/pic.png')).toBe('assets/pic.png');
  });
});

describe('rewriteMdLinks', () => {
  const published = new Set([
    'superpowers/specs/design.md',
    'superpowers/plans/01-foundation.md',
    'superpowers/plans/02-map-view.md',
  ]);
  const from = 'superpowers/plans';

  it('rewrites a sibling .md link to .html', () => {
    expect(rewriteMdLinks('<a href="02-map-view.md">next</a>', { from, published }))
      .toBe('<a href="02-map-view.html">next</a>');
  });

  it('rewrites across directories and preserves the fragment', () => {
    expect(rewriteMdLinks('<a href="../specs/design.md#goals">goals</a>', { from, published }))
      .toBe('<a href="../specs/design.html#goals">goals</a>');
  });

  it('leaves external links untouched', () => {
    const html = '<a href="https://example.com/readme.md">ext</a>';
    expect(rewriteMdLinks(html, { from, published })).toBe(html);
  });

  it('leaves links to unpublished files untouched', () => {
    const html = '<a href="../../../README.md">readme</a>';
    expect(rewriteMdLinks(html, { from, published })).toBe(html);
  });

  it('leaves non-markdown links untouched', () => {
    const html = '<a href="../../legacy-yard-map.html">legacy</a>';
    expect(rewriteMdLinks(html, { from, published })).toBe(html);
  });
});
