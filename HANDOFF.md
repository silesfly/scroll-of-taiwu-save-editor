# HANDOFF — 태오회권 세이브 에디터

- **프로젝트 루트**: `/home/jiyoung/workspace/editors/태오회권_에디터`
- **작성 시각**: 2026-11-16
- **기준 브랜치**: `main` (HEAD `85b98b9` — 초기 커밋 `d102a81`, `SaveStore.cs` TOCTOU/핸들 롤백 강화 `fd05d94`..`85b98b9`)

## 완료된 구현 요약
1. **REA / ECMA-335 메타데이터 기반 `ArchiveData` v4 코덱 (`src/taiwu-deflate.js`, `src/taiwu-wire.js`, `src/taiwu-codec.js`)**
   - `T1G` / `T1L` 헤더(`HeaderCRC32` +4, `ContentCRC32` +12) 및 순수 JS / Node `zlib` RFC1951 deflate/inflate 상호운용.
   - 21개 도메인 프레임 워커(`DOMAIN_WIRE_SPEC`) + `workingDbBytes` 무손실 보존.
   - `GlobalDomain(0)`, `WorldDomain(1)`, `CharacterDomain(4)`(65 고정 필드 `fixedOffsets` + 10 동적 tail + `_rawTails`/`_origTailBytes`), `TaiwuDomain(5)`, `ItemDomain(6)`, `CombatSkillDomain(7)` 지원.
2. **한국어 카탈로그 (`tools/extract_catalog.py` -> `src/catalog-data.js`)**
   - `무협위키/.local/graph/scroll-of-taiwu-data/`로부터 14종 카테고리 순수 한국어 데이터 추출 (`hanzi=0`, `markup_tags=0`).
3. **세션 코어 & 단일 HTML UI (`src/editor-core.js`, `src/editor-ui.js`, `src/editor-page.html`, `build.py`)**
   - `getCharacterDetail`에서 중첩 아이템 맵(`catalog.items[itemType][templateId]`), 무공 객체(`catalog.combatSkills[id].name`), 생활 기예 배열(`catalog.lifeSkills[id]`), 인물·성별·나이·상추 침식·경지·내력·자질·부상·독성 매핑 완비.
   - `computeDiff()` 내 `cloneJSON(this.model)` 정규화로 `Uint8Array` 오탐 제거.
   - 빌드 산출물: `dist/ScrollOfTaiwuSaveEditor-v1.0.html` (**387,346 bytes / 0.369 MiB**, SHA-256 `05d9e752ebf391ab44798a72d87e4ebc798afa82b4f3fcb1fa1c868fb674e88e`).
4. **Python CLI & HTTP 루프백 서버 (`taiwu_editor.py`)**
   - `demo`, `validate`, `inspect`, `presets`, `edit`, `serve` 및 경로 탈출 차단(`403`), `Origin` 검사(`403`), 백업 생성 검증.
5. **Windows `.NET 4.8` WebView2 호스트 (`src/SaveStore.cs`, `src/SaveEditor.cs`, `tests/SaveStoreTests.cs`)**
   - `SaveEditor.cs` 네임스페이스(`using TaiwuEditor;`) 및 `SaveEditor.Invoke` 한정 수정 후 0-에러·0-경고(`SafeFileHandle`) 컴파일 확인.
   - `SaveStore.cs`: `PinAncestorDirectories`(`FILE_SHARE_DELETE` 배제)·`lockH`(`FILE_SHARE_NONE`)·`RenameByHandle`/`DeleteByHandle` 커널 핸들 기반 원자 교체 및 롤백 시 임시 핸들 즉시 해제·닫기 적용(`85b98b9`), 중간 Phase 3 실패 롤백 회귀 검증 포함.

## 검증 영수증 (최종 수정 이후 실행)
- `python3 tools/extract_catalog.py --check-only`: **PASS** (`Check passed successfully. Verified 14 categories.`)
- `python3 build.py`: **PASS** (`387,346 바이트`, SHA-256 `05d9e752ebf391ab44798a72d87e4ebc798afa82b4f3fcb1fa1c868fb674e88e`)
- `node tests/test_editor.cjs`: **PASS** (`passed: 16, failed: 0`)
- `python3 -W error -B -m unittest discover -s tests -v`: **PASS** (`Ran 10 tests in 13.350s — OK`)
- Playwright 헤드리스 E2E (`http://127.0.0.1:18485/`): **PASS** (`beforeDirty="변경 없음"`, 6개 탭 정상 렌더, `hero_max_stats` 적용 후 `dirtyAfterPreset="변경 1건"` / `54` diff 행, `[object Object]` 없음, `hanziCount=0`, 콘솔 오류 `0`건 / 경고 `0`건)
- Windows-5090 `.NET 4.8` 검증: `SaveStoreTests.exe` **통과 5 / 실패 0**, `ScrollOfTaiwuSaveEditor.exe --self-test` **exit 0**
- Duplication Guard (`duplicate_guard.py check --target src --target tests --target tools`): 테스트 파일(`tests/SaveStoreTests.cs`, `tests/test_cli_and_server.py`) 보일러플레이트 및 대칭 reader/writer 블록(`taiwu-codec.js`, `taiwu-wire.js`) 14건 확인, 실제 중복 결함 없음.
- `#5 review_gate` (`gpt-6.1-sol` 비작성자 `openai` 계열, 커밋 `85b98b9`): **VERDICT: APPROVE / CHANGE_REVIEW: PASS / INTEGRATION_GATE: PASS** (핸들 잠금·중간 Phase 3 롤백 검증 완료). 선행 `gemini-4-carbon-medium`(`silesfly_credit`, `F3z6au3qPP6Mx9gP1dfsoQM`)도 **VERDICT: APPROVE**.

## NOT_RUN / 잔여 확인 사항
- Steam 실게임 클라이언트(`The Scroll Of Taiwu`, AppID `838350`)에서 실제 `.sav` 파일 로드 후 게임 재실행 통합 테스트: **NOT_RUN** (실게임 바이너리 메타데이터·CRC32 스펙 검증 및 데모/리소스 픽스처 라운드트립까지 완료).
- `windows-5090` 임시 검증 폴더(`C:\Users\lesfl\AppData\Local\Temp\taiwu-verify`) 및 Linux `/tmp/taiwu_e2e`는 임시 확인용으로 남아있을 수 있음(보안·저장소 상태에는 무영향).
