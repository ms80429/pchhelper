import { describe, expect, it } from 'vitest';
import { damage, makePokemon } from '../../src/calc';
import { newBattle, replay, type Action } from '../../src/battle/state';
import { inferredRange, inferredSpeed, obsFromLog, observe, summarize, type Inference } from '../../src/infer';
import { apply } from '../../src/battle/state';
import { moveRange } from '../../src/battle/damage';
import { calcStats } from '../../src/calc/stats';
import { getSpecies, natureMods, usage, type Stats } from '../../src/data/champions';

const SP = { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 };
const maxHp = calcStats(getSpecies('garchomp')!.baseStats, SP).hp;
const init = newBattle([{ species: 'garchomp', maxHp, moves: ['dragonclaw'], item: '', ability: 'roughskin', sp: SP, nature: 'Adamant' }], ['dragonite']);
const run = (...log: Action[]) => replay(init, [{ type: 'switch', side: 'me', slot: 0 }, { type: 'switch', side: 'opp', slot: 0 }, ...log]);
const me = () => makePokemon('garchomp', { sp: SP, nature: 'Adamant', ability: 'Rough Skin' });

// The opponent's real set (SP total 66).
const TRUE = { sp: { hp: 32, atk: 20, def: 14, spa: 0, spd: 0, spe: 0 } as Stats, nature: 'Adamant', ability: 'Inner Focus', item: '' };
const opp = (o: { item?: string } = {}) => makePokemon('dragonite', { sp: TRUE.sp, nature: TRUE.nature, ability: TRUE.ability, ...o });
const rolls = (r: ReturnType<typeof damage>) => r.damage as number[];

/** The true set survives iff every group still holds a candidate agreeing with it on that group's dims. */
function holds(inf: Inference, item = TRUE.item) {
  const mods = natureMods(TRUE.nature);
  return inf.groups.every(g => g.cands.some(c =>
    Object.entries(c.sp).every(([s, v]) => TRUE.sp[s as keyof Stats] === v)
    && Object.entries(c.mod).every(([s, v]) => (mods[s as keyof Stats] ?? 1) === v)
    && (c.ability === undefined || c.ability === 'innerfocus')
    && (c.item === undefined || c.item === item || (c.item === '' && !g.items.includes(item)))));
}
const size = (inf: Inference) => inf.groups.reduce((n, g) => n * g.cands.length, 1);

describe('infer: opponent hits me (exact HP lost)', () => {
  const dmg = rolls(damage(opp(), me(), 'outrage'))[7];
  const inf = observe(undefined, { state: run(), attacker: 'opp', move: 'outrage', dmg });

  it('true set survives; only Atk (and item/ability if they matter) is constrained', () => {
    expect(holds(inf)).toBe(true);
    const s = summarize(inf);
    expect(s.stats.atk!.min).toBeLessThanOrEqual(20);
    expect(s.stats.atk!.max).toBeGreaterThanOrEqual(20);
    expect(s.stats.hp).toBeUndefined();
    expect(s.stats.def).toBeUndefined();
    expect(s.count).toBeGreaterThan(0);
  });

  it('a second observation intersects', () => {
    const s2 = run({ type: 'boost', side: 'opp', stat: 'atk', delta: 1 });
    const A = opp(); A.boosts.atk = 1;
    const inf2 = observe(inf, { state: s2, attacker: 'opp', move: 'outrage', dmg: rolls(damage(A, me(), 'outrage'))[0] });
    expect(holds(inf2)).toBe(true);
    expect(size(inf2)).toBeLessThanOrEqual(size(inf));
  });

  it('impossible damage → 0 candidates', () => {
    expect(summarize(observe(undefined, { state: run(), attacker: 'opp', move: 'outrage', dmg: 1 })).count).toBe(0);
  });

  it('crit flag reaches calc', () => {
    const crit = rolls(damage(opp(), me(), 'outrage', {}, {}, { isCrit: true }))[15];
    expect(holds(observe(undefined, { state: run(), attacker: 'opp', move: 'outrage', dmg: crit, crit: true }))).toBe(true);
  });

  it('unrevealed Life Orb is a candidate; revealing the item drops the item dim', () => {
    const lo = rolls(damage(opp({ item: 'Life Orb' }), me(), 'outrage'))[15];
    const a = observe(undefined, { state: run(), attacker: 'opp', move: 'outrage', dmg: lo });
    expect(holds(a, 'lifeorb')).toBe(true);
    expect(summarize(a).items).toContain('lifeorb');
    const b = observe(a, { state: run({ type: 'reveal', side: 'opp', item: 'lifeorb' }), attacker: 'opp', move: 'outrage', dmg: lo });
    expect(summarize(b).items).toBeUndefined();
    expect(holds(b, 'lifeorb')).toBe(true);
  });

  it('multi-hit: total = sum of independent per-hit rolls', () => {
    const [h1, h2] = damage(opp(), me(), 'scaleshot', {}, {}, { hits: 2 } as any).damage as unknown as number[][];
    const ok = observe(undefined, { state: run(), attacker: 'opp', move: 'scaleshot', hits: 2, dmg: h1[0] + h2[15] });
    expect(holds(ok)).toBe(true);
    expect(summarize(observe(undefined, { state: run(), attacker: 'opp', move: 'scaleshot', hits: 2, dmg: h1[15] })).count).toBe(0);
  });
});

describe('infer: I hit the opponent (HP %)', () => {
  const D = opp();
  const pct = Math.round(rolls(damage(me(), D, 'dragonclaw'))[8] / D.maxHP() * 100);
  const state = run({ type: 'reveal', side: 'opp', ability: 'innerfocus' }); // Multiscale would otherwise be a candidate at full HP
  const inf = observe(undefined, { state, attacker: 'me', move: 'dragonclaw', dmg: pct });

  it('true set survives; HP and Def constrained', () => {
    expect(holds(inf)).toBe(true);
    const s = summarize(inf);
    expect(s.stats.hp).toBeDefined();
    expect(s.stats.def).toBeDefined();
    expect(s.stats.atk).toBeUndefined();
  });

  it('unrevealed ability at full HP: Multiscale becomes a candidate dim', () => {
    const a = observe(undefined, { state: run(), attacker: 'me', move: 'dragonclaw', dmg: pct });
    expect(summarize(a).abilities).toContain('innerfocus');
    expect(holds(a)).toBe(true);
  });

  it('SP total 66 couples groups', () => {
    const atkDmg = rolls(damage(opp(), me(), 'outrage'))[7];
    const both = observe(inf, { state: run(), attacker: 'opp', move: 'outrage', dmg: atkDmg });
    expect(holds(both)).toBe(true);
    const minSp = (cands: { sp: Partial<Stats> }[]) => Math.min(...cands.map(c => Object.values(c.sp).reduce((a, b) => a + b!, 0)));
    for (const g of both.groups) {
      const others = both.groups.filter(h => h !== g).reduce((n, h) => n + minSp(h.cands), 0);
      expect(minSp(g.cands) + others).toBeLessThanOrEqual(66);
      for (const c of g.cands) expect(Object.values(c.sp).reduce((a, b) => a + b!, 0) + others).toBeLessThanOrEqual(66);
    }
  });
});

describe('infer: battle wiring', () => {
  it('inferredRange of the observed move contains the observation and is narrower than the bracket', () => {
    const dmg = rolls(damage(opp(), me(), 'outrage'))[7];
    const inf = observe(undefined, { state: run(), attacker: 'opp', move: 'outrage', dmg });
    const r = inferredRange(inf, run(), 'opp', 'outrage')!;
    const pct = dmg / maxHp * 100;
    expect(r[0]).toBeLessThanOrEqual(pct);
    expect(r[1]).toBeGreaterThanOrEqual(pct);
    expect(moveRange(run(), 'opp', 'outrage', r)!.inferred).toBe(true);
    expect(inferredRange(inf, run(), 'me', 'dragonclaw')).toBeUndefined(); // HP/Def not inferred yet
  });

  it('obsFromLog: damage after the other side move this turn; hits 0 / no move → none', () => {
    const log: Action[] = [{ type: 'switch', side: 'me', slot: 0 }, { type: 'switch', side: 'opp', slot: 0 },
      { type: 'move', side: 'opp', move: 'outrage' }, { type: 'damage', side: 'me', hp: maxHp - 50, crit: true },
      { type: 'damage', side: 'me', hp: maxHp - 60, hits: 0 }, { type: 'endTurn' }, { type: 'damage', side: 'me', hp: 10 }];
    const states = log.reduce((ss, a) => [...ss, apply(ss[ss.length - 1], a)], [init]);
    expect(obsFromLog(log, states, 3)).toMatchObject({ attacker: 'opp', move: 'outrage', dmg: 50, crit: true });
    expect(obsFromLog(log, states, 4)).toBeUndefined();
    expect(obsFromLog(log, states, 6)).toBeUndefined();
  });
});

describe('infer: speed from move order', () => {
  // Garchomp Spe 154; at −1 → 102. Dragonite Spe = floor((80 + SP + 20) × mod). Item revealed as none (Iron Ball would halve it).
  const at = (...log: Action[]) => run({ type: 'reveal', side: 'opp', item: '' }, { type: 'boost', side: 'me', stat: 'spe', delta: -1 }, ...log);
  const spe = (inf: Inference) => inf.groups.find(g => g.dims.includes('spe'))!.cands.map(c => `${c.sp.spe}/${c.mod.spe ?? 1}`);

  it('I moved first → opp Spe ≤ mine (ties allowed)', () => {
    const inf = observe(undefined, { state: at(), first: 'me' });
    expect(holds(inf)).toBe(true);
    const r = summarize(inf).stats.spe!;
    expect([r.min, r.max]).toEqual([0, 14]); // 0.9: floor(114 × 0.9) = 102; neutral: 102 at SP 2
    expect(r.mods).toEqual([0.9, 1]);
    expect(spe(inf)).toContain('2/1');
    expect(spe(inf)).not.toContain('3/1');
  });

  it('inferredSpeed: opp − my final Speed over the candidates; undefined before any Speed info', () => {
    const inf = observe(undefined, { state: at(), first: 'me' });
    expect(inferredSpeed(inf, at())).toEqual([90 - 102, 0]); // floor(100 × 0.9) … 102 vs my 102
    expect(inferredSpeed(inf, run({ type: 'reveal', side: 'opp', item: '' }))).toEqual([90 - 154, 102 - 154]); // my −1 gone
    expect(inferredSpeed(observe(undefined, { state: run(), attacker: 'opp', move: 'outrage', dmg: 0 }), at())).toBeUndefined();
  });

  it('summary lines: SP range per nature mod, split per item candidate', () => {
    const one = summarize(observe(undefined, { state: at(), first: 'me' })).lines;
    expect(one).toHaveLength(1);
    expect(one[0].item).toBeUndefined();
    expect(one[0].stats.spe).toEqual({ 0.9: [0, 14], 1: [0, 2] });

    // Opp moved first vs my −1 (102): without an item it needs ≥ 102; with Scarf anything goes.
    const split = summarize(observe(undefined, { state: run({ type: 'boost', side: 'me', stat: 'spe', delta: -1 }), first: 'opp' })).lines;
    expect(split.find(l => l.item === '')!.stats.spe).toEqual({ 0.9: [14, 32], 1: [2, 32], 1.1: [0, 32] });
    expect(split.find(l => l.item === 'choicescarf')!.stats.spe).toEqual({ 0.9: [0, 32], 1: [0, 32], 1.1: [0, 32] });
  });

  it('summary lines carry a usage prior per group: sums to 1, sorted, Scarf vs none by Smogon usage', () => {
    const inf = observe(undefined, { state: run({ type: 'boost', side: 'me', stat: 'spe', delta: -1 }), first: 'opp' });
    const lines = summarize(inf).lines, g = inf.groups.find(x => x.dims.includes('item'))!;
    expect(lines.reduce((a, l) => a + l.p!, 0)).toBeCloseTo(1);
    expect(lines.map(l => l.p)).toEqual(lines.map(l => l.p).sort((a, b) => b! - a!));
    const u = usage('dragonite').items, pct = (id: string) => u.find(x => x[0] === id)?.[1] ?? 0.5;
    const none = 100 - g.items.reduce((a, i) => a + pct(i), 0);
    const scarf = lines.find(l => l.item === 'choicescarf')!, empty = lines.find(l => l.item === '')!;
    expect(scarf.p! / empty.p!).toBeCloseTo(pct('choicescarf') / none);
  });

  it('Trick Room flips the comparison', () => {
    const c = spe(observe(undefined, { state: at({ type: 'field', isTrickRoom: true }), first: 'me' }));
    expect(c).toContain('2/1');
    expect(c).not.toContain('1/1');
    expect(c).toContain('0/1.1');
  });

  it('outsped by an uninvestable margin → only Choice Scarf remains', () => {
    const s = summarize(observe(undefined, { state: run(), first: 'opp' }));
    expect(s.items).toEqual(['choicescarf']);
  });

  it('obsFromLog: first moves of both sides, same priority; else none', () => {
    const log: Action[] = [{ type: 'switch', side: 'me', slot: 0 }, { type: 'switch', side: 'opp', slot: 0 },
      { type: 'move', side: 'opp', move: 'outrage' }, { type: 'move', side: 'me', move: 'dragonclaw' }, { type: 'endTurn' },
      { type: 'move', side: 'opp', move: 'extremespeed' }, { type: 'move', side: 'me', move: 'dragonclaw' }];
    const states = log.reduce((ss, a) => [...ss, apply(ss[ss.length - 1], a)], [init]);
    expect(obsFromLog(log, states, 3)).toMatchObject({ first: 'opp', state: states[2] });
    expect(obsFromLog(log, states, 2)).toBeUndefined();
    expect(obsFromLog(log, states, 6)).toBeUndefined(); // priority differs
  });
});
