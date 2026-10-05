// Battle state as a pure reducer over an action log. Current state = replay(init, log); undo = drop the last action.
// Turn flags follow Showdown semantics (see comments) so toVarCtx feeds src/calc/variable-power.ts correctly.
import { getAbility, getSpecies, ITEMS, toID, type StatID, type Stats } from '../data/champions';
import type { VarCtx } from '../calc/variable-power';

/** Singles: 6 previewed, 3 brought (data/SOURCES.md; user-confirmed 2026-10-04). */
export const PARTY_SIZE = 3;

export type SideID = 'me' | 'opp';
export type Status = '' | 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz';
export type BoostID = Exclude<StatID, 'hp'> | 'accuracy' | 'evasion';

export interface Mon {
  species: string;
  hp: number; maxHp: number;   // mine: real HP. opp: percent (maxHp 100)
  status: Status;
  fainted: boolean;
  brought: boolean;            // in the battle party (Beat Up). mine: all. opp: once it has switched in
  moves: string[];             // mine: the set. opp: revealed so far (max 4)
  item?: string;               // undefined = unknown, '' = no item (knocked off / consumed)
  ability?: string;
  sp?: Stats; nature?: string; // mine only (the set). opp: unknown → bracketed in battle/damage.ts
}

/** Reset on switch-out / faint (Champions also resets Rage Fist here: docs/champions-diffs.md). */
export interface Volatile {
  boosts: Partial<Record<BoostID, number>>;
  timesHit: number;            // Rage Fist: SD timesAttacked, +1 per hit of a multi-hit move
  stockpile: number;
  lastMoveFailed?: boolean;    // SD moveLastTurnResult === false
  // turn flags, cleared by endTurn
  moved: boolean;              // Payback: acted this turn (a switch is not a move → SD newlySwitched)
  hitByOpponent: boolean;      // Avalanche: SD attackedBy(target).thisTurn
  hurt: boolean;               // Assurance: SD hurtThisTurn (any damage source)
  statLowered: boolean;        // Lash Out: SD statsLoweredThisTurn
}

export interface Side {
  team: Mon[];
  active: number;              // -1 before lead is chosen
  vol: Volatile;
  megaUsed: boolean;
  conditions: Record<string, number>; // reflect, lightscreen, auroraveil, tailwind, stealthrock, spikes, toxicspikes, stickyweb → turns / layers
}

export interface State {
  turn: number;
  sides: Record<SideID, Side>;
  field: { weather?: string; terrain?: string; isGravity?: boolean; isTrickRoom?: boolean };
}

export type Action =
  | { type: 'switch'; side: SideID; slot: number }
  | { type: 'move'; side: SideID; move: string; failed?: boolean }
  | { type: 'damage'; side: SideID; hp: number; hits?: number; crit?: boolean } // hp = new HP; hits = opponent move hits (0 = hazard/weather/recoil)
  | { type: 'status'; side: SideID; status: Status }
  | { type: 'boost'; side: SideID; stat: BoostID; delta: number }
  | { type: 'reveal'; side: SideID; item?: string; ability?: string }
  | { type: 'mega'; side: SideID; species: string }
  | { type: 'condition'; side: SideID; id: string; value: number } // 0 removes
  | { type: 'field'; weather?: string; terrain?: string; isGravity?: boolean; isTrickRoom?: boolean }
  | { type: 'endTurn' };

const freshVolatile = (): Volatile =>
  ({ boosts: {}, timesHit: 0, stockpile: 0, moved: false, hitByOpponent: false, hurt: false, statLowered: false });
const other = (s: SideID): SideID => (s === 'me' ? 'opp' : 'me');

/** `mine` = the Pokémon brought to this battle (not the whole preset). `opp` = the opponent's previewed team. */
export function newBattle(mine: Omit<Mon, 'hp' | 'status' | 'fainted' | 'brought'>[], opp: string[]): State {
  const side = (team: Mon[]): Side => ({ team, active: -1, vol: freshVolatile(), megaUsed: false, conditions: {} });
  return {
    turn: 1,
    sides: {
      me: side(mine.map(m => ({ ...m, hp: m.maxHp, status: '', fainted: false, brought: true }))),
      opp: side(opp.map(species => ({ species, hp: 100, maxHp: 100, status: '', fainted: false, brought: false, moves: [] }))),
    },
    field: {},
  };
}

export const activeMon = (s: State, side: SideID): Mon | undefined => s.sides[side].team[s.sides[side].active];

export function apply(state: State, a: Action): State {
  const s = structuredClone(state);
  if (a.type === 'endTurn') {
    s.turn++;
    for (const side of Object.values(s.sides)) Object.assign(side.vol, { moved: false, hitByOpponent: false, hurt: false, statLowered: false });
    return s;
  }
  if (a.type === 'field') {
    const { type, ...patch } = a;
    Object.assign(s.field, patch);
    return s;
  }
  const side = s.sides[a.side];
  const mon = side.team[side.active];
  if (a.type === 'switch') {
    if (!side.team[a.slot] || side.team[a.slot].fainted) throw new Error(`Cannot switch to slot ${a.slot}`);
    side.active = a.slot;
    side.team[a.slot].brought = true;
    side.vol = freshVolatile();
    return s;
  }
  if (a.type === 'condition') {
    if (a.value) side.conditions[a.id] = a.value; else delete side.conditions[a.id];
    return s;
  }
  if (!mon) throw new Error(`No active Pokémon on ${a.side}`);
  switch (a.type) {
    case 'move': {
      const id = toID(a.move);
      if (!mon.moves.includes(id)) {
        if (mon.moves.length >= 4) throw new Error(`${mon.species} already has 4 moves: ${mon.moves.join(', ')}`);
        mon.moves.push(id);
      }
      side.vol.moved = true;
      side.vol.lastMoveFailed = !!a.failed;
      if (!a.failed && id === 'stockpile') side.vol.stockpile = Math.min(3, side.vol.stockpile + 1);
      if (id === 'spitup' || id === 'swallow') side.vol.stockpile = 0;
      break;
    }
    case 'damage': {
      const hp = Math.max(0, Math.min(mon.maxHp, a.hp));
      if (hp < mon.hp) side.vol.hurt = true;
      const hits = a.hits ?? 1;
      if (hits > 0) { side.vol.timesHit += hits; side.vol.hitByOpponent = true; }
      mon.hp = hp;
      if (hp === 0) { mon.fainted = true; side.vol = freshVolatile(); }
      break;
    }
    case 'status': mon.status = a.status; break;
    case 'boost': {
      const cur = side.vol.boosts[a.stat] ?? 0;
      const next = Math.max(-6, Math.min(6, cur + a.delta));
      if (next < cur) side.vol.statLowered = true;
      side.vol.boosts[a.stat] = next;
      break;
    }
    case 'reveal':
      if (a.item !== undefined) mon.item = a.item;
      if (a.ability !== undefined) mon.ability = a.ability;
      break;
    case 'mega': {
      if (side.megaUsed) throw new Error(`${a.side} already Mega Evolved`);
      const mega = getSpecies(a.species);
      if (!mega?.isMega) throw new Error(`Not a Mega forme: ${a.species}`);
      if (toID(mega.battleOnly as string) !== toID(mon.species)) throw new Error(`${mon.species} cannot become ${a.species}`);
      mon.species = a.species;
      mon.ability = getAbility(mega.abilities['0'])!.id; // every Champions Mega has exactly one ability
      mon.item = ITEMS.find(i => i.megaStone?.[mega.battleOnly as string] === mega.name)!.id; // reveals the stone
      side.megaUsed = true;
      break;
    }
  }
  return s;
}

export const replay = (init: State, log: Action[]) => log.reduce(apply, init);

/** Battle facts for a move used by `attacker`'s active Pokémon against the other side's active Pokémon. */
export function toVarCtx(s: State, attacker: SideID): VarCtx {
  const me = s.sides[attacker], them = s.sides[other(attacker)];
  return {
    faintedAllies: me.team.filter(m => m.fainted).length,
    timesHit: me.vol.timesHit,
    targetMovedFirst: them.vol.moved,
    hitByTargetThisTurn: me.vol.hitByOpponent,
    lastMoveFailed: !!me.vol.lastMoveFailed,
    statLoweredThisTurn: me.vol.statLowered,
    targetHurtThisTurn: them.vol.hurt,
    stockpile: me.vol.stockpile,
    beatUpAllyBaseAtk: beatUpAtk(me),
  };
}

const baseAtk = (m: Mon) => getSpecies(m.species)!.baseStats.atk;

/** Beat Up hits = brought, non-fainted, status-free members. Unseen opp slots (always healthy: they never appeared)
 *  take the highest base Atk among the unrevealed previews — worst case for the damage we take. */
function beatUpAtk(side: Side): number[] {
  const healthy = side.team.filter(m => m.brought && !m.fainted && !m.status).map(baseAtk);
  const unseen = PARTY_SIZE - side.team.filter(m => m.brought).length;
  if (unseen <= 0) return healthy;
  const worst = Math.max(...side.team.filter(m => !m.brought).map(baseAtk));
  return [...healthy, ...Array(unseen).fill(worst)];
}
