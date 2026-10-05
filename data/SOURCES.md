# 데이터 출처

모든 원본은 `data/raw/`에 그대로 저장 (수정 금지). 재수집: `npm run fetch-raw` (섹션 단위: `npm run fetch-raw -- serebii` 등).
수집일: **2026-10-04** (`data/raw/FETCHED.txt`). 현재 레귤레이션: **Reg M-C** (2026-09-09 ~ 2026-12-02, 시즌 M-6).

| 원본 | 위치 | 고정 버전 | 용도 |
|---|---|---|---|
| Pokémon Showdown `data/mods/champions` | `raw/showdown/*.json` | commit `9fb3a5b99f1a0bea17f495c5cc1bfe04fdd19c3e` | 1차 데이터: 종족값·타입·특성·체중, 기술, 도구, 습득기술 |
| Showdown `gen9` (SV) | `raw/showdown/gen9-*.json` | 같은 commit | 본편 대비 변경점 확인용 |
| Serebii Champions | `raw/serebii/*.shtml`, `raw/serebii/dex/*.shtml` | 2026-10-04 스냅샷 | 등장 포켓몬 명단, 사용 가능 기술 목록(타입·분류·PP·위력·명중), 도구 목록, 메가 특성, 변경 기술, 상태이상 변경 |
| Bulbapedia (raw wikitext) | `raw/bulbapedia/*.wiki` | 2026-10-04 스냅샷 | 실수치 공식, Reg M-C 참가 가능 목록(폼 단위), 본편 대비 변경점, 분노의주먹 |
| PokeAPI CSV | `raw/pokeapi/*.csv` | commit `bc92d3b6029ef1abe9e7ad424c400b338f3c11fe` | 2차 소스: 타입·종족값 교차검증. 한글명(기술·도구·특성·타입, 일부 폼) |
| 포켓몬코리아 공식 도감 | `raw/pokemonkorea/pokedex.html` | 2026-10-04 (`/ajax/pokedex`, No.1–1008) | 포켓몬·폼 한글명 1순위 |
| Smogon 사용률 (chaos JSON) | `raw/smogon/gen9championsbssregmc-1500-2026-09.json` | 2026-09 월간, 레이팅 1500 이상, 69,462판 (2026-10-05 수집) | 9단계: 상대 미공개 기술 후보. **Showdown BSS Reg M-C 래더 통계이지 인게임 랭크 통계가 아님** (인게임 통계 pokemon-zone.com은 스크립트 접근 403) |
| 수동 보충 | `raw/manual/ko-supplement.json` | 항목별 URL 기록 | 위 소스에 없는 한글명 (천정부지, 불꽃의갈기) |

Showdown 데이터는 `scripts/fetch-raw.mjs`가 해당 commit을 빌드한 뒤 `Dex.mod('champions')`로 덤프한다
(폼·진화 전 습득기술 상속을 Showdown 자체 로직으로 해결하기 위함). `isNonstandard`가 설정된 항목은 제외.

## 챔피언스 규칙 (확인일 2026-10-04)

| 규칙 | 값 | 근거 |
|---|---|---|
| 레벨 | 50 고정 | Bulbapedia `Pokémon_Champions.wiki` "stats are calculated as if it was level 50" |
| 개체값 | 전부 31 | 같은 문서 "calculated as if they had 31 IVs" |
| 노력치 → 능력 포인트(SP) | 능력치당 0~32, 총 66 | Bulbapedia `Stat_point.wiki` |
| 실수치 | HP = 종족값 + SP + 75 / 그 외 = ⌊(종족값 + SP + 20) × 성격⌋ | `Stat_point.wiki` Calculation 절. Showdown `mods/champions/scripts.ts`(SP→EV 4+8n 환산), `@smogon/calc` `calcStatChampions`와 동일 |
| 성격 보정 | 0.9 / 1.0 / 1.1 | `Stat_point.wiki` |
| 배틀 기믹 | 메가진화만 (배틀당 1회). 테라스탈·다이맥스·Z기술 없음 | `Regulation_Set_M-C.wiki` Ruleset, `Pokémon_Champions.wiki` (다른 기믹은 "future"), Showdown `canTerastallize() { return null; }` |
| 싱글 랭크 선출 | 6마리 등록 → 3마리 선출 (선출 시간 90초) | Showdown `Flat Rules`(`Picked Team Size = Auto` = 싱글 3), `Regulation_Set_M-C.wiki`(Preview time 90s). ⚠ 1차 공식 문서로는 미확인. 사용자 게임 내 확인 (2026-10-04) → `src/battle/state.ts` `PARTY_SIZE = 3` |
| 도구 | 중복 금지 (Item Clause) | `Regulation_Set_M-C.wiki` |
| 시간 | 총 20분 / 개인 7분 / 턴 45초 | `Regulation_Set_M-C.wiki` |
| 사용 가능 포켓몬 | Reg M-C 목록 = 게임 내 등장 포켓몬 전체 | `Regulation_Set_M-C.wiki` 카드 목록, Serebii `pokemon.shtml`. `validate-data`가 두 목록을 모두 대조 |

## 가공 규칙 (`scripts/build-data.ts`)

1. **포켓몬**: Showdown champions 목록에서
   - 원본 폼이 챔피언스에 없는 **전투 전용 폼** 제외 (Meloetta-Pirouette, Ogerpon-*-Tera, Terapagos-Terastal, Eiscue-Noice, Cramorant-*, Minior-Meteor).
   - 타입·종족값·특성·체중이 기본 폼과 완전히 같은 **외형 폼** 제외 (Vivillon 무늬, Alcremie, Polteageist-Antique, Squawkabilly-Blue, Sinistcha-Masterpiece).
   - 제외 목록과 사유: `data/build-log.json`.
2. **기술**: 명단 = Serebii "Useable Moves". Showdown에만 있는 Spore / Soft-Boiled / Power Shift 제외 (어떤 챔피언스 포켓몬도 배우지 않음).
   PP = Showdown champions 공식 `(pp/5 + 1) × 4` (기본 PP 상한 20) — Serebii PP와 전수 대조.
   개별 수정값은 `docs/champions-diffs.md` "Showdown과 다른 값" 표.
3. **특성**: 챔피언스 포켓몬이 가질 수 있는 특성만.
4. **한글명** (`ko-names.json`)
   - 포켓몬: 공식 도감 이름. 메가는 공식 표기(`메가리자몽X`), 성별 메가는 `메가냐오닉스 (수컷의 모습)`.
     폼은 `기본명 (공식 폼 표기)` (예: `윈디 (히스이의 모습)`), 폼 표기에 이름이 포함되면 그대로 (`히트로토무`).
     공식 도감에 없는 폼 표기(캐스퐁 날씨폼, 호바귀 사이즈, 따라큐 들킨 모습)는 PokeAPI 한국어 폼명.
     No.1009 이상은 PokeAPI 종 이름.
   - 기술·도구·특성·타입: PokeAPI 한국어(lang 3). Leek은 PokeAPI identifier `stick`.

5. **사용률** (`usage.json`): `{종 id: {moves, items, abilities: [[id, %], ...]}}` (도구 `''` = 없음). Showdown은 메가스톤 소지 개체를
   메가폼으로 집계 → 메가를 기본폼에 합산(가중치 합). % = 가중치 / 가중 개체 수(특성 가중치 합). 1% 미만 버림.
   특성은 메가폼 집계가 메가 특성이라 **기본폼 개체만**으로 계산. Showdown은 외형 폼(깨비물까치 색, 스트린더 로우, 냐오닉스 암컷)을
   기본폼에 합쳐 집계 → 그 종이 가질 수 없는 특성은 빼고 `build-log.json` `usageForeignAbility`에 기록 (현재 3건, 해당 종 특성 % 합 < 100).
   종·기술·도구·특성 미매칭은 `usageUnknown` (현재 0). 사용률 기술 ⊂ learnset, 도구 존재, 특성 ⊂ 종 특성을 `tests/data/usage.test.ts`로 확인.

## 골든 테스트 (`tests/calc/golden.json`)

- 출처: ChampDex 계산기 (2026-10-04). 케이스마다 재현 URL 기록 (`scripts/champdex-url.mjs`로 생성).
  16개 난수는 페이지 내부 결과 객체(`rolls`)에서 읽음. 랭크 변화는 URL에 없어 UI 버튼으로 설정.
  각 케이스 공격자의 기술은 챔피언스 learnset으로 습득 가능한지 확인함.
- 불일치 8건 (life-orb, expert-belt, reflect, thick-fat, knock-off, facade, body-press, foul-play):
  ChampDex 번들 코드상 해당 효과를 **구현하지 않거나 단순화**함
  (객기 2배·화상 무시 없음, 탁쳐서떨구기 1.5배 없음, 바디프레스/속임수가 자기 공격 사용,
  두꺼운지방을 최종 데미지에 적용, 생명의구슬·달인의띠·리플렉터 보정 순서/반올림 차이).
- 참고 증거: `scripts/showdown-rolls.mjs` — Showdown 배틀 엔진(챔피언스 모드)에 난수를 고정해 같은 케이스를 계산.
  37개 전부 우리 계산과 일치 (불일치 8건 포함). **골든 출처로 쓰지 않음** — 판정은 게임 내 실측으로.
- 실측 판정 (2026-10-04, 사용자 프라이빗 배틀): 불일치 8건 전부 관측값이 우리 16개 값 안 + ChampDex 값 밖 →
  사용자 승인 하에 `golden.json`에 `refutedBy: [관측 id]` 표시. 관측 원본은 `tests/calc/observed.json` (실수치 포함).
  판정용 조합의 ChampDex 값은 같은 URL 형식으로 ChampDex에서 직접 읽어 note에 기록.
