// data/raw → data/*.json. Rules for every transformation are documented in data/SOURCES.md.
import { writeFileSync } from 'node:fs';
import { csv, koByIdentifier, koreaDex, pokeapiToShowdownId, readJSON, serebiiMoves, toID } from './lib/raw';

type Stats = Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>;
interface SdSpecies {
  id: string; name: string; num: number; baseSpecies: string; forme: string; types: string[]; baseStats: Stats;
  abilities: Record<string, string>; weightkg: number; requiredItem: string | null; changesFrom: string | null;
  battleOnly: string | string[] | null; gender: string | null;
}

const sd = (f: string) => readJSON(`data/raw/showdown/${f}.json`);
const species: SdSpecies[] = sd('species');
const moves: any[] = sd('moves');
const items: any[] = sd('items');
const abilities: any[] = sd('abilities');
const learnsets: Record<string, string[]> = sd('learnsets');

// ---------- species ----------
const names = new Set(species.map(s => s.name));
const byName = new Map(species.map(s => [s.name, s]));
const dropped: { name: string; reason: string }[] = [];
const sameBattleData = (a: SdSpecies, b: SdSpecies) =>
  JSON.stringify([a.types, a.baseStats, a.abilities, a.weightkg]) === JSON.stringify([b.types, b.baseStats, b.abilities, b.weightkg]);

const dex = species.filter(s => {
  // Showdown leaves battle-only formes (e.g. Meloetta-Pirouette, Ogerpon-*-Tera) legal while the forme they
  // come from is not in Champions. (Floette-Eternal is standalone: its base Floette is absent but it is not battle-only.)
  const from = [s.battleOnly ?? []].flat()[0];
  if (from && !names.has(from)) {
    dropped.push({ name: s.name, reason: `battle-only forme of ${from}, which is not in Champions` });
    return false;
  }
  const base = byName.get(s.baseSpecies);
  if (base && s.forme && !/Mega/.test(s.forme) && !s.battleOnly && sameBattleData(s, base)) {
    dropped.push({ name: s.name, reason: `cosmetic forme of ${base.name} (identical types/stats/abilities/weight)` });
    return false;
  }
  return true;
}).map(s => ({
  id: s.id, name: s.name, num: s.num, baseSpecies: s.baseSpecies, forme: s.forme || null,
  isMega: /Mega/.test(s.forme), battleOnly: s.battleOnly, requiredItem: s.requiredItem,
  types: s.types, baseStats: s.baseStats, abilities: s.abilities, weightkg: s.weightkg, gender: s.gender,
}));
const dexIds = new Set(dex.map(s => s.id));

// ---------- moves ----------
// Champions PP: Showdown data/mods/champions/scripts.ts → base pp capped at 20, max PP = (pp/5+1)*4. Verified against Serebii list.
const champPP = (m: any) => (m.noPPBoosts ? m.pp : (m.pp / 5 + 1) * 4);
// Values where Serebii (in-game data) disagrees with Showdown; each entry is listed in docs/champions-diffs.md.
const MOVE_OVERRIDES: Record<string, Record<string, unknown>> = {
  doubleshock: { accuracy: true }, // Serebii moves.shtml + updatedattacks.shtml: "--" (SV: 100)
};
// Move roster = Serebii "Useable Moves". Showdown's champions mod also keeps Spore, Soft-Boiled, Power Shift,
// which Serebii omits and no Champions species learns.
const useable = new Set(serebiiMoves().map(m => toID(m.name)));
const notUseable = moves.filter(m => !useable.has(m.id)).map(m => m.name);
const championsMoves = moves.filter(m => useable.has(m.id)).map(m => ({
  id: m.id, name: m.name, num: m.num, type: m.type, category: m.category, basePower: m.basePower,
  accuracy: m.accuracy, pp: champPP(m), priority: m.priority, contact: !!m.flags.contact, target: m.target,
  multihit: m.multihit, damage: m.damage, ohko: m.ohko,
  flags: Object.keys(m.flags).filter(k => m.flags[k]).sort(),
  hasBasePowerCallback: m.hasBasePowerCallback, hasOnBasePower: m.hasOnBasePower, hasDamageCallback: m.hasDamageCallback,
  overrideOffensiveStat: m.overrideOffensiveStat, overrideOffensivePokemon: m.overrideOffensivePokemon,
  overrideDefensiveStat: m.overrideDefensiveStat, willCrit: m.willCrit,
  ...MOVE_OVERRIDES[m.id],
}));

const usedAbilities = new Set(dex.flatMap(s => Object.values(s.abilities)));
const championsAbilities = abilities.filter(a => usedAbilities.has(a.name));

// ---------- learnsets (only kept species; moves must exist — validate-data checks) ----------
const championsLearnsets = Object.fromEntries(Object.entries(learnsets).filter(([id]) => dexIds.has(id)));

// ---------- Korean names ----------
// Species: official Korean Pokédex first, PokeAPI (lang 3) as fallback. Rules in data/SOURCES.md.
const korea = koreaDex();
const koSpeciesByNum = new Map(csv('pokemon_species_names').filter(r => r.local_language_id === '3').map(r => [+r.pokemon_species_id, r.name]));
const pokemonRows = csv('pokemon');
const formRows = csv('pokemon_forms');
const koFormName = new Map(csv('pokemon_form_names').filter(r => r.local_language_id === '3').map(r => [r.pokemon_form_id, r.form_name]));
const pokeapiFormLabel = (s: { id: string; num: number }) => {
  const pk = pokemonRows.find(r => +r.species_id === s.num && pokeapiToShowdownId(r.identifier) === s.id);
  const form = pk && formRows.find(f => f.pokemon_id === pk.id && f.is_default === '1');
  return form && koFormName.get(form.id);
};
// Join key Showdown forme → label as written in the official Korean Pokédex. Only used if that exact label
// exists for that dex number in data/raw/pokemonkorea (so a wrong entry yields "missing", never a wrong name).
const FORME_LABEL: Record<string, string> = {
  Alola: '알로라의 모습', Galar: '가라르의 모습', Hisui: '히스이의 모습',
  'Paldea-Combat': '팔데아의 모습 / 컴뱃종', 'Paldea-Blaze': '팔데아의 모습 / 블레이즈종', 'Paldea-Aqua': '팔데아의 모습 / 워터종',
  Eternal: '영원의 꽃', F: '암컷의 모습', Heat: '히트로토무', Wash: '워시로토무', Frost: '프로스트로토무', Fan: '스핀로토무',
  Mow: '커트로토무', Blade: '블레이드폼', Midnight: '한밤중의 모습', Dusk: '황혼의 모습', 'Low-Key': '로우한 모습',
  Hangry: '배고픈 모양', Four: '네 식구', Yellow: '옐로 페더', White: '화이트 페더', Hero: '마이티폼',
};
const MEGA_SUFFIX: Record<string, string> = { Mega: '', 'Mega-X': 'X', 'Mega-Y': 'Y', 'Mega-Z': 'Z' };

const koSpecies: Record<string, string> = {};
for (const s of dex) {
  const rows = korea.filter(r => r.num === s.num);
  const base = rows.find(r => !r.name.startsWith('메가') || r.num === 154)?.name ?? koSpeciesByNum.get(s.num); // 154 = 메가니움
  if (!base) continue; // reported by validate-data
  if (!s.forme) { koSpecies[s.id] = base; continue; }
  if (s.isMega) {
    const suffix = MEGA_SUFFIX[s.forme.replace(/^[MF]-/, '')];
    const official = rows.find(r => r.name === `메가${base}${suffix}`)?.name;
    // Meowstic-M-Mega / -F-Mega: one official entry; disambiguate with the official gender labels
    const sex = s.forme.match(/^([MF])-/)?.[1];
    const sexLabel = sex && rows.find(r => r.label === (sex === 'M' ? '수컷의 모습' : '암컷의 모습'))?.label;
    if (official) koSpecies[s.id] = sexLabel ? `${official} (${sexLabel})` : official;
    continue;
  }
  const want = FORME_LABEL[s.forme];
  const label = (want && rows.some(r => r.label === want) ? want : undefined) ?? pokeapiFormLabel(s);
  if (label) koSpecies[s.id] = label.includes(base) ? label : `${base} (${label})`;
}

const koMoves = koByIdentifier('moves', 'move_names', 'move_id');
const koItems = koByIdentifier('items', 'item_names', 'item_id');
koItems.set('leek', koItems.get('stick')!); // PokeAPI still uses the pre-Gen-8 identifier "stick"
const koAbilities = koByIdentifier('abilities', 'ability_names', 'ability_id');
const supplement = readJSON('data/raw/manual/ko-supplement.json');
for (const [id, { ko }] of Object.entries<any>(supplement.abilities)) koAbilities.set(id, ko);
const koTypesById = koByIdentifier('types', 'type_names', 'type_id');
const pick = (list: { id: string }[], map: Map<string, string>) =>
  Object.fromEntries(list.filter(x => map.has(x.id)).map(x => [x.id, map.get(x.id)!]));

const koNames = {
  species: koSpecies,
  moves: pick(championsMoves, koMoves),
  items: pick(items, koItems),
  abilities: pick(championsAbilities, koAbilities),
  types: Object.fromEntries([...koTypesById].filter(([id]) => !['unknown', 'shadow', 'stellar'].includes(id))),
};

// ---------- usage (Smogon chaos, Showdown BSS ladder) ----------
// Showdown counts a Mega-stone holder as its Mega forme; we show candidates for the pre-Mega species, so each Mega is
// merged into its base: pct = Σ weight / Σ weighted count (= Σ ability weights). Entries < 1% are dropped.
// Abilities: a Mega's counts are its Mega ability (pre-Mega one unknown) → base-forme entries only, over their own count.
const chaos = readJSON('data/raw/smogon/gen9championsbssregmc-1500-2026-09.json').data as Record<string, any>;
const moveIds = new Set(championsMoves.map(m => m.id)), itemIds = new Set(items.map(i => i.id));
const abilityIds = new Set(championsAbilities.map(a => a.id));
type Fam = { n: number; nBase: number; moves: Record<string, number>; items: Record<string, number>; abilities: Record<string, number> };
const fam: Record<string, Fam> = {};
const usageUnknown: string[] = [];
const usageForeignAbility: string[] = []; // Showdown merges cosmetic formes (Squawkabilly colours) → their abilities land on the base
const add = (o: Record<string, number>, k: string, w: number) => { o[k] = (o[k] ?? 0) + w; };
for (const [name, x] of Object.entries(chaos)) {
  const sp = dex.find(s => s.id === toID(name));
  if (!sp) { usageUnknown.push(`species ${name}`); continue; }
  const f = (fam[sp.isMega ? toID([sp.battleOnly].flat()[0]!) : sp.id] ??= { n: 0, nBase: 0, moves: {}, items: {}, abilities: {} });
  const n = Object.values<number>(x.Abilities).reduce((a, b) => a + b, 0);
  f.n += n;
  for (const [m, w] of Object.entries<number>(x.Moves)) {
    if (!m) continue; // '' = empty slot
    if (!moveIds.has(m)) { usageUnknown.push(`move ${name}:${m}`); continue; }
    add(f.moves, m, w);
  }
  for (const [i, w] of Object.entries<number>(x.Items)) {
    const id = i === 'nothing' ? '' : i; // '' = no item
    if (id && !itemIds.has(id)) { usageUnknown.push(`item ${name}:${i}`); continue; }
    add(f.items, id, w);
  }
  if (sp.isMega) continue;
  f.nBase += n;
  for (const [a, w] of Object.entries<number>(x.Abilities)) {
    if (!abilityIds.has(a)) { usageUnknown.push(`ability ${name}:${a}`); continue; }
    if (!Object.values(sp.abilities).some(x => toID(x as string) === a)) { usageForeignAbility.push(`${name}:${a}`); continue; }
    add(f.abilities, a, w);
  }
}
const pcts = (o: Record<string, number>, n: number) => Object.entries(o)
  .map(([k, w]) => [k, Math.round((w / n) * 1000) / 10] as const).filter(([, p]) => p >= 1).sort((a, b) => b[1] - a[1]);
const usage = Object.fromEntries(Object.entries(fam).map(([id, f]) =>
  [id, { moves: pcts(f.moves, f.n), items: pcts(f.items, f.n), abilities: f.nBase ? pcts(f.abilities, f.nBase) : [] }]));

const out = (f: string, x: unknown) => writeFileSync(`data/${f}`, JSON.stringify(x, null, 1) + '\n');
out('champions-dex.json', dex);
out('champions-moves.json', championsMoves);
out('champions-learnsets.json', championsLearnsets);
out('items.json', items.map(i => ({ id: i.id, name: i.name, megaStone: i.megaStone })));
out('abilities.json', championsAbilities.map(a => ({ id: a.id, name: a.name })));
out('ko-names.json', koNames);
out('usage.json', usage);
out('build-log.json', { droppedSpecies: dropped, droppedMoves: notUseable, usageUnknown, usageForeignAbility });
console.log(`dex ${dex.length} (dropped ${dropped.length}) moves ${championsMoves.length} items ${items.length} abilities ${championsAbilities.length}`);
console.log(`usage ${Object.keys(usage).length} species (unknown ${usageUnknown.length})`);
for (const [k, v] of Object.entries(koNames)) console.log(`ko ${k}: ${Object.keys(v).length}`);
