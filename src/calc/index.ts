// @smogon/calc wrapper. Calc's own Champions mechanics (gen 0) run on top of OUR data:
// species/moves are served from src/data/champions.ts, so anything not in Champions does not exist here.
import { calculate, Field, Generations, Move, Pokemon, type Result } from '@smogon/calc';
import { getMove, getSpecies, MOVES, SPECIES, type Stats, toID } from '../data/champions';
import { getFinalSpeed } from '@smogon/calc/dist/mechanics/util';
import { VARIABLE_POWER, type VarCtx } from './variable-power';

const CALC = Generations.get(0); // calc's Champions generation: mechanics, items, abilities, natures, type chart

function species(id: string) {
  const s = getSpecies(id);
  if (!s) return undefined;
  // calc names Aegislash's base forme "Aegislash-Shield"
  const c: any = CALC.species.get(s.id as any) ?? CALC.species.get(`${s.id}shield` as any) ?? {};
  return {
    ...c, kind: 'Species', id: s.id, name: s.name, types: s.types, baseStats: s.baseStats, weightkg: s.weightkg,
    abilities: { 0: s.abilities['0'] }, ...(s.forme ? { baseSpecies: s.baseSpecies } : {}),
  };
}

function move(id: string) {
  const m = getMove(id);
  if (!m) return undefined;
  const c: any = CALC.moves.get(m.id as any) ?? {};
  return {
    ...c, kind: 'Move', id: m.id, name: m.name, type: m.type, category: m.category, basePower: m.basePower,
    priority: m.priority, flags: Object.fromEntries(m.flags.map(f => [f, 1])),
  };
}

export const GEN: any = {
  ...CALC,
  num: 0,
  abilities: CALC.abilities, items: CALC.items, types: CALC.types, natures: CALC.natures,
  species: { get: species, *[Symbol.iterator]() { for (const s of SPECIES) yield species(s.id); } },
  moves: { get: move, *[Symbol.iterator]() { for (const m of MOVES) yield move(m.id); } },
};

type CalcOpts = NonNullable<ConstructorParameters<typeof Pokemon>[2]>;
export interface PokemonInput extends Omit<CalcOpts, 'evs' | 'ivs' | 'level' | 'item' | 'ability' | 'nature'> {
  sp?: Partial<Stats>; // stat points 0–32 each
  item?: string; ability?: string; nature?: string;
}
export function makePokemon(name: string, { sp, ...o }: PokemonInput = {}) {
  if (!getSpecies(name)) throw new Error(`Not in Champions: ${name}`);
  return new Pokemon(GEN, name, { ...o, evs: sp } as any);
}

export type FieldInput = ConstructorParameters<typeof Field>[0];

/** Damage with Champions variable-power handlers applied. Multi-BP moves (Beat Up) return one roll array per hit. */
export function damage(attacker: Pokemon, defender: Pokemon, moveName: string,
  field: FieldInput = {}, ctx: VarCtx = {}, moveOpts: ConstructorParameters<typeof Move>[2] = {}): Result {
  const id = toID(moveName);
  const bp = VARIABLE_POWER[id]?.bp?.(ctx, getMove(id)?.basePower ?? 0);
  const run = (basePower?: number) => calculate(GEN, attacker, defender,
    new Move(GEN, moveName, { ...moveOpts, ...(basePower !== undefined ? { overrides: { basePower } } : {}) } as any),
    new Field(field));
  if (!Array.isArray(bp)) return run(bp);
  const hits = bp.map(b => run(b));
  const result = hits[0] ?? run(0);
  (result as any).damage = hits.map(h => h.damage as number[]);
  return result;
}

/** In-battle Speed (boosts, paralysis, Tailwind on `side`, Choice Scarf, weather abilities…). Trick Room is not applied. */
export function finalSpeed(p: Pokemon, field: FieldInput = {}, side: 'attackerSide' | 'defenderSide' = 'attackerSide') {
  const f = new Field(field);
  return getFinalSpeed(GEN, p, f, f[side]);
}
