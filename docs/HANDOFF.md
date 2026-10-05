# 인수인계

## 현재 위치
CLAUDE.md §6 **1~9단계 전부 완료** + UI 디자인 정리(토스 스타일). 남은 건 실사용 피드백.

## 검증 상태 (2026-10-05)
- `npx tsc -p .` 통과, `npm test` 138/138 통과 (10파일).
- `npm run validate`: 20개 항목 **전부 PASS**. 골든 테스트 = 출처 일치 29/37 + 실측 반박 8 (life-orb, expert-belt, reflect,
  thick-fat, knock-off, facade, body-press, foul-play — 사용자 승인으로 `golden.json`에 `refutedBy`, `tests/calc/observed.json`으로 검사).

## 사용자 대기
없음.

## 다음 할 일
1. 사용자가 실제 배틀(게임 옆 좁은 창, `npm run dev`)에서 새 디자인을 써보고 피드백 → `index.html` `<style>` 조정.
   사용자가 원하면 글씨·여백을 더 토스처럼 키우기 (지금은 게임 옆에 맞게 촘촘하게 둠).
- (후보) "유력" 데미지 범위: 사전확률 상위 도구·특성만으로 `inferredRange`를 다시 계산해 따로 표시. 지금 범위는 후보 전체.
- (후보) 사이코필드 등 우선도 무효 조건은 우선도 표시에 반영 안 됨.

## 알아둘 것
- 사용률: Smogon `gen9championsbssregmc-1500` 2026-09 chaos → `data/usage.json` `{종: {moves, items, abilities}}` (Showdown 래더 통계,
  인게임 랭크 아님). `usage(종)` / `usageMoves(종)` in `champions.ts`, 메가는 기본폼으로 조회. 가공 규칙(메가 합산, 특성은 기본폼만,
  외형 폼 특성 3건 제외)은 [data/SOURCES.md](../data/SOURCES.md) 5번. 표시: 기술 ≥10%, 도구·특성 ≥5% (미공개일 때),
  추정 요약의 도구·특성 옆 `(xx%)`. 월 갱신 시 `fetch-raw.mjs` `USAGE`와 `build-data.ts` 원본 파일명을 같이 바꿀 것.
- UI 스타일 (2026-10-05): CSS는 전부 `index.html` `<style>` 한 곳. 토스풍 = 테두리 없음, 회색 캔버스 + 흰 카드(20px), 채운 입력(10px),
  `:root` 토큰 + `prefers-color-scheme: dark`. 카드 안 회색 박스(`fieldset`, `.active`)에선 입력을 흰색으로 반전, 상단 `.bar`도 흰 버튼
  (캔버스와 같은 회색이면 안 보임). 폰트 Pretendard CDN(jsdelivr, 오프라인이면 맑은 고딕). 배틀 그리드: >1000px 3열(나|상대|데미지+로그),
  ≤1000px 데미지 위 + 2열, ≤620px 1열. 데미지 줄: `koMax===1` 빨강(확정 1타), `koMin===1` 주황(난수 1타), 미공개 후보는 강조 없음.
  §5-3 가정 문구는 `<details>` summary에 항상 보이게 둠 (긴 설명만 접힘). 타입 색 `.t-<id>`는 UI 색일 뿐 게임 데이터 아님.
- `Pick` (`src/ui/Pick.tsx`): 직접 만든 콤보박스 (datalist는 초성 필터 불가). `matchAt` = 글자별 초성/정확 매칭, ㄱ≠ㄲ.
  정확한 이름을 치면 즉시 선택 → 브라우저 테스트에서 JS로 `input` 이벤트에 한글명 넣는 방식이 그대로 동작.
- 추정 엔진 (8단계) — `src/infer/index.ts`:
  - 관측마다 데미지에 영향 주는 차원을 실제 계산으로 판별(`relevance`). 후보는 **겹치지 않는 차원 그룹**으로 저장, 그룹 간은
    SP 총합 66과 성격(+1·−1)만 `couple`로 결합. 전체 곱이면 수백만 개라 이렇게 함.
  - 도구 후보 = 메가스톤·열매·주얼 제외 전부(발동 시 게임이 알려줌). item `''` = "없음 또는 지금까지 무관했던 도구".
  - 상대 HP%는 ±1% 허용(`PCT_TOL`; 게임 표시 = 정수 반올림 실측, 두 번 읽은 차이라 오차 < 1), 기절은 "최대 난수 ≥ 관측". 후보 0 = 모순 경고. **난수는 정수 사이에 빈틈이 있음**
    (예: 내 한카 H32 B32에 상대 한카 지진 = 77·80·89 불가능) → 경고가 떠도 엔진 버그가 아닐 수 있음, 먼저 가능한 값인지 계산.
  - 로그 → 관측(`obsFromLog`): 데미지 줄 + 같은 턴 상대의 마지막 성공 공격기. 스피드는 양쪽 첫 `move`, 우선도 동일·확정일 때만.
    트릭룸 = 부호 반전 (챔피언스엔 본편의 트릭룸 언더플로 없음 — [champions-diffs.md](champions-diffs.md)).
  - 선공의손톱·퀵드로우 발동은 로그에 없음 → 후보 0 경고 가능. 5개 비HP 능력치가 다 관측되면 그룹 간 성격 검사가 느슨함.
  - `inferredSpeed(inf, state)` = 후보 전체의 (상대 최종 스피드 − 내 최종 스피드) [min,max], 트릭룸이면 부호 반전 → `>0` 상대 선공,
    `<0` 내가 선공, 0 포함 = 불명(동속). `inferredRange`와 같은 `evalRange` 사용. 스피드 미추정이면 undefined → 줄 숨김.
  - 사용률 사전확률(`withPrior`, `summarize`의 `SummaryLine.p`): 그룹 안 (도구, 특성) 줄마다 Smogon 사용률 곱을 정규화. 도구 ''
    (없음/무관) = 100 − Σ(그 그룹에서 영향 있던 도구 사용률). 목록 밖(<1%) = 0.5. **표시용만** — 후보를 지우거나 범위를 바꾸지 않음
    (확률 낮다고 지우면 실제 구애스카프를 놓침). SP 배분은 데이터 없어서 가중 안 함.
  - 우선도 표시: `priorities()`(obsFromLog용)를 export해서 DamagePanel 기술 줄에 `우선도 +n` (특성 미공개면 `0/+1`처럼 가능한 값 전부).
  - Battle.tsx는 슬롯별 추정을 액션 객체 WeakMap 캐시로 누적. `(추정)` = 그 기술이 의존하는 상대 능력치가 전부 추정됐을 때만.
- 데미지 표시 (7단계): 상대 미상 = `OPP_SPREADS` 5개 최소~최대 %, 행동 순서는 스피드 추정 후에만, 미공개 도구 = 없음, 특성 = 첫 특성 (사용자 결정).
  calc에는 영문명. 몇 타: max% → 난수, min% → 확정 (현재 HP 기준).
- 배틀 UI (6단계): React 상태는 `Action[]` 로그 하나, undo = pop, `apply`가 throw하면 경고. `간접/회복` = `hits: 0`
  (분노의주먹·눈사태·추정에서 제외). "기절" = `hp 0, hits 0`. 날씨·필드는 calc 이름. 메가 리듀서가 특성·메가스톤 자동 공개.
- 팀 입력 (5단계): `MonSet`은 전부 id. 프리셋 `localStorage['pokechamps.presets']` = `{이름: MonSet[6]}`, JSON 가져오기는 병합.
  가져오기는 **형식만** 검사(`parsePresets`), 세트 합법성은 불러온 뒤 편집기 `setErrors`가 표시 + 배틀 시작 차단 (오타 팀도 살려서 고치게).
- 브라우저 미리보기: `.claude/launch.json`의 `dev` 5173 / `dev-alt` 5174 / `dev-3` 5175 (다른 채팅이 앞 포트 쓸 때).
  스크린샷이 늦게 갱신될 때 있음 → JS로 DOM 텍스트 확인. React 입력은 native value setter + `input` 이벤트.
  **브라우저 테스트**: 프리셋 키에 `{test: MonSet[6]}` 넣고 reload → 불러오기 select에 `change` **한 번만** → 선출 3개 클릭 →
  상대 입력 6개에 한글명 `input` → 배틀 시작 → 양쪽 선봉 버튼 → 상대 `새 기술` 입력에 기술명, 내 `남은 HP` 폼 `requestSubmit`. 끝나면 프리셋 삭제.
  JSON 내보내기 테스트는 `HTMLAnchorElement.prototype.click`을 잠깐 가로채 실제 다운로드 없이 Blob 확인.
- Bulbapedia는 WebFetch·curl 모두 Cloudflare 403 (2026-10-05). Serebii `attackdex-champions/*.shtml`은 WebFetch 가능.
- 데이터 파이프라인: `npm run fetch-raw [-- 섹션]` → `npm run build-data` → `npm run validate`. 원본 `data/raw/` 수정 금지.
- `battle/state.ts`: 내 HP는 실수치, 상대는 %. `item` undefined = 미공개, `''` = 없음. 집단구타는 선출 3마리 기준.
- 싱글 6→3 선출: 공식 문서 미확인, 사용자가 게임에서 확인 (2026-10-04). 실측 환경: 본계정 + 부계정 프라이빗 배틀.
- 한글명은 `data/ko-names.json`에서 확인. 챔피언스엔 화염구슬·맹독구슬·구애머리띠·구애안경·돌격조끼·진화의휘석 없음.
- ChampDex: 두꺼운지방 = 각 난수 floor(/2)로 재현. learnset에 없는 기술은 조용히 공중날기로 계산, 랭크는 URL에 안 들어감.
- `@smogon/calc` 0.12.0 gen 0 = 챔피언스. 분노의주먹·성묘는 `variable-power.ts`에서 위력 직접 계산. calc 1회 ~0.05ms.
- 출처 정정: `data/raw/manual/roster-errata.json`, 전기쇼크 명중은 Serebii(필중). `/next`·`/wrapup` = `.claude/commands/`.

## 세션 기록
- 2026-10-04: 게임 실측 11건으로 ChampDex 불일치 8건 전부 반박(refutedBy), 검증 20/20 PASS → 3단계 완료.
- 2026-10-04: 4~7단계 — 배틀 상태 리듀서·undo, 팀 입력 UI, 배틀 진행 UI, 데미지 표시 완료.
- 2026-10-04: 8단계 추정 엔진 (차원 그룹 후보·SP66/성격 결합·도구/특성 후보, 로그→관측, 급소 체크, 추정 범위 표시).
- 2026-10-05: 8단계 마무리 — 행동 순서로 스피드 추정(`SpeedObs`, 트릭룸), 추정 요약 도구·특성 × 성격별 SP 범위.
- 2026-10-05: 9단계 — Smogon BSS 사용률 수집·가공(`usage.json`), 상대 미공개 기술 후보 표시.
- 2026-10-05: 추정 화면 브라우저 확인, 사용률 도구·특성 후보, JSON 내보내기/가져오기 수동 테스트, 트릭룸·순풍 출처 확인, 초성 검색 콤보박스.
- 2026-10-05: 추정 스피드로 행동 순서(선공/후공/불명) 표시 — `inferredSpeed`, DamagePanel 한 줄, 브라우저 확인.
- 2026-10-05: 사용자 실측 — 순풍 스피드 ×2, 상대 HP % 정수 반올림 → champions-diffs, `PCT_TOL` 근거 기록.
- 2026-10-05: 기술별 우선도 표시, 사용률 사전확률로 추정 도구·특성 후보에 비율 표시 (`withPrior`).
- 2026-10-05: UI 디자인 정리 — 다크모드·반응형 배틀 그리드·타입 칩·HP 미터·1타 강조, 이어서 토스 스타일(테두리 제거, Pretendard).
