import { describe, expect, it } from 'vitest';
import { getAbility, getItem, getSpecies, learnset, usage, USAGE, usageMoves } from '../../src/data/champions';

describe('usage', () => {
  it('every usage move is learnable by that species', () => {
    const bad = Object.entries(USAGE)
      .flatMap(([sp, u]) => u.moves.filter(([m]) => !learnset(sp).includes(m)).map(([m]) => `${sp}:${m}`));
    expect(bad).toEqual([]);
  });
  it('usage items exist, abilities are the base species own', () => {
    const bad = Object.entries(USAGE).flatMap(([sp, u]) => [
      ...u.items.filter(([i]) => i && !getItem(i)).map(([i]) => `${sp}:${i}`),
      ...u.abilities.filter(([a]) => !Object.values(getSpecies(sp)!.abilities).some(x => getAbility(x)!.id === a)).map(([a]) => `${sp}:${a}`)]);
    expect(bad).toEqual([]);
    expect(usage('garchompmega')).toEqual(usage('garchomp'));
  });
  it('Mega looks up its base species', () => {
    expect(getSpecies('salamencemega')?.isMega).toBe(true);
    expect(usageMoves('salamencemega')).toEqual(usageMoves('salamence'));
    expect(usageMoves('salamence').length).toBeGreaterThan(0);
  });
});
