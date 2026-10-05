import { describe, expect, it } from 'vitest';
import { damage, makePokemon } from '../../src/calc';
import { newBattle, replay, type Action } from '../../src/battle/state';
import { koText, moveRange, OPP_SPREADS } from '../../src/battle/damage';
import { calcStats } from '../../src/calc/stats';
import { getSpecies } from '../../src/data/champions';

const SP = { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 };
const maxHp = calcStats(getSpecies('garchomp')!.baseStats, SP).hp;
const init = newBattle([{ species: 'garchomp', maxHp, moves: ['earthquake'], item: 'lifeorb', ability: 'roughskin', sp: SP, nature: 'Adamant' }], ['metagross']);
const run = (...log: Action[]) => replay(init, [{ type: 'switch', side: 'me', slot: 0 }, { type: 'switch', side: 'opp', slot: 0 }, ...log]);
const me = (o = {}) => makePokemon('garchomp', { sp: SP, nature: 'Adamant', item: 'Life Orb', ability: 'Rough Skin', ...o });
const opp = (i: number) => makePokemon('metagross', { sp: OPP_SPREADS[i].sp, nature: OPP_SPREADS[i].nature });
const pct = (r: ReturnType<typeof damage>, def: ReturnType<typeof makePokemon>) => r.range().map(d => d / def.maxHP() * 100);

describe('moveRange', () => {
  it('my move vs unknown opp: max = uninvested target, min = H32 B32 +Def', () => {
    const r = moveRange(run(), 'me', 'earthquake')!;
    expect(r.assumed).toBe(true);
    expect(r.max).toBe(pct(damage(me(), opp(0), 'earthquake'), opp(0))[1]);
    expect(r.min).toBe(pct(damage(me(), opp(2), 'earthquake'), opp(2))[0]);
  });

  it('opp move vs me: max = A32 +Atk, uses my real HP', () => {
    const r = moveRange(run({ type: 'damage', side: 'me', hp: Math.floor(maxHp / 2) }), 'opp', 'meteormash')!;
    const D = me();
    expect(r.max).toBe(pct(damage(opp(1), D, 'meteormash'), D)[1]);
    expect(r.koMax).toBeLessThanOrEqual(Math.ceil(50 / r.min));
  });

  it('reflect, boosts and status reach calc', () => {
    const base = moveRange(run(), 'me', 'earthquake')!;
    expect(moveRange(run({ type: 'condition', side: 'opp', id: 'reflect', value: 1 }), 'me', 'earthquake')!.max).toBeLessThan(base.max);
    expect(moveRange(run({ type: 'boost', side: 'me', stat: 'atk', delta: 2 }), 'me', 'earthquake')!.max).toBeGreaterThan(base.max);
    expect(moveRange(run({ type: 'status', side: 'me', status: 'brn' }), 'me', 'earthquake')!.max).toBeLessThan(base.max);
  });

  it('immune / status move → undefined', () => {
    expect(moveRange(run(), 'opp', 'thunderbolt')).toBeUndefined(); // Electric vs Ground
    expect(moveRange(run(), 'me', 'swordsdance')).toBeUndefined();
  });

  it('koText', () => {
    expect(koText({ min: 50, max: 60, koMin: 2, koMax: 2, assumed: false })).toBe('확정 2타');
    expect(koText({ min: 40, max: 60, koMin: 2, koMax: 3, assumed: false })).toBe('난수 2타 (확정 3타)');
  });
});
