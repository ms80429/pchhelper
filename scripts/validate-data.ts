// CLAUDE.md §4 — full data validation. Writes reports/data-validation.md, exits 1 on any FAIL.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { csv, pokeapiToShowdownId, readJSON, serebii, serebiiMoves, serebiiPokemon, toID } from './lib/raw';
import { ABILITIES, ITEMS, KO, LEARNSETS, MOVES, SPECIES, type StatID } from '../src/data/champions';
import { damage, makePokemon } from '../src/calc';
import { VARIABLE_POWER } from '../src/calc/variable-power';

interface Check { name: string; summary: string; issues: string[] }
const checks: Check[] = [];
const notes: string[] = []; // shown in report, do not affect PASS/FAIL
const check = (name: string, summary: string, issues: string[]) => checks.push({ name, summary, issues });
const ids = new Set(SPECIES.map(s => s.id));
const byId = new Map(SPECIES.map(s => [s.id, s]));
const buildLog = readJSON('data/build-log.json');
const cosmeticOf = new Map<string, string>(buildLog.droppedSpecies.filter((d: any) => d.reason.startsWith('cosmetic'))
  .map((d: any) => [toID(d.name), toID(d.reason.match(/forme of (.+?) \(/)[1])]));
const nonMegaBattleOnly = SPECIES.filter(s => s.battleOnly && !s.isMega);

// ================= 4-1 Pokémon =================
// Roster vs Bulbapedia Regulation Set M-C (form-level list)
{
  const wiki = readFileSync('data/raw/bulbapedia/Regulation_Set_M-C.wiki', 'utf8');
  const ALIAS: Record<string, string> = { jumbo: 'super', female: 'f' };
  const cards = [...wiki.matchAll(/\{\{ChampsCard\|(\d+)\|([^|}]+)(?:\|ig=-([^|}]+))?/g)].flatMap(m => {
    const ig = m[3] ? toID(m[3]).replace(/^(jumbo|female)$/, k => ALIAS[k]) : '';
    const id = toID(m[2]) + ig;
    // One card stands for several Showdown formes (both forms confirmed on their Serebii dex pages)
    if (id === 'meowsticmega') return ['meowsticmmega', 'meowsticfmega'];
    if (id === 'maushold') return ['maushold', 'mausholdfour'];
    return [cosmeticOf.get(id) ?? id];
  });
  // Source omissions confirmed elsewhere (data/raw/manual/roster-errata.json); shown in the summary, never silent
  const errata = Object.keys(readJSON('data/raw/manual/roster-errata.json')['bulbapedia-reg-m-c']);
  const expected = new Set([...cards, ...errata]);
  const ours = SPECIES.filter(s => !nonMegaBattleOnly.includes(s)).map(s => s.id);
  check('명단: Bulbapedia Reg M-C', `카드 ${new Set(cards).size} + 출처 정정 ${errata.length} (${errata.join(', ')}) / 데이터 ${ours.length}`, [
    ...errata.filter(id => cards.includes(id)).map(id => `정정 불필요 (이미 목록에 있음): ${id}`),
    ...[...expected].filter(id => !ids.has(id)).map(id => `누락 (M-C에 있음): ${id}`),
    ...ours.filter(id => !expected.has(id)).map(id => `초과 (M-C에 없음): ${id}`),
  ]);
}
// Roster vs Serebii "Available Pokémon" (+ types)
{
  const SUF: Record<string, string> = { m: 'Mega', mx: 'Mega-X', my: 'Mega-Y', mz: 'Mega-Z', a: 'Alola', g: 'Galar', h: 'Hisui', e: 'Eternal' };
  const issues: string[] = [];
  const matched = new Set<string>();
  const rows = serebiiPokemon();
  for (const r of rows) {
    const cands = SPECIES.filter(s => s.num === r.num);
    const hit = r.suffix === '' ? cands.filter(s => !s.forme || s.forme === 'Eternal' && !cands.some(c => !c.forme))
      : r.suffix === 'p' ? cands.filter(s => s.forme?.startsWith('Paldea'))
      : r.suffix === 'm' ? cands.filter(s => /^([MF]-)?Mega$/.test(s.forme ?? ''))
      : cands.filter(s => s.forme === SUF[r.suffix]);
    if (!hit.length) { issues.push(`누락 (Serebii): #${r.num} ${r.name} [${r.suffix}]`); continue; }
    for (const s of hit) {
      matched.add(s.id);
      if (hit.length === 1 && s.types.join() !== r.types.join()) issues.push(`타입 불일치 ${s.name}: ${s.types} vs Serebii ${r.types}`);
    }
  }
  // Serebii lists species, not alternate formes: those must be backed by the species' Serebii dex page.
  const FORM_EVIDENCE: Record<string, string> = {
    castformsunny: 'Sunny Form', castformrainy: 'Rainy Form', castformsnowy: 'Snowy Form',
    rotomheat: 'Heat Rotom', rotomwash: 'Wash Rotom', rotomfrost: 'Frost Rotom', rotomfan: 'Fan Rotom', rotommow: 'Mow Rotom',
    meowsticf: 'Female', aegislashblade: 'Blade Forme', gourgeistsmall: 'Small Variety', gourgeistlarge: 'Large Variety',
    gourgeistsuper: 'Jumbo Variety', lycanrocmidnight: 'Midnight Form', lycanrocdusk: 'Dusk Form', mimikyubusted: 'Busted Form',
    toxtricitylowkey: 'Low Key Form', indeedeef: 'Female', morpekohangry: 'Hangry Mode', basculegionf: 'Female',
    mausholdfour: 'Family of Four', squawkabillyyellow: 'Yellow Plumage', squawkabillywhite: 'White Plumage', palafinhero: 'Hero Form',
  };
  for (const s of SPECIES.filter(s => !matched.has(s.id))) {
    const word = FORM_EVIDENCE[s.id];
    const page = `data/raw/serebii/dex/${toID(s.baseSpecies)}.shtml`;
    if (!word) issues.push(`초과 (Serebii 목록에 없음, 근거 없음): ${s.name}`);
    else if (!existsSync(page) || !readFileSync(page, 'latin1').includes(`alt="${word}"`)) issues.push(`폼 근거 없음: ${s.name} ("${word}" not in ${page})`);
  }
  check('명단: Serebii', `행 ${rows.length}, 폼 근거 ${Object.keys(FORM_EVIDENCE).length}`, issues);
}
// Megas
{
  const issues: string[] = [];
  const megas = SPECIES.filter(s => s.isMega);
  for (const m of megas) {
    const stone = m.requiredItem && ITEMS.find(i => i.name === m.requiredItem);
    if (!stone) issues.push(`${m.name}: 메가스톤 ${m.requiredItem} 없음`);
    else if (!Object.values(stone.megaStone ?? {}).includes(m.name)) issues.push(`${m.name}: ${stone.name}.megaStone 매핑 없음`);
    if (!m.battleOnly || !ids.has(toID([m.battleOnly].flat()[0]))) issues.push(`${m.name}: 원본 폼 없음`);
  }
  // Champions mega abilities (Serebii megaabilities.shtml)
  const h = serebii('megaabilities');
  const rows = [...h.matchAll(/#(\d{4})\s*<\/td>[\s\S]*?pokedex-champions\/[^"]+\/">([^<]+)<\/a>[\s\S]*?abilitydex\/[^"]+">([^<]+)<\/a>/g)];
  for (const [, num, name, ability] of rows) {
    const suffix = name.match(/ ([XYZ])$/)?.[1];
    const cands = megas.filter(m => m.num === +num && (suffix ? m.forme!.endsWith(`-${suffix}`) : !/-[XYZ]$/.test(m.forme!)));
    if (!cands.length) issues.push(`Serebii 메가 특성 대상 없음: ${name}`);
    for (const m of cands) if (m.abilities['0'] !== ability.trim()) issues.push(`${m.name} 특성 ${m.abilities['0']} vs Serebii ${ability}`);
  }
  check('메가진화', `메가 ${megas.length} / Serebii 메가 특성 ${rows.length}건 대조`, issues);
}
// Types / stats / abilities sanity
{
  const TYPES = new Set(['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic',
    'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy']);
  const abil = new Set(ABILITIES.map(a => a.name));
  const t: string[] = [], st: string[] = [], ab: string[] = [];
  for (const s of SPECIES) {
    if (s.types.length < 1 || s.types.length > 2 || new Set(s.types).size !== s.types.length || s.types.some(x => !TYPES.has(x))) t.push(`${s.name}: ${s.types}`);
    const v = Object.values(s.baseStats);
    if (v.length !== 6 || v.some(x => !Number.isInteger(x) || x < 1)) st.push(`${s.name}: ${JSON.stringify(s.baseStats)}`);
    for (const a of Object.values(s.abilities)) if (!abil.has(a)) ab.push(`${s.name}: ${a}`);
  }
  check('타입 형식', `18타입·1~2개·중복 없음`, t);
  check('종족값 형식', `6개 모두 1 이상 정수`, st);
  check('특성 존재', `abilities.json ${ABILITIES.length}개`, ab);
}
// Cross-check types + base stats with PokeAPI
{
  const pk = csv('pokemon'), types = new Map(csv('types').map(r => [r.id, r.identifier]));
  const ptypes = csv('pokemon_types'), pstats = csv('pokemon_stats');
  const SK = ['', 'hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const issues: string[] = [];
  for (const s of SPECIES) {
    const cands = pk.filter(r => +r.species_id === s.num);
    const r = s.forme ? cands.find(c => pokeapiToShowdownId(c.identifier) === s.id) : cands.find(c => c.is_default === '1');
    if (!r) { issues.push(`${s.name}: PokeAPI 매핑 없음`); continue; }
    const t = ptypes.filter(x => x.pokemon_id === r.id).sort((a, b) => +a.slot - +b.slot).map(x => types.get(x.type_id));
    if (t.join() !== s.types.map(x => x.toLowerCase()).join()) issues.push(`${s.name} 타입 ${s.types} vs PokeAPI ${t}`);
    const stats: Record<string, number> = {};
    for (const x of pstats.filter(x => x.pokemon_id === r.id)) stats[SK[+x.stat_id]] = +x.base_stat;
    for (const k of Object.keys(s.baseStats) as StatID[]) if (stats[k] !== s.baseStats[k]) issues.push(`${s.name} ${k} ${s.baseStats[k]} vs PokeAPI ${stats[k]}`);
  }
  check('타입·종족값 교차검증 (PokeAPI)', `불일치 ${issues.length}건`, issues);
}
// Korean names
{
  const all = (k: keyof typeof KO, list: { id: string; name: string }[]) => list.filter(x => !KO[k][x.id]).map(x => `${k}: ${x.name}`);
  const v = SPECIES.map(s => KO.species[s.id]).filter(Boolean);
  const dup = v.filter((x, i) => v.indexOf(x) !== i).map(x => `중복: ${x}`);
  check('한글명', `포켓몬 ${v.length} / 기술 ${Object.keys(KO.moves).length} / 도구 ${Object.keys(KO.items).length} / 특성 ${Object.keys(KO.abilities).length}`,
    [...all('species', SPECIES), ...all('moves', MOVES), ...all('items', ITEMS), ...all('abilities', ABILITIES), ...dup]);
}
// Calc smoke: every species as attacker and defender
{
  const issues: string[] = [];
  const bad = (n: number) => !Number.isFinite(n);
  for (const s of SPECIES) {
    try {
      const p = makePokemon(s.name, { sp: { hp: 2, atk: 32, spe: 32 }, nature: 'Adamant' });
      if (Object.values(p.stats).some(bad)) issues.push(`${s.name}: 실수치 NaN`);
      for (const [a, d] of [[s.name, 'Snorlax'], ['Snorlax', s.name]]) {
        const r = damage(makePokemon(a), makePokemon(d), 'Body Slam');
        if ([r.damage].flat(2).some(n => bad(n as number))) issues.push(`${a} → ${d}: NaN`);
      }
    } catch (e) { issues.push(`${s.name}: ${(e as Error).message}`); }
  }
  check('계산 스모크 (포켓몬)', `${SPECIES.length}마리 × 공격/방어`, issues);
}

// ================= 4-2 Moves =================
const moveIds = new Set(MOVES.map(m => m.id));
const attacks = MOVES.filter(m => m.category !== 'Status');
{
  const missing = new Map<string, string[]>();
  for (const [sp, ms] of Object.entries(LEARNSETS)) for (const m of ms) if (!moveIds.has(m)) missing.set(m, [...(missing.get(m) ?? []), sp]);
  check('습득 기술 존재', `learnset ${Object.keys(LEARNSETS).length}마리`, [...missing].map(([m, s]) => `${m} (${s.slice(0, 5).join(', ')}${s.length > 5 ? '…' : ''})`));
  const noLearnset = SPECIES.filter(s => !LEARNSETS[s.id]?.length).map(s => `learnset 없음: ${s.name}`);
  if (noLearnset.length) check('learnset 보유', '', noLearnset);
}
{
  const issues: string[] = [];
  for (const m of MOVES) {
    if (!m.type || !['Physical', 'Special', 'Status'].includes(m.category)) issues.push(`${m.name}: 타입/분류`);
    if (!Number.isInteger(m.basePower) || !(m.accuracy === true || Number.isInteger(m.accuracy)) || !Number.isInteger(m.pp) ||
      !Number.isInteger(m.priority) || typeof m.contact !== 'boolean') issues.push(`${m.name}: 필드 누락`);
  }
  check('기술 필수 필드', `총 ${MOVES.length}`, issues);
}
// Serebii cross-check of move numbers (in-game data)
{
  const by = new Map(MOVES.map(m => [m.id, m]));
  const issues: string[] = [];
  const rows = serebiiMoves();
  for (const r of rows) {
    const m = by.get(toID(r.name));
    if (!m) { issues.push(`Serebii에만 있음: ${r.name}`); continue; }
    if (m.type !== r.type) issues.push(`${m.name} 타입 ${m.type} vs ${r.type}`);
    if (m.category !== r.category) issues.push(`${m.name} 분류 ${m.category} vs ${r.category}`);
    if (m.pp !== r.pp) issues.push(`${m.name} PP ${m.pp} vs ${r.pp}`);
    if ((m.basePower || null) !== r.bp) issues.push(`${m.name} 위력 ${m.basePower} vs ${r.bp}`);
    if (m.accuracy !== r.acc) issues.push(`${m.name} 명중 ${m.accuracy} vs ${r.acc}`);
  }
  const names = new Set(rows.map(r => toID(r.name)));
  for (const m of MOVES) if (!names.has(m.id)) issues.push(`Serebii에 없음: ${m.name}`);
  check('기술 교차검증 (Serebii)', `Serebii ${rows.length} / 데이터 ${MOVES.length}`, issues);
}
// Classification: exactly one of fixed / variable / fixed-damage / special
type Kind = 'fixed' | 'variable' | 'fixedDamage' | 'special';
const kinds = (m: typeof MOVES[number]): Kind[] => {
  const fixedDamage = m.damage !== null || m.hasDamageCallback || !!m.ohko;
  const special = !!(m.overrideOffensivePokemon || m.overrideOffensiveStat || m.overrideDefensiveStat);
  const variable = !fixedDamage && (m.hasBasePowerCallback || m.hasOnBasePower || m.basePower <= 1 || m.id in VARIABLE_POWER);
  const k: Kind[] = [];
  if (fixedDamage) k.push('fixedDamage');
  if (special) k.push('special');
  if (variable) k.push('variable');
  if (!k.length) k.push('fixed');
  return k;
};
const counts = { fixed: 0, variable: 0, fixedDamage: 0, special: 0 };
{
  const issues: string[] = [];
  for (const m of attacks) {
    const k = kinds(m);
    if (k.length !== 1) issues.push(`${m.name}: 분류 ${k.length}개 (${k})`);
    else counts[k[0]]++;
    if (k[0] === 'fixed' && m.basePower <= 1) issues.push(`${m.name}: 위력 ${m.basePower}인데 고정 위력`);
  }
  check('공격기 분류', `고정 ${counts.fixed} / 가변 ${counts.variable} / 고정데미지 ${counts.fixedDamage} / 특수계산 ${counts.special}`, issues);
}
// Variable power auto-detection + CLAUDE.md §4-3 minimum table
const REQUIRED_TABLE = ['hex', 'lastrespects', 'ragefist', 'knockoff', 'acrobatics', 'facade', 'venoshock', 'brine', 'weatherball',
  'payback', 'avalanche', 'reversal', 'flail', 'eruption', 'waterspout', 'heavyslam', 'heatcrash', 'lowkick', 'grassknot',
  'gyroball', 'electroball', 'storedpower'];
const detected = attacks.filter(m => kinds(m).includes('variable')).map(m => m.id);
{
  const issues = [
    ...detected.filter(id => !VARIABLE_POWER[id]).map(id => `핸들러 없음: ${id}`),
    ...REQUIRED_TABLE.filter(id => moveIds.has(id) && !VARIABLE_POWER[id]).map(id => `필수 표 핸들러 없음: ${id}`),
    ...Object.keys(VARIABLE_POWER).filter(id => !moveIds.has(id)).map(id => `챔피언스에 없는 기술의 핸들러: ${id}`),
  ];
  check('가변 위력 탐지', `탐지 ${detected.length} / 핸들러 ${Object.keys(VARIABLE_POWER).length} / 필수 표 중 미등장: ${REQUIRED_TABLE.filter(id => !moveIds.has(id)).join(', ') || '없음'}`, issues);
}
// Multi-hit: hit counts vs Serebii's in-game effect text ("attacks 2 to 5 times", "attacks twice", ...)
{
  const effect = new Map(serebiiMoves().map(r => [toID(r.name), r.effect]));
  const hitsFromText = (t: string): number | number[] | 'party' | null => {
    if (/as many times as the number of Pok/.test(t)) return 'party'; // Beat Up — handled by VARIABLE_POWER.beatup
    const range = t.match(/attacks (\d+) to (\d+) times/);
    if (range) return /ends if the user misses/.test(t) ? +range[2] : [+range[1], +range[2]]; // Population Bomb: 10 checks
    if (/attacks twice|hits twice/.test(t)) return 2;
    const n = t.match(/attacks (\d+) times/);
    return n ? +n[1] : null;
  };
  const issues: string[] = [];
  for (const m of attacks) {
    const t = effect.get(m.id) ?? '';
    const want = hitsFromText(t);
    if (want === 'party') { if (!VARIABLE_POWER[m.id]) issues.push(`${m.name}: 파티 수 타격인데 핸들러 없음`); continue; }
    if (JSON.stringify(want) !== JSON.stringify(m.multihit)) issues.push(`${m.name}: ${JSON.stringify(m.multihit)} vs Serebii "${t}"`);
  }
  check('연속기 타수 (Serebii 효과문)', `연속기 ${attacks.filter(m => m.multihit).length}`, issues);
}
// Move calc smoke
{
  const issues: string[] = [];
  for (const m of attacks) {
    try {
      const r = damage(makePokemon('Clefable'), makePokemon('Garchomp'), m.name);
      if ([r.damage].flat(2).some(n => !Number.isFinite(n as number))) issues.push(`${m.name}: NaN`);
    } catch (e) { issues.push(`${m.name}: ${(e as Error).message}`); }
  }
  check('계산 스모크 (기술)', `공격기 ${attacks.length}`, issues);
}
// Items vs Serebii
{
  const h = serebii('items');
  const names = new Set([...h.matchAll(/itemdex\/[^"]*\.shtml">([^<]+)<\/a>/g)].map(m => m[1].trim())
    .filter(n => !/Ticket|Coupon/.test(n)).map(toID));
  const ours = new Set(ITEMS.map(i => i.id));
  check('도구 명단 (Serebii, 티켓류 제외)', `Serebii ${names.size} / 데이터 ${ours.size}`, [
    ...[...names].filter(n => !ours.has(n)).map(n => `누락: ${n}`), ...[...ours].filter(n => !names.has(n)).map(n => `초과: ${n}`)]);
}

// ================= tests (4-3 handlers, 4-4 golden) =================
const vitest = (() => {
  mkdirSync('reports', { recursive: true });
  try { execSync('npx vitest run --reporter=json --outputFile=reports/.vitest.json', { stdio: 'ignore' }); } catch { /* failures read below */ }
  return readJSON('reports/.vitest.json');
})();
const results = vitest.testResults.flatMap((f: any) => f.assertionResults.map((a: any) => ({ file: f.name.replace(/\\/g, '/'), ...a })));
{
  const vp = results.filter((r: any) => r.file.endsWith('tests/calc/variable-power.test.ts'));
  const failed = vp.filter((r: any) => r.status !== 'passed');
  const tested = vp.filter((r: any) => r.status === 'passed' && VARIABLE_POWER[r.title]).length;
  check('가변 위력 단위 테스트', `핸들러 ${Object.keys(VARIABLE_POWER).length} / 테스트 통과 ${tested}`, [
    ...failed.map((r: any) => `실패: ${r.title}`),
    ...Object.keys(VARIABLE_POWER).filter(id => !vp.some((r: any) => r.title === id && r.status === 'passed')).map(id => `테스트 없음/실패: ${id}`),
  ]);
}
{
  const golden = existsSync('tests/calc/golden.json') ? readJSON<any[]>('tests/calc/golden.json') : [];
  const g = results.filter((r: any) => r.file.endsWith('tests/calc/golden.test.ts'));
  // refutedBy (user-approved): source value contradicted by in-game observation; the test checks the observation instead.
  const refuted = new Map(golden.filter(c => c.refutedBy).map(c => [c.id, c.refutedBy as string[]]));
  const passed = g.filter((r: any) => r.status === 'passed' && !refuted.has(r.title)).length;
  const refutedOk = g.filter((r: any) => r.status === 'passed' && refuted.has(r.title));
  check('골든 테스트', `${passed}/${Math.max(golden.length, 30)}` + (refuted.size ? ` + 실측 반박 ${refutedOk.length}` : ''), [
    ...(golden.length < 30 ? [`케이스 ${golden.length}개 (최소 30)`] : []),
    ...g.filter((r: any) => r.status !== 'passed').map((r: any) => `실패: ${r.title}` + (refuted.has(r.title) ? ' (반박 근거 관측 검증 실패)' : '')),
  ]);
  if (refutedOk.length) notes.push(...refutedOk.map((r: any) => `골든 \`${r.title}\`: 출처 값이 실측으로 반박됨 (관측: ${refuted.get(r.title)!.join(', ')}) — 관측값이 우리 16개 값 안`));
}
{
  const other = results.filter((r: any) => r.status !== 'passed' && !/variable-power|golden/.test(r.file));
  check('기타 테스트', `${results.length}개 실행`, other.map((r: any) => `실패: ${r.fullName}`));
}

// ================= report =================
const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
const pf = (c: Check) => (c.issues.length ? 'FAIL' : 'PASS');
const megaN = SPECIES.filter(s => s.isMega).length, formN = SPECIES.filter(s => s.forme && !s.isMega).length;
const lines = [
  `# Data Validation Report  (${stamp})`, '',
  `포켓몬: 총 ${SPECIES.length} / 메가 ${megaN} / 폼 ${formN}`,
  `기술: 총 ${MOVES.length} / 공격기 ${attacks.length} / 변화기 ${MOVES.length - attacks.length}`, '',
  '| 항목 | 요약 | 결과 |', '|---|---|---|',
  ...checks.map(c => `| ${c.name} | ${c.summary} | ${pf(c)}${c.issues.length ? ` (${c.issues.length})` : ''} |`), '',
  `**전체: ${checks.every(c => !c.issues.length) ? 'PASS' : 'FAIL'}**`, '',
  ...(notes.length ? ['## 실측 반박 (사용자 승인)', '', ...notes.map(n => `- ${n}`), ''] : []),
  '## 불일치 / 누락 상세', '',
  ...checks.filter(c => c.issues.length).flatMap(c => [`### ${c.name}`, ...c.issues.map(i => `- ${i}`), '']),
];
writeFileSync('reports/data-validation.md', lines.join('\n') + '\n');
console.log(lines.slice(0, 8 + checks.length + 2).join('\n'));
process.exit(checks.every(c => !c.issues.length) ? 0 : 1);
