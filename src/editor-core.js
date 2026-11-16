/* editor-core.js — 태오회권 에디터 핵심 로직 (UMD) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      (function () { try { return require('./taiwu-codec.js'); } catch (e) { return null; } })(),
      (function () { try { return require('./taiwu-wire.js'); } catch (e) { return null; } })(),
      (function () { try { return require('./catalog-data.js'); } catch (e) { return null; } })()
    );
  } else {
    root.TaiwuEditorCore = factory(root.TaiwuCodec, root.TaiwuWire, root.TAIWU_CATALOG);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Codec, Wire, DefaultCatalog) {
  'use strict';

  /* ---------- 한국어 유틸 ---------- */
  var GENDER = { 1: '남', 0: '여', '-1': '미상' };
  var MAIN_STAT_NAMES = ['완력', '민첩', '정신력', '체질', '근골', '지력'];
  var LIFE_SKILL_NAMES = [
    '음률', '기성', '서예', '회화', '산술', '감정', '단조', '목공',
    '의술', '독술', '직금', '명장', '도교', '불교', '요리', '잡학'
  ];
  var COMBAT_SKILL_NAMES = [
    '내공', '신법', '비기', '권법', '지법', '각법', '암기',
    '검법', '도법', '창술', '기문', '편술', '궁술', '악기'
  ];
  var RESOURCE_NAMES = ['식재', '목재', '금철', '옥석', '직물', '약재', '은전', '명성'];
  var BODY_NAMES = [
    '가슴(외상)', '요복(외상)', '두부(외상)', '왼팔(외상)', '오른팔(외상)', '왼다리(외상)', '오른다리(외상)',
    '가슴(내상)', '요복(내상)', '두부(내상)', '왼팔(내상)', '오른팔(내상)', '왼다리(내상)', '오른다리(내상)',
    '부상15', '부상16'
  ];
  var POISON_NAMES = ['열독', '울독', '한독', '적독', '부독', '환독'];
  var NEILI_ALLOC_NAMES = ['금강', '자하', '현음', '순양'];

  function safeDisplayName(name, fallback) {
    if (!name || typeof name !== 'string') return fallback || '이름없음';
    var t = name.trim();
    if (!t) return fallback || '이름없음';
    return t;
  }

  function formatTaiwuDate(currDate) {
    if (typeof currDate !== 'number' || currDate < 0) return '알수없음';
    var year = Math.floor(currDate / 360) + 1;
    var day = currDate % 360;
    var month = Math.floor(day / 30) + 1;
    var dday = (day % 30) + 1;
    return year + '년 ' + month + '월 ' + dday + '일';
  }

  function cloneJSON(x) { return JSON.parse(JSON.stringify(x)); }

  /* ---------- 프리셋 ---------- */
  var PRESETS = {
    hero_max_stats: {
      id: 'hero_max_stats',
      label: '주인공 능력치 최대',
      description: '주인공의 모든 능력치를 극대화합니다'
    },
    heal_cleanse: {
      id: 'heal_cleanse',
      label: '상처 정화',
      description: '부상, 중독, 기혈 혼란, 상추 침식을 제거합니다'
    },
    resources_abundant: {
      id: 'resources_abundant',
      label: '자원 풍요',
      description: '자원과 유산 포인트를 대량으로 지급합니다'
    },
    skills_complete: {
      id: 'skills_complete',
      label: '모든 기술 완성',
      description: '생활 기술과 무공을 모두 완성합니다'
    }
  };

  /* ---------- 세션 ---------- */
  function TaiwuEditorSession(arg) {
    var isCatalogLike = !!arg && typeof arg === 'object'
      && (arg.organizations || arg.features || arg.combatSkills)
      && !(arg.localParsed || arg.localSav || arg.local || arg.globalParsed || arg.globalSav || arg.global || arg.model);

    if (!arg || isCatalogLike) {
      this.bundle = null;
      this.catalog = isCatalogLike ? arg : (DefaultCatalog || {});
      this.globalParsed = null;
      this.localParsed = null;
      this.model = null;
      this.baselineJson = '{}';
      this.modifiedLog = [];
      return;
    }

    if (typeof arg !== 'object') {
      throw new Error('저장 데이터가 없습니다');
    }

    this.bundle = arg;
    this.catalog = arg.catalog || DefaultCatalog || {};

    if ((arg.localSav || arg.globalSav) && !(arg.localParsed || arg.local)) {
      this.globalParsed = null;
      this.localParsed = null;
      this.model = null;
      this.baselineJson = '{}';
      this.modifiedLog = [];
      this.loadBuffers(arg.globalSav, arg.localSav);
      return;
    }

    this.globalParsed = arg.globalParsed || arg.global || null;
    this.localParsed = arg.localParsed || arg.local || null;
    this.model = Codec && Codec.decodeArchiveModel
      ? Codec.decodeArchiveModel(this.globalParsed, this.localParsed)
      : cloneJSON(arg.model || {});
    this.baselineJson = JSON.stringify(this.model);
    this.modifiedLog = [];
    this._ensureShape();
  }

  TaiwuEditorSession.prototype.loadDemo = function () {
    var demo = Codec.createDemoSaveBundle();
    this.loadBuffers(demo.globalSav, demo.localSav);
    return this;
  };

  TaiwuEditorSession.prototype.loadBuffers = function (globalBytes, localBytes) {
    if (!localBytes) {
      throw new Error('지역 저장 파일이 필요합니다.');
    }
    this.localParsed = Codec.parseArchive(localBytes);
    this.globalParsed = globalBytes ? Codec.parseArchive(globalBytes) : null;
    this.model = Codec.decodeArchiveModel(this.globalParsed, this.localParsed);
    this._ensureShape();
    this.baselineJson = JSON.stringify(this.model);
    this.modifiedLog = [];
    return this;
  };

  TaiwuEditorSession.prototype.exportBuffers = function () {
    if (!this.model || !this.localParsed) {
      throw new Error('불러온 저장 데이터가 없습니다.');
    }
    if (this.globalParsed) {
      Codec.applyModelToParsed(this.globalParsed, this.localParsed, this.model);
    } else {
      Codec.applyModelToParsed(
        this.localParsed,
        this.localParsed,
        Object.assign({}, this.model, { global: null })
      );
    }
    var globalSav = this.globalParsed ? Codec.serializeArchive(this.globalParsed) : null;
    var localSav = Codec.serializeArchive(this.localParsed);
    this.baselineJson = JSON.stringify(this.model);
    var groups = [this.model.characters, this.model.combatSkills, this.model.objectItems];
    groups.forEach(function (group) {
      if (Array.isArray(group)) {
        group.forEach(function (item) {
          if (item && typeof item === 'object') delete item._dirty;
        });
      }
    });
    return { globalSav: globalSav, localSav: localSav };
  };

  TaiwuEditorSession.prototype.exportJsonSnapshot = function () {
    return JSON.stringify(this.model || {}, null, 2);
  };

  TaiwuEditorSession.prototype.importJsonSnapshot = function (text) {
    var parsed = typeof text === 'string' ? JSON.parse(text) : text;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('JSON 형식이 올바르지 않습니다.');
    }
    if (this.model && typeof this.model === 'object') {
      Object.assign(this.model, parsed);
    } else {
      this.model = cloneJSON(parsed);
    }
    this._ensureShape();
    return this;
  };

  TaiwuEditorSession.prototype._ensureShape = function () {
    var m = this.model;
    if (!m.global) m.global = {};
    if (!m.world) m.world = {};
    if (!m.taiwu) m.taiwu = {};
    if (!Array.isArray(m.characters)) m.characters = [];
    if (!Array.isArray(m.taiwuCombatSkills)) m.taiwuCombatSkills = [];
    if (!Array.isArray(m.taiwuLifeSkills)) m.taiwuLifeSkills = [];
    if (!Array.isArray(m.combatSkills)) m.combatSkills = [];
    if (!Array.isArray(m.stackableItems)) m.stackableItems = [];
    if (!Array.isArray(m.objectItems)) m.objectItems = [];
  };

  TaiwuEditorSession.prototype._findChar = function (charId) {
    charId = Number(charId);
    return this.model.characters.find(function (c) { return Number(c.id) === charId; });
  };

  TaiwuEditorSession.prototype._heroId = function () {
    var taiwu = this.model.taiwu || {};
    if (typeof taiwu.taiwuCharId === 'number') return taiwu.taiwuCharId;
    if (this.model.characters.length) return this.model.characters[0].id;
    return null;
  };

  TaiwuEditorSession.prototype._dirtyCount = function () {
    var n = 0;
    var m = this.model;
    m.characters.forEach(function (c) { if (c._dirty) n++; });
    m.combatSkills.forEach(function (s) { if (s._dirty) n++; });
    m.objectItems.forEach(function (o) { if (o._dirty) n++; });
    return n;
  };

  TaiwuEditorSession.prototype.getSummary = function () {
    var m = this.model;
    var w = m.world || {};
    var hero = this._findChar(this._heroId());
    var heroName = hero
      ? safeDisplayName((w.taiwuSurname || '') + (w.taiwuGivenName || ''), '이름없음')
      : safeDisplayName((w.taiwuSurname || '') + (w.taiwuGivenName || ''), '이름없음');
    return {
      heroName: heroName,
      dateText: formatTaiwuDate(w.currDate),
      currDate: typeof w.currDate === 'number' ? w.currDate : 0,
      generation: typeof w.taiwuGenerationsCount === 'number' ? w.taiwuGenerationsCount : 1,
      charCount: m.characters.length,
      combatSkillCount: m.combatSkills.length,
      itemCount: m.objectItems.length,
      stackableCount: m.stackableItems.length,
      dirtyCount: this._dirtyCount(),
      isDirty: JSON.stringify(m) !== this.baselineJson
    };
  };

  TaiwuEditorSession.prototype.listCharacters = function (search, onlyVillage) {
    var q = (search && String(search).trim()) || '';
    var heroId = this._heroId();
    var villageId = this.model.taiwu && typeof this.model.taiwu.taiwuVillageSettlementId === 'number'
      ? this.model.taiwu.taiwuVillageSettlementId : null;

    var out = [];
    for (var i = 0; i < this.model.characters.length; i++) {
      var c = this.model.characters[i];
      var displayName = this._charDisplayName(c);
      if (q && displayName.indexOf(q) < 0 && String(c.id).indexOf(q) < 0) continue;
      if (onlyVillage && villageId !== null) {
        var sid = c.orgInfo ? c.orgInfo.settlementId : null;
        if (sid !== villageId) continue;
      }
      out.push({
        id: c.id,
        templateId: c.templateId,
        name: displayName,
        isHero: Number(c.id) === heroId,
        genderText: GENDER[String(c.gender)] || '미상',
        actualAge: c.actualAge,
        currAge: c.currAge,
        happiness: c.happiness,
        baseMorality: c.baseMorality,
        health: c.health,
        baseMaxHealth: c.baseMaxHealth,
        maxHealth: (c.baseMaxHealth || 0) + (c.extraNeili || 0),
        orgName: this._orgName(c),
        _dirty: !!c._dirty
      });
    }
    return out;
  };

  TaiwuEditorSession.prototype._charDisplayName = function (c) {
    var cat = this.catalog || {};
    if (cat.characters && cat.characters[c.id] && cat.characters[c.id].name) {
      return String(cat.characters[c.id].name).replace(/[<>]/g, '');
    }
    if (cat.charNames && cat.charNames[c.id]) {
      return String(cat.charNames[c.id]).replace(/[<>]/g, '');
    }
    if (c.name) return safeDisplayName(String(c.name));
    return '인물' + (c.id != null ? c.id : '?');
  };

  TaiwuEditorSession.prototype._orgName = function (c) {
    var cat = this.catalog || {};
    var oi = c.orgInfo || {};
    if (cat.orgs && oi.orgTemplateId != null && cat.orgs[oi.orgTemplateId]) {
      return String(cat.orgs[oi.orgTemplateId]).replace(/[<>]/g, '');
    }
    return '무소속';
  };

  TaiwuEditorSession.prototype.getCharacterDetail = function (charId) {
    var ch = this._findChar(charId);
    if (!ch) return null;
    var self = this;
    var detail = cloneJSON(ch);
    detail.displayName = this._charDisplayName(ch);
    detail.genderText = GENDER[String(ch.gender)] || '미상';
    detail.orgName = this._orgName(ch);
    detail.maxHealth = (ch.baseMaxHealth || 0) + (ch.extraNeili || 0);
    detail.mainStats = (ch.baseMainAttributes || []).map(function (v, i) {
      return { index: i, name: MAIN_STAT_NAMES[i] || ('능력' + i), base: v, curr: (ch.currMainAttributes || [])[i] || 0 };
    });
    detail.lifeSkills = (ch.baseLifeSkillQual || []).map(function (v, i) {
      return { index: i, name: LIFE_SKILL_NAMES[i] || ('생활' + i), base: v };
    });
    detail.combatSkillQuals = (ch.baseCombatSkillQual || []).map(function (v, i) {
      return { index: i, name: COMBAT_SKILL_NAMES[i] || ('무공' + i), base: v };
    });
    detail.resourcesList = (ch.resources || []).map(function (v, i) {
      return { index: i, name: RESOURCE_NAMES[i] || ('자원' + i), value: v };
    });
    detail.injuriesList = (ch.injuries || []).map(function (v, i) {
      return { index: i, name: BODY_NAMES[i] || ('부위' + i), value: v };
    });
    detail.poisonedList = (ch.poisoned || []).map(function (v, i) {
      return { index: i, name: POISON_NAMES[i] || ('독' + i), value: v };
    });
    detail.features = (ch.featureIds || []).map(function (id) {
      var n = (self.catalog.features && self.catalog.features[id]) || null;
      return { id: id, name: n ? String(n).replace(/[<>]/g, '') : ('기질' + id) };
    });
    detail.inventoryList = (ch.inventory || []).map(function (it) {
      var bucket = self.catalog.items && self.catalog.items[String(it.itemType)];
      var rawName = bucket ? bucket[String(it.templateId)] : null;
      var typeName = (self.catalog.itemTypeNames && self.catalog.itemTypeNames[it.itemType]) || ('분류 ' + it.itemType);
      return {
        itemType: it.itemType, modState: it.modState,
        templateId: it.templateId, id: it.id, amount: it.amount,
        typeName: String(typeName).replace(/[<>]/g, ''),
        name: rawName ? String(rawName).replace(/[<>]/g, '') : ('물품 ' + it.templateId)
      };
    });
    detail.combatSkillEntries = this.model.combatSkills.filter(function (s) {
      return Number(s.charId) === Number(charId);
    }).map(function (s) {
      var meta = self.catalog.combatSkills && self.catalog.combatSkills[s.skillId];
      var sname = meta ? (typeof meta === 'string' ? meta : meta.name) : null;
      var o = cloneJSON(s);
      o.name = sname ? String(sname).replace(/[<>]/g, '') : ('무공 ' + s.skillId);
      o.grade = (meta && typeof meta === 'object' && meta.grade != null) ? meta.grade : null;
      return o;
    });
    var entryMap = {};
    detail.combatSkillEntries.forEach(function (e) { entryMap[String(e.skillId)] = e; });
    detail.learnedCombatSkills = (ch.learnedCombatSkills || []).map(function (id) {
      var meta = self.catalog.combatSkills && self.catalog.combatSkills[id];
      var sname = meta ? (typeof meta === 'string' ? meta : meta.name) : null;
      var prog = entryMap[String(id)] || {};
      return {
        id: id,
        skillId: id,
        name: sname ? String(sname).replace(/[<>]/g, '') : ('무공 ' + id),
        grade: (meta && typeof meta === 'object' && meta.grade != null) ? meta.grade : null,
        readingState: prog.readingState != null ? prog.readingState : 0,
        activationState: prog.activationState != null ? prog.activationState : 0,
        breakoutStepsCount: prog.breakoutStepsCount != null ? prog.breakoutStepsCount : 0
      };
    });
    detail.learnedLifeSkillEntries = (ch.learnedLifeSkills || []).map(function (l) {
      var lid = (l && typeof l === 'object') ? l.skillId : l;
      var lmeta = self.catalog.lifeSkills && self.catalog.lifeSkills[lid];
      var lname = Array.isArray(lmeta) ? lmeta[0] : (lmeta && typeof lmeta === 'object' ? lmeta.name : lmeta);
      var lgrade = Array.isArray(lmeta) ? lmeta[1] : (lmeta && typeof lmeta === 'object' ? lmeta.grade : null);
      return {
        skillId: lid,
        name: lname ? String(lname).replace(/[<>]/g, '') : ('기예 ' + lid),
        grade: lgrade,
        readingState: (l && typeof l === 'object' && l.readingState != null) ? l.readingState : 0
      };
    });
    return detail;
  };

  /* ---------- 변경 표시 ---------- */
  function markChar(ch) { if (ch) ch._dirty = true; }

  /* ---------- 월드/태오/글로벌 수정 ---------- */
  TaiwuEditorSession.prototype.updateWorld = function (patch) {
    Object.assign(this.model.world, patch || {});
    return this.model.world;
  };

  TaiwuEditorSession.prototype.updateTaiwu = function (patch) {
    Object.assign(this.model.taiwu, patch || {});
    return this.model.taiwu;
  };

  TaiwuEditorSession.prototype.updateGlobal = function (patch) {
    Object.assign(this.model.global, patch || {});
    return this.model.global;
  };

  /* ---------- 캐릭터 수정 ---------- */
  TaiwuEditorSession.prototype.updateCharacter = function (charId, patch) {
    var ch = this._findChar(charId);
    if (!ch) return null;
    if (patch && typeof patch === 'object') {
      Object.keys(patch).forEach(function (k) {
        if (k === 'id' || k === '_dirty') return;
        ch[k] = patch[k];
      });
    }
    markChar(ch);
    return ch;
  };

  TaiwuEditorSession.prototype.healCharacter = function (charId) {
    var ch = this._findChar(charId);
    if (!ch) return null;
    var injLen = (Array.isArray(ch.injuries) && ch.injuries.length > 0) ? ch.injuries.length : 16;
    ch.injuries = new Array(injLen).fill(0);
    ch.poisoned = new Array(6).fill(0);
    ch.disorderOfQi = 0;
    ch.xiangshuInfection = 0;
    ch.health = ch.baseMaxHealth = Math.max(ch.baseMaxHealth || 1, 10000);
    markChar(ch);
    return ch;
  };

  TaiwuEditorSession.prototype.addCharacterFeature = function (charId, featureId) {
    var ch = this._findChar(charId);
    if (!ch) return null;
    if (!Array.isArray(ch.featureIds)) ch.featureIds = [];
    var fid = Number(featureId);
    if (ch.featureIds.indexOf(fid) < 0) ch.featureIds.push(fid);
    markChar(ch);
    return ch;
  };

  TaiwuEditorSession.prototype.removeCharacterFeature = function (charId, featureId) {
    var ch = this._findChar(charId);
    if (!ch) return null;
    var fid = Number(featureId);
    if (Array.isArray(ch.featureIds)) {
      ch.featureIds = ch.featureIds.filter(function (v) { return Number(v) !== fid; });
    }
    markChar(ch);
    return ch;
  };

  /* ---------- 인벤토리 ---------- */
  TaiwuEditorSession.prototype.addInventoryItem = function (charId, itemOrType, templateId, amount) {
    var ch = this._findChar(charId);
    if (!ch) return null;
    if (!Array.isArray(ch.inventory)) ch.inventory = [];
    var item = (itemOrType && typeof itemOrType === 'object')
      ? itemOrType
      : { itemType: itemOrType, templateId: templateId, amount: amount };
    var nextId = 1;
    ch.inventory.forEach(function (it) { if (it.id >= nextId) nextId = it.id + 1; });
    ch.inventory.push({
      itemType: Number(item.itemType) || 0,
      modState: Number(item.modState) || 0,
      templateId: Number(item.templateId) || 0,
      id: Number(item.id) || nextId,
      amount: Number(item.amount) || 1
    });
    markChar(ch);
    return ch.inventory;
  };

  TaiwuEditorSession.prototype.updateInventoryItemAmount = function (charId, invItemId, amount) {
    var ch = this._findChar(charId);
    if (!ch || !Array.isArray(ch.inventory)) return null;
    var it = ch.inventory.find(function (x) { return Number(x.id) === Number(invItemId); });
    if (!it) return null;
    it.amount = Math.max(0, Number(amount) || 0);
    markChar(ch);
    return it;
  };

  TaiwuEditorSession.prototype.removeInventoryItem = function (charId, invItemId) {
    var ch = this._findChar(charId);
    if (!ch || !Array.isArray(ch.inventory)) return null;
    ch.inventory = ch.inventory.filter(function (x) { return Number(x.id) !== Number(invItemId); });
    markChar(ch);
    return ch.inventory;
  };

  TaiwuEditorSession.prototype.updateInventoryItemByIndex = function (charId, idx, amount) {
    var ch = this._findChar(charId);
    if (!ch || !Array.isArray(ch.inventory) || !ch.inventory[idx]) return null;
    ch.inventory[idx].amount = Math.max(0, Number(amount) || 0);
    markChar(ch);
    return ch.inventory[idx];
  };

  TaiwuEditorSession.prototype.removeInventoryItemByIndex = function (charId, idx) {
    var ch = this._findChar(charId);
    if (!ch || !Array.isArray(ch.inventory) || idx < 0 || idx >= ch.inventory.length) return null;
    ch.inventory.splice(idx, 1);
    markChar(ch);
    return ch.inventory;
  };

  TaiwuEditorSession.prototype.updateCharacterLifeSkill = function (charId, skillId, readingState) {
    var ch = this._findChar(charId);
    if (!ch) return null;
    if (!Array.isArray(ch.learnedLifeSkills)) ch.learnedLifeSkills = [];
    var rec = ch.learnedLifeSkills.find(function (x) { return Number(x.skillId) === Number(skillId); });
    if (!rec) {
      rec = { skillId: Number(skillId), readingState: Number(readingState) || 0, pad: 0 };
      ch.learnedLifeSkills.push(rec);
    } else {
      rec.readingState = Number(readingState) || 0;
    }
    markChar(ch);
    return rec;
  };

  /* ---------- 무공/생활 기술 ---------- */
  TaiwuEditorSession.prototype.updateCombatSkill = function (charId, skillId, patch) {
    var rec = this.model.combatSkills.find(function (s) {
      return Number(s.charId) === Number(charId) && Number(s.skillId) === Number(skillId);
    });
    if (!rec) {
      rec = {
        charId: Number(charId), skillId: Number(skillId),
        readingState: 0, activationState: 0,
        forcedBreakoutStepsCount: 0, breakoutStepsCount: 0,
        innerRatio: 0, obtainedNeili: 0, revoked: 0, specialEffectId: 0, _dirty: true
      };
      this.model.combatSkills.push(rec);
    }
    if (patch && typeof patch === 'object') {
      Object.keys(patch).forEach(function (k) {
        if (k === 'charId' || k === 'skillId' || k === '_dirty') return;
        rec[k] = patch[k];
      });
    }
    rec._dirty = true;
    return rec;
  };

  TaiwuEditorSession.prototype.updateTaiwuLifeSkill = function (skillId, patch) {
    var rec = this.model.taiwuLifeSkills.find(function (s) {
      return Number(s.skillId) === Number(skillId);
    });
    if (!rec) {
      rec = { skillId: Number(skillId), readingProgress: [0, 0, 0, 0, 0] };
      this.model.taiwuLifeSkills.push(rec);
    }
    if (patch && typeof patch === 'object') {
      if (Array.isArray(patch.readingProgress)) {
        rec.readingProgress = patch.readingProgress.slice(0, 5);
        while (rec.readingProgress.length < 5) rec.readingProgress.push(0);
      }
    }
    return rec;
  };

  /* ---------- 겹침/오브젝트 ---------- */
  TaiwuEditorSession.prototype.updateStackableItem = function (index, patch) {
    var s = this.model.stackableItems[index];
    if (!s) return null;
    if (patch && typeof patch === 'object') {
      if (patch.count !== undefined) s.count = Math.max(0, Number(patch.count) || 0);
    }
    return s;
  };

  TaiwuEditorSession.prototype.updateObjectItemDurability = function (index, maxDur, currDur) {
    var o = this.model.objectItems[index];
    if (!o) return null;
    if (maxDur !== undefined) o.maxDurability = Math.max(0, Number(maxDur) || 0);
    if (currDur !== undefined) o.currDurability = Math.max(0, Number(currDur) || 0);
    o._dirty = true;
    return o;
  };

  /* ---------- 프리셋 적용 ---------- */
  TaiwuEditorSession.prototype.applyPreset = function (presetId, targetCharId) {
    if (!PRESETS[presetId]) return { ok: false, message: '알수없는 프리셋입니다' };
    var heroId = (targetCharId != null) ? Number(targetCharId) : this._heroId();
    var ch = this._findChar(heroId);
    var touched = 0;

    if (presetId === 'hero_max_stats') {
      if (!ch) return { ok: false, message: '대상 캐릭터를 찾을수없습니다' };
      ch.baseMainAttributes = [9999, 9999, 9999, 9999, 9999, 9999];
      ch.currMainAttributes = [9999, 9999, 9999, 9999, 9999, 9999];
      ch.baseLifeSkillQual = new Array(16).fill(9999);
      ch.baseCombatSkillQual = new Array(14).fill(9999);
      ch.baseNeiliAlloc = [9999, 9999, 9999, 9999];
      ch.extraNeiliAlloc = [9999, 9999, 9999, 9999];
      ch.health = ch.baseMaxHealth = 99999;
      ch.extraNeili = ch.currNeili = 99999;
      markChar(ch); touched++;
    } else if (presetId === 'heal_cleanse') {
      if (!ch) return { ok: false, message: '대상 캐릭터를 찾을수없습니다' };
      ch.injuries = new Array(16).fill(0);
      ch.poisoned = new Array(6).fill(0);
      ch.disorderOfQi = 0;
      ch.xiangshuInfection = 0;
      ch.health = ch.baseMaxHealth = Math.max(ch.baseMaxHealth || 1, 10000);
      markChar(ch); touched++;
    } else if (presetId === 'resources_abundant') {
      if (!ch) return { ok: false, message: '대상 캐릭터를 찾을수없습니다' };
      ch.resources = [999999, 999999, 999999, 999999, 999999, 999999, 999999, 999999];
      if (!this.model.taiwu) this.model.taiwu = {};
      this.model.taiwu.legacyPoint = 999999;
      this.model.taiwu.cricketLuckPoint = 999999;
      markChar(ch); touched++;
    } else if (presetId === 'skills_complete') {
      if (!ch) return { ok: false, message: '대상 캐릭터를 찾을수없습니다' };
      ch.baseLifeSkillQual = new Array(16).fill(9999);
      ch.baseCombatSkillQual = new Array(14).fill(9999);
      if (!Array.isArray(ch.learnedCombatSkills)) ch.learnedCombatSkills = [];
      for (var i = 0; i < 14; i++) {
        if (ch.learnedCombatSkills.indexOf(i) < 0) ch.learnedCombatSkills.push(i);
        this.updateCombatSkill(ch.id, i, {
          readingState: 100, activationState: 1,
          breakoutStepsCount: 9999, innerRatio: 100, obtainedNeili: 99999, revoked: 0
        });
      }
      if (!Array.isArray(ch.learnedLifeSkills)) ch.learnedLifeSkills = [];
      for (var j = 0; j < 16; j++) {
        if (!ch.learnedLifeSkills.some(function (x) { return x.skillId === j; })) {
          ch.learnedLifeSkills.push({ skillId: j, readingState: 100, pad: 0 });
        }
        this.updateTaiwuLifeSkill(j, { readingProgress: [255, 255, 255, 255, 255] });
      }
      var self = this;
      this.model.taiwuCombatSkills.forEach(function (rec) {
        rec.readingProgress = new Array(15).fill(255);
        rec.lastClearBreakPlateTime = 0;
        rec.fullPowerCastTimes = 9999;
      });
      markChar(ch); touched++;
    }
    return { ok: true, message: '프리셋을 적용했습니다', touched: touched };
  };

  /* ---------- 변경 비교 ---------- */
  TaiwuEditorSession.prototype.computeDiff = function () {
    var before = JSON.parse(this.baselineJson);
    var after = cloneJSON(this.model);
    var self = this;
    var diffs = [];

    function walk(a, b, path, category, label) {
      if (a === b) return;
      var ta = Object.prototype.toString.call(a);
      var tb = Object.prototype.toString.call(b);
      if (ta !== tb) { diffs.push({ category: category, target: path, label: label, before: a, after: b }); return; }
      if (a === null || b === null || typeof a !== 'object') {
        if (a !== b) diffs.push({ category: category, target: path, label: label, before: a, after: b });
        return;
      }
      if (Array.isArray(a)) {
        var len = Math.max(a.length, b.length);
        for (var i = 0; i < len; i++) {
          walk(a[i], b[i], path + '[' + i + ']', category, label + ' ' + i);
        }
        return;
      }
      var keys = {};
      Object.keys(a).forEach(function (k) { keys[k] = 1; });
      Object.keys(b).forEach(function (k) { keys[k] = 1; });
      Object.keys(keys).forEach(function (k) {
        if (k.charAt(0) === '_') return;
        walk(a[k], b[k], path + '.' + k, category, label + '.' + k);
      });
    }

    walk(before.global, after.global, 'global', '글로벌', '글로벌');
    walk(before.world, after.world, 'world', '월드', '월드');
    walk(before.taiwu, after.taiwu, 'taiwu', '태오', '태오');

    if (Array.isArray(before.characters) && Array.isArray(after.characters)) {
      for (var i = 0; i < after.characters.length; i++) {
        var cb = before.characters[i] || {};
        var ca = after.characters[i];
        var nm = self._charDisplayName(ca);
        walk(cb, ca, 'characters[' + ca.id + ']', '캐릭터', nm);
      }
    }

    walk(before.combatSkills, after.combatSkills, 'combatSkills', '무공', '무공');
    walk(before.taiwuCombatSkills, after.taiwuCombatSkills, 'taiwuCombatSkills', '태오 무공', '태오 무공');
    walk(before.taiwuLifeSkills, after.taiwuLifeSkills, 'taiwuLifeSkills', '태오 생활', '태오 생활');
    walk(before.stackableItems, after.stackableItems, 'stackableItems', '겹침 물품', '겹침 물품');
    walk(before.objectItems, after.objectItems, 'objectItems', '오브젝트', '오브젝트');

    return diffs;
  };

  /* ---------- 세션 생성 ---------- */
  function createSession(bundle) {
    return new TaiwuEditorSession(bundle);
  }

  return {
    PRESETS: PRESETS,
    TaiwuEditorSession: TaiwuEditorSession,
    createSession: createSession,
    formatTaiwuDate: formatTaiwuDate,
    safeDisplayName: safeDisplayName
  };
}));
