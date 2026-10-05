# 챔피언스 ↔ 본편(SV) 차이

확인일 2026-10-04. 출처 약어:
**BP** = `data/raw/bulbapedia/Pokémon_Champions.wiki` "Changes from Scarlet and Violet",
**SD** = Showdown `data/mods/champions/*.ts` (commit 9fb3a5b),
**SB** = Serebii `updatedattacks.shtml` / `statusconditions.shtml` / `moves.shtml`.

## 포켓몬
- 타입·종족값 변경 없음: 353개 전부 PokeAPI와 일치 (`reports/data-validation.md`).
- 챔피언스 오리지널/신규 메가와 메가 특성: Serebii `megaabilities.shtml`과 대조 (validate-data).

## 계산에 영향 있는 기술 변경

| 기술 | 변경 | 출처 |
|---|---|---|
| Slash / Trop Kick / Psyshield Bash | 위력 70 → 80 / 85 / 90 | BP, SD, SB |
| Apple Acid, Fire Lash, Grav Apple, Spirit Shackle | 위력 80 → 90 | BP, SD, SB |
| First Impression | 위력 90 → 100. 등장 턴에만 사용 가능 | BP, SD, SB |
| Beak Blast, Mountain Gale | 위력 100 → 120 | BP, SD, SB |
| Meteor Assault | 위력 150 → 170 | BP, SD, SB |
| Bone Rush / Infernal Parade / Snipe Shot / Night Daze | 위력 +5 → 30 / 65 / 85 / 90 | BP, SD, SB |
| Snap Trap | 풀 → 강철 타입 | BP, SD |
| Anchor Shot 90, Bolt Beak 80, Fishious Rend 80, Gear Grind 60(명중 90) 등 | SD 패치 목록 (본편에 없던 기술의 챔피언스 값) | SD `moves.ts` |
| Crush Claw, Dire Claw, Dragon Claw, Shadow Claw | 베기 기술 판정 (예리한칼날 적용) | BP, SD |
| Double Shock | 펀치 기술 판정 (철주먹 적용) | BP, SD |
| Dragon Cheer | 소리 기술 판정 | BP, SD |
| **Rage Fist (분노의주먹)** | **교체·기절 시 피격 횟수 초기화** | BP `Rage_Fist_(move).wiki`, SD `scripts.ts` (`clearVolatile`에서 timesAttacked 초기화) |
| Make It Rain | 명중 100 → 95, 특공 -2 (본편 -1) | BP, SD |
| Crabhammer / Syrup Bomb | 명중 +5 → 95 / 90 | BP, SD |
| Fake Out | 등장 턴에만 사용 가능 | BP, SD |

계산 무관(부가효과 확률 등): Iron Head 풀죽음 20%, Moonblast 특공↓ 10%, Dire Claw 30%, Toxic Thread 스피드 -2,
Freeze-Dry 얼음 상태 불가, 대부분 기술 PP 변경(→ `champions-moves.json`의 pp).

## Showdown과 다른 값 (build-data `MOVE_OVERRIDES`)

| 기술 | Showdown | 채택 | 근거 / 상태 |
|---|---|---|---|
| Double Shock | 명중 100 | 필중(`true`) | SB `moves.shtml`·`updatedattacks.shtml` 둘 다 "--" (SV 100). BP는 펀치 판정만 언급. **⚠ 미확정** — 데미지 계산에는 영향 없음 |

## 상태이상

| 상태 | 챔피언스 | 출처 |
|---|---|---|
| 마비 | 행동 불능 확률 12.5% (본편 25%). 스피드 50%는 동일 | BP, SB, SD `conditions.ts` |
| 잠듦 | 2~3턴 (2턴째 1/3 확률로 깸, 3턴째 확정) | BP, SB, SD |
| 얼음 | 행동 시도 시 25% 해동, 3턴째 확정 해동 | BP, SB, SD |

## 스피드·행동 순서 (확인 2026-10-05)

| 항목 | 챔피언스 | 출처 |
|---|---|---|
| 트릭룸 | 5턴, 우선도 −7 = 본편과 같음. 순서 = 실스피드 부호 반전. 본편의 `10000 − 스피드` 언더플로(실스피드 > 1809일 때 순서 꼬임)는 **없음** — 우리 구현(`infer` 부호 반전)이 이미 이 방식 | SB `moves.shtml`, SD `scripts.ts` `getActionSpeed` ("Remove Trick Room underflow", 게임 근거 표기 없음) |
| 순풍 | 4턴, 스피드 ×2 = 본편과 같음 (SD는 본편 상속, override 없음) | SB `moves.shtml` (턴만), SD (×2 상속), 실측 ×2 (사용자, 2026-10-05) |

BP 변경점 문서에는 두 기술 언급 없음. Bulbapedia 기술 문서는 Cloudflare로 막혀 미확인. 순풍 ×2는 사용자가 게임에서 실측 확인 (2026-10-05).

## 특성

| 특성 | 챔피언스 | 출처 |
|---|---|---|
| Unseen Fist | 방어 중인 상대에게 25% 데미지 (본편 100%) | BP, SD |
| Healer | 발동 50% (본편 30%) | BP, SD |
| Run Away | 교체 시 발동 | BP, SD |
| 신규 메가 특성 | Dragonize, Mega Sol, Piercing Drill, Spicy Spray, Eelevate, Fire Mane, Aura Guard | BP, SB `newabilities.shtml` |

## 도구 / 기타
- Eject Button이 U-turn·Volt Switch·Flip Turn의 교체를 막지 않음 (BP).
- 사용 가능한 도구는 166종뿐: 구애머리띠·구애안경·돌격조끼·진화의휘석 등 **없음** (Serebii `items.shtml` = SD 목록).
- 4배 / 0.25배 상성은 "extremely effective" / "mostly ineffective"로 별도 표시 (표시만, 수치 동일) (BP).
