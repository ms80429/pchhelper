// In-game observations (docs/in-game-measurement.md). Each observed damage must be one of our 16 rolls,
// and recorded in-game stats (if any) must equal our stat formula.
import { describe, expect, it } from 'vitest';
import observed from './observed.json';
import { ourRolls, type GoldenCase } from './golden-run';
import { makePokemon } from '../../src/calc';

type Obs = GoldenCase & { observed: number[]; stats?: { attacker?: Record<string, number>; defender?: Record<string, number> } };
const mon = (s: GoldenCase['attacker']) => makePokemon(s.name, { nature: s.nature, sp: s.sp });

describe('in-game observations', () => {
  it('file loads', () => expect(Array.isArray(observed)).toBe(true));
  for (const c of observed as unknown as Obs[]) {
    it(c.id, () => {
      const rolls = ourRolls(c);
      for (const dmg of c.observed) expect(rolls, `observed ${dmg}`).toContain(dmg);
      for (const side of ['attacker', 'defender'] as const) {
        const want = c.stats?.[side];
        if (want) expect(Object.fromEntries(Object.keys(want).map(k => [k, (mon(c[side]).stats as any)[k]]))).toEqual(want);
      }
    });
  }
});
