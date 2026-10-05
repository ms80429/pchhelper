// Battle screen (§5-2). The action log is the only React state; current state = replay of the log, undo = pop.
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { getAbility, getItem, getSpecies, ITEMS, KO, learnset, SPECIES, toID, usage } from '../data/champions';
import { activeMon, apply, type Action, type BoostID, type Mon, type SideID, type State, type Status } from '../battle/state';
import { byKo, Pick } from './Pick';
import { koText, moveRange } from '../battle/damage';
import { inferredRange, inferredSpeed, obsFromLog, priorities, observe, summarize, type Inference } from '../infer';

const STATUS_KO: Record<Status, string> = { '': '정상', brn: '화상', par: '마비', psn: '독', tox: '맹독', slp: '잠듦', frz: '얼음' };
const BOOST_KO: Record<BoostID, string> = { atk: '공격', def: '방어', spa: '특공', spd: '특방', spe: '스피드', accuracy: '명중', evasion: '회피' };
// Labels are the Korean names of the moves that set them (data/ko-names.json).
const WEATHERS = [['Sun', 'sunnyday'], ['Rain', 'raindance'], ['Sand', 'sandstorm'], ['Snow', 'snowscape']] as const;
const TERRAINS = [['Electric', 'electricterrain'], ['Grassy', 'grassyterrain'], ['Psychic', 'psychicterrain'], ['Misty', 'mistyterrain']] as const;
/** Side conditions → max value (1 = on/off; spikes are layers). */
const CONDS: [string, number][] = [['reflect', 1], ['lightscreen', 1], ['auroraveil', 1], ['tailwind', 1], ['stealthrock', 1], ['spikes', 3], ['toxicspikes', 2], ['stickyweb', 1]];
const ITEM_OPTS = ITEMS.map(i => ({ id: i.id, ko: KO.items[i.id] })).sort(byKo);

const name = (species: string) => KO.species[toID(species)] ?? species;
const hpText = (m: Mon, mine: boolean) => (m.fainted ? '기절' : mine ? `${m.hp}/${m.maxHp}` : `${m.hp}%`);
const WHO: Record<SideID, string> = { me: '나', opp: '상대' };
export const Types = ({ types }: { types: readonly string[] }) =>
  <>{types.map(t => <span key={t} className={`type t-${toID(t)}`}>{KO.types[toID(t)] ?? t}</span>)}</>;

/** One log line, described against the state the action was applied to. */
function describe(a: Action, s: State): string {
  if (a.type === 'endTurn') return `── ${s.turn}턴 끝`;
  if (a.type === 'field') {
    const w = WEATHERS.find(x => x[0] === a.weather), t = TERRAINS.find(x => x[0] === a.terrain);
    if ('weather' in a) return `날씨: ${w ? KO.moves[w[1]] : '없음'}`;
    if ('terrain' in a) return `필드: ${t ? KO.moves[t[1]] : '없음'}`;
    if ('isTrickRoom' in a) return `${KO.moves.trickroom}: ${a.isTrickRoom ? '시작' : '끝'}`;
    return `${KO.moves.gravity}: ${a.isGravity ? '시작' : '끝'}`;
  }
  const who = WHO[a.side], m = activeMon(s, a.side), n = m ? name(m.species) : '';
  switch (a.type) {
    case 'switch': return `${who}: ${name(s.sides[a.side].team[a.slot].species)} 등장`;
    case 'move': return `${who} ${n}: ${KO.moves[toID(a.move)]}${a.failed ? ' (실패)' : ''}`;
    case 'damage': return `${who} ${n}: HP → ${a.hp}${a.side === 'opp' ? '%' : ''}${(a.hits ?? 1) === 0 ? ' (간접)' : (a.hits ?? 1) > 1 ? ` (${a.hits}타)` : ''}${a.crit ? ' 급소' : ''}`;
    case 'status': return `${who} ${n}: ${STATUS_KO[a.status]}`;
    case 'boost': return `${who} ${n}: ${BOOST_KO[a.stat]} ${a.delta > 0 ? '+' : ''}${a.delta}`;
    case 'reveal': return `${who} ${n}: ${a.item !== undefined ? `도구 ${a.item ? KO.items[a.item] : '없음'}` : `특성 ${KO.abilities[a.ability!]}`}`;
    case 'mega': return `${who}: ${name(a.species)}로 메가진화`;
    case 'condition': return `${who} 쪽 ${KO.moves[a.id]}: ${a.value || '끝'}`;
  }
}

export function Battle({ init, onExit }: { init: State; onExit(): void }) {
  const [log, setLog] = useState<Action[]>([]);
  const [warn, setWarn] = useState('');
  const states = useMemo(() => log.reduce((ss, a) => [...ss, apply(ss[ss.length - 1], a)], [init]), [init, log]);
  const s = states[states.length - 1];
  // Inference per opp slot after each action. The log only grows/pops, so an action object always has the same prefix
  // → cache by action (observe takes up to ~0.3 s).
  const cache = useRef(new WeakMap<Action, Record<number, Inference>>());
  const infers = useMemo(() => log.reduce<Record<number, Inference>>((cur, a, i) => {
    let next = cache.current.get(a);
    if (!next) {
      const o = obsFromLog(log, states, i), slot = states[i].sides.opp.active;
      next = o ? { ...cur, [slot]: observe(cur[slot], o) } : cur;
      cache.current.set(a, next);
    }
    return next;
  }, {}), [log, states]);
  // Invalid input (5th opp move, 2nd Mega, switch to a fainted mon…) throws → warn, don't log.
  const push = (a: Action) => {
    try { apply(s, a); setLog([...log, a]); setWarn(''); } catch (e) { setWarn((e as Error).message); }
  };
  return (
    <main>
      <div className="row bar">
        <b className="turn">{s.turn}턴</b>
        <button onClick={() => push({ type: 'endTurn' })}>턴 끝</button>
        <button disabled={!log.length} onClick={() => { setLog(log.slice(0, -1)); setWarn(''); }}>되돌리기</button>
        <select value={s.field.weather ?? ''} onChange={e => push({ type: 'field', weather: e.target.value || undefined })}>
          <option value="">날씨 없음</option>{WEATHERS.map(([id, m]) => <option key={id} value={id}>{KO.moves[m]}</option>)}
        </select>
        <select value={s.field.terrain ?? ''} onChange={e => push({ type: 'field', terrain: e.target.value || undefined })}>
          <option value="">필드 없음</option>{TERRAINS.map(([id, m]) => <option key={id} value={id}>{KO.moves[m]}</option>)}
        </select>
        <label><input type="checkbox" checked={!!s.field.isGravity} onChange={e => push({ type: 'field', isGravity: e.target.checked })} />{KO.moves.gravity}</label>
        <label><input type="checkbox" checked={!!s.field.isTrickRoom} onChange={e => push({ type: 'field', isTrickRoom: e.target.checked })} />{KO.moves.trickroom}</label>
        <button onClick={() => confirm('배틀을 끝내고 팀 화면으로? (로그 삭제)') && onExit()}>팀 화면</button>
        <span className="err">{warn}</span>
      </div>
      <div className="battle">
        <SidePanel s={s} side="me" push={push} />
        <SidePanel s={s} side="opp" push={push} />
        <ol className="log" reversed>{log.map((a, i) => <li key={i}>{describe(a, states[i])}</li>).reverse()}</ol>
        <DamagePanel s={s} inf={infers[s.sides.opp.active]} />
      </div>
    </main>
  );
}

function SidePanel({ s, side, push }: { s: State; side: SideID; push(a: Action): void }) {
  const sd = s.sides[side], mon = activeMon(s, side), mine = side === 'me';
  return (
    <section className={`side ${side}`}>
      <h2>{mine ? '내 쪽' : '상대'}{sd.megaUsed && ' (메가 사용)'}</h2>
      <div className="row">{sd.team.map((m, i) =>
        <button key={i} className={i === sd.active ? 'on' : ''} disabled={m.fainted || i === sd.active}
          onClick={() => push({ type: 'switch', side, slot: i })}>{name(m.species)} {hpText(m, mine)}</button>)}
      </div>
      {mon && !mon.fainted ? <Active mon={mon} side={side} boosts={sd.vol.boosts} megaUsed={sd.megaUsed} push={push} key={sd.active} />
        : <div>{mon ? '교체할 포켓몬' : mine ? '선봉' : '상대 선봉'}을 위에서 고르세요</div>}
      <div className="row">{CONDS.map(([id, max]) => max === 1
        ? <label key={id}><input type="checkbox" checked={!!sd.conditions[id]}
            onChange={e => push({ type: 'condition', side, id, value: e.target.checked ? 1 : 0 })} />{KO.moves[id]}</label>
        : <label key={id}>{KO.moves[id]} <select value={sd.conditions[id] ?? 0}
            onChange={e => push({ type: 'condition', side, id, value: +e.target.value })}>
            {Array.from({ length: max + 1 }, (_, n) => <option key={n}>{n}</option>)}</select></label>)}
      </div>
    </section>
  );
}

function Active({ mon, side, boosts, megaUsed, push }: { mon: Mon; side: SideID; boosts: Partial<Record<BoostID, number>>; megaUsed: boolean; push(a: Action): void }) {
  const mine = side === 'me', sp = getSpecies(mon.species)!;
  const [hp, setHp] = useState('');
  const [hits, setHits] = useState(1);
  const [failed, setFailed] = useState(false);
  const [crit, setCrit] = useState(false);
  const useMove = (move: string) => { push({ type: 'move', side, move, failed }); setFailed(false); };
  // Mine: only the Mega its held stone allows. Opp: any (item may be unknown).
  const megas = SPECIES.filter(x => x.isMega && toID(x.battleOnly as string) === sp.id
    && (!mine || getItem(mon.item ?? '')?.megaStone?.[sp.name] === x.name));
  const abilities = Object.values(sp.abilities).map(a => getAbility(a)!.id);
  const unrevealed = learnset(sp.id).filter(m => !mon.moves.includes(m)).map(id => ({ id, ko: KO.moves[id] })).sort(byKo);
  return (
    <div className="active">
      <div className="row">
        <b className="name">{name(mon.species)}</b> <Types types={sp.types} /> HP {hpText(mon, mine)}
        {megas.map(m => <button key={m.id} disabled={megaUsed} onClick={() => push({ type: 'mega', side, species: m.id })}>{name(m.id)}</button>)}
      </div>
      <meter min={0} max={100} low={20.01} high={50.01} optimum={100} value={mine ? mon.hp / mon.maxHp * 100 : mon.hp} />
      <form className="row" onSubmit={e => { e.preventDefault(); if (hp !== '') push({ type: 'damage', side, hp: +hp, hits, ...(crit && hits ? { crit } : {}) }); setHp(''); setCrit(false); }}>
        <input type="number" min={0} max={mon.maxHp} step="any" value={hp} placeholder={mine ? '남은 HP' : '남은 %'} onChange={e => setHp(e.target.value)} />
        <select value={hits} onChange={e => setHits(+e.target.value)} title="상대 기술 타수. 0 = 설치기·날씨·반동·회복">
          {[1, 2, 3, 4, 5, 0].map(n => <option key={n} value={n}>{n ? `${n}타` : '간접/회복'}</option>)}
        </select>
        <label title="추정 엔진용: 이 데미지가 급소였음"><input type="checkbox" checked={crit} onChange={e => setCrit(e.target.checked)} />급소</label>
        <button className="primary">HP 적용</button>
        <button type="button" onClick={() => push({ type: 'damage', side, hp: 0, hits: 0 })}>기절</button>
        <select value={mon.status} onChange={e => push({ type: 'status', side, status: e.target.value as Status })}>
          {Object.entries(STATUS_KO).map(([id, ko]) => <option key={id} value={id}>{ko}</option>)}
        </select>
      </form>
      <div className="boosts">{(Object.keys(BOOST_KO) as BoostID[]).map(b =>
        <span key={b} className="boost"><span>{BOOST_KO[b]}</span>
          <button onClick={() => push({ type: 'boost', side, stat: b, delta: -1 })}>−</button>
          <b className={(boosts[b] ?? 0) > 0 ? 'up' : (boosts[b] ?? 0) < 0 ? 'down' : ''}>{boosts[b] ?? 0}</b>
          <button onClick={() => push({ type: 'boost', side, stat: b, delta: 1 })}>+</button></span>)}
      </div>
      <div className="row">
        {mon.moves.map(m => <button key={m} onClick={() => useMove(m)}>{KO.moves[m]}</button>)}
        {!mine && mon.moves.length < 4 && <Pick key={mon.moves.length} options={unrevealed} value="" placeholder="새 기술" onChange={id => id && useMove(id)} />}
        <label><input type="checkbox" checked={failed} onChange={e => setFailed(e.target.checked)} />실패</label>
      </div>
      <div className="row">
        도구: {mon.item === undefined ? '미공개' : mon.item ? KO.items[mon.item] : '없음'}
        {!mine && <Pick options={ITEM_OPTS} value={mon.item ?? ''} placeholder="도구 공개" onChange={item => item && push({ type: 'reveal', side, item })} />}
        {mon.item !== '' && <button onClick={() => push({ type: 'reveal', side, item: '' })}>도구 잃음</button>}
        {' · '}특성: {mine ? KO.abilities[mon.ability!]
          : <select value={mon.ability ?? ''} onChange={e => push({ type: 'reveal', side, ability: e.target.value })}>
              {mon.ability === undefined && <option value="">미공개</option>}
              {abilities.map(a => <option key={a} value={a}>{KO.abilities[a]}</option>)}</select>}
      </div>
    </div>
  );
}

/** §5-3: my moves → opp, opp's revealed moves → me. Unknown opp spread is bracketed (battle/damage.ts). */
const MOD_KO = { 0.9: '↓', 1: '–', 1.1: '↑' } as const;
const STAT_KO = { hp: 'HP', ...BOOST_KO };

/** One row per (item, ability) candidate of each inferred group: SP range per nature mod, e.g. "스피드 ↑0~32 –2~32". */
function InferText({ inf }: { inf: Inference }) {
  const sum = summarize(inf), u = usage(inf.species);
  const pct = (list: [string, number][], id: string) => { const p = list.find(x => x[0] === id)?.[1]; return p ? ` (${p}%)` : ''; };
  if (!sum.count) return <div className="err">추정: 관측끼리 모순 (후보 0) — HP·급소·랭크·벽 입력 실수? 로그 확인 후 되돌리기</div>;
  const range = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}~${b}`);
  return (
    <div className="infer"><h3>추정 SP</h3>
      <ul>{sum.lines.map((l, i) => {
        const head = [l.item !== undefined && `도구 ${l.item ? KO.items[l.item] + pct(u.items, l.item) : '없음/무관'}`,
          l.ability !== undefined && `특성 ${KO.abilities[l.ability]}${pct(u.abilities, l.ability)}`].filter(Boolean).join(' · ');
        const stats = Object.entries(l.stats).map(([st, byMod]) => `${STAT_KO[st as keyof typeof STAT_KO]} ${
          ([1.1, 1, 0.9] as const).filter(m => byMod![m]).map(m => (st === 'hp' ? '' : MOD_KO[m]) + range(byMod![m]!)).join(' ')}`);
        const p = l.p !== undefined && l.p < 1 ? ` [사용률 기준 ${(l.p * 100).toFixed(0)}%]` : '';
        return <li key={i}>{head && `${head}${p}: `}{stats.join(' / ') || '능력치 무관'}</li>;
      })}</ul>
    </div>
  );
}

function DamagePanel({ s, inf }: { s: State; inf?: Inference }) {
  const me = activeMon(s, 'me'), opp = activeMon(s, 'opp');
  if (!me || !opp || me.fainted || opp.fainted) return null;
  const live = inf && summarize(inf).count ? inf : undefined;
  const rows = (side: SideID, moves: string[], pct?: Record<string, number>) => moves.map(m => {
    let text: ReactNode, cls = '';
    try {
      const r = moveRange(s, side, m, live && inferredRange(live, s, side, m));
      // Highlight one-hit KOs: guaranteed (min roll) vs possible (max roll)
      cls = !r ? '' : r.koMax === 1 ? 'sure' : r.koMin === 1 ? 'roll' : '';
      text = r ? <><span className="ko">{koText(r)}</span><span className="pct">{r.min.toFixed(1)}~{r.max.toFixed(1)}%{r.inferred ? ' (추정)' : ''}</span></> : <span className="pct">데미지 없음</span>;
    } catch (e) { text = <span className="err">계산 오류: {(e as Error).message}</span>; }
    // Priority ≠ 0 beats Speed; several values = depends on the unrevealed ability (Prankster, Gale Wings). NaN = Stall.
    const pr = priorities(s, side, m);
    const prio = pr.some(x => x !== 0) ? ` 우선도 ${pr.map(x => (Number.isNaN(x) ? '맨 뒤(시간벌기)' : x > 0 ? `+${x}` : `${x}`)).join('/')}` : '';
    return <li key={m} className={cls}><b>{KO.moves[m]}</b>{pct && ` (${pct[m]}%)`}{prio}{text}</li>;
  });
  const sp = getSpecies(opp.species)!;
  // Same-priority order from the inferred opp Speed (diff is negated under Trick Room, so the sign is the order)
  let order: string | undefined;
  try {
    const d = live && inferredSpeed(live, s);
    if (d) order = `${d[0] > 0 ? '상대 선공' : d[1] < 0 ? '내가 선공' : '불명 (동속·역전 가능)'} (상대−나 ${d[0]}~${d[1]}${s.field.isTrickRoom ? ', 트릭룸 반전' : ''}, 추정)`;
  } catch (e) { order = `계산 오류: ${(e as Error).message}`; }
  // §5 step 9: unrevealed moves used on ≥10% of Smogon BSS sets, while slots remain; unrevealed item/ability ≥5%.
  const u = usage(opp.species);
  const cands = opp.moves.length < 4 ? u.moves.filter(([m, p]) => p >= 10 && !opp.moves.includes(m)) : [];
  const list = (l: [string, number][], ko: Record<string, string>) => l.filter(([, p]) => p >= 5).map(([id, p]) => `${id ? ko[id] : '없음'} ${p}%`).join(' · ');
  return (
    <section className="damage">
      <h2>데미지</h2>
      {order && <div className="order">행동 순서 (같은 우선도): {order}</div>}
      <h3>{name(me.species)} → {name(opp.species)}</h3>
      <ul>{rows('me', me.moves)}</ul>
      <h3>{name(opp.species)} → {name(me.species)}</h3>
      <ul>{opp.moves.length ? rows('opp', opp.moves) : <li>공개된 기술 없음</li>}</ul>
      {cands.length > 0 && <details open><summary><h3>미공개 후보 (Smogon BSS 사용률)</h3></summary>
        <ul className="cands">{rows('opp', cands.map(([m]) => m), Object.fromEntries(cands))}</ul></details>}
      {opp.item === undefined && u.items.length > 0 && <div>도구 후보 (사용률): {list(u.items, KO.items)}</div>}
      {opp.ability === undefined && u.abilities.length > 0 && <div>특성 후보 (사용률): {list(u.abilities, KO.abilities)}</div>}
      {inf && <InferText inf={inf} />}
      {/* §5-3: assumptions stay visible in the summary; the long explanation is collapsible */}
      <details><summary><small>가정: 추정 안 된 상대 능력치 → 무투자~풀투자 범위
        {opp.item === undefined && ' · 도구 미공개 → 없음'}
        {opp.ability === undefined && ` · 특성 미공개 → ${KO.abilities[getAbility(sp.abilities['0'])!.id]}`} (자세히)</small></summary><small>
        (추정) 표시 = 관측으로 좁힌 후보 범위. 그 외 가정: 상대 능력치 미상 → 무투자 ~ (HP 32 + 관련 능력치 32 + 상승 성격) 범위, 행동 순서는 스피드 추정 후에만 표시 (우선도 표시된 기술은 우선도 높은 쪽이 먼저). [사용률 기준 %] = 남은 도구·특성 후보를 Smogon 사용률로 가중한 비율 (SP 배분은 가중 안 함).
      </small></details>
    </section>
  );
}
