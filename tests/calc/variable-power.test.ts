// One test per VARIABLE_POWER entry. Expected values follow Showdown's basePowerCallback / onBasePower semantics,
// with each move's base power read from champions-moves.json (never hardcoded).
import { describe, expect, it } from 'vitest';
import { damage, makePokemon, type FieldInput, type PokemonInput } from '../../src/calc';
import { VARIABLE_POWER, type VarCtx } from '../../src/calc/variable-power';
import { getMove, getSpecies } from '../../src/data/champions';

const BP = (id: string) => getMove(id)!.basePower;
const NORMAL_TARGET = 'Snorlax'; // nothing immune/odd for most moves
const ATTACKER = 'Clefable';   // neutral fixture, no relevant ability (Magic Guard/Unaware don't affect BP)
function bp(move: string, o: { atk?: string; a?: PokemonInput; def?: string; d?: PokemonInput; field?: FieldInput; ctx?: VarCtx } = {}) {
  const r = damage(makePokemon(o.atk ?? ATTACKER, o.a), makePokemon(o.def ?? NORMAL_TARGET, o.d), move, o.field, o.ctx);
  return (r.rawDesc as any).moveBP ?? r.move.bp;
}
const species = (n: string) => !!getSpecies(n);

const tests: Record<string, () => void> = {
  ragefist: () => {
    expect(bp('Rage Fist', { atk: 'Annihilape' })).toBe(50);
    expect(bp('Rage Fist', { atk: 'Annihilape', ctx: { timesHit: 3 } })).toBe(200);
    expect(bp('Rage Fist', { atk: 'Annihilape', ctx: { timesHit: 9 } })).toBe(350); // cap
  },
  lastrespects: () => {
    expect(bp('Last Respects', { atk: 'Houndstone', def: 'Snorlax' })).toBe(50);
    expect(bp('Last Respects', { atk: 'Houndstone', ctx: { faintedAllies: 2 } })).toBe(150);
  },
  payback: () => {
    // calc would pick "moves last" from Speed; our flag must win both ways
    expect(bp('Payback', { a: { sp: { spe: 32 } }, ctx: { targetMovedFirst: true } })).toBe(BP('payback') * 2);
    expect(bp('Payback', { ctx: { targetMovedFirst: false } })).toBe(BP('payback')); // Clefable is slower than nothing here: flag decides
  },
  avalanche: () => {
    expect(bp('Avalanche', { ctx: { hitByTargetThisTurn: true } })).toBe(BP('avalanche') * 2);
    expect(bp('Avalanche')).toBe(BP('avalanche'));
  },
  stompingtantrum: () => expect(bp('Stomping Tantrum', { ctx: { lastMoveFailed: true } })).toBe(BP('stompingtantrum') * 2),
  temperflare: () => expect(bp('Temper Flare', { ctx: { lastMoveFailed: true } })).toBe(BP('temperflare') * 2),
  lashout: () => {
    expect(bp('Lash Out', { ctx: { statLoweredThisTurn: true } })).toBe(BP('lashout') * 2);
    expect(bp('Lash Out')).toBe(BP('lashout'));
  },
  assurance: () => expect(bp('Assurance', { ctx: { targetHurtThisTurn: true } })).toBe(BP('assurance') * 2),
  ficklebeam: () => {
    expect(bp('Fickle Beam', { ctx: { fickleBeamBoost: true } })).toBe(BP('ficklebeam') * 2);
    expect(bp('Fickle Beam')).toBe(BP('ficklebeam'));
  },
  spitup: () => expect(bp('Spit Up', { ctx: { stockpile: 3 } })).toBe(300),
  beatup: () => {
    const r = damage(makePokemon(ATTACKER), makePokemon('Snorlax'), 'Beat Up', {}, { beatUpAllyBaseAtk: [100, 55, 130] });
    expect((r.damage as number[][]).length).toBe(3); // one roll array per party member: BP 15, 10, 18
    expect((r.damage as number[][])[2][15]).toBeGreaterThan((r.damage as number[][])[1][15]);
  },
  round: () => expect(bp('Round')).toBe(BP('round')),
  watershuriken: () => expect(bp('Water Shuriken')).toBe(BP('watershuriken')),

  hex: () => expect(bp('Hex', { def: 'Garchomp', d: { status: 'par' } })).toBe(BP('hex') * 2),
  infernalparade: () => expect(bp('Infernal Parade', { def: 'Garchomp', d: { status: 'brn' } })).toBe(BP('infernalparade') * 2),
  barbbarrage: () => expect(bp('Barb Barrage', { d: { status: 'psn' } })).toBe(BP('barbbarrage') * 2),
  venoshock: () => expect(bp('Venoshock', { d: { status: 'tox' } })).toBe(BP('venoshock') * 2),
  facade: () => expect(bp('Facade', { a: { status: 'brn' } })).toBe(BP('facade') * 2),
  knockoff: () => {
    expect(bp('Knock Off', { d: { item: 'Leftovers' } })).toBe(BP('knockoff') * 1.5);
    expect(bp('Knock Off')).toBe(BP('knockoff'));
  },
  acrobatics: () => {
    expect(bp('Acrobatics')).toBe(BP('acrobatics') * 2);
    expect(bp('Acrobatics', { a: { item: 'Leftovers' } })).toBe(BP('acrobatics'));
  },
  fling: () => expect(bp('Fling', { a: { item: 'Iron Ball' } })).toBe(130),
  weatherball: () => {
    expect(bp('Weather Ball', { field: { weather: 'Rain' } })).toBe(BP('weatherball') * 2);
    expect(bp('Weather Ball')).toBe(BP('weatherball'));
  },
  solarbeam: () => expect(bp('Solar Beam', { field: { weather: 'Rain' } })).toBe(BP('solarbeam') / 2),
  solarblade: () => expect(bp('Solar Blade', { field: { weather: 'Sand' } })).toBe(BP('solarblade') / 2),
  risingvoltage: () => expect(bp('Rising Voltage', { field: { terrain: 'Electric' } })).toBe(BP('risingvoltage') * 2),
  expandingforce: () => expect(bp('Expanding Force', { field: { terrain: 'Psychic' } })).toBe(BP('expandingforce') * 1.5),
  mistyexplosion: () => expect(bp('Misty Explosion', { field: { terrain: 'Misty' } })).toBe(BP('mistyexplosion') * 1.5),
  gravapple: () => expect(bp('Grav Apple', { field: { isGravity: true } })).toBe(BP('gravapple') * 1.5),
  eruption: () => {
    expect(bp('Eruption')).toBe(150);
    expect(bp('Eruption', { a: { curHP: 1 } })).toBe(1);
  },
  waterspout: () => expect(bp('Water Spout', { a: { curHP: 1 } })).toBe(1),
  flail: () => {
    expect(bp('Flail', { a: { curHP: 1 } })).toBe(200);
    expect(bp('Flail')).toBe(20);
  },
  reversal: () => expect(bp('Reversal', { a: { curHP: 1 } })).toBe(200),
  hardpress: () => expect(bp('Hard Press')).toBe(100),
  heavyslam: () => expect(bp('Heavy Slam', { atk: 'Snorlax', def: 'Rotom' })).toBe(120),   // 460 / 0.3 kg
  heatcrash: () => expect(bp('Heat Crash', { atk: 'Rotom', def: 'Snorlax' })).toBe(40),
  lowkick: () => expect(bp('Low Kick', { def: 'Snorlax' })).toBe(120),
  grassknot: () => expect(bp('Grass Knot', { def: 'Rotom' })).toBe(20),
  gyroball: () => expect(bp('Gyro Ball', { atk: 'Snorlax', def: 'Rotom' })).toBeGreaterThan(40),
  electroball: () => expect(bp('Electro Ball', { atk: 'Rotom', def: 'Snorlax' })).toBeGreaterThanOrEqual(80),
  storedpower: () => expect(bp('Stored Power', { a: { boosts: { spa: 2, spd: 2 } } })).toBe(20 + 20 * 4),
  powertrip: () => expect(bp('Power Trip', { a: { boosts: { atk: 1 } } })).toBe(40),
  tripleaxel: () => {
    const r = damage(makePokemon(ATTACKER), makePokemon('Snorlax'), 'Triple Axel');
    expect((r.damage as number[][]).length).toBe(3);
  },
};

describe('variable power handlers', () => {
  it('every registry entry has a test and vice versa', () => {
    expect(Object.keys(tests).sort()).toEqual(Object.keys(VARIABLE_POWER).sort());
  });
  it('test fixtures exist in Champions', () => {
    for (const s of [ATTACKER, 'Rotom', 'Snorlax', 'Annihilape', 'Houndstone']) expect([s, species(s)]).toEqual([s, true]);
  });
  for (const [id, t] of Object.entries(tests)) it(id, t);
});
