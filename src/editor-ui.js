(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => MAP[c]);

  const MAX_PICK_BYTES = 64 * 1024 * 1024;
  const FEAT_GROUP_LABELS = {
    0: '기본(긍정)',
    1: '기본(부정)',
    2: '문파·퀘스트·특수',
    3: '숨김·NPC',
    4: '신계 DLC'
  };

  let session = null;
  let activeTab = 'stats';
  let charSearch = '';
  let onlyVillage = false;
  let currentCharId = null;
  let httpReady = false;
  let toastTimer = 0;

  let sourceMode = null; // null | 'demo' | 'file' | 'folder' | 'server'
  let loadedFiles = { localName: null, globalName: null };
  let folderSlots = []; // [{ key, label, localName, localBytes, globalName, globalBytes }]
  let activeFolderSlotKey = null;
  let currentServerSlot = null;

  let qualFeatSearch = '';
  let qualFeatGroup = 'all';
  let dlgFeatSearch = '';
  let dlgFeatGroup = 'all';
  let cachedFeatureRows = null;

  function toast(msg, kind) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.dataset.kind = kind || 'info';
    el.hidden = false;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.classList.remove('show'); el.hidden = true; }, 3200);
  }

  function hasLoaded() {
    return !!(session && (session.localParsed || session.globalParsed));
  }

  function hasLocal() {
    return !!(session && session.localParsed);
  }

  function hasGlobal() {
    return !!(session && session.globalParsed);
  }

  function summary() {
    try { return hasLoaded() ? session.getSummary() : null; } catch (e) { return null; }
  }

  function listChars() {
    try { return hasLocal() ? session.listCharacters(charSearch, onlyVillage) : []; } catch (e) { return []; }
  }

  function bytesToB64(bytes) {
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(s);
  }

  function toBytes(v) {
    if (v instanceof Uint8Array) return v;
    if (Array.isArray(v)) return new Uint8Array(v);
    if (typeof v === 'string') {
      const bin = atob(v);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return arr;
    }
    return new Uint8Array(0);
  }

  function download(name, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch (e) {
      return false;
    }
  }

  function inspectMagic(bytes) {
    if (!bytes || bytes.length < 4) return { kind: null, version: null };
    if (bytes[0] === 0x54 && bytes[1] === 0x31) {
      if (bytes[2] === 0x4c) return { kind: 'local', version: bytes[3] };
      if (bytes[2] === 0x47) return { kind: 'global', version: bytes[3] };
    }
    return { kind: null, version: null };
  }

  function getAllFeatures() {
    if (cachedFeatureRows) return cachedFeatureRows;
    const cat = window.TAIWU_CATALOG || {};
    const fMap = cat.features || {};
    const mMap = cat.featureMeta || {};
    const ids = Object.keys(fMap).map((k) => Number(k)).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
    cachedFeatureRows = ids.map((id) => {
      const key = String(id);
      const rawName = fMap[key];
      const name = typeof rawName === 'string' ? rawName : ((rawName && rawName.name) || ('특성 ' + id));
      const meta = Array.isArray(mMap[key]) ? mMap[key] : [2, 0, ''];
      const group = Number(meta[0]);
      const level = Number(meta[1] || 0);
      const desc = String(meta[2] || '');
      return {
        id,
        name,
        group: Number.isNaN(group) ? 2 : group,
        groupLabel: FEAT_GROUP_LABELS[group] || '특수',
        level,
        desc
      };
    });
    return cachedFeatureRows;
  }

  function filterFeatures(query, group) {
    const all = getAllFeatures();
    const rawQ = String(query || '').trim().toLowerCase();
    const numQ = rawQ.replace(/^#/, '');
    const gFilter = group && group !== 'all' ? Number(group) : null;
    return all.filter((f) => {
      if (gFilter !== null && f.group !== gFilter) return false;
      if (!rawQ) return true;
      if (String(f.id) === numQ || ('#' + f.id).indexOf(rawQ) >= 0) return true;
      if (f.name.toLowerCase().indexOf(rawQ) >= 0) return true;
      if (f.desc && f.desc.toLowerCase().indexOf(rawQ) >= 0) return true;
      return false;
    });
  }

  function buildFeatureText(rows) {
    const lines = ['#번호\t특성 이름\t분류\t설명'];
    for (let i = 0; i < rows.length; i++) {
      const f = rows[i];
      lines.push('#' + f.id + '\t' + f.name + '\t' + f.groupLabel + '\t' + (f.desc || ''));
    }
    return lines.join('\n') + '\n';
  }

  function updateFileBadge() {
    const badge = $('#file-badge');
    if (!badge) return;
    if (!hasLoaded()) {
      badge.hidden = true;
      badge.textContent = '';
      return;
    }
    if (sourceMode === 'demo') {
      badge.textContent = '데모 세이브';
    } else if (hasLocal() && hasGlobal()) {
      badge.textContent = (loadedFiles.localName || 'local.sav') + ' + ' + (loadedFiles.globalName || 'global.sav');
    } else if (hasLocal()) {
      badge.textContent = loadedFiles.localName || 'local.sav';
    } else {
      badge.textContent = (loadedFiles.globalName || 'global.sav') + ' (전역 전용)';
    }
    badge.hidden = false;
  }

  function renderModeBanner() {
    const banner = $('#mode-banner');
    if (!banner) return;
    if (!hasLoaded()) {
      banner.hidden = true;
      banner.innerHTML = '';
      banner.className = 'mode-banner';
      return;
    }
    if (hasGlobal() && !hasLocal()) {
      banner.className = 'mode-banner is-warn';
      banner.innerHTML =
        '<span>전역 파일(<code>' + esc(loadedFiles.globalName || 'global.sav') +
        '</code>)만 열려 있습니다. 인물·능력치·특성·소지품·무공을 편집하려면 슬롯 폴더(<code>world_1</code> 등) 안의 <code>local.sav</code>를 열어주세요.</span>' +
        '<div class="banner-actions"><button type="button" class="primary" data-action="open-files">local.sav 열기</button></div>';
      banner.hidden = false;
      return;
    }
    banner.hidden = true;
    banner.innerHTML = '';
    banner.className = 'mode-banner';
  }

  function renderFolderSlotBar() {
    const bar = $('#folder-slot-bar');
    const sel = $('#folder-slot-select');
    if (!bar || !sel) return;
    if (sourceMode !== 'folder' || folderSlots.length <= 1) {
      bar.hidden = true;
      sel.innerHTML = '';
      return;
    }
    sel.innerHTML = folderSlots.map((slot) =>
      '<option value="' + esc(slot.key) + '"' + (slot.key === activeFolderSlotKey ? ' selected' : '') + '>' +
      esc(slot.label) + '</option>'
    ).join('');
    bar.hidden = false;
  }

  function renderSummary(s) {
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v == null ? '—' : String(v); };
    if (!s) {
      set('#sum-hero', '없음');
      set('#sum-date', '-');
      set('#sum-generation', '-');
      set('#sum-chars', '0');
      set('#sum-dirty', '변경 없음');
      const badge = $('#dirty-badge');
      if (badge) { badge.hidden = true; badge.textContent = '변경 0건'; badge.dataset.dirty = '0'; }
      return;
    }
    set('#sum-hero', s.heroName || '이름 없음');
    set('#sum-date', s.dateText || (s.currDate != null ? s.currDate : '—'));
    set('#sum-generation', s.hasLocal ? (s.generation != null ? s.generation : '—') : '—');
    set('#sum-chars', s.hasLocal ? (s.charCount + '명 · 무공 ' + s.combatSkillCount + ' · 물품 ' + s.itemCount) : '전역 전용');
    set('#sum-dirty', s.isDirty ? ('변경 ' + Math.max(1, s.dirtyCount) + '건') : '변경 없음');
    const badge = $('#dirty-badge');
    if (badge) {
      badge.hidden = false;
      badge.textContent = s.isDirty ? '미저장' : '저장됨';
      badge.dataset.dirty = s.isDirty ? '1' : '0';
    }
  }

  function ensureCharSelected() {
    const rows = listChars();
    if (!rows.length) {
      currentCharId = null;
      return null;
    }
    if (currentCharId != null && rows.some((r) => Number(r.id) === Number(currentCharId))) {
      return currentCharId;
    }
    currentCharId = rows[0].id;
    return currentCharId;
  }

  function renderCharList() {
    const box = $('#char-list');
    if (!box) return;
    if (!hasLocal()) {
      box.innerHTML = '<li class="empty">전역 파일만 열려 있습니다. local.sav를 열면 인물 목록이 표시됩니다.</li>';
      return;
    }
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
      return '<li><button type="button" class="' + cls.join(' ') + '" data-action="pick-char" data-char-id="' + esc(c.id) + '" aria-selected="' + (Number(c.id) === Number(currentCharId) ? 'true' : 'false') + '">' +
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

  function renderFeatureRowsHtml(rows, ownedSet, limit, allowAttach) {
    const slice = limit > 0 ? rows.slice(0, limit) : rows;
    if (!slice.length) {
      return '<table><tbody><tr><td class="empty">일치하는 특성이 없습니다</td></tr></tbody></table>';
    }
    const body = slice.map((f) => {
      const has = ownedSet && ownedSet.has(f.id);
      let actionHtml;
      if (allowAttach) {
        actionHtml = has
          ? '<button type="button" data-action="del-feature" data-feature-id="' + esc(f.id) + '">제거</button>'
          : '<button type="button" class="primary" data-action="add-feature-id" data-feature-id="' + esc(f.id) + '">추가</button>';
      } else {
        actionHtml = '<button type="button" data-action="copy-feature-id" data-feature-id="' + esc(f.id) + '">#' + esc(f.id) + ' 복사</button>';
      }
      return '<tr>' +
        '<td class="feat-id">#' + esc(f.id) + '</td>' +
        '<td>' + esc(f.name) + '</td>' +
        '<td><span class="feat-tag">' + esc(f.groupLabel) + '</span></td>' +
        '<td class="feat-desc">' + esc(f.desc || '—') + '</td>' +
        '<td>' + actionHtml + '</td>' +
        '</tr>';
    }).join('');
    const note = limit > 0 && rows.length > limit
      ? '<p class="hint" style="padding:8px 10px">검색 결과 ' + rows.length + '건 중 상위 ' + limit + '건 표시 중입니다. 검색어를 좁히거나 "전체 특성 도감"을 열어 모두 확인하세요.</p>'
      : '';
    return '<table><thead><tr><th>번호</th><th>특성 이름</th><th>분류</th><th>설명</th><th>작업</th></tr></thead><tbody>' + body + '</tbody></table>' + note;
  }

  function getOwnedFeatureSet() {
    const set = new Set();
    if (!hasLocal() || currentCharId == null) return set;
    try {
      const d = session.getCharacterDetail(currentCharId);
      if (d && Array.isArray(d.featureIds)) {
        d.featureIds.forEach((id) => set.add(Number(id)));
      }
    } catch (e) {}
    return set;
  }

  function renderQualFeatureResults() {
    const box = $('#qual-feat-list');
    if (!box) return;
    const rows = filterFeatures(qualFeatSearch, qualFeatGroup);
    const owned = getOwnedFeatureSet();
    box.innerHTML = renderFeatureRowsHtml(rows, owned, 80, true);
  }

  function renderFeatureCatalogDialog() {
    const box = $('#feat-dlg-list');
    if (!box) return;
    const rows = filterFeatures(dlgFeatSearch, dlgFeatGroup);
    const countEl = $('#feat-dialog-count');
    if (countEl) countEl.textContent = rows.length + ' / ' + getAllFeatures().length + '종';
    const allowAttach = hasLocal() && currentCharId != null;
    const owned = allowAttach ? getOwnedFeatureSet() : null;
    box.innerHTML = renderFeatureRowsHtml(rows, owned, 0, allowAttach);
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
      '<span class="chip">#' + esc(f.id) + ' ' + esc(f.name) + '<button type="button" data-action="del-feature" data-feature-id="' + esc(f.id) + '">×</button></span>').join('');
    const owned = new Set((d.featureIds || []).map((id) => Number(id)));
    const matched = filterFeatures(qualFeatSearch, qualFeatGroup);
    return '<section class="card"><h3>생활 자질</h3>' + life + '</section>' +
      '<section class="card"><h3>무공 자질</h3>' + combat + '</section>' +
      '<section class="card"><h3>특성</h3><div class="chip-list">' + (feats || '<p class="empty">없음</p>') + '</div>' +
      '<div class="feat-tools"><input type="text" id="feature-input" placeholder="특성 번호 직접 입력 (예: 606)"><button type="button" class="btn" data-action="add-feature">번호로 추가</button>' +
      '<button type="button" data-action="open-feature-catalog">전체 특성 도감 (#0~#954)</button></div>' +
      '<div class="feat-tools">' +
      '<input id="qual-feat-search" type="search" value="' + esc(qualFeatSearch) + '" placeholder="특성 이름·#번호 검색 (문파·퀘스트·NPC 포함)" autocomplete="off">' +
      '<select id="qual-feat-group" aria-label="특성 분류">' +
      '<option value="all"' + (qualFeatGroup === 'all' ? ' selected' : '') + '>전체 분류 (' + getAllFeatures().length + ')</option>' +
      '<option value="0"' + (qualFeatGroup === '0' ? ' selected' : '') + '>기본 특성 (긍정)</option>' +
      '<option value="1"' + (qualFeatGroup === '1' ? ' selected' : '') + '>기본 특성 (부정)</option>' +
      '<option value="2"' + (qualFeatGroup === '2' ? ' selected' : '') + '>문파·퀘스트·특수</option>' +
      '<option value="3"' + (qualFeatGroup === '3' ? ' selected' : '') + '>숨김·NPC 전용</option>' +
      '<option value="4"' + (qualFeatGroup === '4' ? ' selected' : '') + '>신계 DLC</option>' +
      '</select></div>' +
      '<div id="qual-feat-list" class="feat-scroll">' + renderFeatureRowsHtml(matched, owned, 80, true) + '</div></section>' +
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
    const parts = [];
    if (hasLocal()) {
      parts.push(
        '<section class="card"><h3>세계 상태 (local.sav)</h3>' +
        '<p class="hint">현재 날짜: ' + esc(s.dateText || s.currDate || '—') + '</p>' +
        '<textarea id="world-json" rows="6" placeholder="변경할 항목을 JSON 형식으로 입력하세요"></textarea>' +
        '<div class="row-actions"><button type="button" class="btn" data-action="apply-world">세계 상태 적용</button></div>' +
        '<textarea id="taiwu-json" rows="4" placeholder="태오회 설정을 JSON 형식으로 입력하세요"></textarea>' +
        '<div class="row-actions"><button type="button" class="btn" data-action="apply-taiwu">태오회 설정 적용</button></div></section>'
      );
    } else {
      parts.push(
        '<section class="card"><h3>슬롯 세이브 미로드</h3>' +
        '<p class="hint">세계 진행·태오촌·인물 설정은 슬롯 폴더(world_1 등) 안의 local.sav를 열어야 편집할 수 있습니다.</p>' +
        '<div class="row-actions"><button type="button" class="primary" data-action="open-files">local.sav 열기</button></div></section>'
      );
    }
    if (hasGlobal()) {
      const g = (session.model && session.model.global) || {};
      const cleanG = {
        globalFlags: g.globalFlags || '0',
        ownedChickens: Array.isArray(g.ownedChickens) ? g.ownedChickens : [],
        achievementsCount: g.achievementsCount || 0
      };
      parts.push(
        '<section class="card"><h3>전역 기록 (global.sav)</h3>' +
        '<p class="hint">전역 플래그: ' + esc(cleanG.globalFlags) + ' · 보유 신계: ' + esc(cleanG.ownedChickens.length) + '종 · 업적 수: ' + esc(cleanG.achievementsCount) + '</p>' +
        '<textarea id="global-json" rows="5">' + esc(JSON.stringify(cleanG, null, 2)) + '</textarea>' +
        '<div class="row-actions"><button type="button" class="btn" data-action="apply-global">전역 기록 적용</button></div></section>'
      );
    }
    return parts.join('');
  }

  function fmtVal(v) {
    if (v === undefined) return '—';
    if (v === null || typeof v !== 'object') return String(v);
    return JSON.stringify(v);
  }

  function renderDiff() {
    const presetsObj = (window.TaiwuEditorCore && window.TaiwuEditorCore.PRESETS) || {};
    const presetButtons = hasLocal()
      ? Object.keys(presetsObj).map((id) => {
          const p = presetsObj[id];
          return '<button type="button" class="btn preset-btn" data-action="apply-preset" data-preset-id="' + esc(p.id) + '" title="' + esc(p.description) + '">' + esc(p.label) + '</button>';
        }).join('')
      : '<p class="empty">프리셋은 local.sav를 열었을 때 사용할 수 있습니다</p>';
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

  function syncTabButtons() {
    $$('.tab-btn[data-tab]').forEach((b) => {
      const on = (b.dataset.tab === activeTab);
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function renderTabContent() {
    const box = $('#tab-content');
    if (!box) return;
    if (!hasLoaded()) { box.innerHTML = '<p class="empty">불러온 세이브가 없습니다</p>'; return; }
    if (activeTab === 'world') { box.innerHTML = renderWorld(); return; }
    if (activeTab === 'diff') { box.innerHTML = renderDiff(); return; }
    if (!hasLocal()) {
      box.innerHTML = '<section class="card"><h3>슬롯 세이브(local.sav)가 필요합니다</h3>' +
        '<p class="hint">현재 전역 파일(global.sav)만 열려 있습니다. 인물 능력치·자질·특성·소지품·무공을 보려면 슬롯 폴더(world_1 등)의 local.sav를 열어주세요.</p>' +
        '<div class="row-actions"><button type="button" class="primary" data-action="open-files">local.sav 열기</button></div></section>';
      return;
    }
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
    const loaded = hasLoaded();
    const s = loaded ? (summary() || {}) : null;
    renderSummary(s);
    updateFileBadge();
    renderModeBanner();
    renderFolderSlotBar();
    syncTabButtons();
    if (loaded) {
      renderCharList();
      renderTabContent();
    }
    const wp = $('#workspace-panel'), wl = $('#welcome-panel');
    if (wp) wp.hidden = !loaded;
    if (wl) wl.hidden = loaded;
    const dlg = $('#feature-catalog-dialog');
    if (dlg && dlg.open) renderFeatureCatalogDialog();
  }

  function patch(p) {
    if (currentCharId == null || !hasLocal()) return;
    try { session.updateCharacter(currentCharId, p); renderWorkspace(); }
    catch (e) { toast('변경을 적용할 수 없습니다', 'error'); }
  }

  function updateCombat(skillId, p) {
    if (currentCharId == null || !hasLocal()) return;
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
        if (currentCharId == null) return;
        const d = session.getCharacterDetail(currentCharId);
        const arr = d.currMainAttributes.slice(); arr[idx] = val;
        patch({ currMainAttributes: arr }); break;
      }
      case 'neili-alloc': {
        if (currentCharId == null) return;
        const d = session.getCharacterDetail(currentCharId);
        const arr = d.baseNeiliAlloc.slice(); arr[idx] = val;
        patch({ baseNeiliAlloc: arr }); break;
      }
      case 'resource': {
        if (currentCharId == null) return;
        const d = session.getCharacterDetail(currentCharId);
        const arr = d.resources.slice(); arr[idx] = val;
        patch({ resources: arr }); break;
      }
      case 'life-qual': {
        if (currentCharId == null) return;
        const d = session.getCharacterDetail(currentCharId);
        const arr = d.baseLifeSkillQual.slice(); arr[idx] = val;
        patch({ baseLifeSkillQual: arr }); break;
      }
      case 'combat-qual': {
        if (currentCharId == null) return;
        const d = session.getCharacterDetail(currentCharId);
        const arr = d.baseCombatSkillQual.slice(); arr[idx] = val;
        patch({ baseCombatSkillQual: arr }); break;
      }
      case 'injury': {
        if (currentCharId == null) return;
        const d = session.getCharacterDetail(currentCharId);
        const arr = d.injuries.slice(); arr[idx] = val;
        patch({ injuries: arr }); break;
      }
      case 'poison': {
        if (currentCharId == null) return;
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

  function loadFolderSlot(slotKey) {
    const slot = folderSlots.find((s) => s.key === slotKey);
    if (!slot) { toast('슬롯을 찾을 수 없습니다', 'error'); return; }
    try {
      session.loadBuffers(slot.globalBytes || null, slot.localBytes || null);
      sourceMode = 'folder';
      activeFolderSlotKey = slot.key;
      loadedFiles = {
        localName: slot.localBytes ? (slot.localName || 'local.sav') : null,
        globalName: slot.globalBytes ? (slot.globalName || 'global.sav') : null
      };
      currentCharId = null;
      if (hasLocal()) {
        ensureCharSelected();
        if (activeTab === 'world' && !hasGlobal()) activeTab = 'stats';
      } else {
        activeTab = 'world';
      }
      renderWorkspace();
      toast(slot.label + ' 슬롯을 불러왔습니다', 'success');
    } catch (e) {
      toast((e && e.message) || '슬롯을 읽을 수 없습니다', 'error');
    }
  }

  function handleAction(btn) {
    const act = btn.dataset.action;
    if (!act) return;
    switch (act) {
      case 'load-demo': case 'demo':
        session.loadDemo();
        sourceMode = 'demo';
        loadedFiles = { localName: 'local.sav', globalName: 'global.sav' };
        folderSlots = [];
        activeFolderSlotKey = null;
        currentServerSlot = null;
        currentCharId = null;
        activeTab = 'stats';
        ensureCharSelected();
        renderWorkspace();
        toast('예시 세이브를 불러왔습니다', 'success');
        break;
      case 'open-files': case 'open': {
        const inp = $('#file-input');
        if (inp) { inp.value = ''; inp.click(); }
        break;
      }
      case 'open-folder': {
        const inp = $('#folder-input');
        if (inp) { inp.value = ''; inp.click(); }
        else toast('이 브라우저에서는 폴더 열기를 지원하지 않습니다', 'error');
        break;
      }
      case 'open-feature-catalog': {
        const dlg = $('#feature-catalog-dialog');
        if (!dlg) break;
        renderFeatureCatalogDialog();
        if (typeof dlg.showModal === 'function') {
          if (!dlg.open) dlg.showModal();
        } else {
          dlg.setAttribute('open', '');
        }
        const searchEl = $('#feat-dlg-search');
        if (searchEl) searchEl.focus();
        break;
      }
      case 'close-feature-catalog': {
        const dlg = $('#feature-catalog-dialog');
        if (!dlg) break;
        if (typeof dlg.close === 'function') dlg.close();
        else dlg.removeAttribute('open');
        break;
      }
      case 'copy-feature-list': {
        const rows = filterFeatures(dlgFeatSearch, dlgFeatGroup);
        copyText(buildFeatureText(rows)).then((ok) => {
          toast(ok ? ('특성 ' + rows.length + '종 목록을 복사했습니다') : '클립보드 복사에 실패했습니다', ok ? 'success' : 'error');
        });
        break;
      }
      case 'download-feature-list': {
        const rows = filterFeatures(dlgFeatSearch, dlgFeatGroup);
        download('taiwu_features_' + rows.length + '.txt', buildFeatureText(rows), 'text/plain;charset=utf-8');
        toast('특성 ' + rows.length + '종 목록을 TXT로 저장했습니다', 'success');
        break;
      }
      case 'copy-feature-id': {
        const fid = btn.dataset.featureId;
        copyText('#' + fid).then((ok) => {
          toast(ok ? ('특성 번호 #' + fid + ' 복사 완료') : '복사에 실패했습니다', ok ? 'success' : 'error');
        });
        break;
      }
      case 'export-json':
        if (!hasLoaded()) { toast('먼저 세이브 파일을 열어주세요', 'error'); break; }
        try {
          const snap = session.exportJsonSnapshot();
          download('taiwu_snapshot.json', typeof snap === 'string' ? snap : JSON.stringify(snap, null, 2), 'application/json;charset=utf-8');
          toast('JSON을 내보냈습니다', 'success');
        } catch (e) { toast('내보낼 수 없습니다', 'error'); }
        break;
      case 'save-files':
        if (!hasLoaded()) { toast('먼저 세이브 파일을 열어주세요', 'error'); break; }
        try {
          const out = session.exportBuffers();
          const hasG = !!(out && out.globalSav && out.globalSav.length);
          const hasL = !!(out && out.localSav && out.localSav.length);
          if (!hasG && !hasL) { toast('저장할 세이브 데이터가 없습니다', 'error'); break; }
          const gName = loadedFiles.globalName || 'global.sav';
          const lName = loadedFiles.localName || 'local.sav';
          if (window.chrome && window.chrome.webview && window.chrome.webview.postMessage) {
            const payload = { type: 'save-files', globalName: gName, localName: lName };
            if (hasG) payload.globalSav = Array.from(out.globalSav);
            if (hasL) payload.localSav = Array.from(out.localSav);
            window.chrome.webview.postMessage(payload);
            toast('저장을 요청했습니다', 'success');
          } else if (httpReady && currentServerSlot) {
            const body = { slotDir: currentServerSlot };
            if (hasG) body.globalSavB64 = bytesToB64(out.globalSav);
            if (hasL) body.localSavB64 = bytesToB64(out.localSav);
            fetch('/api/save?path=' + encodeURIComponent(currentServerSlot), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            }).then((r) => { if (!r.ok) throw new Error('fail'); toast('서버에 저장했습니다', 'success'); })
              .catch(() => toast('서버 저장에 실패했습니다', 'error'));
          } else {
            const savedNames = [];
            if (hasL) {
              download(lName, out.localSav);
              savedNames.push(lName);
            }
            if (hasG) {
              if (hasL) {
                setTimeout(() => download(gName, out.globalSav), 150);
              } else {
                download(gName, out.globalSav);
              }
              savedNames.push(gName);
            }
            renderWorkspace();
            toast(savedNames.join(', ') + ' 파일을 내려받았습니다', 'success');
          }
        } catch (e) { toast((e && e.message) || '저장할 수 없습니다', 'error'); }
        break;
      case 'load-server-slot': {
        const sel = $('#slot-select');
        const target = sel && sel.value;
        if (!target) { toast('슬롯을 선택하세요', 'error'); break; }
        fetch('/api/load?path=' + encodeURIComponent(target), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slotDir: target })
        })
          .then((r) => { if (!r.ok) throw new Error('fail'); return r.json(); })
          .then((body) => {
            const gRaw = body.globalSavB64 || body.globalSav || null;
            const lRaw = body.localSavB64 || body.localSav || null;
            const g = gRaw ? toBytes(gRaw) : null;
            const l = lRaw ? toBytes(lRaw) : null;
            session.loadBuffers(g, l);
            sourceMode = 'server';
            currentServerSlot = target;
            loadedFiles = { localName: l ? 'local.sav' : null, globalName: g ? 'global.sav' : null };
            folderSlots = [];
            activeFolderSlotKey = null;
            currentCharId = null;
            activeTab = hasLocal() ? 'stats' : 'world';
            ensureCharSelected();
            renderWorkspace();
            toast('슬롯을 불러왔습니다', 'success');
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
        const raw = inp && inp.value.trim().replace(/^#/, '');
        if (!raw || !/^\d+$/.test(raw)) { toast('숫자로 된 특성 번호를 입력하세요', 'error'); break; }
        try {
          session.addCharacterFeature(currentCharId, Number(raw));
          renderWorkspace();
          toast('특성 #' + raw + ' 추가 완료', 'success');
        } catch (e) { toast('특성을 추가할 수 없습니다', 'error'); }
        break;
      }
      case 'add-feature-id': {
        const fid = Number(btn.dataset.featureId);
        if (!hasLocal() || currentCharId == null || Number.isNaN(fid)) {
          toast('먼저 local.sav를 열어 인물을 선택하세요', 'error');
          break;
        }
        try {
          session.addCharacterFeature(currentCharId, fid);
          renderWorkspace();
          const fName = (window.TAIWU_CATALOG && window.TAIWU_CATALOG.features && window.TAIWU_CATALOG.features[String(fid)]) || ('특성 ' + fid);
          toast('#' + fid + ' ' + fName + ' 추가 완료', 'success');
        } catch (e) { toast('특성을 추가할 수 없습니다', 'error'); }
        break;
      }
      case 'del-feature':
        try {
          session.removeCharacterFeature(currentCharId, btn.dataset.featureId);
          renderWorkspace();
          toast('특성 #' + btn.dataset.featureId + ' 제거 완료', 'success');
        } catch (e) { toast('특성을 제거할 수 없습니다', 'error'); }
        break;
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
      case 'apply-global': applyJson('#global-json', (o) => session.updateGlobal(o), '전역 기록'); break;
      default: break;
    }
  }

  function isCandidateSaveFile(file, fromFolder) {
    if (!file || typeof file.size !== 'number' || file.size < 16 || file.size > MAX_PICK_BYTES) return false;
    if (!fromFolder) return true;
    const name = String(file.name || '').toLowerCase();
    return name.endsWith('.sav') || name.endsWith('.sav.sp') || name.endsWith('.sp');
  }

  function dirOf(relPath) {
    const p = String(relPath || '').replace(/\\/g, '/');
    const idx = p.lastIndexOf('/');
    return idx >= 0 ? p.slice(0, idx) : '';
  }

  function findCompanionGlobal(localEntry, globals) {
    if (!globals.length) return null;
    if (globals.length === 1) return globals[0];
    const lDir = localEntry.dir;
    const parentDir = dirOf(lDir);
    return globals.find((g) => g.dir === parentDir)
      || globals.find((g) => g.dir === lDir)
      || globals.find((g) => !g.dir || lDir.indexOf(g.dir + '/') === 0)
      || globals[0];
  }

  function readFiles(files, opts) {
    opts = opts || {};
    const rawList = Array.from(files || []).filter(Boolean);
    if (!rawList.length) { toast('세이브 파일을 선택하세요', 'error'); return; }
    const fromFolder = opts.fromFolder != null
      ? !!opts.fromFolder
      : rawList.some((f) => (f.webkitRelativePath || '').indexOf('/') >= 0);

    const candidates = rawList.filter((f) => isCandidateSaveFile(f, fromFolder));
    if (!candidates.length) {
      toast(fromFolder ? '선택한 폴더에서 .sav 세이브 파일을 찾지 못했습니다' : '올바른 세이브 파일(.sav)을 선택해 주세요', 'error');
      return;
    }

    Promise.all(candidates.map((f) => f.arrayBuffer().then((buf) => {
      const bytes = new Uint8Array(buf);
      const relPath = f.webkitRelativePath || f.name;
      return {
        name: f.name,
        relPath,
        dir: dirOf(relPath),
        bytes,
        magic: inspectMagic(bytes)
      };
    }))).then((entries) => {
      const validLocals = [];
      const validGlobals = [];
      let badVersion = false;

      entries.forEach((e) => {
        if (!e.magic.kind) return;
        if (e.magic.version !== 4) { badVersion = true; return; }
        if (e.magic.kind === 'local') validLocals.push(e);
        else if (e.magic.kind === 'global') validGlobals.push(e);
      });

      if (!validLocals.length && !validGlobals.length) {
        if (badVersion) {
          toast('태오회권 정식판(Archive v4) 세이브 파일만 지원합니다', 'error');
        } else {
          toast('지원하지 않는 파일입니다. 슬롯 폴더의 local.sav 또는 global.sav를 선택해 주세요', 'error');
        }
        return;
      }

      if (fromFolder || validLocals.length > 1) {
        validLocals.sort((a, b) => a.relPath.localeCompare(b.relPath));
        if (validLocals.length) {
          folderSlots = validLocals.map((loc, idx) => {
            const comp = findCompanionGlobal(loc, validGlobals);
            return {
              key: 'slot-' + idx,
              label: loc.relPath + (comp ? ' (+ global.sav)' : ''),
              localName: loc.name,
              localBytes: loc.bytes,
              globalName: comp ? comp.name : null,
              globalBytes: comp ? comp.bytes : null
            };
          });
        } else {
          const g0 = validGlobals[0];
          folderSlots = [{
            key: 'slot-0',
            label: g0.relPath + ' (전역 전용)',
            localName: null,
            localBytes: null,
            globalName: g0.name,
            globalBytes: g0.bytes
          }];
        }
        currentServerSlot = null;
        loadFolderSlot(folderSlots[0].key);
        return;
      }

      folderSlots = [];
      activeFolderSlotKey = null;
      currentServerSlot = null;

      const loc = validLocals[0] || null;
      const glob = validGlobals[0] || null;

      try {
        if (loc && glob) {
          session.loadBuffers(glob.bytes, loc.bytes);
          sourceMode = 'file';
          loadedFiles = { localName: loc.name, globalName: glob.name };
          currentCharId = null;
          activeTab = 'stats';
          ensureCharSelected();
          renderWorkspace();
          toast(loc.name + ', ' + glob.name + ' 파일을 불러왔습니다', 'success');
        } else if (loc) {
          if (sourceMode === 'file' && hasGlobal() && !hasLocal()) {
            session.attachLocalBuffer(loc.bytes);
            loadedFiles.localName = loc.name;
            currentCharId = null;
            activeTab = 'stats';
            ensureCharSelected();
            renderWorkspace();
            toast(loc.name + ' 파일을 추가하여 전체 세이브를 불러왔습니다', 'success');
          } else {
            session.loadBuffers(null, loc.bytes);
            sourceMode = 'file';
            loadedFiles = { localName: loc.name, globalName: null };
            currentCharId = null;
            activeTab = 'stats';
            ensureCharSelected();
            renderWorkspace();
            toast(loc.name + ' 파일을 불러왔습니다', 'success');
          }
        } else if (glob) {
          if (sourceMode === 'file' && hasLocal()) {
            session.attachGlobalBuffer(glob.bytes);
            loadedFiles.globalName = glob.name;
            renderWorkspace();
            toast(glob.name + ' 전역 파일을 추가했습니다', 'success');
          } else {
            session.loadBuffers(glob.bytes, null);
            sourceMode = 'file';
            loadedFiles = { localName: null, globalName: glob.name };
            currentCharId = null;
            activeTab = 'world';
            renderWorkspace();
            toast('전역 파일(' + glob.name + ')만 열었습니다. 인물 편집은 슬롯 폴더의 local.sav를 여세요', 'info');
          }
        }
      } catch (err) {
        toast((err && err.message) || '세이브 파일 해석에 실패했습니다', 'error');
      }
    }).catch(() => toast('파일을 읽을 수 없습니다', 'error'));
  }

  function bind() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) { handleAction(btn); return; }
      const tab = e.target.closest('.tab-btn[data-tab]');
      if (tab) {
        activeTab = tab.dataset.tab;
        syncTabButtons();
        renderTabContent();
      }
    });
    document.addEventListener('change', (e) => {
      const el = e.target;
      if (el.id === 'file-input') {
        if (el.files && el.files.length) readFiles(el.files, { fromFolder: false });
        el.value = '';
        return;
      }
      if (el.id === 'folder-input') {
        if (el.files && el.files.length) readFiles(el.files, { fromFolder: true });
        el.value = '';
        return;
      }
      if (el.id === 'folder-slot-select') {
        if (el.value) loadFolderSlot(el.value);
        return;
      }
      if (el.id === 'qual-feat-group') {
        qualFeatGroup = el.value || 'all';
        renderQualFeatureResults();
        return;
      }
      if (el.id === 'feat-dlg-group') {
        dlgFeatGroup = el.value || 'all';
        renderFeatureCatalogDialog();
        return;
      }
      if (el.id === 'slot-select') return;
      if (el.dataset && el.dataset.edit) handleEdit(el);
    });
    document.addEventListener('input', (e) => {
      const el = e.target;
      if (el.id === 'qual-feat-search') {
        qualFeatSearch = el.value;
        renderQualFeatureResults();
        return;
      }
      if (el.id === 'feat-dlg-search') {
        dlgFeatSearch = el.value;
        renderFeatureCatalogDialog();
      }
    });
    const search = $('#char-search');
    if (search) search.addEventListener('input', () => { charSearch = search.value; renderCharList(); });
    const filter = $('#filter-village');
    if (filter) filter.addEventListener('change', () => { onlyVillage = filter.checked; renderCharList(); });
    const drop = $('#dropzone');
    if (drop) {
      const openPicker = () => { const inp = $('#file-input'); if (inp) { inp.value = ''; inp.click(); } };
      drop.addEventListener('click', (e) => {
        if (e.target && e.target.closest && e.target.closest('button, a, input, select')) return;
        openPicker();
      });
      drop.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
      });
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('is-over');
        readFiles(e.dataTransfer && e.dataTransfer.files, { fromFolder: false });
      });
    }
    const dlg = $('#feature-catalog-dialog');
    if (dlg) {
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg && typeof dlg.close === 'function') dlg.close();
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

    const canFetchLocal = typeof location !== 'undefined' && (location.protocol === 'http:' || location.protocol === 'https:');
    if (canFetchLocal) {
      fetch('/api/health', { method: 'GET' })
        .then((r) => { if (!r.ok) throw new Error('no'); return r.json(); })
        .then(() => {
          httpReady = true;
          const bar = $('#server-slot-bar'); if (bar) bar.hidden = false;
          return fetch('/api/saves').then((r) => (r.ok ? r.json() : [])).then((list) => {
            const sel = $('#slot-select');
            if (!sel) return;
            const items = Array.isArray(list) ? list : ((list && (list.saves || list.slots)) || []);
            sel.innerHTML = '<option value="">슬롯 선택</option>' + items.map((it) => {
              const val = typeof it === 'string' ? it : (it.slotDir || it.localPath || it.name || it.id || '');
              const label = typeof it === 'string' ? it : (it.slotName || it.name || val);
              return '<option value="' + esc(val) + '">' + esc(label) + '</option>';
            }).join('');
          });
        })
        .catch(() => { httpReady = false; });
    }

    renderWorkspace();
  });
})();
