---
description: 세션 시작 — HANDOFF를 읽고 상태를 확인한 뒤 다음 작업을 이어서 진행
---

이전 세션의 인수인계를 받아 작업을 이어간다. 이번 세션 초점(있으면): $ARGUMENTS

1. **읽기**: `docs/HANDOFF.md`, `reports/data-validation.md`, `git log --oneline -10`, `git status`.
   CLAUDE.md 규칙(특히 §0, §8)은 그대로 적용된다.
2. **환경 확인**: `node_modules`가 없으면 `npm install`. Showdown이 필요한 스크립트(`fetch-raw`, `scripts/showdown-rolls.mjs`)를
   쓸 때만 `node_modules/.cache/pokemon-showdown` 존재 확인 (없으면 `npm run fetch-raw -- showdown`).
3. **상태 재확인**: `npm test`, `npm run validate`를 실행해 HANDOFF의 "검증 상태"와 같은지 비교. 다르면 먼저 보고.
4. **보고 (짧게)**: 현재 단계 / 검증 상태 / 사용자 대기 항목 / 이번에 할 작업 1개.
   - `$ARGUMENTS`가 있으면 그것을 이번 작업으로 삼는다.
   - "사용자 대기"에 이번 작업을 막는 항목이 있으면, 그 질문부터 하고 답을 기다린다.
5. 막힌 게 없으면 "다음 할 일" 1번을 바로 시작한다. 검증 전부 PASS 전에는 UI 작업 금지 (CLAUDE.md §0-3).
6. 세션을 끝낼 때는 사용자에게 `/wrapup`을 권한다.
