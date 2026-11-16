# 태오회권 세이브 에디터 (The Scroll Of Taiwu, AppID 838350)

태오회권(`ArchiveData` v4 — `T1G` / `T1L`) 바이너리 세이브를 100% 한국어 환경(`hanzi=0`, 마크업 태그 `0`)에서 안전하게 열람·수정할 수 있는 **3-서피스 오프라인 세이브 에디터**입니다.

## 주요 기능 및 아키텍처
1. **단일 오프라인 HTML 에디터 (`dist/ScrollOfTaiwuSaveEditor-v1.0.html`)**
   - 외부 네트워크·CDN·폰트 호출 없이 브라우저 단독 실행 (`strict CSP`: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'`).
   - 순수 JS RFC1951 `DeflateStream` 호환 압축/해제(`src/taiwu-deflate.js`) 및 `T1G`/`T1L` HeaderCRC32/ContentCRC32 검증(`src/taiwu-wire.js`).
   - 21개 도메인 중 `GlobalDomain(0)`, `WorldDomain(1)`, `CharacterDomain(4)`(고정 65필드 + 동적 tail 10필드), `TaiwuDomain(5)`, `ItemDomain(6)`, `CombatSkillDomain(7)` 깊은 디코드/인코드 및 미처리 도메인·`workingDb` 바이트 무손실 보존(`src/taiwu-codec.js`).
   - 무협위키(`무협위키/.local/graph/scroll-of-taiwu-data/`) 추출 14종 순수 한국어 카탈로그(`src/catalog-data.js`, 약 204 KB).
   - 6개 편집 탭(`기본·속성`, `자질·특성`, `자원·소지품`, `무공·기예`, `세계·전승`, `프리셋·변경내역`) + 4종 빠른 프리셋 + 실시간 변경 비교(`src/editor-core.js`, `src/editor-ui.js`).

2. **Python CLI 및 루프백 웹 서버 (`taiwu_editor.py`)**
   - `demo`, `validate`, `inspect`, `presets`, `edit`, `serve` 서브커맨드 지원.
   - `serve` 모드는 `127.0.0.1` 루프백 바인딩, `POST /api/save` `Origin` 헤더 검사, 정규 경로(Realpath) 기반 디렉터리 탈출 차단(`403`), 덮어쓰기 전 타임스탬프 백업, 50 MiB 크기 상한을 강제합니다.

3. **Windows `.NET Framework 4.8` WebView2 호스트 (`src/SaveStore.cs`, `src/SaveEditor.cs`)**
   - 리파스 포인트/심볼릭 링크 차단, 허용된 세이브 루트 경로 검증, 원자적 백업·롤백을 지원하는 네이티브 데스크톱 호스트.
   - `--self-test` 자가 점검 플래그 지원.

## 빌드 및 검증 명령
```bash
# 1. 한국어 카탈로그 무결성 확인 (14개 카테고리, 한자/태그 0)
python3 tools/extract_catalog.py --check-only

# 2. 단일 오프라인 HTML 번들 빌드
python3 build.py

# 3. JS 코덱/세션 단위 테스트 (16개)
node tests/test_editor.cjs

# 4. Python CLI 및 루프백 HTTP 서버 테스트 (10개)
python3 -W error -B -m unittest discover -s tests -v

# 5. 로컬 웹 UI 서버 기동
python3 taiwu_editor.py serve --save-dir <세이브_디렉터리> --port 18485
```

## Windows `.NET 4.8` 빌드 예시 (`windows-5090`)
```powershell
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /utf8output /target:winexe /out:ScrollOfTaiwuSaveEditor.exe /resource:dist\ScrollOfTaiwuSaveEditor-v1.0.html,ScrollOfTaiwuSaveEditor.html /r:Microsoft.Web.WebView2.Core.dll /r:Microsoft.Web.WebView2.WinForms.dll /r:System.Web.Extensions.dll src\SaveStore.cs src\SaveEditor.cs
.\ScrollOfTaiwuSaveEditor.exe --self-test
```

## 주의 사항
- 저장 시 자동 백업이 생성되지만, 실게임 세이브 수정 전에는 반드시 별도 백업을 권장합니다.
- 실제 Steam 태오회권 클라이언트(`838350`)에서 직접 세이브를 불러와 실행 확인하는 단계는 환경 범위 밖(`NOT_RUN`)이므로, 첫 실게임 적용 시 소량 테스트 후 진행하세요.
