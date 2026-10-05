// §5-3 damage display: battle state → calc inputs. Unknown opponent spreads are bracketed (user decision 2026-10-04):
// the range spans "no investment" through "32 SP in one stat + boosting nature" (+ HP 32), so both ends are shown.
// Unrevealed opponent item = none, ability = the species' first ability (calc default).
import { damage, makePokemon, type FieldInput } from '../calc/index';
import { getAbility, getItem, getSpecies, NATURES, type StatID, type Stats } from '../data/champions';
import { activeMon, toVarCtx, type Mon, type SideID, type State } from './state';

const nature = (plus: StatID, minus: StatID) => NATURES.find(n => n.plus === plus && n.minus === minus)!.name;
const NEUTRAL = NATURES.find(n => n.plus === n.minus)!.name;
export const Z: Stats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

/** Opponent spreads tried when its real one is unknown. Speed stays 0 (Gyro/Electro Ball assume uninvested Speed). */
export const OPP_SPREADS: { label: string; sp: Stats; nature: string }[] = [
  { label: '무투자', sp: Z, nature: NEUTRAL },
  { label: 'H32 A32 +공격', sp: { ...Z, hp: 32, atk: 32 }, nature: nature('atk', 'spa') },
  { label: 'H32 B32 +방어', sp: { ...Z, hp: 32, def: 32 }, nature: nature('def', 'atk') },
  { label: 'H32 C32 +특공', sp: { ...Z, hp: 32, spa: 32 }, nature: nature('spa', 'atk') },
  { label: 'H32 D32 +특방', sp: { ...Z, hp: 32, spd: 32 }, nature: nature('spd', 'atk') },
];

const SIDE_FLAGS: [string, string][] = [['reflect', 'isReflect'], ['lightscreen', 'isLightScreen'], ['auroraveil', 'isAuroraVeil'], ['tailwind', 'isTailwind'], ['stealthrock', 'isSR']];
function calcSide(c: Record<string, number>) {
  return { ...Object.fromEntries(SIDE_FLAGS.map(([id, k]) => [k, !!c[id]])), spikes: c.spikes ?? 0 };
}

export function toField(s: State, attacker: SideID): FieldInput {
  const def: SideID = attacker === 'me' ? 'opp' : 'me';
  return {
    weather: s.field.weather as any, terrain: s.field.terrain as any, isGravity: !!s.field.isGravity,
    attackerSide: calcSide(s.sides[attacker].conditions), defenderSide: calcSide(s.sides[def].conditions),
  } as FieldInput;
}

export function build(s: State, side: SideID, m: Mon, spread?: { sp: Stats; nature: string }) {
  const p = makePokemon(m.species, {
    sp: m.sp ?? spread!.sp, nature: m.nature ?? spread!.nature,
    item: m.item ? getItem(m.item)?.name : undefined,
    ability: m.ability ? getAbility(m.ability)?.name : undefined,
    status: (m.status || undefined) as any,
    boosts: s.sides[side].vol.boosts as any,
  });
  // mine: real HP. opp: percent of this spread's max HP (Eruption, Reversal, Multiscale… read it)
  p.originalCurHP = side === 'me' ? m.hp : Math.max(1, Math.round(p.maxHP() * m.hp / 100));
  return p;
}

export interface Range {
  min: number; max: number;    // % of defender's max HP
  koMin: number; koMax: number; // hits needed from defender's current HP: best case (max rolls) / guaranteed (min rolls)
  assumed: boolean;             // an unknown opponent spread was bracketed
  inferred?: boolean;           // min/max came from src/infer candidates
}

/** Damage of `move` from `attacker`'s active Pokémon to the other active one. undefined = no damage / not computable.
 *  `inferred` = [min, max] % from src/infer (infer/inferredRange), replacing the bracketed spreads. */
export function moveRange(s: State, attacker: SideID, move: string, inferred?: [number, number]): Range | undefined {
  const def: SideID = attacker === 'me' ? 'opp' : 'me';
  const a = activeMon(s, attacker), d = activeMon(s, def);
  if (!a || !d || a.fainted || d.fainted) return;
  const field = toField(s, attacker), ctx = toVarCtx(s, attacker);
  const opp = attacker === 'me' ? d : a;
  const spreads = opp.sp ? [undefined] : OPP_SPREADS;
  let [min, max] = inferred ?? [Infinity, -Infinity];
  if (!inferred) for (const spr of spreads) {
    const A = build(s, attacker, a, spr), D = build(s, def, d, spr);
    const [lo, hi] = damage(A, D, move, field, ctx).range();
    min = Math.min(min, (lo / D.maxHP()) * 100);
    max = Math.max(max, (hi / D.maxHP()) * 100);
  }
  const curPct = d.hp / d.maxHp * 100;
  if (!(max > 0)) return;
  return {
    min, max, assumed: !opp.sp && !inferred, inferred: !!inferred,
    koMax: min > 0 ? Math.ceil(curPct / min - 1e-9) : Infinity, koMin: Math.ceil(curPct / max - 1e-9),
  };
}

export const koText = (r: Range) =>
  r.koMin === r.koMax ? `확정 ${r.koMin}타` : `난수 ${r.koMin}타${Number.isFinite(r.koMax) ? ` (확정 ${r.koMax}타)` : ''}`;
