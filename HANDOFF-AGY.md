# HANDOFF-AGY — 태오회권 세이브 에디터 (AGY 전용 지침)

저장소 루트, 브랜치(`main`), 산출물 SHA-256(`05d9e752ebf391ab44798a72d87e4ebc798afa82b4f3fcb1fa1c868fb674e88e`), 전체 테스트 영수증 및 `NOT_RUN` 목록은 [HANDOFF.md](HANDOFF.md)를 단일 정본으로 따른다.

## AGY 런타임 · 정책 참조
- **전역 규칙 및 메모리**: `~/.gemini/config/AGENTS.md`, `~/.gemini/config/memory/INDEX.md`, `agy-model-agents.json`(`schema_version: "3.0-consolidated-7agents-gcp4"`), `command-background.md`, `change-review.md`, `work-wiki.md`, `duplication-guard.md`
- **통합 7대 에이전트 & 모드 (`/agent_mode`)**: `lead_orchestrator`, `spec_engineer`, `code_implementer`, `validation_runner`, `review_gate`, `guard_watcher`, `media_specialist` (`manual`/`auto` 2모드, `hooks.json` `env009-v1`). `R1`/일반 `R2`는 `1-Pass Unified Review`로 `review_gate` 비작성자 1회 통과 시 즉시 마감한다.
- **작업 플로우 규칙 (REA 선행 조사)**: 게임 에디터 작성 시 먼저 `무협위키`에 REA 분석 결과가 있으면 재사용하고, 없으면 `REA`로 게임 바이너리/소스 구조 분석부터 수행한다(`projects/game-editor.md` 반영).

## 본 작업 AGY 영수증 (`Conversation ID: 0fa1bd71-7c87-4333-85db-5ed9afdd50ff`)
- **Review Gate 영수증 (`#5 review_gate`)**: `gemini-4-carbon-medium` (`silesfly_credit`, response_id `F3z6au3qPP6Mx9gP1dfsoQM`) — `VERDICT: APPROVE`, `CHANGE_REVIEW: PASS`, `INTEGRATION_GATE: PASS`
- **Duplication Guard 스냅샷**: `~/.codex/state/duplication-guard/taiwu-20261116-before.json` -> `taiwu-20261116-after.json`
- **Laya Routing (`--harness agy`, `decision_id: taiwu-20261116-001`)**: `R2` (`code_implementer`) `outcome` / `label` 완료.

## 재개 시 첫 점검
- 후속 수정 요청 시 [HANDOFF.md](HANDOFF.md) 확인 및 `laya-routing` 새 `classify`/`decide`로 착수하며, `dist/ScrollOfTaiwuSaveEditor-v1.0.html` 및 `.exe`는 `.gitignore` 제외 산출물이므로 수정 시 `python3 build.py`로 재생성한다.
