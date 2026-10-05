// Builds ChampDex calc share URLs for tests/calc/golden.json.
// URL format = champdex.com `encodeCalcState` (read from the site bundle 2026-10-04). Stat stages are not part of the
// URL, so cases with `boosts` must be set by hand in the UI after loading.
// Usage: node scripts/champdex-url.mjs   → prints "id<TAB>url" per case
import { readFileSync } from 'node:fs';

const slug = s => s.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
const species = n => {
  const m = n.match(/^(.+)-Mega(?:-([XYZ]))?$/);
  return m ? `mega-${slug(m[1])}${m[2] ? '-' + m[2].toLowerCase() : ''}` : slug(n);
};
const STATUS = { brn: 'burn', par: 'paralysis', psn: 'poison', tox: 'badPoison', slp: 'sleep', frz: 'freeze' };
const sp = s => ['hp', 'atk', 'def', 'spa', 'spd', 'spe'].map(k => s?.[k] ?? 0).join('.');

export function champdexUrl(c) {
  const a = c.attacker, d = c.defender, f = c.field ?? {};
  const fields = [species(a.name), species(d.name), slug(c.move), a.nature.toLowerCase(), d.nature.toLowerCase(),
    a.ability ?? '', d.ability ?? '', a.item ?? '', d.item ?? '', (f.weather ?? 'none').toLowerCase(), '0', c.crit ? '1' : '0',
    sp(a.sp), sp(d.sp), (f.terrain ?? 'none').toLowerCase(), f.reflect ? '1' : '0', f.lightScreen ? '1' : '0', '0', '0',
    '0', /* singles */ '', '0', '', '0', '3', String(c.ctx?.faintedAllies ?? 0), String(c.ctx?.timesHit ?? 0), '0', '0', '0',
    STATUS[a.status] ?? '', STATUS[d.status] ?? ''];
  return 'https://champdex.com/tools/calc?c=' + Buffer.from(fields.join('~'), 'utf8').toString('base64url');
}

if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  for (const c of JSON.parse(readFileSync('tests/calc/golden.json', 'utf8'))) console.log(`${c.id}\t${champdexUrl(c)}`);
}
