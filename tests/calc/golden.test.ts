// CLAUDE.md §4-4: 16 damage rolls must match the recorded source exactly. Sources per case in golden.json.
// A case with `refutedBy` (user-approved) is checked against in-game observations instead: each referenced
// observation must exist in observed.json and fall inside our rolls. The validation report lists these separately.
import { describe, expect, it } from 'vitest';
import golden from './golden.json';
import observed from './observed.json';
import { ourRolls, type GoldenCase } from './golden-run';

type Case = GoldenCase & { expected: number[]; refutedBy?: string[] };
const obsById = new Map((observed as unknown as (GoldenCase & { observed: number[] })[]).map(o => [o.id, o]));

describe('golden damage cases', () => {
  for (const c of golden as unknown as Case[]) {
    if (!c.refutedBy) { it(c.id, () => expect(ourRolls(c)).toEqual(c.expected)); continue; }
    it(c.id, () => {
      expect(c.refutedBy!.length).toBeGreaterThan(0);
      for (const id of c.refutedBy!) {
        const o = obsById.get(id);
        expect(o, `observation ${id}`).toBeDefined();
        for (const dmg of o!.observed) expect(ourRolls(o!), `${id} observed ${dmg}`).toContain(dmg);
      }
    });
  }
});
