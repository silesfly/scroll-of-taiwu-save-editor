# HANDOFF — 태오회권 세이브 에디터

- **프로젝트 루트**: `/home/jiyoung/workspace/editors/태오회권_에디터`
- **최종 갱신**: `2026-11-28` (`HYUP-W20261128-004`)
- **기준 브랜치**: `main`

## 완료된 구현 요약
1. **REA / ECMA-335 메타데이터 기반 `ArchiveData` v4 코덱 (`src/taiwu-deflate.js`, `src/taiwu-wire.js`, `src/taiwu-codec.js`)**
   - `T1G` / `T1L` 헤더(`HeaderCRC32` +4, `ContentCRC32` +12) 및 순수 JS / Node `zlib` RFC1951 deflate/inflate 상호운용.
   - 21개 도메인 프레임 워커(`DOMAIN_WIRE_SPEC`) + `workingDbBytes` 무손실 보존.
   - `GlobalDomain(0)`, `WorldDomain(1)`, `CharacterDomain(4)`(65 고정 필드 `fixedOffsets` + 10 동적 tail + `_rawTails`/`_origTailBytes`), `TaiwuDomain(5)`, `ItemDomain(6)`, `CombatSkillDomain(7)` 지원.
2. **한국어 카탈로그 15종 (`tools/extract_catalog.py` -> `src/catalog-data.js`)**
   - `무협위키/.local/graph/scroll-of-taiwu-data/` 정본 + `GameData.Shared.dll` `Config.CharacterFeature` 리플렉션 덤프(`character_features_dump.json`) 기반 **955종 전체 특성(`#0`~`#954`)** 및 분류·등급·효과 요약(`featureMeta`: 기본 긍정 84·기본 부정 87·문파/퀘스트/특수 668·숨김/NPC 52·신계 DLC 64) 수록 (`hanzi=0`, `markup_tags=0`).
3. **세션 코어 & 단일 HTML UI (`src/editor-core.js`, `src/editor-ui.js`, `src/editor-page.html`, `build.py`)**
   - **단일 파일(`local.sav` 또는 `global.sav`) 즉시 열기**, **매직 바이트(`T1L`/`T1G`, v4) 자동 판별**(2개 파일 역순 자동 스왑), **`SaveGames` 폴더 통째 열기**(다중 `world_*` 슬롯 전환), **`attachGlobalBuffer`/`attachLocalBuffer` 편집 보존 병합**, **원본 파일명 다운로드**(미로드 버퍼 `null` 다운로드 및 `전역.sav`/`지역.sav` 하드코딩 제거), **초기 웰컴 화면 표시** 및 `file://` CORS 콘솔 오류 제거.
   - **전체 특성 도감 955종(`#0`~`#954`)**: 세이브 미로드 상태에서도 상단/웰컴 모달(`<dialog>`)로 검색·분류 필터·클립보드 복사·TXT 내려받기 지원; `자질·특성` 탭 인라인 검색·원클릭 추가/제거 지원.
   - 통합 스킨 `m1` (`수묵 장경각`) 유지.
   - 빌드 산출물: `dist/ScrollOfTaiwuSaveEditor-v1.0.html` (**586,440 bytes / 0.559 MiB**, SHA-256 `748e4dc5a1e4450ce3ff803c05f1448ebe8ceda451f2ef3c35661dc83d8eb3ae`).
4. **Python CLI & HTTP 루프백 서버 (`taiwu_editor.py`)**
   - `demo`, `validate`, `inspect`, `presets`, `edit`, `serve` 및 경로 탈출 차단(`403`), `Origin` 검사(`403`), 백업 생성 검증.
5. **Windows `.NET 4.8` WebView2 호스트 (`src/SaveStore.cs`, `src/SaveEditor.cs`, `tests/SaveStoreTests.cs`)**
   - 커널 핸들 기반 원자 교체 및 롤백 보호 유지.

## 검증 영수증 (최종 수정 이후 실행)
- `python3 tools/extract_catalog.py --check-only`: **PASS** (`Check passed successfully. Verified 15 categories.`, 955종 특성, `hanzi=0`, `tags=0`)
- `python3 build.py`: **PASS** (`586,440 바이트`, SHA-256 `748e4dc5a1e4450ce3ff803c05f1448ebe8ceda451f2ef3c35661dc83d8eb3ae`)
- `node tests/test_editor.cjs`: **PASS** (`passed: 18, failed: 0`)
- `python3 -W error -B -m unittest discover -s tests -v`: **PASS** (`Ran 10 tests — OK`)
- Playwright 헤드리스 Chrome E2E (`file://` 8대 시나리오: 초기 웰컴, 955종 도감 검색, `local.sav` 단독 열기·`#929` 추가·단독 다운로드·CRC32 검증, `global.sav` 단독→`local.sav` 병합, 역순 `[local, global]`, 잘못된 파일 오류 토스트, 한자 0건, 955종 TXT 저장): **PASS** (`console errors=0`, `page errors=0`)
- Duplication Guard (`duplicate_guard.py check --target src --target tests`): **PASS** (`NO_NEW_DUPLICATION`, `new_target_groups=0`, `issues=0`)
- `#5 review_gate` (`latest-sol high`, `oauth_only`, 비작성자 `openai` 계열): **VERDICT: APPROVE_WITH_NOTES** (P0/P1 0건)

## NOT_RUN / 잔여 확인 사항
- Steam 실게임 클라이언트(`The Scroll Of Taiwu`, AppID `838350`)에서 실제 `.sav` 파일 로드 후 게임 재실행 통합 테스트: **NOT_RUN** (`GameData.ArchiveData.dll` 리플렉션으로 `SaveGames\world_1\local.sav`, `ArchiveSlotsCount=15`, `Deflate/CRC32` 스펙 확인 및 데모 픽스처 라운드트립까지 완료).
- 단독 Windows `.exe` GitHub Release(`ScrollOfTaiwuSaveEditor.exe`) 재업로드: **NOT_RUN** (통합 `HyupEditors.exe` 및 `hyupwiki.com/scroll-of-taiwu/editor/app/` 우선 동기화).
