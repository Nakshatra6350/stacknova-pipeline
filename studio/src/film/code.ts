// Colours a short Java (or Go, SQL) listing for a code panel, so films can hold code as plain text.
import { INK, type Token } from '../props/cards';

const KEYWORDS = new Set(('abstract assert boolean break byte case catch char class const continue default do double else enum ' +
  'extends final finally float for if implements import instanceof int interface long native new package private protected ' +
  'public record return short static super switch synchronized this throw throws transient try var void volatile while ' +
  'null true false func go defer select chan map struct type range SELECT FROM WHERE UPDATE SET INSERT INTO VALUES BEGIN ' +
  'COMMIT ROLLBACK DELETE AND OR NOT').split(' '));

/** One row of tokens per line: keywords, types (Capitalised), strings, numbers and comments. */
export function colour(code: string): Token[][] {
  return code.replace(/\s+$/, '').split('\n').map((line) => {
    const out: Token[] = [];
    const comment = line.indexOf('//');
    const body = comment >= 0 ? line.slice(0, comment) : line;
    const re = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|@?[A-Za-z_][\w]*|\d[\w.]*|\s+|.)/g;
    for (const m of body.matchAll(re)) {
      const s = m[0];
      let col = INK.text;
      if (s.startsWith('"') || s.startsWith("'")) col = INK.str;
      else if (/^\d/.test(s)) col = INK.num;
      else if (s.startsWith('@') || KEYWORDS.has(s)) col = INK.kw;
      else if (/^[A-Z][a-z]\w*$/.test(s)) col = INK.type;
      const last = out[out.length - 1];
      if (last && last[1] === col) last[0] += s; else out.push([s, col]);
    }
    if (comment >= 0) out.push([line.slice(comment), INK.dim]);
    return out;
  });
}
