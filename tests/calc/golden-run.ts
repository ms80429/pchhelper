// Shared by golden.test.ts and the collection step: runs one golden case through our calc.
import { damage, makePokemon } from '../../src/calc';

export interface Side { name: string; nature: string; ability?: string; item?: string; sp?: Record<string, number>; status?: string; boosts?: Record<string, number> }
export interface GoldenCase { id: string; note: string; attacker: Side; defender: Side; move: string; crit?: boolean;
  field?: { weather?: string; terrain?: string; reflect?: boolean; lightScreen?: boolean }; ctx?: Record<string, number> }

const mon = (s: Side) => makePokemon(s.name, { nature: s.nature, ability: s.ability, item: s.item, sp: s.sp, status: s.status as any, boosts: s.boosts });

export function ourRolls(c: GoldenCase): number[] {
  const f = c.field ?? {};
  const r = damage(mon(c.attacker), mon(c.defender), c.move,
    { gameType: 'Singles', weather: f.weather as any, terrain: f.terrain as any,
      defenderSide: { isReflect: f.reflect, isLightScreen: f.lightScreen } }, c.ctx ?? {}, { isCrit: c.crit });
  const d = r.damage;
  return typeof d === 'number' ? Array(16).fill(d) : (d as number[]);
}
