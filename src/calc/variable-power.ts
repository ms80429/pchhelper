// Variable-power move handlers. Every move validate-data detects as variable must have an entry here.
//  - `bp` present: we compute base power (formula from Showdown data/moves.ts basePowerCallback) and override calc.
//  - `bp` absent: @smogon/calc derives it from state it already models (status, HP, item, weight, weather, ...);
//    `needs` lists that state so the battle UI knows what to feed. Each entry is pinned by tests/calc/variable-power.test.ts.

/** Battle facts calc cannot see. Tracked by battle/state.ts. */
export interface VarCtx {
  faintedAllies?: number;          // Last Respects: fainted Pokémon on the user's side
  timesHit?: number;               // Rage Fist: hits taken since switching in (Champions resets on switch/faint)
  targetMovedFirst?: boolean;      // Payback: target already acted this turn (and did not just switch in)
  hitByTargetThisTurn?: boolean;   // Avalanche
  lastMoveFailed?: boolean;        // Stomping Tantrum, Temper Flare
  statLoweredThisTurn?: boolean;   // Lash Out
  targetHurtThisTurn?: boolean;    // Assurance
  stockpile?: number;              // Spit Up (0–3)
  fickleBeamBoost?: boolean;       // Fickle Beam 30% double
  beatUpAllyBaseAtk?: number[];    // Beat Up: base Atk of each healthy party member (user included)
}

type BP = number | number[]; // number[] = one base power per hit (Beat Up)
export interface Handler { needs: string[]; bp?: (ctx: VarCtx, basePower: number) => BP }

const double = (flag: keyof VarCtx) => ({ needs: [flag], bp: (c: VarCtx, b: number) => (c[flag] ? b * 2 : b) });

export const VARIABLE_POWER: Record<string, Handler> = {
  // --- base power we compute ---
  ragefist: { needs: ['timesHit'], bp: c => Math.min(350, 50 + 50 * (c.timesHit ?? 0)) },
  lastrespects: { needs: ['faintedAllies'], bp: c => 50 + 50 * (c.faintedAllies ?? 0) },
  payback: double('targetMovedFirst'), // calc guesses from Speed; real order is known in battle
  avalanche: double('hitByTargetThisTurn'),
  stompingtantrum: double('lastMoveFailed'),
  temperflare: double('lastMoveFailed'),
  lashout: double('statLoweredThisTurn'), // calc approximates with "any negative boost"
  assurance: double('targetHurtThisTurn'),
  ficklebeam: double('fickleBeamBoost'),
  spitup: { needs: ['stockpile'], bp: c => 100 * (c.stockpile ?? 0) },
  beatup: { needs: ['beatUpAllyBaseAtk'], bp: c => (c.beatUpAllyBaseAtk ?? []).map(atk => 5 + Math.floor(atk / 10)) },
  round: { needs: [], bp: (_, b) => b },          // doubles only (ally used Round first) — never boosted in singles
  watershuriken: { needs: [], bp: (_, b) => b },  // boost is Greninja-Ash only, which is not in Champions

  // --- calc computes from state it models ---
  hex: { needs: ['defender.status'] },
  infernalparade: { needs: ['defender.status'] },
  barbbarrage: { needs: ['defender.status'] },
  venoshock: { needs: ['defender.status'] },
  facade: { needs: ['attacker.status'] },
  knockoff: { needs: ['defender.item'] },
  acrobatics: { needs: ['attacker.item'] },
  fling: { needs: ['attacker.item'] },
  weatherball: { needs: ['field.weather', 'attacker.ability'] }, // also Mega Sol
  solarbeam: { needs: ['field.weather', 'attacker.ability'] },
  solarblade: { needs: ['field.weather', 'attacker.ability'] },
  risingvoltage: { needs: ['field.terrain'] },
  expandingforce: { needs: ['field.terrain'] },
  mistyexplosion: { needs: ['field.terrain'] },
  gravapple: { needs: ['field.isGravity'] },
  eruption: { needs: ['attacker.curHP'] },
  waterspout: { needs: ['attacker.curHP'] },
  flail: { needs: ['attacker.curHP'] },
  reversal: { needs: ['attacker.curHP'] },
  hardpress: { needs: ['defender.curHP'] },
  heavyslam: { needs: ['attacker.weight', 'defender.weight'] },
  heatcrash: { needs: ['attacker.weight', 'defender.weight'] },
  lowkick: { needs: ['defender.weight'] },
  grassknot: { needs: ['defender.weight'] },
  gyroball: { needs: ['attacker.spe', 'defender.spe'] },
  electroball: { needs: ['attacker.spe', 'defender.spe'] },
  storedpower: { needs: ['attacker.boosts'] },
  powertrip: { needs: ['attacker.boosts'] },
  tripleaxel: { needs: [] }, // 20/40/60 per hit, calc handles
};
