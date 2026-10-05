import { useEffect, useId, useState } from 'react';

export interface Opt { id: string; ko: string }
export const byKo = (a: Opt, b: Opt) => a.ko.localeCompare(b.ko, 'ko');

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
/** Query char q matches name char c: same char, or q is a 초성 and c is a syllable starting with it. */
const charOk = (q: string, c: string) => {
  if (q === c) return true;
  const code = c.charCodeAt(0) - 0xac00;
  return CHO.includes(q) && code >= 0 && code < 11172 && CHO[Math.floor(code / 588)] === q;
};
/** Index of the first match of query in name (초성 allowed per char, case/space-insensitive), or -1. */
export function matchAt(name: string, query: string): number {
  const n = name.toLowerCase().replace(/\s/g, ''), q = query.toLowerCase().replace(/\s/g, '');
  for (let i = 0; i + q.length <= n.length; i++) if ([...q].every((c, j) => charOk(c, n[i + j]))) return i;
  return -1;
}

const MAX = 30;

/** Korean-name search with 초성 (ㄹㅈㅁ → 리자몽). Typing an exact name selects it; unmatched text is reverted on blur. */
export function Pick({ options, value, onChange, placeholder }: { options: Opt[]; value: string; onChange(id: string): void; placeholder?: string }) {
  const listId = useId();
  const label = options.find(o => o.id === value)?.ko ?? '';
  const [text, setText] = useState(label);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  useEffect(() => setText(label), [label]);

  const hits = !open ? [] : (text ? options.map(o => [o, matchAt(o.ko, text)] as const).filter(([, i]) => i >= 0)
    .sort((a, b) => a[1] - b[1]).map(([o]) => o) : options).slice(0, MAX);
  const choose = (o: Opt) => { setText(o.ko); setOpen(false); onChange(o.id); };

  return (
    <span className="pick">
      <input value={text} placeholder={placeholder} role="combobox" aria-expanded={hits.length > 0} aria-controls={listId}
        aria-activedescendant={hits[hi] ? `${listId}-${hi}` : undefined}
        onFocus={() => { setOpen(true); setHi(0); }}
        onBlur={() => { setOpen(false); setText(label); }}
        onChange={e => {
          const t = e.target.value; setText(t); setOpen(true); setHi(0);
          const o = options.find(o => o.ko === t);
          if (o) onChange(o.id); else if (!t) onChange('');
        }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi(Math.min(hi + 1, hits.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(Math.max(hi - 1, 0)); }
          else if (e.key === 'Enter' && hits[hi]) { e.preventDefault(); choose(hits[hi]); }
          else if (e.key === 'Escape') setOpen(false);
        }} />
      {hits.length > 0 && <ul id={listId} role="listbox">{hits.map((o, i) =>
        <li key={o.id} id={`${listId}-${i}`} role="option" aria-selected={i === hi} className={i === hi ? 'hi' : ''}
          onMouseDown={e => { e.preventDefault(); choose(o); }} onMouseEnter={() => setHi(i)}>{o.ko}</li>)}</ul>}
    </span>
  );
}
