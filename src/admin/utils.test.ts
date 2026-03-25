import { describe, expect, it } from 'vitest';

import { esc } from './utils';

describe('esc', () => {
  it('passes plain strings unchanged', () => {
    expect(esc('hello')).toBe('hello');
  });

  it('escapes ampersands', () => {
    expect(esc('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than and greater-than', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    expect(esc('"quoted"')).toBe('&quot;quoted&quot;');
  });

  it('handles empty string', () => {
    expect(esc('')).toBe('');
  });

  it('coerces non-strings via String()', () => {
    expect(esc(42 as unknown as string)).toBe('42');
  });

  it('handles multiple special characters in one string', () => {
    expect(esc('<a href="&amp;">test</a>')).toBe(
      '&lt;a href=&quot;&amp;amp;&quot;&gt;test&lt;/a&gt;',
    );
  });
});
