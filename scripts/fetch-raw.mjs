// Downloads raw source data into data/raw/. Pinned commits → reproducible.
// Usage: npm run fetch-raw [-- serebii|pokeapi|pokemonkorea|showdown|usage]   (needs git + network; Showdown clone cached in node_modules/.cache)
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const SHOWDOWN_SHA = '9fb3a5b99f1a0bea17f495c5cc1bfe04fdd19c3e';
const POKEAPI_SHA = 'bc92d3b6029ef1abe9e7ad424c400b338f3c11fe';
const SEREBII_PAGES = ['pokemon', 'moves', 'items', 'updatedattacks', 'newabilities', 'megaabilities',
  'statusconditions', 'training', 'rankedbattle', 'patch', 'transferonly'];
const POKEAPI_CSVS = ['pokemon', 'pokemon_species', 'pokemon_forms', 'pokemon_species_names', 'pokemon_form_names',
  'pokemon_stats', 'pokemon_types', 'types', 'type_names', 'moves', 'move_names', 'items', 'item_names',
  'abilities', 'ability_names', 'move_meta'];

// Serebii lists species only; these per-species dex pages are the evidence for alternate formes.
const SEREBII_DEX = ['castform', 'rotom', 'vivillon', 'meowstic', 'aegislash', 'gourgeist', 'lycanroc', 'mimikyu',
  'toxtricity', 'polteageist', 'alcremie', 'indeedee', 'morpeko', 'basculegion', 'maushold', 'squawkabilly',
  'palafin', 'sinistcha', 'meloetta', 'minior', 'cramorant', 'eiscue', 'ogerpon', 'terapagos'];

// Smogon usage stats (Showdown ladder, not in-game ranked). Format = Battle Stadium Singles of the current regulation.
const USAGE = { month: '2026-09', format: 'gen9championsbssregmc', cutoff: 1500 };
const RAW = path.resolve('data/raw');
const only = process.argv[2];
const want = s => !only || only === s;
const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });
const mk = d => (mkdirSync(d, { recursive: true }), d);

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

// --- Serebii ---
if (want('serebii')) {
  const ser = mk(path.join(RAW, 'serebii'));
  for (const p of SEREBII_PAGES) writeFileSync(path.join(ser, `${p}.shtml`), await get(`https://www.serebii.net/pokemonchampions/${p}.shtml`));
  const dex = mk(path.join(ser, 'dex'));
  for (const p of SEREBII_DEX) {
    const r = await fetch(`https://www.serebii.net/pokedex-champions/${p}/`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    writeFileSync(path.join(dex, `${p}.shtml`), Buffer.from(await r.arrayBuffer())); // 404 page kept on purpose: evidence of absence
  }
}

// --- Smogon usage (chaos JSON, saved as-is) ---
if (want('usage')) {
  const { month, format, cutoff } = USAGE;
  writeFileSync(path.join(mk(path.join(RAW, 'smogon')), `${format}-${cutoff}-${month}.json`),
    await get(`https://www.smogon.com/stats/${month}/chaos/${format}-${cutoff}.json`));
}

// --- Bulbapedia (raw wikitext; the HTML pages return 403 to scripts) ---
const BULBAPEDIA = ['Stat_point', 'Pokémon_Champions', 'Rage_Fist_(move)', 'Regulation_Set_M-C'];
if (want('bulbapedia')) {
  const bp = mk(path.join(RAW, 'bulbapedia'));
  for (const p of BULBAPEDIA) {
    // curl, not fetch: Bulbapedia's bot filter 403s Node's fetch
    const url = `https://bulbapedia.bulbagarden.net/w/index.php?title=${encodeURIComponent(p)}&action=raw`;
    sh(`curl -sfL -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -o "${path.join(bp, p.replace(/[^\w()-]/g, '_'))}.wiki" "${url}"`);
  }
}

// --- Official Korean Pokédex (form labels PokeAPI lacks) ---
if (want('pokemonkorea')) {
  const pages = [];
  for (let pn = 1; ; pn++) {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ mode: 'load_more', word: '', characters: '', pn, area: '', snumber: 1, snumber2: 1025,
      sortselval: 'number asc,number_count asc', typestr: '' })) fd.append(k, String(v));
    const r = await fetch('https://pokemonkorea.co.kr/ajax/pokedex', { method: 'POST', body: fd,
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://pokemonkorea.co.kr/pokedex' } });
    const html = (await r.text()).split('#|#')[1] ?? '';
    if (!html.includes('No.0')) break;
    pages.push(html);
  }
  writeFileSync(path.join(mk(path.join(RAW, 'pokemonkorea')), 'pokedex.html'), pages.join('\n'));
}

// --- PokeAPI CSV ---
if (want('pokeapi')) {
  const pa = mk(path.join(RAW, 'pokeapi'));
  for (const f of POKEAPI_CSVS) writeFileSync(path.join(pa, `${f}.csv`), await get(`https://raw.githubusercontent.com/PokeAPI/pokeapi/${POKEAPI_SHA}/data/v2/csv/${f}.csv`));
}

if (want('showdown')) {
// --- Showdown (champions mod, dumped through its own Dex so inheritance is resolved by Showdown itself) ---
const ps = path.resolve('node_modules/.cache/pokemon-showdown');
if (!existsSync(ps)) {
  mk(ps);
  sh('git init -q', ps);
  sh('git remote add origin https://github.com/smogon/pokemon-showdown.git', ps);
}
sh(`git fetch -q --depth 1 origin ${SHOWDOWN_SHA}`, ps);
sh(`git checkout -q ${SHOWDOWN_SHA}`, ps);
sh('npm i --silent --ignore-scripts', ps);
sh('node build', ps);
const { Dex } = createRequire(import.meta.url)(path.join(ps, 'dist/sim'));
const d = Dex.mod('champions');
const legal = x => x.exists && !x.isNonstandard;

const species = d.species.all().filter(legal).map(s => ({
  id: s.id, name: s.name, num: s.num, baseSpecies: s.baseSpecies, forme: s.forme, types: s.types,
  baseStats: s.baseStats, abilities: s.abilities, weightkg: s.weightkg, requiredItem: s.requiredItem ?? null,
  changesFrom: s.changesFrom ?? null, battleOnly: s.battleOnly ?? null, gender: s.gender || null, tier: s.tier,
}));
const moves = d.moves.all().filter(legal).map(m => ({
  id: m.id, name: m.name, num: m.num, type: m.type, category: m.category, basePower: m.basePower,
  accuracy: m.accuracy, pp: m.pp, priority: m.priority, flags: m.flags, target: m.target,
  multihit: m.multihit ?? null, damage: m.damage ?? null, ohko: m.ohko ?? false,
  hasBasePowerCallback: !!m.basePowerCallback, hasOnBasePower: !!m.onBasePower, hasDamageCallback: !!m.damageCallback,
  overrideOffensiveStat: m.overrideOffensiveStat ?? null, overrideOffensivePokemon: m.overrideOffensivePokemon ?? null,
  overrideDefensiveStat: m.overrideDefensiveStat ?? null, willCrit: m.willCrit ?? false,
  noPPBoosts: m.noPPBoosts ?? false, secondaries: m.secondaries ?? null,
}));
const items = d.items.all().filter(legal).map(i => ({
  id: i.id, name: i.name, num: i.num, megaStone: i.megaStone ?? null,
}));
// Abilities: legal ones plus any a legal species has — Showdown leaves e.g. Aura Guard (Lucario-Mega-Z) flagged nonstandard.
const speciesAbilities = new Set(species.flatMap(s => Object.values(s.abilities)));
const abilities = d.abilities.all().filter(a => a.exists && (!a.isNonstandard || speciesAbilities.has(a.name)))
  .map(a => ({ id: a.id, name: a.name, num: a.num, isNonstandard: a.isNonstandard ?? null }));
const learnsets = {};
for (const s of d.species.all().filter(legal)) {
  learnsets[s.id] = [...d.species.getMovePool(s.id)].sort(); // Showdown resolves prevo/forme inheritance
}
// gen9 (SV) base dex for "is this a Champions change vs mainline?" diffing
const sv = Dex.mod('gen9');
const svSpecies = Object.fromEntries(species.map(s => sv.species.get(s.id)).filter(x => x.exists)
  .map(s => [s.id, { types: s.types, baseStats: s.baseStats, abilities: s.abilities }]));
const svMoves = Object.fromEntries(moves.map(m => sv.moves.get(m.id)).filter(x => x.exists)
  .map(m => [m.id, { type: m.type, category: m.category, basePower: m.basePower, accuracy: m.accuracy, pp: m.pp, priority: m.priority }]));

const out = mk(path.join(RAW, 'showdown'));
const w = (f, x) => writeFileSync(path.join(out, f), JSON.stringify(x, null, 1));
w('species.json', species); w('moves.json', moves); w('items.json', items); w('abilities.json', abilities);
w('learnsets.json', learnsets); w('gen9-species.json', svSpecies); w('gen9-moves.json', svMoves);
console.log(`species ${species.length} moves ${moves.length} items ${items.length} abilities ${abilities.length} learnsets ${Object.keys(learnsets).length}`);
}

if (!only) writeFileSync(path.join(RAW, 'FETCHED.txt'),
  `fetched ${new Date().toISOString()}\nshowdown ${SHOWDOWN_SHA}\npokeapi ${POKEAPI_SHA}\nserebii ${SEREBII_PAGES.join(',')}\n`);
