(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => MAP[c]);

  let session = null;
  let activeTab = 'stats';
  let charSearch = '';
  let onlyVillage = false;
  let currentCharId = null;
  let httpReady = false;
  let toastTimer = 0;

  function toast(msg, kind) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.dataset.kind = kind || 'info';
    el.hidden = false;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.classList.remove('show'); el.hidden = true; }, 2600);
  }

  function summary() {
    try { return session.getSummary(); } catch (e) { return null; }
  }

  function listChars() {
    try { return session.listCharacters(charSearch, onlyVillage); } catch (e) { return []; }
  }

  function renderSummary(s) {
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v == null ? '—' : String(v); };
    set('#sum-hero', s.heroName || '이름 없음');
    set('#sum-date', s.dateText || (s.currDate != null ? s.currDate : '—'));
    set('#sum-generation', s.generation != null ? s.generation : '—');
    set('#sum-chars', s.charCount + '명 · 무공 ' + s.combatSkillCount + ' · 물품 ' + s.itemCount);
    set('#sum-dirty', s.isDirty ? ('변경 ' + s.dirtyCount + '건') : '변경 없음');
    const badge = $('#dirty-badge');
    if (badge) { badge.textContent = s.isDirty ? '미저장' : '저장됨'; badge.dataset.dirty = s.isDirty ? '1' : '0'; }
  }

  function ensureCharSelected() {
    if (currentCharId != null) return currentCharId;
    const rows = listChars();
    if (rows.length) currentCharId = rows[0].id;
    return currentCharId;
  }

  function renderCharList() {
    const box = $('#char-list');
    if (!box) return;
    const rows = listChars();
    if (!rows.length) { box.innerHTML = '<li class="empty">표시할 인물이 없습니다</li>'; return; }
    ensureCharSelected();
    box.innerHTML = rows.map((c) => {
      const cls = ['char-row'];
      if (Number(c.id) === Number(currentCharId)) cls.push('active');
      if (c.isHero) cls.push('hero');
      const tags = [];
      if (c.isHero) tags.push('주인공');
      if (c.isCompanion) tags.push('동행');
      const age = c.currAge != null ? c.currAge : (c.actualAge != null ? c.actualAge : '—');
      return '<li><button type="button" class="' + cls.join(' ') + '" data-action="pick-char" data-char-id="' + esc(c.id) + '">' +
        '<span class="char-name">' + esc(c.name) + '</span>' +
        '<span class="char-meta">' + esc(c.orgName || '무소속') + ' · ' + esc(c.genderText || '미상') + ' · ' + esc(age) + '세</span>' +
        (tags.length ? '<span class="char-tags">' + tags.map(esc).join(' ') + '</span>' : '') +
        '</button></li>';
    }).join('');
  }

  function numInput(label, value, attrs) {
    return '<label class="field"><span>' + esc(label) + '</span><input type="number" value="' + esc(value) + '" ' + attrs + '></label>';
  }

  function renderStats(d) {
    const cat = window.TAIWU_CATALOG || {};
    const names = Array.isArray(cat.mainAttributeNames) && cat.mainAttributeNames.length === 6
      ? cat.mainAttributeNames : ['완력', '민첩', '정신력', '체질', '근골', '지력'];
    const resNames = Array.isArray(cat.resourceNames) && cat.resourceNames.length === 8
      ? cat.resourceNames : ['식재', '목재', '금철', '옥석', '직물', '약재', '은전', '명성'];
    const attrRows = names.map((n, i) =>
      numInput(n, (d.currMainAttributes || [])[i] != null ? d.currMainAttributes[i] : 0, 'data-edit="curr-attr" data-idx="' + i + '"') +
      '<span class="hint">기본 ' + esc((d.baseMainAttributes || [])[i] != null ? d.baseMainAttributes[i] : 0) + '</span>').join('');
    const neiliRows = ['금강', '자하', '현음', '순양'].map((n, i) =>
      numInput(n, (d.baseNeiliAlloc || [])[i] != null ? d.baseNeiliAlloc[i] : 0, 'data-edit="neili-alloc" data-idx="' + i + '"')).join('');
    const resRows = resNames.map((n, i) =>
      numInput(n, (d.resources || [])[i] != null ? d.resources[i] : 0, 'data-edit="resource" data-idx="' + i + '"')).join('');
    const currAge = d.currAge != null ? d.currAge : 0;
    const actualAge = d.actualAge != null ? d.actualAge : 0;
    return '<section class="card"><h3>기본 정보</h3>' +
      numInput('현재 나이', currAge, 'data-edit="currAge"') +
      numInput('실제 나이', actualAge, 'data-edit="actualAge"') +
      numInput('기혈', d.health != null ? d.health : 0, 'data-edit="health"') +
      numInput('최대 기혈', d.baseMaxHealth != null ? d.baseMaxHealth : 0, 'data-edit="baseMaxHealth"') +
      numInput('현재 내력', d.currNeili != null ? d.currNeili : 0, 'data-edit="currNeili"') +
      numInput('추가 내력', d.extraNeili != null ? d.extraNeili : 0, 'data-edit="extraNeili"') +
      numInput('기혈 혼란', d.disorderOfQi != null ? d.disorderOfQi : 0, 'data-edit="disorderOfQi"') +
      numInput('상추 침식', d.xiangshuInfection != null ? d.xiangshuInfection : 0, 'data-edit="xiangshuInfection"') +
      numInput('경지', d.consummateLevel != null ? d.consummateLevel : 0, 'data-edit="consummateLevel"') +
      numInput('기분', d.happiness != null ? d.happiness : 0, 'data-edit="happiness"') +
      numInput('입장·도덕', d.baseMorality != null ? d.baseMorality : 0, 'data-edit="baseMorality"') +
      numInput('수련 경험', d.exp != null ? d.exp : 0, 'data-edit="exp"') +
      '<button type="button" class="btn" data-action="heal">부상·상태 회복</button></section>' +
      '<section class="card"><h3>주요 능력치</h3>' + attrRows + '</section>' +
      '<section class="card"><h3>내력 배분</h3>' + neiliRows + '</section>' +
      '<section class="card"><h3>개인 자원</h3>' + resRows + '</section>';
  }

  function renderQual(d) {
    const lifeNames = (d.lifeSkills || []).map((x) => x.name);
    const combatNames = (d.combatSkillQuals || []).map((x) => x.name);
    const bodyNames = (d.injuriesList || []).map((x) => x.name);
    const poisonNames = (d.poisonedList || []).map((x) => x.name);
    const life = (d.baseLifeSkillQual || []).map((v, i) => numInput(lifeNames[i] || ('생활 ' + i), v, 'data-edit="life-qual" data-idx="' + i + '"')).join('');
    const combat = (d.baseCombatSkillQual || []).map((v, i) => numInput(combatNames[i] || ('무공 ' + i), v, 'data-edit="combat-qual" data-idx="' + i + '"')).join('');
    const injuries = (d.injuries || []).map((v, i) => numInput(bodyNames[i] || ('부위 ' + (i + 1)), v, 'data-edit="injury" data-idx="' + i + '"')).join('');
    const poisoned = (d.poisoned || []).map((v, i) => numInput(poisonNames[i] || ('중독 ' + (i + 1)), v, 'data-edit="poison" data-idx="' + i + '"')).join('');
    const feats = (d.features || []).map((f) =>
      '<span class="chip">' + esc(f.name) + '<button type="button" data-action="del-feature" data-feature-id="' + esc(f.id) + '">×</button></span>').join('');
    return '<section class="card"><h3>생활 자질</h3>' + life + '</section>' +
      '<section class="card"><h3>무공 자질</h3>' + combat + '</section>' +
      '<section class="card"><h3>특성</h3>' + (feats || '<p class="empty">없음</p>') +
      '<div class="row"><input type="text" id="feature-input" placeholder="특성 번호"><button type="button" class="btn" data-action="add-feature">추가</button></div></section>' +
      '<section class="card"><h3>부상</h3>' + injuries + '</section>' +
      '<section class="card"><h3>중독</h3>' + poisoned + '</section>';
  }

  function renderItems(d) {
    const list = d.inventoryList || [];
    const rows = list.map((it, idx) =>
      '<tr><td>' + esc(it.typeName || ('분류 ' + it.itemType)) + '</td><td>' + esc(it.name || ('물품 ' + it.templateId)) +
      '</td><td><input type="number" value="' + esc(it.amount) + '" data-edit="item-amount" data-idx="' + idx + '"></td>' +
      '<td><button type="button" class="mini" data-action="del-item" data-idx="' + idx + '">삭제</button></td></tr>').join('');
    return '<section class="card"><h3>소지품</h3>' +
      '<table class="grid"><thead><tr><th>분류</th><th>이름</th><th>수량</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="4" class="empty">비어 있음</td></tr>') + '</tbody></table>' +
      '<div class="row"><input type="text" id="item-type" placeholder="분류 코드">' +
      '<input type="text" id="item-template" placeholder="물품 번호">' +
      '<input type="number" id="item-amount" placeholder="수량" value="1">' +
      '<button type="button" class="btn" data-action="add-item">추가</button></div></section>';
  }

  function renderSkills(d) {
    const cList = (d.learnedCombatSkills && d.learnedCombatSkills.length)
      ? d.learnedCombatSkills : (d.combatSkillEntries || []);
    const combat = cList.map((s) => {
      const gradeTxt = s.grade != null ? ((9 - Number(s.grade)) + '품') : '—';
      return '<tr><td>' + esc(s.name) + '</td><td>' + esc(gradeTxt) + '</td>' +
        '<td><input type="number" value="' + esc(s.readingState != null ? s.readingState : 0) + '" data-edit="cs-read" data-skill-id="' + esc(s.skillId) + '"></td>' +
        '<td><input type="number" value="' + esc(s.activationState != null ? s.activationState : 0) + '" data-edit="cs-act" data-skill-id="' + esc(s.skillId) + '"></td>' +
        '<td><input type="number" value="' + esc(s.breakoutStepsCount != null ? s.breakoutStepsCount : 0) + '" data-edit="cs-breakout" data-skill-id="' + esc(s.skillId) + '"></td></tr>';
    }).join('');
    const lList = d.learnedLifeSkillEntries || [];
    const life = lList.map((s) => {
      const gradeTxt = s.grade != null ? ((9 - Number(s.grade)) + '품') : '—';
      return '<tr><td>' + esc(s.name) + '</td><td>' + esc(gradeTxt) + '</td>' +
        '<td><input type="number" value="' + esc(s.readingState != null ? s.readingState : 0) + '" data-edit="ls-read" data-skill-id="' + esc(s.skillId) + '"></td></tr>';
    }).join('');
    return '<section class="card"><h3>전투 무공</h3><table class="grid"><thead><tr><th>이름</th><th>등급</th><th>독파 상태</th><th>운용 상태</th><th>돌파 수련</th></tr></thead><tbody>' +
      (combat || '<tr><td colspan="5" class="empty">없음</td></tr>') + '</tbody></table></section>' +
      '<section class="card"><h3>생활 기예</h3><table class="grid"><thead><tr><th>이름</th><th>등급</th><th>독파 상태</th></tr></thead><tbody>' +
      (life || '<tr><td colspan="3" class="empty">없음</td></tr>') + '</tbody></table></section>';
  }

  function renderWorld() {
    const s = summary() || {};
    return '<section class="card"><h3>세계 상태</h3>' +
      '<p class="hint">현재 날짜: ' + esc(s.dateText || s.currDate || '—') + '</p>' +
      '<textarea id="world-json" rows="6" placeholder="변경할 항목을 JSON 형식으로 입력하세요"></textarea>' +
      '<button type="button" class="btn" data-action="apply-world">적용</button>' +
      '<textarea id="taiwu-json" rows="4" placeholder="태오회 설정을 JSON 형식으로 입력하세요"></textarea>' +
      '<button type="button" class="btn" data-action="apply-taiwu">적용</button></section>';
  }

  function fmtVal(v) {
    if (v === undefined) return '—';
    if (v === null || typeof v !== 'object') return String(v);
    return JSON.stringify(v);
  }

  function renderDiff() {
    const presetsObj = (window.TaiwuEditorCore && window.TaiwuEditorCore.PRESETS) || {};
    const presetButtons = Object.keys(presetsObj).map((id) => {
      const p = presetsObj[id];
      return '<button type="button" class="btn preset-btn" data-action="apply-preset" data-preset-id="' + esc(p.id) + '" title="' + esc(p.description) + '">' + esc(p.label) + '</button>';
    }).join('');
    let diffs = [];
    try { diffs = session.computeDiff() || []; } catch (e) { diffs = []; }
    const body = Array.isArray(diffs) ? diffs.map((item) =>
      '<tr><td>' + esc(item.category || '') + '</td><td>' + esc(item.label || item.target || '') +
      '</td><td>' + esc(fmtVal(item.before)) + '</td><td>' + esc(fmtVal(item.after)) + '</td></tr>'
    ).join('') : '';
    return '<section class="card"><h3>빠른 프리셋</h3><div class="preset-row">' + (presetButtons || '<p class="empty">사용 가능한 프리셋이 없습니다</p>') + '</div></section>' +
      '<section class="card"><h3>변경 내역</h3>' +
      (body
        ? '<table class="grid"><thead><tr><th>분류</th><th>항목</th><th>변경 전</th><th>변경 후</th></tr></thead><tbody>' + body + '</tbody></table>'
        : '<p class="empty">변경 사항이 없습니다</p>') +
      '</section>';
  }

  function renderTabContent() {
    const box = $('#tab-content');
    if (!box) return;
    if (!session) { box.innerHTML = '<p class="empty">불러온 세이브가 없습니다</p>'; return; }
    if (activeTab === 'world') { box.innerHTML = renderWorld(); return; }
    if (activeTab === 'diff') { box.innerHTML = renderDiff(); return; }
    ensureCharSelected();
    if (currentCharId == null) { box.innerHTML = '<p class="empty">인물을 선택하세요</p>'; return; }
    let d = null;
    try { d = session.getCharacterDetail(currentCharId); } catch (e) { d = null; }
    if (!d) { box.innerHTML = '<p class="empty">인물 정보를 읽을 수 없습니다</p>'; return; }
    const age = d.currAge != null ? d.currAge : (d.actualAge != null ? d.actualAge : '—');
    const head = '<header class="char-head"><h2>' + esc(d.displayName || ('인물 ' + d.id)) + '</h2><span class="hint">' + esc(d.orgName || '무소속') + ' · ' + esc(d.genderText || '미상') + ' · ' + esc(age) + '세</span></header>';
    if (activeTab === 'stats') box.innerHTML = head + renderStats(d);
    else if (activeTab === 'qual') box.innerHTML = head + renderQual(d);
    else if (activeTab === 'items') box.innerHTML = head + renderItems(d);
    else if (activeTab === 'skills') box.innerHTML = head + renderSkills(d);
    else box.innerHTML = head;
  }

  function renderWorkspace() {
    const s = summary() || {};
    renderSummary(s);
    renderCharList();
    renderTabContent();
    const wp = $('#workspace-panel'), wl = $('#welcome-panel');
    if (wp) wp.hidden = !session;
    if (wl) wl.hidden = !!session;
  }

  function patch(p) {
    if (!currentCharId || !session) return;
    try { session.updateCharacter(currentCharId, p); renderWorkspace(); }
    catch (e) { toast('변경을 적용할 수 없습니다', 'error'); }
  }

  function updateCombat(skillId, p) {
    if (!currentCharId || !session) return;
    try { session.updateCombatSkill(currentCharId, skillId, p); renderWorkspace(); }
    catch (e) { toast('무공 정보를 변경할 수 없습니다', 'error'); }
  }

  function handleEdit(el) {
    const kind = el.dataset.edit;
    const idx = Number(el.dataset.idx);
    const val = el.type === 'number' ? Number(el.value) : el.value;
    switch (kind) {
      case 'currAge': case 'actualAge': case 'health': case 'baseMaxHealth': case 'currNeili': case 'extraNeili':
      case 'disorderOfQi': case 'xiangshuInfection': case 'consummateLevel': case 'happiness':
      case 'baseMorality': case 'exp': patch({ [kind]: val }); break;
      case 'curr-attr': {
        if (!currentCharId) return;
        const d = session.getCharacterDetail(currentCharId);
        const arr = d.currMainAttributes.slice(); arr[idx] = val;
        patch({ currMainAttributes: arr }); break;
      }
      case 'neili-alloc': {
        if (!currentCharId) return;
        const d = session.getCharacterDetail(currentCharId);
        const arr = d.baseNeiliAlloc.slice(); arr[idx] = val;
        patch({ baseNeiliAlloc: arr }); break;
      }
      case 'resource': {
        if (!currentCharId) return;
        const d = session.getCharacterDetail(currentCharId);
        const arr = d.resources.slice(); arr[idx] = val;
        patch({ resources: arr }); break;
      }
      case 'life-qual': {
        if (!currentCharId) return;
        const d = session.getCharacterDetail(currentCharId);
        const arr = d.baseLifeSkillQual.slice(); arr[idx] = val;
        patch({ baseLifeSkillQual: arr }); break;
      }
      case 'combat-qual': {
        if (!currentCharId) return;
        const d = session.getCharacterDetail(currentCharId);
        const arr = d.baseCombatSkillQual.slice(); arr[idx] = val;
        patch({ baseCombatSkillQual: arr }); break;
      }
      case 'injury': {
        if (!currentCharId) return;
        const d = session.getCharacterDetail(currentCharId);
        const arr = d.injuries.slice(); arr[idx] = val;
        patch({ injuries: arr }); break;
      }
      case 'poison': {
        if (!currentCharId) return;
        const d = session.getCharacterDetail(currentCharId);
        const arr = d.poisoned.slice(); arr[idx] = val;
        patch({ poisoned: arr }); break;
      }
      case 'item-amount':
        try { session.updateInventoryItemByIndex(currentCharId, idx, val); renderWorkspace(); }
        catch (e) { toast('수량을 변경할 수 없습니다', 'error'); } break;
      case 'cs-read': updateCombat(el.dataset.skillId, { readingState: val }); break;
      case 'cs-act': updateCombat(el.dataset.skillId, { activationState: val }); break;
      case 'cs-breakout': updateCombat(el.dataset.skillId, { breakoutStepsCount: val }); break;
      case 'ls-read':
        try { session.updateCharacterLifeSkill(currentCharId, el.dataset.skillId, val); renderWorkspace(); }
        catch (e) { toast('생활 기예를 변경할 수 없습니다', 'error'); } break;
      default: break;
    }
  }

  function applyJson(id, fn, label) {
    const el = $(id);
    if (!el) return;
    try {
      const obj = JSON.parse(el.value || '{}');
      fn(obj);
      renderWorkspace();
      toast(label + ' 적용 완료', 'success');
    } catch (e) {
      toast('형식이 올바르지 않습니다', 'error');
    }
  }

  function handleAction(btn) {
    const act = btn.dataset.action;
    if (!act) return;
    switch (act) {
      case 'load-demo': case 'demo':
        session.loadDemo(); currentCharId = null; ensureCharSelected(); renderWorkspace(); toast('예시 세이브를 불러왔습니다', 'success'); break;
      case 'open-files': case 'open':
        $('#file-input') && $('#file-input').click(); break;
      case 'export-json':
        try {
          const snap = session.exportJsonSnapshot();
          download('태오회권_스냅샷.json', JSON.stringify(snap, null, 2));
          toast('JSON을 내보냈습니다', 'success');
        } catch (e) { toast('내보낼 수 없습니다', 'error'); }
        break;
      case 'save-files':
        try {
          const out = session.exportBuffers();
          if (window.chrome && window.chrome.webview && window.chrome.webview.postMessage) {
            window.chrome.webview.postMessage({ type: 'save-files', globalSav: Array.from(out.globalSav), localSav: Array.from(out.localSav) });
            toast('저장을 요청했습니다', 'success');
          } else if (httpReady) {
            fetch('/api/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ globalSav: Array.from(out.globalSav), localSav: Array.from(out.localSav) })
            }).then((r) => { if (!r.ok) throw new Error('fail'); toast('서버에 저장했습니다', 'success'); })
              .catch(() => toast('서버 저장에 실패했습니다', 'error'));
          } else {
            download('전역.sav', out.globalSav);
            download('지역.sav', out.localSav);
            toast('파일을 내려받았습니다', 'success');
          }
        } catch (e) { toast('저장할 수 없습니다', 'error'); }
        break;
      case 'load-server-slot': {
        const sel = $('#slot-select');
        const name = sel && sel.value;
        if (!name) { toast('슬롯을 선택하세요', 'error'); break; }
        fetch('/api/load?name=' + encodeURIComponent(name))
          .then((r) => { if (!r.ok) throw new Error('fail'); return r.json(); })
          .then((body) => {
            session.loadBuffers(toBytes(body.globalSav), toBytes(body.localSav));
            currentCharId = null; ensureCharSelected(); renderWorkspace(); toast('슬롯을 불러왔습니다', 'success');
          })
          .catch(() => toast('슬롯을 불러올 수 없습니다', 'error'));
        break;
      }
      case 'pick-char': currentCharId = btn.dataset.charId; renderWorkspace(); break;
      case 'heal':
        try { session.healCharacter(currentCharId); renderWorkspace(); toast('회복했습니다', 'success'); }
        catch (e) { toast('회복할 수 없습니다', 'error'); } break;
      case 'add-feature': {
        const inp = $('#feature-input');
        if (!inp || !inp.value.trim()) { toast('특성 번호를 입력하세요', 'error'); break; }
        try { session.addCharacterFeature(currentCharId, inp.value.trim()); renderWorkspace(); }
        catch (e) { toast('특성을 추가할 수 없습니다', 'error'); } break;
      }
      case 'del-feature':
        try { session.removeCharacterFeature(currentCharId, btn.dataset.featureId); renderWorkspace(); }
        catch (e) { toast('특성을 제거할 수 없습니다', 'error'); } break;
      case 'add-item': {
        const type = ($('#item-type') || {}).value;
        const tpl = ($('#item-template') || {}).value;
        const amt = Number(($('#item-amount') || {}).value || 1);
        if (!type || !tpl) { toast('분류와 물품 번호를 입력하세요', 'error'); break; }
        try { session.addInventoryItem(currentCharId, type.trim(), tpl.trim(), amt); renderWorkspace(); }
        catch (e) { toast('물품을 추가할 수 없습니다', 'error'); } break;
      }
      case 'del-item':
        try { session.removeInventoryItemByIndex(currentCharId, Number(btn.dataset.idx)); renderWorkspace(); }
        catch (e) { toast('물품을 삭제할 수 없습니다', 'error'); } break;
      case 'apply-preset': {
        const res = session.applyPreset(btn.dataset.presetId, currentCharId);
        renderWorkspace();
        toast((res && res.message) || '프리셋을 적용했습니다', res && res.ok === false ? 'error' : 'success');
        break;
      }
      case 'apply-world': applyJson('#world-json', (o) => session.updateWorld(o), '세계 상태'); break;
      case 'apply-taiwu': applyJson('#taiwu-json', (o) => session.updateTaiwu(o), '태오회 설정'); break;
      default: break;
    }
  }

  function toBytes(v) {
    if (v instanceof Uint8Array) return v;
    if (Array.isArray(v)) return new Uint8Array(v);
    if (typeof v === 'string') {
      const bin = atob(v); const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return arr;
    }
    return new Uint8Array(0);
  }

  function download(name, data) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function readFiles(files) {
    if (!files || files.length < 2) { toast('전역과 지역 세이브 두 개를 선택하세요', 'error'); return; }
    const list = Array.from(files).slice(0, 2);
    Promise.all(list.map((f) => f.arrayBuffer().then((b) => new Uint8Array(b))))
      .then(([g, l]) => {
        session.loadBuffers(g, l);
        currentCharId = null; ensureCharSelected(); renderWorkspace(); toast('세이브를 불러왔습니다', 'success');
      })
      .catch(() => toast('파일을 읽을 수 없습니다', 'error'));
  }

  function bind() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) { handleAction(btn); return; }
      const tab = e.target.closest('.tab-btn[data-tab]');
      if (tab) {
        activeTab = tab.dataset.tab;
        $$('.tab-btn').forEach((b) => {
          const on = (b === tab);
          b.classList.toggle('active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        renderTabContent();
      }
    });
    document.addEventListener('change', (e) => {
      const el = e.target;
      if (el.id === 'file-input') { readFiles(el.files); el.value = ''; return; }
      if (el.id === 'slot-select') return;
      if (el.dataset && el.dataset.edit) handleEdit(el);
    });
    const search = $('#char-search');
    if (search) search.addEventListener('input', () => { charSearch = search.value; renderCharList(); });
    const filter = $('#filter-village');
    if (filter) filter.addEventListener('change', () => { onlyVillage = filter.checked; renderCharList(); });
    const drop = $('#dropzone');
    if (drop) {
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('hot'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('hot'));
      drop.addEventListener('drop', (e) => {
        e.preventDefault(); drop.classList.remove('hot');
        readFiles(e.dataTransfer && e.dataTransfer.files);
      });
    }
  }

  function initSession() {
    const Core = window.TaiwuEditorCore;
    if (Core && typeof Core.createSession === 'function') return Core.createSession();
    if (typeof window.TaiwuEditorSession === 'function') return new window.TaiwuEditorSession();
    return null;
  }

  document.addEventListener('DOMContentLoaded', () => {
    session = initSession();
    if (!session) { toast('편집기 코어를 불러올 수 없습니다', 'error'); return; }
    window.__taiwuSession = session;
    window.__taiwuUI = { render: renderWorkspace, activeTab: () => activeTab };
    bind();

    fetch('/api/health', { method: 'GET' })
      .then((r) => { if (!r.ok) throw new Error('no'); return r.json(); })
      .then(() => {
        httpReady = true;
        const bar = $('#server-slot-bar'); if (bar) bar.hidden = false;
        return fetch('/api/saves').then((r) => (r.ok ? r.json() : [])).then((list) => {
          const sel = $('#slot-select');
          if (!sel) return;
          const items = Array.isArray(list) ? list : (list && list.slots) || [];
          sel.innerHTML = '<option value="">슬롯 선택</option>' + items.map((it) => {
            const name = typeof it === 'string' ? it : (it.name || it.id || '');
            return '<option value="' + esc(name) + '">' + esc(name) + '</option>';
          }).join('');
        });
      })
      .catch(() => { httpReady = false; });

    renderWorkspace();
  });
})();
