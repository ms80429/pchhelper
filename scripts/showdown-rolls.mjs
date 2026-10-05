// Evidence tool (not a golden source): runs each tests/calc/golden.json case through the actual Pokémon Showdown
// battle engine (champions mod, pinned commit from fetch-raw) with the damage roll forced to each of its 16 values.
// Usage: npm run fetch-raw -- showdown (once) ; node scripts/showdown-rolls.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const { Battle } = createRequire(import.meta.url)(path.resolve('node_modules/.cache/pokemon-showdown/dist/sim'));
const golden = JSON.parse(readFileSync('tests/calc/golden.json', 'utf8'));
const WEATHER = { Sun: 'sunnyday', Rain: 'raindance', Sand: 'sandstorm', Snow: 'snowscape' };

const set = (s, move) => ({
  species: s.name, ability: s.ability, item: s.item ?? '', nature: s.nature, level: 50, moves: [move],
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...s.sp }, ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
});

export function showdownRolls(c) {
  const b = new Battle({ formatid: 'gen9championscustomgame' });
  b.setPlayer('p1', { team: [set(c.attacker, c.move)] });
  b.setPlayer('p2', { team: [set(c.defender, 'splash')] });
  b.makeChoices('team 1', 'team 1');
  const [a, d] = [b.p1.active[0], b.p2.active[0]];
  for (const [p, s] of [[a, c.attacker], [d, c.defender]]) {
    if (s.status) { p.status = s.status; p.statusState = { id: s.status, target: p }; }
    Object.assign(p.boosts, s.boosts ?? {});
  }
  const f = c.field ?? {};
  b.field.clearWeather();
  if (f.weather) b.field.setWeather(WEATHER[f.weather], a);
  if (f.reflect) b.p2.addSideCondition('reflect', d);
  if (c.ctx?.timesHit) a.timesAttacked = c.ctx.timesHit;
  if (c.ctx?.faintedAllies) b.p1.totalFainted = c.ctx.faintedAllies;
  b.randomChance = () => !!c.crit; // only crit rolls matter here
  const rolls = [];
  for (let i = 15; i >= 0; i--) {
    b.random = () => i; // randomizer: trunc(base * (100 - random(16)) / 100)
    const move = b.dex.getActiveMove(c.move);
    if (c.crit) move.willCrit = true;
    rolls.push(b.actions.getDamage(a, d, move) || 0);
  }
  return rolls;
}

if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  for (const c of golden) {
    const r = showdownRolls(c);
    const eq = JSON.stringify(r) === JSON.stringify(c.expected);
    console.log(`${c.id}\t${eq ? 'matches golden' : 'DIFF'}\t${JSON.stringify(r)}`);
  }
}
