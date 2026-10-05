import { describe, expect, it } from 'vitest';
import { emptySet, parsePresets, setErrors, toBattleMon } from '../../src/ui/team';
import { getSpecies, learnset } from '../../src/data/champions';
import { calcStats } from '../../src/calc/stats';

const garchomp = () => ({ ...emptySet(), species: 'garchomp', ability: 'roughskin', moves: learnset('garchomp').slice(0, 4) });

describe('setErrors', () => {
  it('empty slot and a legal set have no errors', () => {
    expect(setErrors(emptySet())).toEqual([]);
    expect(setErrors({ ...garchomp(), sp: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 } })).toEqual([]);
  });
  it('flags SP, moves, ability, mega stone, battle-only forme', () => {
    expect(setErrors({ ...garchomp(), sp: { hp: 3, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 } })).toEqual(['총합 67 > 66']);
    expect(setErrors({ ...garchomp(), moves: ['earthquake', 'earthquake', '', ''] })).toContain('기술 중복');
    expect(setErrors({ ...garchomp(), moves: ['hydropump', '', '', ''] })).toContain('습득 불가 기술: hydropump');
    expect(setErrors({ ...garchomp(), ability: 'levitate' })).toContain('특성 불가: levitate');
    expect(setErrors({ ...garchomp(), item: 'abomasite' })).toContain('이 포켓몬의 메가스톤이 아님');
    expect(setErrors({ ...emptySet(), species: 'garchompmega' })[0]).toMatch(/포켓몬 없음/);
  });
});

describe('parsePresets', () => {
  it('round-trips and rejects bad shapes', () => {
    const p = { a: [garchomp(), ...Array.from({ length: 5 }, emptySet)] };
    expect(parsePresets(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(() => parsePresets([])).toThrow();
    expect(() => parsePresets({ a: [garchomp()] })).toThrow();
  });
});

describe('toBattleMon', () => {
  it('max HP from SP + nature, empty move slots dropped', () => {
    const set = { ...garchomp(), item: 'choicescarf', sp: { ...emptySet().sp, hp: 32 }, moves: ['earthquake', '', 'dragonclaw', ''] };
    const hp = calcStats(getSpecies('garchomp')!.baseStats, set.sp, {}).hp;
    expect(hp).toBeGreaterThan(calcStats(getSpecies('garchomp')!.baseStats, emptySet().sp, {}).hp);
    expect(toBattleMon(set)).toEqual({ species: 'garchomp', maxHp: hp, moves: ['earthquake', 'dragonclaw'], item: 'choicescarf', ability: 'roughskin', sp: set.sp, nature: set.nature });
  });
});
