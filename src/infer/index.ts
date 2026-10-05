// §5-4 opponent stat inference. Each observation ("opp's move took Z HP off me" / "my move took Z% off opp" /
// "opp moved before me") keeps
// only the candidates (SP, nature mod, item, ability) whose rolls contain the observed damage.
// Which dims matter is found per observation by trying them (does changing it change the rolls?). Candidates live in
// groups over disjoint dims — e.g. {atk,item} and {hp,def,ability} — so the space is a sum of small products, not one
// huge product. Groups are coupled only by SP total ≤ 66 and nature (at most one + and one −).
import { damage, finalSpeed } from '../calc/index';
import { SP_MAX, SP_TOTAL, type NatureMod } from '../calc/stats';
import { build, toField, Z } from '../battle/damage';
import { activeMon, toVarCtx, type Action, type Mon, type SideID, type State } from '../battle/state';
import { getAbility, getMove, getSpecies, ITEMS, NATURES, usage, type StatID, type Stats } from '../data/champions';

export type Dim = StatID | 'item' | 'ability';
export interface Cand { sp: Partial<Stats>; mod: Partial<Record<StatID, NatureMod>>; item?: string; ability?: string }
/** `items` = items tried explicitly. A cand with item '' = no item, or an item that mattered to none of this group's observations. */
export interface Group { dims: Dim[]; items: string[]; cands: Cand[] }
export interface Inference { species: string; groups: Group[] }

export type Obs = HitObs | SpeedObs;
export interface HitObs {
  state: State;  // just before the hit
  attacker: SideID;
  move: string;
  dmg: number;   // attacker 'opp': my HP lost (exact). attacker 'me': opp HP % lost
  crit?: boolean;
  hits?: number; // multi-hit moves
}
/** Both sides used a move of the same priority this turn; `first` acted first. state = before the turn's first move. */
export interface SpeedObs { state: State; first: SideID }

/** Opp HP is read as whole % before and after the hit. The game rounds the shown % to the nearest integer (user-measured
 *  2026-10-05) → each reading is off by ≤ 0.5, the difference by < 1. */
export const PCT_TOL = 1;

const STATS: StatID[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
// Berries and Gems announce themselves when they act, so an unrevealed one didn't touch the hit. Mega Stones: no damage effect.
const SILENT_ITEMS = ITEMS.filter(i => !i.megaStone && !/ (Berry|Gem)$/.test(i.name)).map(i => i.id);

const spSum = (c: Cand) => Object.values(c.sp).reduce((a, b) => a + b!, 0);
function natureOk(mod: Cand['mod']) {
  const v = Object.entries(mod).filter(([s]) => s !== 'hp').map(([, m]) => m);
  const plus = v.filter(m => m === 1.1).length, minus = v.filter(m => m === 0.9).length;
  return plus <= 1 && minus <= 1 && (v.length < 5 || plus === minus);
}
const ok = (c: Cand) => natureOk(c.mod) && spSum(c) <= SP_TOTAL;

/** A real nature with these mods; the unset side goes on a stat outside `mod` (so it can't matter to the hit). */
function natureFor(mod: Cand['mod']) {
  const plus = STATS.find(s => mod[s] === 1.1), minus = STATS.find(s => mod[s] === 0.9);
  const free = STATS.find(s => s !== 'hp' && mod[s] === undefined);
  const p = plus ?? (minus ? free : undefined), m = minus ?? (plus ? free : undefined);
  return NATURES.find(n => (p ? n.plus === p && n.minus === m : n.plus === n.minus))!.name;
}

const merge = (a: Cand, b: Partial<Cand>): Cand =>
  ({ sp: { ...a.sp, ...b.sp }, mod: { ...a.mod, ...b.mod }, item: a.item ?? b.item, ability: a.ability ?? b.ability });

function project(g: Group, dim: 'item' | 'ability'): Group {
  const seen = new Map(g.cands.map(c => { const { [dim]: _, ...rest } = c; return [JSON.stringify(rest), rest as Cand]; }));
  return { dims: g.dims.filter(d => d !== dim), items: dim === 'item' ? [] : g.items, cands: [...seen.values()] };
}

/** Possible damage totals for a candidate (multi-hit: every sum of per-hit rolls). Attacker 'me' → % of opp max HP.
 *  Speed observation → [opp Speed − mine], negated under Trick Room (≥ 0 = opp may act first). */
function evaluator(o: Obs) {
  const s = o.state, mine = activeMon(s, 'me'), opp = activeMon(s, 'opp');
  if (!mine || !opp) throw new Error('No active Pokémon');
  const oppAs = (c: Cand) => build(s, 'opp', { ...opp, item: c.item ?? opp.item, ability: c.ability ?? opp.ability },
    { sp: { ...Z, ...c.sp }, nature: natureFor(c.mod) });
  if ('first' in o) {
    const field = toField(s, 'opp'), tr = s.field.isTrickRoom ? -1 : 1;
    const mySpe = finalSpeed(build(s, 'me', mine), field, 'defenderSide');
    return (c: Cand) => [tr * (finalSpeed(oppAs(c), field) - mySpe)];
  }
  const field = toField(s, o.attacker), ctx = toVarCtx(s, o.attacker);
  const opts = { isCrit: !!o.crit, ...(o.hits ? { hits: o.hits } : {}) } as any;
  return (c: Cand) => {
    const [A, D] = o.attacker === 'opp' ? [oppAs(c), build(s, 'me', mine)] : [build(s, 'me', mine), oppAs(c)];
    const r = damage(A, D, o.move, field, ctx, opts).damage as number | number[] | number[][];
    const hits = typeof r === 'number' ? [[r]] : Array.isArray(r[0]) ? (r as number[][]) : [r as number[]];
    const totals = hits.reduce<number[]>((acc, h) => [...new Set(acc.flatMap(a => h.map(x => a + x)))], [0]).sort((a, b) => a - b);
    return o.attacker === 'opp' ? totals : totals.map(t => (t / D.maxHP()) * 100);
  };
}

/** Drop candidates no choice of the other groups can complete within SP 66 and one +/− nature. Repeats to a fixpoint. */
function couple(groups: Group[]): Group[] {
  const use = (c: Cand) => (Object.values(c.mod).includes(1.1) ? 1 : 0) | (Object.values(c.mod).includes(0.9) ? 2 : 0);
  for (let changed = true; changed;) {
    changed = false;
    const best = groups.map(g => g.cands.reduce((b, c) => (b[use(c)] = Math.min(b[use(c)], spSum(c)), b), [Infinity, Infinity, Infinity, Infinity]));
    groups = groups.map((g, i) => {
      let acc = [0, Infinity, Infinity, Infinity]; // min SP of the other groups, by nature bits used
      best.forEach((b, j) => {
        if (j === i) return;
        const next = [Infinity, Infinity, Infinity, Infinity];
        for (let u = 0; u < 4; u++) for (let v = 0; v < 4; v++) if (!(u & v)) next[u | v] = Math.min(next[u | v], acc[u] + b[v]);
        acc = next;
      });
      const cands = g.cands.filter(c => acc.some((v, u) => !(u & use(c)) && spSum(c) + v <= SP_TOTAL));
      if (cands.length !== g.cands.length) changed = true;
      return { ...g, cands };
    });
  }
  return groups;
}

/** Apply what the opponent has revealed since (item / ability → drop that dim). Mega Evolution changed the ability;
 *  SP / nature / item knowledge carries over. */
function normalize(inf: Inference | undefined, opp: Mon): Group[] {
  let groups = !inf ? [] : inf.species === opp.species ? inf.groups : inf.groups.map(g => project(g, 'ability'));
  if (opp.item !== undefined) groups = groups.map(g => !g.dims.includes('item') ? g
    : project({ ...g, cands: g.cands.filter(c => c.item === opp.item || (c.item === '' && !g.items.includes(opp.item!))) }, 'item'));
  if (opp.ability !== undefined) groups = groups.map(g => !g.dims.includes('ability') ? g
    : project({ ...g, cands: g.cands.filter(c => c.ability === opp.ability) }, 'ability'));
  return groups;
}

/** Dims the hit depends on: does changing it (SP 0→32, item, ability) change the rolls? */
function relevance(ev: (c: Cand) => number[], opp: Mon) {
  const key = (c: Partial<Cand>) => ev({ sp: {}, mod: {}, ...c }).join();
  const base = key({});
  const R: Dim[] = STATS.filter(s => key({ sp: { [s]: SP_MAX } }) !== base);
  const noItem = opp.item === undefined ? key({ item: '' }) : '';
  const itemRel = opp.item === undefined ? SILENT_ITEMS.filter(i => key({ item: i }) !== noItem) : [];
  if (itemRel.length) R.push('item');
  const abilities = Object.values(getSpecies(opp.species)!.abilities).map(a => getAbility(a)!.id);
  if (opp.ability === undefined && new Set(abilities.map(ability => key({ ability }))).size > 1) R.push('ability');
  // A candidate reduced to the dims that matter (items that don't matter here act as none)
  const probe = (c: Cand): Cand => {
    const pick = <T>(o: Partial<Record<StatID, T>>) => Object.fromEntries(Object.entries(o).filter(([s]) => R.includes(s as Dim)));
    return { sp: pick(c.sp), mod: pick(c.mod),
      item: R.includes('item') && c.item !== undefined ? (itemRel.includes(c.item) ? c.item : '') : undefined,
      ability: R.includes('ability') ? c.ability : undefined };
  };
  return { R, itemRel, abilities, probe };
}

/** Does an evaluator result agree with the observation? Speed ties go either way. */
function fitter(o: Obs): (v: number[]) => boolean {
  if ('first' in o) return v => (o.first === 'opp' ? v[0] >= 0 : v[0] <= 0);
  const defHp = activeMon(o.state, o.attacker === 'opp' ? 'me' : 'opp')!.hp;
  const ko = o.dmg >= defHp; // overkill: the rolls only need to reach it
  return v => o.attacker === 'opp'
    ? v.includes(o.dmg) || (ko && v[v.length - 1] >= o.dmg)
    : v.some(x => Math.abs(x - o.dmg) <= PCT_TOL) || (ko && v[v.length - 1] >= o.dmg - PCT_TOL);
}

/** Narrow `inf` (undefined = no observation yet) by one observation of the opponent's active Pokémon. */
export function observe(inf: Inference | undefined, o: Obs): Inference {
  const opp = activeMon(o.state, 'opp')!, ev = evaluator(o), fits = fitter(o);
  const groups = normalize(inf, opp);
  const { R, itemRel, abilities, probe } = relevance(ev, opp);

  // Merge the groups sharing those dims, then expand the dims no group has yet
  const hit = groups.filter(g => g.dims.some(d => R.includes(d)));
  let cands: Cand[] = [{ sp: {}, mod: {} }];
  const dims: Dim[] = [], items: string[] = [];
  for (const g of hit) {
    cands = cands.flatMap(a => g.cands.map(b => merge(a, b))).filter(ok);
    dims.push(...g.dims); items.push(...g.items);
  }
  for (const d of R.filter(d => !dims.includes(d))) {
    const vals: Partial<Cand>[] = d === 'item' ? ['', ...itemRel].map(item => ({ item }))
      : d === 'ability' ? abilities.map(ability => ({ ability }))
      : Array.from({ length: SP_MAX + 1 }, (_, sp) => sp).flatMap(sp =>
          (d === 'hp' ? [undefined] : [0.9, 1, 1.1] as const).map(m => ({ sp: { [d]: sp }, mod: m ? { [d]: m } : {} })));
    cands = cands.flatMap(c => vals.map(v => merge(c, v))).filter(ok);
    dims.push(d);
  }
  if (R.includes('item')) {
    const fresh = itemRel.filter(i => !items.includes(i));
    if (hit.some(g => g.dims.includes('item')))
      cands = cands.flatMap(c => (c.item === '' ? [c, ...fresh.map(item => ({ ...c, item }))] : [c]));
    items.push(...fresh);
  }

  // Keep candidates whose rolls contain the observation (memo on the dims that matter)
  const memo = new Map<string, boolean>();
  cands = cands.filter(c => {
    const p = probe(c), k = JSON.stringify(p);
    if (!memo.has(k)) memo.set(k, fits(ev(p)));
    return memo.get(k)!;
  });

  const rest = groups.filter(g => !hit.includes(g));
  // A dim-less observation (fixed damage…) only matters if it contradicts everything → keep an empty group as the alarm
  const merged = dims.length || !cands.length ? [{ dims, items, cands }] : [];
  return { species: opp.species, groups: couple([...rest, ...merged]) };
}

/** Damage (% of the defender's max HP) of `move` over the inferred candidates. undefined = the hit depends on an opp
 *  stat nothing has been inferred about yet (caller falls back to its assumed spreads). */
export function inferredRange(inf: Inference, state: State, attacker: SideID, move: string): [number, number] | undefined {
  const r = evalRange(inf, state, evaluator({ state, attacker, move, dmg: 0 }));
  const k = attacker === 'opp' ? 100 / activeMon(state, 'me')!.maxHp : 1;
  return r && [r[0] * k, r[1] * k];
}

/** Opp final Speed − mine over the inferred candidates (negated under Trick Room: > 0 = opp acts first).
 *  undefined = opp Speed not inferred yet. */
export function inferredSpeed(inf: Inference, state: State): [number, number] | undefined {
  return evalRange(inf, state, evaluator({ state, first: 'me' }));
}

/** [min, max] of the evaluator over the inferred candidates; undefined when a relevant opp stat is un-inferred. */
function evalRange(inf: Inference, state: State, ev: (c: Cand) => number[]): [number, number] | undefined {
  const opp = activeMon(state, 'opp')!;
  const groups = normalize(inf, opp);
  const { R, probe } = relevance(ev, opp);
  const stats = R.filter(d => STATS.includes(d as StatID));
  const hit = groups.filter(g => g.dims.some(d => R.includes(d)));
  if (!stats.length || !stats.every(s => hit.some(g => g.dims.includes(s)))) return;
  // ponytail: plain product of the touched groups (usually one); fine at a few thousand candidates
  const cands = hit.reduce<Cand[]>((acc, g) => acc.flatMap(a => g.cands.map(b => merge(a, b))).filter(ok), [{ sp: {}, mod: {} }]);
  const probes = new Map(cands.map(c => { const p = probe(c); return [JSON.stringify(p), p]; }));
  let min = Infinity, max = -Infinity;
  for (const p of probes.values()) {
    const v = ev(p);
    min = Math.min(min, v[0]); max = Math.max(max, v[v.length - 1]);
  }
  return Number.isFinite(min) ? [min, max] : undefined;
}

export interface Summary {
  count: number; // product of group sizes; 0 = observations contradict each other (input error?)
  stats: Partial<Record<StatID, { min: number; max: number; mods: NatureMod[] }>>;
  items?: string[];     // '' = none / an item that didn't matter
  abilities?: string[];
  /** One per group × (item, ability) candidate: SP [min, max] per nature mod of each stat dim. */
  lines: SummaryLine[];
}
/** `p` = usage-prior share of this (item, ability) among its group's lines; absent when the group has neither dim. */
export interface SummaryLine { item?: string; ability?: string; p?: number; stats: Partial<Record<StatID, Partial<Record<NatureMod, [number, number]>>>> }

export function summarize(inf: Inference): Summary {
  const out: Summary = { count: inf.groups.reduce((n, g) => n * g.cands.length, 1), stats: {}, lines: [] };
  for (const g of inf.groups) {
    const lines = new Map<string, SummaryLine>();
    for (const c of g.cands) {
      const key = `${c.item}|${c.ability}`;
      const l = lines.get(key) ?? lines.set(key, { item: c.item, ability: c.ability, stats: {} }).get(key)!;
      for (const [s, sp] of Object.entries(c.sp) as [StatID, number][]) {
        const byMod = (l.stats[s] ??= {}), m = c.mod[s] ?? 1, r = byMod[m];
        byMod[m] = r ? [Math.min(r[0], sp), Math.max(r[1], sp)] : [sp, sp];
      }
    }
    out.lines.push(...withPrior(inf.species, g, [...lines.values()]));
  }
  for (const g of inf.groups) for (const c of g.cands) {
    for (const [s, sp] of Object.entries(c.sp) as [StatID, number][]) {
      const r = (out.stats[s] ??= { min: sp, max: sp, mods: [] });
      r.min = Math.min(r.min, sp); r.max = Math.max(r.max, sp);
      const m = c.mod[s] ?? 1;
      if (!r.mods.includes(m)) r.mods.push(m);
    }
    if (c.item !== undefined && !(out.items ??= []).includes(c.item)) out.items.push(c.item);
    if (c.ability !== undefined && !(out.abilities ??= []).includes(c.ability)) out.abilities.push(c.ability);
  }
  for (const r of Object.values(out.stats)) r!.mods.sort();
  return out;
}

/** Smogon BSS usage as a prior over a group's (item, ability) lines. Item '' (none, or one that didn't matter) gets
 *  100 − Σ usage of the items that did matter. ponytail: SP spread isn't weighted (no Champions spread data); items /
 *  abilities treated as independent. Unlisted (< 1%) → 0.5. */
function withPrior(species: string, g: Group, lines: SummaryLine[]): SummaryLine[] {
  if (!g.dims.includes('item') && !g.dims.includes('ability')) return lines;
  const u = usage(species), pct = (l: [string, number][], id: string) => l.find(x => x[0] === id)?.[1] ?? 0.5;
  const itemP = (id: string) => id ? pct(u.items, id) : Math.max(0.5, 100 - g.items.reduce((a, i) => a + pct(u.items, i), 0));
  const w = lines.map(l => (l.item === undefined ? 1 : itemP(l.item)) * (l.ability === undefined ? 1 : pct(u.abilities, l.ability)));
  const sum = w.reduce((a, b) => a + b, 0);
  return lines.map((l, i) => ({ ...l, p: w[i] / sum })).sort((a, b) => b.p! - a.p!);
}

/** Possible priorities of `move` for side's active Pokémon over its possible abilities (NaN = Stall: order unknown). */
export function priorities(s: State, side: SideID, move: string): number[] {
  const mon = activeMon(s, side)!, m = getMove(move)!;
  const base = m.priority + (m.id === 'grassyglide' && s.field.terrain === 'Grassy' ? 1 : 0);
  const abilities = mon.ability ? [mon.ability] : Object.values(getSpecies(mon.species)!.abilities).map(a => getAbility(a)!.id);
  return [...new Set(abilities.map(a => a === 'stall' ? NaN : base
    + ((a === 'prankster' && m.category === 'Status') || (a === 'galewings' && m.type === 'Flying' && mon.hp === mon.maxHp) ? 1 : 0)))];
}

/** The observation recorded by log[i], if any. `states[i]` = state before log[i].
 *  - damage entry with hits ≥ 1, caused by the other side's last successful damaging move this turn;
 *  - a side's first move this turn after the other side's first move, same (certain) priority, no switch in between.
 *  ponytail: Quick Claw / Quick Draw activations aren't logged; they'd show up as a contradiction (0 candidates). */
export function obsFromLog(log: Action[], states: State[], i: number): Obs | undefined {
  const a = log[i];
  if (a.type === 'move') {
    let k = -1;
    for (let j = i - 1; j >= 0 && log[j].type !== 'endTurn'; j--) {
      const b = log[j];
      if (b.type === 'move' && b.side === a.side) return;
      if (b.type === 'switch' && k < 0) return; // someone switched between the two moves (U-turn, Roar…)
      if (b.type === 'move') k = j;
    }
    if (k < 0) return;
    const pa = priorities(states[k], a.side, a.move), pb = priorities(states[k], (log[k] as { side: SideID }).side, (log[k] as { move: string }).move);
    if (pa.length !== 1 || pb.length !== 1 || pa[0] !== pb[0]) return;
    return { state: states[k], first: a.side === 'me' ? 'opp' : 'me' };
  }
  if (a.type !== 'damage' || (a.hits ?? 1) === 0) return;
  const attacker: SideID = a.side === 'me' ? 'opp' : 'me';
  let move: string | undefined;
  for (let j = i - 1; j >= 0 && log[j].type !== 'endTurn' && !move; j--) {
    const b = log[j];
    if (b.type === 'move' && b.side === attacker) move = b.failed ? '' : b.move;
  }
  if (!move || getMove(move)?.category === 'Status') return;
  const state = states[i], dmg = activeMon(state, a.side)!.hp - Math.max(0, a.hp);
  if (dmg <= 0) return;
  return { state, attacker, move, dmg, crit: a.crit, ...((a.hits ?? 1) > 1 ? { hits: a.hits } : {}) };
}
