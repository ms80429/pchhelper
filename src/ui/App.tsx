import { useState } from 'react';
import { getAbility, getSpecies, ITEMS, KO, learnset, NATURES, natureMods, SPECIES } from '../data/champions';
import { calcStats, SP_MAX, SP_TOTAL } from '../calc/stats';
import { Pick, byKo } from './Pick';
import { Battle, Types } from './Battle';
import { newBattle, PARTY_SIZE, type State } from '../battle/state';
import { emptySet, toBattleMon, parsePresets, setErrors, STAT_KO, STATS, TEAM_SIZE, type MonSet } from './team';

// Mega/battle-only formes come from items or in battle, not from team building.
const SPECIES_OPTS = SPECIES.filter(s => !s.battleOnly).map(s => ({ id: s.id, ko: KO.species[s.id] })).sort(byKo);
const ITEM_OPTS = ITEMS.map(i => ({ id: i.id, ko: KO.items[i.id] })).sort(byKo);
const NATURE_OPTS = [
  { name: NATURES.find(n => n.plus === n.minus)!.name, label: '무보정' },
  ...NATURES.filter(n => n.plus !== n.minus)
    .sort((a, b) => STATS.indexOf(a.plus) - STATS.indexOf(b.plus) || STATS.indexOf(a.minus) - STATS.indexOf(b.minus)).map(n => ({ name: n.name, label: `+${STAT_KO[n.plus]} −${STAT_KO[n.minus]}` })),
];

function SetEditor({ set, onChange, picked, onPick }: { set: MonSet; onChange(s: MonSet): void; picked: boolean; onPick(on: boolean): void }) {
  const sp = getSpecies(set.species);
  const up = (p: Partial<MonSet>) => onChange({ ...set, ...p });
  const errs = setErrors(set);
  const total = STATS.reduce((a, s) => a + set.sp[s], 0);
  const stats = sp && calcStats(sp.baseStats, set.sp, natureMods(set.nature));
  const moveOpts = sp ? learnset(sp.id).map(id => ({ id, ko: KO.moves[id] })).sort(byKo) : [];
  const abilities = sp ? Object.values(sp.abilities).map(a => getAbility(a)!.id) : [];
  return (
    <fieldset className={errs.length ? 'bad' : ''}>
      <label><input type="checkbox" checked={picked} onChange={e => onPick(e.target.checked)} />선출</label>
      <Pick options={SPECIES_OPTS} value={set.species} placeholder="포켓몬"
        onChange={id => up({ ...emptySet(), species: id, ability: id ? getAbility(getSpecies(id)!.abilities['0'])!.id : '' })} />
      {sp && <>
        <Types types={sp.types} />
        <Pick options={ITEM_OPTS} value={set.item} placeholder="도구" onChange={item => up({ item })} />
        <select value={set.ability} onChange={e => up({ ability: e.target.value })}>
          {abilities.map(a => <option key={a} value={a}>{KO.abilities[a]}</option>)}
        </select>
        <select value={set.nature} onChange={e => up({ nature: e.target.value })}>
          {NATURE_OPTS.map(n => <option key={n.name} value={n.name}>{n.label}</option>)}
        </select>
        <table><tbody>
          <tr><th />{STATS.map(s => <th key={s}>{STAT_KO[s]}</th>)}<th>합</th></tr>
          <tr><td>SP</td>{STATS.map(s =>
            <td key={s}><input type="number" min={0} max={SP_MAX} value={set.sp[s]}
              onChange={e => up({ sp: { ...set.sp, [s]: e.target.valueAsNumber || 0 } })} /></td>)}
            <td className={total > SP_TOTAL ? 'err' : ''}>{total}/{SP_TOTAL}</td></tr>
          <tr><td>실수치</td>{STATS.map(s => <td key={s}>{stats![s]}</td>)}<td /></tr>
        </tbody></table>
        <div className="moves">{set.moves.map((m, i) =>
          <Pick key={i} options={moveOpts} value={m} placeholder={`기술 ${i + 1}`}
            onChange={id => up({ moves: set.moves.map((x, j) => (j === i ? id : x)) })} />)}</div>
      </>}
      {errs.map(e => <div key={e} className="err">{e}</div>)}
    </fieldset>
  );
}

const PRESET_KEY = 'pokechamps.presets';
function loadPresets(): Record<string, MonSet[]> {
  try { return parsePresets(JSON.parse(localStorage.getItem(PRESET_KEY) ?? '{}')); } catch { return {}; }
}

export function App() {
  const [mine, setMine] = useState<MonSet[]>(() => Array.from({ length: TEAM_SIZE }, emptySet));
  const [opp, setOpp] = useState<string[]>(() => Array(TEAM_SIZE).fill(''));
  const [presets, setPresets] = useState(loadPresets);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [battle, setBattle] = useState<State | null>(null);

  const startErr = picked.length !== PARTY_SIZE ? `선출 ${PARTY_SIZE}마리 선택 (지금 ${picked.length})`
    : picked.some(i => !mine[i].species || setErrors(mine[i]).length) ? '선출한 포켓몬 설정 오류'
    : opp.some(s => !s) ? '상대 6마리 입력' : '';
  if (battle) return <Battle init={battle} onExit={() => setBattle(null)} />;

  const savePresets = (p: Record<string, MonSet[]>) => {
    setPresets(p);
    try { localStorage.setItem(PRESET_KEY, JSON.stringify(p)); } catch { setMsg('localStorage 저장 실패 — JSON 내보내기로 백업하세요'); }
  };
  const exportJson = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(presets, null, 1)], { type: 'application/json' }));
    a.download = 'pokechamps-presets.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (f?: File) => {
    if (!f) return;
    try {
      const p = parsePresets(JSON.parse(await f.text()));
      savePresets({ ...presets, ...p });
      setMsg(`불러옴: ${Object.keys(p).join(', ')}`);
    } catch (e) { setMsg(`가져오기 실패: ${(e as Error).message}`); }
  };

  return (
    <main>
      <section>
        <h2>내 팀</h2>
        <div className="row">
          <input value={name} placeholder="프리셋 이름" onChange={e => setName(e.target.value)} />
          <button disabled={!name} onClick={() => { savePresets({ ...presets, [name]: mine }); setMsg(`저장: ${name}`); }}>저장</button>
          <select value="" onChange={e => { setMine(presets[e.target.value]); setName(e.target.value); }}>
            <option value="">불러오기…</option>
            {Object.keys(presets).map(n => <option key={n}>{n}</option>)}
          </select>
          <button disabled={!presets[name]} onClick={() => { const { [name]: _, ...rest } = presets; savePresets(rest); }}>삭제</button>
          <button onClick={exportJson}>JSON 내보내기</button>
          <label className="button">JSON 가져오기<input type="file" accept=".json" hidden onChange={e => importJson(e.target.files?.[0])} /></label>
          <span>{msg}</span>
        </div>
        <div className="grid">{mine.map((s, i) =>
          <SetEditor key={i} set={s} onChange={n => setMine(mine.map((x, j) => (j === i ? n : x)))}
            picked={picked.includes(i)} onPick={on => setPicked(on ? [...picked, i] : picked.filter(j => j !== i))} />)}</div>
      </section>
      <section>
        <h2>상대 팀</h2>
        <div className="row">{opp.map((s, i) =>
          <Pick key={i} options={SPECIES_OPTS} value={s} placeholder={`상대 ${i + 1}`}
            onChange={id => setOpp(opp.map((x, j) => (j === i ? id : x)))} />)}</div>
        <div className="row">
          <button className="primary" disabled={!!startErr} onClick={() => setBattle(newBattle(picked.map(i => toBattleMon(mine[i])), opp))}>배틀 시작</button>
          <span className="err">{startErr}</span>
        </div>
      </section>
    </main>
  );
}
