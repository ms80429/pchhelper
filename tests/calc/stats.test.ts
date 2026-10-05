import { describe, expect, it } from 'vitest';
import { SPECIES, type StatID } from '../../src/data/champions';
import { makePokemon } from '../../src/calc';
import { calcStat, calcStats, spErrors } from '../../src/calc/stats';

describe('Champions stat formula (Bulbapedia Stat_point)', () => {
  it('HP = base + SP + 75, others = floor((base + SP + 20) × nature)', () => {
    expect(calcStat('hp', 108, 2)).toBe(185);
    expect(calcStat('atk', 130, 32, 1)).toBe(182);
    expect(calcStat('spe', 102, 32, 1.1)).toBe(169); // 169.4 floored
    expect(calcStat('spa', 80, 0, 0.9)).toBe(90);
  });

  it('agrees with @smogon/calc for every species (Adamant, 32 Atk / 32 Spe / 2 HP)', () => {
    const sp = { hp: 2, atk: 32, spe: 32 };
    for (const s of SPECIES) {
      const ours = calcStats(s.baseStats, sp, { atk: 1.1, spa: 0.9 });
      const calc = makePokemon(s.name, { nature: 'Adamant', sp }).stats;
      for (const k of Object.keys(ours) as StatID[]) expect([s.name, k, calc[k]]).toEqual([s.name, k, ours[k]]);
    }
  });

  it('SP limits: 32 per stat, 66 total', () => {
    expect(spErrors({ atk: 32, spe: 32, hp: 2 })).toEqual([]);
    expect(spErrors({ atk: 33 })).toHaveLength(1);
    expect(spErrors({ atk: 32, spe: 32, hp: 3 })).toHaveLength(1);
  });
});
