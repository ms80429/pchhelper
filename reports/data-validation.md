# Data Validation Report  (2026-10-05 21:34)

포켓몬: 총 353 / 메가 82 / 폼 41
기술: 총 512 / 공격기 335 / 변화기 177

| 항목 | 요약 | 결과 |
|---|---|---|
| 명단: Bulbapedia Reg M-C | 카드 345 + 출처 정정 1 (kingambit) / 데이터 346 | PASS |
| 명단: Serebii | 행 326, 폼 근거 24 | PASS |
| 메가진화 | 메가 82 / Serebii 메가 특성 39건 대조 | PASS |
| 타입 형식 | 18타입·1~2개·중복 없음 | PASS |
| 종족값 형식 | 6개 모두 1 이상 정수 | PASS |
| 특성 존재 | abilities.json 216개 | PASS |
| 타입·종족값 교차검증 (PokeAPI) | 불일치 0건 | PASS |
| 한글명 | 포켓몬 353 / 기술 512 / 도구 166 / 특성 216 | PASS |
| 계산 스모크 (포켓몬) | 353마리 × 공격/방어 | PASS |
| 습득 기술 존재 | learnset 353마리 | PASS |
| 기술 필수 필드 | 총 512 | PASS |
| 기술 교차검증 (Serebii) | Serebii 512 / 데이터 512 | PASS |
| 공격기 분류 | 고정 277 / 가변 42 / 고정데미지 13 / 특수계산 3 | PASS |
| 가변 위력 탐지 | 탐지 42 / 핸들러 42 / 필수 표 중 미등장: brine | PASS |
| 연속기 타수 (Serebii 효과문) | 연속기 14 | PASS |
| 계산 스모크 (기술) | 공격기 335 | PASS |
| 도구 명단 (Serebii, 티켓류 제외) | Serebii 166 / 데이터 166 | PASS |
| 가변 위력 단위 테스트 | 핸들러 42 / 테스트 통과 42 | PASS |
| 골든 테스트 | 29/37 + 실측 반박 8 | PASS |
| 기타 테스트 | 138개 실행 | PASS |

**전체: PASS**

## 실측 반박 (사용자 승인)

- 골든 `life-orb`: 출처 값이 실측으로 반박됨 (관측: obs-life-orb) — 관측값이 우리 16개 값 안
- 골든 `expert-belt`: 출처 값이 실측으로 반박됨 (관측: obs-expert-belt) — 관측값이 우리 16개 값 안
- 골든 `reflect`: 출처 값이 실측으로 반박됨 (관측: obs-reflect) — 관측값이 우리 16개 값 안
- 골든 `thick-fat`: 출처 값이 실측으로 반박됨 (관측: obs-thick-fat-overheat) — 관측값이 우리 16개 값 안
- 골든 `knock-off`: 출처 값이 실측으로 반박됨 (관측: obs-knock-off-item) — 관측값이 우리 16개 값 안
- 골든 `facade`: 출처 값이 실측으로 반박됨 (관측: obs-facade-burn) — 관측값이 우리 16개 값 안
- 골든 `body-press`: 출처 값이 실측으로 반박됨 (관측: obs-body-press) — 관측값이 우리 16개 값 안
- 골든 `foul-play`: 출처 값이 실측으로 반박됨 (관측: obs-foul-play) — 관측값이 우리 16개 값 안

## 불일치 / 누락 상세

