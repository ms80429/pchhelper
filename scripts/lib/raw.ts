// Readers for data/raw/. Shared by build-data and validate-data.
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const RAW = path.resolve('data/raw');
export const toID = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export const readJSON = <T = any>(p: string): T => JSON.parse(readFileSync(path.resolve(p), 'utf8'));

export function csv(name: string): Record<string, string>[] {
  const text = readFileSync(path.join(RAW, 'pokeapi', `${name}.csv`), 'utf8').replace(/\r/g, '');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') cell += text[++i];
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') row.push(cell), cell = '';
    else if (c === '\n') row.push(cell), rows.push(row), row = [], cell = '';
    else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  const [head, ...body] = rows;
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const KO = '3';
/** identifier(toID) → Korean name, for a PokeAPI `<x>.csv` + `<x>_names.csv` pair */
export function koByIdentifier(table: string, names: string, key: string): Map<string, string> {
  const ko = new Map(csv(names).filter(r => r.local_language_id === KO).map(r => [r[key], r.name]));
  return new Map(csv(table).filter(r => ko.has(r.id)).map(r => [toID(r.identifier), ko.get(r.id)!]));
}

export function serebii(page: string): string {
  return readFileSync(path.join(RAW, 'serebii', `${page}.shtml`), 'latin1');
}

export interface SerebiiPokemonRow { num: number; suffix: string; name: string; types: string[] }
export function serebiiPokemon(): SerebiiPokemonRow[] {
  const re = /#(\d{4})\s*<\/td>[\s\S]*?small\/([\w-]+)\.png[\s\S]*?<a href="[^"]*">([^<]+)<br[\s\S]*?<\/td>([\s\S]*?)<\/tr>/g;
  return [...serebii('pokemon').matchAll(re)].map(m => ({
    num: +m[1], suffix: m[2].split('-').slice(1).join('-'), name: m[3].trim(),
    types: [...m[4].matchAll(/type\/(\w+)\.gif/g)].map(x => x[1][0].toUpperCase() + x[1].slice(1)),
  }));
}

export interface SerebiiMoveRow { name: string; type: string; category: string; pp: number; bp: number | null; acc: number | true; effect: string }
export function serebiiMoves(): SerebiiMoveRow[] {
  const cell = String.raw`\s*<\/td>\s*<td class="cen">\s*`;
  const re = new RegExp(String.raw`attackdex-champions\/[^"]+\.shtml">([^<]+)<\/a>` + cell +
    String.raw`<img src="\/pokedex-bw\/type\/(\w+)\.gif">` + cell + String.raw`<img src="\/pokedex-bw\/type\/(\w+)\.png">` +
    cell + '([^<]*?)' + cell + '([^<]*?)' + cell + String.raw`([^<]*?)\s*<\/td>\s*<td class="fooinfo">([\s\S]*?)<\/td>`, 'g');
  const cat: Record<string, string> = { physical: 'Physical', special: 'Special', other: 'Status' };
  const num = (s: string) => (s === '--' || s === '' ? null : +s);
  return [...serebii('moves').matchAll(re)].map(m => ({
    name: m[1].trim(), type: m[2][0].toUpperCase() + m[2].slice(1), category: cat[m[3]], pp: +m[4], bp: num(m[5]),
    // Serebii writes never-miss as "--" or "101"
    acc: m[6] === '--' || m[6] === '101' ? true : +m[6],
    effect: m[7].replace(/&eacute;/g, 'é').replace(/\s+/g, ' ').trim(),
  }));
}

export interface KoreaDexRow { num: number; name: string; label: string }
/** Official Korean Pokédex (pokemonkorea.co.kr), Nos. 1–1008 only. */
export function koreaDex(): KoreaDexRow[] {
  const h = readFileSync(path.join(RAW, 'pokemonkorea', 'pokedex.html'), 'utf8');
  return [...h.matchAll(/No\.(\d+)<\/p>\s*([^<]*)<\/h3>\s*<p>([^<]*)<\/p>/g)]
    .map(m => ({ num: +m[1], name: m[2].trim(), label: m[3].trim() }));
}

/** PokeAPI pokemon identifier → Showdown id (e.g. tauros-paldea-combat-breed → taurospaldeacombat) */
export const pokeapiToShowdownId = (identifier: string) =>
  toID(identifier.replace(/-breed$/, '').replace(/-plumage$/, '').replace('family-of-', '')
    .replace(/female/, 'f').replace(/(^|-)male/, '$1m'));
