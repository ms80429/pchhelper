// Champions stat formula — Bulbapedia "Stat point" (data/raw/bulbapedia/Stat_point.wiki):
//   HP = Base + SP + 75,  Other = floor((Base + SP + 20) × Alignment)
import type { StatID, Stats } from '../data/champions';

export const SP_MAX = 32;
export const SP_TOTAL = 66;
export type NatureMod = 0.9 | 1 | 1.1;

export function calcStat(stat: StatID, base: number, sp: number, nature: NatureMod = 1): number {
  if (stat === 'hp') return base === 1 ? 1 : base + sp + 75; // base 1 = Shedinja; kept for parity with calc
  return Math.floor((base + sp + 20) * nature);
}

export function calcStats(base: Stats, sp: Partial<Stats> = {}, natureMods: Partial<Record<StatID, NatureMod>> = {}): Stats {
  const out = {} as Stats;
  for (const s of Object.keys(base) as StatID[]) out[s] = calcStat(s, base[s], sp[s] ?? 0, natureMods[s] ?? 1);
  return out;
}

/** SP spread errors for UI/inference (empty = legal). */
export function spErrors(sp: Partial<Stats>): string[] {
  const vals = Object.values(sp) as number[];
  const errs: string[] = [];
  if (vals.some(v => !Number.isInteger(v) || v < 0 || v > SP_MAX)) errs.push(`능력치당 0~${SP_MAX}`);
  const total = vals.reduce((a, b) => a + b, 0);
  if (total > SP_TOTAL) errs.push(`총합 ${total} > ${SP_TOTAL}`);
  return errs;
}
