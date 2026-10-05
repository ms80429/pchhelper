// The only entry point for game data. Everything here is Champions-filtered (see data/SOURCES.md).
import dexJson from '../../data/champions-dex.json';
import movesJson from '../../data/champions-moves.json';
import learnsetsJson from '../../data/champions-learnsets.json';
import itemsJson from '../../data/items.json';
import abilitiesJson from '../../data/abilities.json';
import koJson from '../../data/ko-names.json';
import usageJson from '../../data/usage.json';
import { Generations } from '@smogon/calc';

export type StatID = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type Stats = Record<StatID, number>;

export interface Species {
  id: string; name: string; num: number; baseSpecies: string; forme: string | null; isMega: boolean;
  battleOnly: string | string[] | null; requiredItem: string | null; types: string[]; baseStats: Stats;
  abilities: Record<string, string>; weightkg: number; gender: string | null;
}
export interface MoveData {
  id: string; name: string; num: number; type: string; category: 'Physical' | 'Special' | 'Status';
  basePower: number; accuracy: number | true; pp: number; priority: number; contact: boolean; target: string;
  multihit: number | number[] | null; damage: number | 'level' | null; ohko: boolean | string; flags: string[];
  hasBasePowerCallback: boolean; hasOnBasePower: boolean; hasDamageCallback: boolean;
  overrideOffensiveStat: string | null; overrideOffensivePokemon: string | null; overrideDefensiveStat: string | null;
  willCrit: boolean;
}
export interface Item { id: string; name: string; megaStone: Record<string, string> | null }
export interface Ability { id: string; name: string }

export const SPECIES = dexJson as unknown as Species[];
export const MOVES = movesJson as unknown as MoveData[];
export const ITEMS = itemsJson as unknown as Item[];
export const ABILITIES = abilitiesJson as unknown as Ability[];
export const LEARNSETS = learnsetsJson as unknown as Record<string, string[]>;
export type UsageList = [string, number][];
export const USAGE = usageJson as unknown as Record<string, { moves: UsageList; items: UsageList; abilities: UsageList }>;
export const KO = koJson as Record<'species' | 'moves' | 'items' | 'abilities' | 'types', Record<string, string>>;

export const toID = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const index = <T extends { id: string }>(xs: T[]) => new Map(xs.map(x => [x.id, x]));
const speciesById = index(SPECIES), movesById = index(MOVES), itemsById = index(ITEMS), abilitiesById = index(ABILITIES);

export const getSpecies = (name: string) => speciesById.get(toID(name));
export const getMove = (name: string) => movesById.get(toID(name));
export const getItem = (name: string) => itemsById.get(toID(name));
export const getAbility = (name: string) => abilitiesById.get(toID(name));
export const learnset = (species: string) => LEARNSETS[toID(species)] ?? [];
/** Smogon BSS usage [id, %] (desc, ≥1%), Megas merged into their base (data/SOURCES.md). Item '' = none. */
export const usage = (species: string) => {
  const sp = getSpecies(species);
  return USAGE[sp?.isMega ? toID([sp.battleOnly].flat()[0]!) : toID(species)] ?? { moves: [], items: [], abilities: [] };
};
export const usageMoves = (species: string): UsageList => usage(species).moves;

/** Natures from calc's Champions generation. plus === minus = neutral. */
export interface Nature { name: string; plus: StatID; minus: StatID }
export const NATURES: Nature[] = [...Generations.get(0).natures].map(n => ({ name: n.name, plus: n.plus as StatID, minus: n.minus as StatID }));
export const natureMods = (name: string): Partial<Record<StatID, 0.9 | 1.1>> => {
  const n = NATURES.find(x => x.name === name);
  return !n || n.plus === n.minus ? {} : { [n.plus]: 1.1, [n.minus]: 0.9 };
};
