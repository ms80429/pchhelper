import { describe, expect, it } from 'vitest';
import { damage, makePokemon } from '../../src/calc';
import { activeMon, apply, newBattle, replay, toVarCtx, type Action } from '../../src/battle/state';
import { getSpecies } from '../../src/data/champions';

const init = newBattle(
  [{ species: 'Annihilape', maxHp: 185, moves: ['ragefist', 'bulkup', 'drainpunch', 'lastrespects'], item: 'leftovers', ability: 'defiant' },
   { species: 'Houndstone', maxHp: 147, moves: ['lastrespects'] },
   { species: 'Snorlax', maxHp: 235, moves: ['bodyslam'] }],
  ['Garchomp', 'Kingambit', 'Charizard'],
);
const lead: Action[] = [{ type: 'switch', side: 'me', slot: 0 }, { type: 'switch', side: 'opp', slot: 0 }];
const run = (...log: Action[]) => replay(init, [...lead, ...log]);

describe('battle state', () => {
  it('Rage Fist counts each hit and resets on switch (Champions)', () => {
    let s = run({ type: 'damage', side: 'me', hp: 150 }, { type: 'damage', side: 'me', hp: 100, hits: 2 });
    expect(toVarCtx(s, 'me').timesHit).toBe(3);
    const bp = (st = s) => {
      const r = damage(makePokemon('Annihilape'), makePokemon('Garchomp'), 'Rage Fist', {}, toVarCtx(st, 'me'));
      return (r.rawDesc as any).moveBP ?? r.move.bp;
    };
    expect(bp()).toBe(200);
    s = replay(s, [{ type: 'switch', side: 'me', slot: 2 }, { type: 'switch', side: 'me', slot: 0 }]);
    expect(toVarCtx(s, 'me').timesHit).toBe(0);
    expect(bp(s)).toBe(50);
  });

  it('indirect damage (hits: 0) hurts but does not count for Rage Fist / Avalanche', () => {
    const s = run({ type: 'damage', side: 'me', hp: 160, hits: 0 });
    expect(toVarCtx(s, 'me')).toMatchObject({ timesHit: 0, hitByTargetThisTurn: false });
    expect(toVarCtx(s, 'opp').targetHurtThisTurn).toBe(true);
  });

  it('faint: counts for Last Respects, resets volatiles, blocks switching back', () => {
    let s = run({ type: 'damage', side: 'me', hp: 0 });
    expect(activeMon(s, 'me')!.fainted).toBe(true);
    s = apply(s, { type: 'switch', side: 'me', slot: 1 });
    expect(toVarCtx(s, 'me').faintedAllies).toBe(1);
    expect(() => apply(s, { type: 'switch', side: 'me', slot: 0 })).toThrow();
  });

  it('turn flags: Payback / Avalanche / Assurance / Lash Out set, then cleared by endTurn', () => {
    let s = run(
      { type: 'move', side: 'opp', move: 'Earthquake' }, { type: 'damage', side: 'me', hp: 90 },
      { type: 'boost', side: 'me', stat: 'atk', delta: -1 },
    );
    expect(toVarCtx(s, 'me')).toMatchObject({ targetMovedFirst: true, hitByTargetThisTurn: true, statLoweredThisTurn: true });
    expect(toVarCtx(s, 'opp')).toMatchObject({ targetMovedFirst: false, targetHurtThisTurn: true });
    s = apply(s, { type: 'endTurn' });
    expect(toVarCtx(s, 'me')).toMatchObject({ targetMovedFirst: false, hitByTargetThisTurn: false, statLoweredThisTurn: false });
    expect(s.sides.me.vol.boosts.atk).toBe(-1); // boosts persist across turns
  });

  it('a switch-in is not "moved" (Payback not doubled vs. a target that just switched)', () => {
    const s = run({ type: 'switch', side: 'opp', slot: 1 });
    expect(toVarCtx(s, 'me').targetMovedFirst).toBe(false);
  });

  it('opponent moves are revealed up to 4; a 5th throws', () => {
    let s = run(...['Earthquake', 'Dragon Claw', 'Earthquake', 'Swords Dance', 'Stone Edge']
      .map(move => ({ type: 'move', side: 'opp', move }) as Action));
    expect(activeMon(s, 'opp')!.moves).toEqual(['earthquake', 'dragonclaw', 'swordsdance', 'stoneedge']);
    expect(() => apply(s, { type: 'move', side: 'opp', move: 'Fire Fang' })).toThrow();
  });

  it('stockpile / failed move / boosts clamp', () => {
    const s = run(
      { type: 'switch', side: 'me', slot: 2 }, // Snorlax: room in its move list
      ...Array(4).fill({ type: 'move', side: 'me', move: 'Stockpile' }),
      { type: 'boost', side: 'me', stat: 'def', delta: 12 },
      { type: 'move', side: 'me', move: 'Body Slam', failed: true },
    );
    expect(toVarCtx(s, 'me')).toMatchObject({ stockpile: 3, lastMoveFailed: true });
    expect(s.sides.me.vol.boosts.def).toBe(6);
  });

  it('mega once per side, only into a Mega forme', () => {
    const s = run({ type: 'switch', side: 'opp', slot: 2 }, { type: 'mega', side: 'opp', species: 'Charizard-Mega-Y' });
    expect(activeMon(s, 'opp')!.species).toBe('Charizard-Mega-Y');
    expect(getSpecies('Charizard-Mega-Y')!.isMega).toBe(true);
    expect(() => apply(s, { type: 'mega', side: 'opp', species: 'Charizard-Mega-X' })).toThrow();
    expect(() => run({ type: 'mega', side: 'opp', species: 'Garchomp' })).toThrow();
    expect(activeMon(s, 'opp')!.ability).toBe('drought');
    expect(activeMon(s, 'opp')!.item).toBe('charizarditey');
    expect(() => run({ type: 'mega', side: 'opp', species: 'Charizard-Mega-X' })).toThrow(); // lead is Garchomp
  });

  it('undo = replay without the last action; earlier states are never mutated', () => {
    const log: Action[] = [...lead, { type: 'damage', side: 'opp', hp: 40 }, { type: 'reveal', side: 'opp', item: 'Choice Scarf' }];
    const before = replay(init, log.slice(0, -1));
    const after = apply(before, log[log.length - 1]);
    expect(activeMon(after, 'opp')!.item).toBe('Choice Scarf');
    expect(activeMon(before, 'opp')!.item).toBeUndefined();
    expect(init.sides.opp.active).toBe(-1);
  });

  it('field and side conditions', () => {
    let s = run({ type: 'field', weather: 'Sun' }, { type: 'condition', side: 'opp', id: 'stealthrock', value: 1 });
    expect(s.field.weather).toBe('Sun');
    expect(s.sides.opp.conditions).toEqual({ stealthrock: 1 });
    s = apply(s, { type: 'condition', side: 'opp', id: 'stealthrock', value: 0 });
    expect(s.sides.opp.conditions).toEqual({});
  });

  it('Beat Up: healthy, non-fainted team members base Atk', () => {
    const s = run({ type: 'status', side: 'me', status: 'brn' });
    expect(toVarCtx(s, 'me').beatUpAllyBaseAtk).toEqual(['Houndstone', 'Snorlax'].map(n => getSpecies(n)!.baseStats.atk));
  });

  it('Beat Up (opp): always 3 brought; unseen slots take the highest base Atk among unrevealed previews', () => {
    const opp = newBattle([{ species: 'Snorlax', maxHp: 235, moves: [] }], ['Garchomp', 'Kingambit', 'Charizard', 'Clefable']);
    const atk = (n: string) => getSpecies(n)!.baseStats.atk;
    const worst = (...ns: string[]) => Math.max(...ns.map(atk));
    let s = replay(opp, [{ type: 'switch', side: 'opp', slot: 0 }]);
    expect(toVarCtx(s, 'opp').beatUpAllyBaseAtk).toEqual([atk('Garchomp'), ...Array(2).fill(worst('Kingambit', 'Charizard', 'Clefable'))]);
    s = replay(s, [{ type: 'switch', side: 'opp', slot: 3 }, { type: 'switch', side: 'opp', slot: 0 }]);
    expect(toVarCtx(s, 'opp').beatUpAllyBaseAtk).toEqual([atk('Garchomp'), atk('Clefable'), worst('Kingambit', 'Charizard')]);
    s = replay(s, [{ type: 'switch', side: 'opp', slot: 2 }, { type: 'damage', side: 'opp', hp: 0 }, { type: 'switch', side: 'opp', slot: 0 }]);
    expect(toVarCtx(s, 'opp').beatUpAllyBaseAtk).toEqual([atk('Garchomp'), atk('Clefable')]); // all 3 seen, Charizard fainted
  });
});
