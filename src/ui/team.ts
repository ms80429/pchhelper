// Team model for the input UI: sets hold ids (species/item/ability/move) + nature name. '' = empty.
import { getAbility, getItem, getMove, getSpecies, learnset, NATURES, natureMods, type StatID, type Stats } from '../data/champions';
import { calcStats, spErrors } from '../calc/stats';

export const STATS: StatID[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const STAT_KO: Record<StatID, string> = { hp: 'HP', atk: '공격', def: '방어', spa: '특공', spd: '특방', spe: '스피드' };
export const TEAM_SIZE = 6;

export interface MonSet { species: string; item: string; ability: string; nature: string; sp: Stats; moves: string[] }

const NEUTRAL = NATURES.find(n => n.plus === n.minus)!.name;
export const emptySet = (): MonSet => ({
  species: '', item: '', ability: '', nature: NEUTRAL, sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, moves: ['', '', '', ''],
});

/** Problems with one set (empty slot = none). Shown live in the editor and checked on import. */
export function setErrors(s: MonSet): string[] {
  if (!s.species) return [];
  const sp = getSpecies(s.species);
  if (!sp || sp.battleOnly) return [`포켓몬 없음: ${s.species}`];
  const errs = spErrors(s.sp);
  const item = s.item ? getItem(s.item) : undefined;
  if (s.item && !item) errs.push(`도구 없음: ${s.item}`);
  if (item?.megaStone && !item.megaStone[sp.name]) errs.push('이 포켓몬의 메가스톤이 아님');
  if (s.ability && !Object.values(sp.abilities).some(a => getAbility(a)?.id === s.ability)) errs.push(`특성 불가: ${s.ability}`);
  if (!NATURES.some(n => n.name === s.nature)) errs.push(`성격 없음: ${s.nature}`);
  const moves = s.moves.filter(Boolean);
  if (new Set(moves).size !== moves.length) errs.push('기술 중복');
  const ls = learnset(sp.id);
  for (const m of moves) if (!getMove(m) || !ls.includes(m)) errs.push(`습득 불가 기술: ${m}`);
  return errs;
}

/** Parse an exported presets file. Throws on wrong shape; per-set legality is left to setErrors. */
export function parsePresets(json: unknown): Record<string, MonSet[]> {
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('프리셋 JSON은 {이름: 팀} 객체여야 함');
  const out: Record<string, MonSet[]> = {};
  for (const [name, team] of Object.entries(json)) {
    if (!Array.isArray(team) || team.length !== TEAM_SIZE) throw new Error(`${name}: 6마리 배열이 아님`);
    out[name] = team.map((m: any, i) => {
      const base = emptySet();
      if (!m || typeof m !== 'object') throw new Error(`${name} ${i + 1}번: 객체가 아님`);
      const str = (k: 'species' | 'item' | 'ability' | 'nature') => typeof m[k] === 'string' ? m[k] : base[k];
      return {
        species: str('species'), item: str('item'), ability: str('ability'), nature: str('nature'),
        sp: Object.fromEntries(STATS.map(s => [s, Number(m.sp?.[s] ?? 0)])) as Stats,
        moves: [0, 1, 2, 3].map(j => typeof m.moves?.[j] === 'string' ? m.moves[j] : ''),
      };
    });
  }
  return out;
}

/** A legal set as a newBattle() entry: real max HP from the set's SP and nature. */
export function toBattleMon(s: MonSet) {
  const sp = getSpecies(s.species)!;
  return { species: sp.id, maxHp: calcStats(sp.baseStats, s.sp, natureMods(s.nature)).hp, moves: s.moves.filter(Boolean), item: s.item, ability: s.ability, sp: s.sp, nature: s.nature };
}
