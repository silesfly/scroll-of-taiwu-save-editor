(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./taiwu-deflate.js'), require('./taiwu-wire.js'));
  } else {
    root.TaiwuCodec = factory(root.TaiwuDeflate, root.TaiwuWire);
  }
})(typeof self !== 'undefined' ? self : this, function (Deflate, Wire) {
  'use strict';

  if (!Wire) throw new Error('TaiwuWire를 불러오지 못했습니다.');
  if (!Deflate) throw new Error('TaiwuDeflate를 불러오지 못했습니다.');

  function err(msg) { throw new Error(msg); }
  function asU8(v) {
    if (v instanceof Uint8Array) return v;
    if (v instanceof ArrayBuffer) return new Uint8Array(v);
    if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    if (Array.isArray(v)) return Uint8Array.from(v);
    return new Uint8Array(0);
  }
  function copyU8(v) { return new Uint8Array(asU8(v)); }
  function hasWire(n) { return typeof Wire[n] === 'function'; }
  function getDomainSafe(parsed, id) {
    if (!parsed) return null;
    if (hasWire('getDomain')) return Wire.getDomain(parsed, id);
    if (parsed.domains) return parsed.domains[id] || parsed.domains[String(id)] || null;
    return null;
  }
  function getEntryMapSafe(domain) {
    if (!domain) return {};
    if (hasWire('getEntryMap')) return Wire.getEntryMap(domain);
    var m = {};
    (domain.entries || []).forEach(function (e) { m[e.dataId] = e; });
    return m;
  }
  function entryRaw(domain, dataId) {
    var m = getEntryMapSafe(domain);
    var e = m[dataId] || m[String(dataId)];
    return e ? asU8(e.rawBytes) : null;
  }
  function setRaw(parsed, domainId, dataId, u8) {
    var domain = getDomainSafe(parsed, domainId);
    if (!domain) {
      if (parsed && parsed.domains) {
        domain = parsed.domains[domainId] = parsed.domains[domainId] || parsed.domains[String(domainId)];
      }
    }
    if (!domain) return false;
    if (hasWire('setEntryRaw')) {
      Wire.setEntryRaw(domain, dataId, asU8(u8));
      return true;
    }
    var m = getEntryMapSafe(domain);
    var e = m[dataId] || m[String(dataId)];
    if (e) { e.rawBytes = asU8(u8); return true; }
    if (!domain.entries) domain.entries = [];
    domain.entries.push({ dataId: Number(dataId), metaBytes: new Uint8Array(0), rawBytes: asU8(u8) });
    return true;
  }
  function markDirty(obj) { if (obj) obj._dirty = true; }

  function Reader(u8) {
    this.buf = asU8(u8);
    this.view = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength);
    this.offset = 0;
  }
  Reader.prototype.left = function () { return this.buf.length - this.offset; };
  Reader.prototype.need = function (n) { if (this.offset + n > this.buf.length) err('자료 길이가 부족합니다.'); };
  Reader.prototype.skip = function (n) { this.need(n); this.offset += n; };
  Reader.prototype.bytes = function (n) { this.need(n); var b = this.buf.slice(this.offset, this.offset + n); this.offset += n; return b; };
  Reader.prototype.u8 = function () { this.need(1); return this.view.getUint8(this.offset++); };
  Reader.prototype.i8 = function () { this.need(1); return this.view.getInt8(this.offset++); };
  Reader.prototype.u16 = function () { this.need(2); var v = this.view.getUint16(this.offset, true); this.offset += 2; return v; };
  Reader.prototype.i16 = function () { this.need(2); var v = this.view.getInt16(this.offset, true); this.offset += 2; return v; };
  Reader.prototype.u32 = function () { this.need(4); var v = this.view.getUint32(this.offset, true); this.offset += 4; return v; };
  Reader.prototype.i32 = function () { this.need(4); var v = this.view.getInt32(this.offset, true); this.offset += 4; return v; };
  Reader.prototype.u64Str = function () {
    this.need(8);
    var lo = BigInt(this.view.getUint32(this.offset, true));
    var hi = BigInt(this.view.getUint32(this.offset + 4, true));
    this.offset += 8;
    return ((hi << 32n) | lo).toString();
  };
  Reader.prototype.fixed = function (fid, off, fn, def) {
    try { this.offset = off; return fn.call(this); } catch (e) { return def; }
  };

  function Writer() { this.buf = new Uint8Array(128); this.view = new DataView(this.buf.buffer); this.offset = 0; }
  Writer.prototype.ensure = function (n) {
    if (this.offset + n <= this.buf.length) return;
    var cap = this.buf.length * 2;
    while (cap < this.offset + n) cap *= 2;
    var nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.offset));
    this.buf = nb;
    this.view = new DataView(nb.buffer);
  };
  Writer.prototype.u8 = function (v) { this.ensure(1); this.view.setUint8(this.offset++, v & 255); return this; };
  Writer.prototype.i8 = function (v) { this.ensure(1); this.view.setInt8(this.offset++, v | 0); return this; };
  Writer.prototype.u16 = function (v) { this.ensure(2); this.view.setUint16(this.offset, v & 65535, true); this.offset += 2; return this; };
  Writer.prototype.i16 = function (v) { this.ensure(2); this.view.setInt16(this.offset, v | 0, true); this.offset += 2; return this; };
  Writer.prototype.u32 = function (v) { this.ensure(4); this.view.setUint32(this.offset, v >>> 0, true); this.offset += 4; return this; };
  Writer.prototype.i32 = function (v) { this.ensure(4); this.view.setInt32(this.offset, v | 0, true); this.offset += 4; return this; };
  Writer.prototype.u64Str = function (s) {
    var n = BigInt(s || '0');
    if (n < 0n) n = 0n;
    var lo = Number(n & 0xffffffffn) >>> 0;
    var hi = Number((n >> 32n) & 0xffffffffn) >>> 0;
    this.u32(lo); this.u32(hi); return this;
  };
  Writer.prototype.bytes = function (b) { b = asU8(b); this.ensure(b.length); this.buf.set(b, this.offset); this.offset += b.length; return this; };
  Writer.prototype.finish = function () { return this.buf.slice(0, this.offset); };

  function finishFixed(w, fixedSize) {
    var out = w.finish();
    if (out.length === fixedSize) return out;
    var b = new Uint8Array(fixedSize);
    b.set(out.subarray(0, Math.min(out.length, fixedSize)), 0);
    return b;
  }
  function readI32Count(raw, constructor) {
    var r = new Reader(raw), out = [];
    try {
      var n = r.i32();
      if (n < 0 || n > 1000000) return out;
      for (var i = 0; i < n; i++) out.push(constructor(r));
    } catch (e) { return out; }
    return out;
  }
  function writeI32Count(arr, fn) {
    var w = new Writer();
    arr = arr || [];
    w.i32(arr.length);
    for (var i = 0; i < arr.length; i++) fn(w, arr[i], i);
    return w.finish();
  }
  function readFixedInts(raw, count, method) {
    var r = new Reader(raw), a = [];
    try { for (var i = 0; i < count; i++) a.push(r[method]()); } catch (e) { while (a.length < count) a.push(0); }
    return a;
  }
  function writeFixedInts(arr, count, method) {
    var w = new Writer();
    for (var i = 0; i < count; i++) w[method]((arr && arr[i]) || 0);
    return w.finish();
  }

  function decodeInventory(raw) {
    raw = asU8(raw);
    var r = new Reader(raw), inv = { wrapSz: 0, items: [] };
    try {
      inv.wrapSz = r.i32();
      if (inv.wrapSz > 0) {
        var cnt = r.i32();
        if (cnt < 0 || cnt > 1000000) cnt = 0;
        for (var i = 0; i < cnt; i++) {
          inv.items.push({
            itemType: r.i8(), modState: r.u8(), templateId: r.i16(),
            id: r.i32(), amount: r.i32()
          });
        }
      }
    } catch (e) {}
    return inv;
  }
  function encodeInventory(inv) {
    var items = Array.isArray(inv) ? inv : (inv && Array.isArray(inv.items) ? inv.items : []);
    if (items.length === 0) {
      var w0 = new Writer(); w0.i32(0); return w0.finish();
    }
    var w = new Writer();
    w.i32(4 + items.length * 12);
    w.i32(items.length);
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      w.i8(it.itemType || 0); w.u8(it.modState || 0); w.i16(it.templateId || 0);
      w.i32(it.id || 0); w.i32(it.amount || 0);
    }
    return w.finish();
  }

  function objCollectionItems(col) { return (col && col.items) || []; }
  function fieldOffset(col, fid) {
    if (!col || !col.fixedOffsets) return -1;
    var o = col.fixedOffsets[fid];
    return typeof o === 'number' ? o : -1;
  }
  function readFixed(raw, col, fid, fn, def) {
    raw = asU8(raw);
    var off = fieldOffset(col, fid);
    if (off < 0 || off >= raw.length) return typeof def === 'function' ? def() : def;
    var r = new Reader(raw); r.offset = off;
    try { return fn(r); } catch (e) { return typeof def === 'function' ? def() : def; }
  }
  function writeFixedPart(w, raw, col, fid, fn, defSize) {
    var n = defSize || 0;
    if (col && col.fixedSizes) {
      var idx = (col.fieldIds || []).indexOf(fid);
      if (idx >= 0 && col.fixedSizes[idx] > 0) n = col.fixedSizes[idx];
    }
    var old = new Uint8Array(n);
    var off = fieldOffset(col, fid);
    if (off >= 0 && raw && off < raw.length) old.set(raw.subarray(off, Math.min(raw.length, off + n)));
    var tmp = new Writer(); fn(tmp); var nb = tmp.finish();
    old.set(nb.subarray(0, Math.min(n, nb.length)), 0);
    w.bytes(old);
  }

  function decodeGlobalModel(parsed) {
    var dom = getDomainSafe(parsed, 0), emap = getEntryMapSafe(dom);
    function raw(id) { var e = emap[id] || emap[String(id)]; return e ? e.rawBytes : null; }
    var globalFlags = '0';
    try { globalFlags = new Reader(raw(4)).u64Str(); } catch (e) {}
    var ownedChickens = [];
    try {
      var r5 = new Reader(raw(5)), n5 = r5.i32();
      if (n5 >= 0 && n5 < 1000000) for (var i = 0; i < n5; i++) ownedChickens.push(r5.i16());
    } catch (e) {}
    var achievementsCount = 0;
    try { achievementsCount = new Reader(raw(8)).i32(); } catch (e) {}
    return { globalFlags: globalFlags, ownedChickens: ownedChickens, achievementsCount: achievementsCount, _dirty: false };
  }

  function decodeWorldModel(parsed) {
    var dom = getDomainSafe(parsed, 1), emap = getEntryMapSafe(dom);
    function raw(id) { var e = emap[id] || emap[String(id)]; return e ? e.rawBytes : null; }
    function rv(id, method, def) {
      var e = emap[id] || emap[String(id)];
      if (!e) return def;
      try { var r = new Reader(e.rawBytes); return r[method](); } catch (err2) { return def; }
    }
    var wi = parsed && parsed.worldInfo ? parsed.worldInfo : {};
    return {
      currDate: rv(26, 'i32', 0),
      mainStoryLineProgress: rv(4, 'i16', 0),
      beatRanChenZi: rv(5, 'u8', 0),
      worldFunctionsStatuses: (function () { var e = emap[6] || emap['6']; if (!e) return '0'; try { return new Reader(e.rawBytes).u64Str(); } catch (x) { return '0'; } })(),
      worldPopulationType: rv(12, 'u8', 0),
      characterLifespanType: rv(13, 'u8', 0),
      combatDifficulty: rv(14, 'u8', 0),
      hereticsAmountType: rv(15, 'u8', 0),
      bossInvasionSpeedType: rv(16, 'u8', 0),
      worldResourceAmountType: rv(17, 'u8', 0),
      allowRandomTaiwuHeir: rv(18, 'u8', 0),
      restrictOptionsBehaviorType: rv(19, 'u8', 0),
      professionUpgrade: rv(35, 'u8', 0),
      favorabilityChange: rv(37, 'u8', 0),
      enemyPracticeLevel: rv(38, 'u8', 0),
      loopingDifficulty: rv(39, 'u8', 0),
      readingDifficulty: rv(40, 'u8', 0),
      breakoutDifficulty: rv(41, 'u8', 0),
      lootYield: rv(42, 'i16', 0),
      taiwuSurname: wi.taiwuSurname || '',
      taiwuGivenName: wi.taiwuGivenName || '',
      gender: wi.gender || 0,
      taiwuGenerationsCount: wi.taiwuGenerationsCount || 0,
      dreamBackCount: wi.dreamBackCount || 0,
      mapStateName: wi.mapStateName || '',
      mapAreaName: wi.mapAreaName || '',
      _dirty: false
    };
  }

  function decodeTaiwuCombatSkills(raw) {
    raw = asU8(raw);
    var r = new Reader(raw), out = [];
    try {
      var cnt = r.i32();
      if (cnt < 0 || cnt > 1000000) cnt = 0;
      for (var i = 0; i < cnt; i++) {
        var skillId = r.i16();
        var sz = r.i32();
        if (sz < 20) { if (sz > 0) r.skip(sz); continue; }
        var start = r.offset;
        var rp = [];
        for (var j = 0; j < 15; j++) rp.push(r.u8());
        var lastClearBreakPlateTime = r.i32();
        var fullPowerCastTimes = r.i8();
        var used = r.offset - start;
        var extraTail = used < sz ? r.bytes(sz - used) : new Uint8Array(0);
        out.push({ skillId: skillId, readingProgress: rp, lastClearBreakPlateTime: lastClearBreakPlateTime, fullPowerCastTimes: fullPowerCastTimes, _extraTail: extraTail });
      }
    } catch (e) {}
    return out;
  }
  function encodeTaiwuCombatSkills(arr) {
    var w = new Writer(); arr = arr || []; w.i32(arr.length);
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i] || {};
      w.i16(s.skillId || 0);
      var rp = s.readingProgress || [];
      var body = new Writer();
      for (var j = 0; j < 15; j++) body.u8(rp[j] || 0);
      body.i32(s.lastClearBreakPlateTime || 0);
      body.i8(s.fullPowerCastTimes || 0);
      if (s._extraTail && s._extraTail.length) body.bytes(s._extraTail);
      var b = body.finish();
      if (b.length < 20) { var nb = new Uint8Array(20); nb.set(b); b = nb; }
      w.i32(b.length); w.bytes(b);
    }
    return w.finish();
  }
  function decodeTaiwuLifeSkills(raw) {
    raw = asU8(raw);
    var r = new Reader(raw), out = [];
    try {
      var cnt = r.i32();
      if (cnt < 0 || cnt > 1000000) cnt = 0;
      for (var i = 0; i < cnt; i++) {
        var skillId = r.i16();
        var sz = r.i32();
        if (sz < 5) { if (sz > 0) r.skip(sz); continue; }
        var rp = []; for (var j = 0; j < 5; j++) rp.push(r.u8());
        if (sz > 5) r.skip(sz - 5);
        out.push({ skillId: skillId, readingProgress: rp });
      }
    } catch (e) {}
    return out;
  }
  function encodeTaiwuLifeSkills(arr) {
    var w = new Writer(); arr = arr || []; w.i32(arr.length);
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i] || {}; var rp = s.readingProgress || [];
      w.i16(s.skillId || 0); w.i32(5);
      for (var j = 0; j < 5; j++) w.u8(rp[j] || 0);
    }
    return w.finish();
  }

  function decodeTaiwuModel(parsed) {
    var dom = getDomainSafe(parsed, 5), emap = getEntryMapSafe(dom);
    function raw(id) { var e = emap[id] || emap[String(id)]; return e ? e.rawBytes : null; }
    function rv(id, method, def) {
      var e = emap[id] || emap[String(id)];
      if (!e) return def;
      try { var r = new Reader(e.rawBytes); return r[method](); } catch (x) { return def; }
    }
    var model = {
      taiwuCharId: rv(0, 'i32', 0),
      taiwuGenerationsCount: rv(1, 'i32', 0),
      cricketLuckPoint: rv(2, 'i32', 0),
      buildingSpaceExtraAdd: rv(11, 'i32', 0),
      legacyPoint: rv(35, 'i32', 0),
      babyBonusMainAttributes: readFixedInts(raw(26) || new Uint8Array(0), 6, 'i16'),
      babyBonusLifeSkillQualifications: readFixedInts(raw(27) || new Uint8Array(0), 16, 'i16'),
      babyBonusCombatSkillQualifications: readFixedInts(raw(28) || new Uint8Array(0), 14, 'i16'),
      taiwuVillageSettlementId: rv(52, 'i16', 0),
      taiwuCombatSkills: decodeTaiwuCombatSkills(raw(13)),
      taiwuLifeSkills: decodeTaiwuLifeSkills(raw(14)),
      stock: decodeInventory(raw(89)),
      trough: decodeInventory(raw(90)),
      warehouse: decodeInventory(raw(91)),
      _dirty: false
    };
    if (model.babyBonusMainAttributes.length < 6) while (model.babyBonusMainAttributes.length < 6) model.babyBonusMainAttributes.push(0);
    if (model.babyBonusLifeSkillQualifications.length < 16) while (model.babyBonusLifeSkillQualifications.length < 16) model.babyBonusLifeSkillQualifications.push(0);
    if (model.babyBonusCombatSkillQualifications.length < 14) while (model.babyBonusCombatSkillQualifications.length < 14) model.babyBonusCombatSkillQualifications.push(0);
    return model;
  }

  var CHAR_FIXED_DEFS = [
    { fid: 0, name: 'id', type: 'i32', size: 4 },
    { fid: 1, name: 'templateId', type: 'i16', size: 2 },
    { fid: 2, name: 'creatingType', type: 'u8', size: 1 },
    { fid: 3, name: 'gender', type: 'i8', size: 1 },
    { fid: 4, name: 'actualAge', type: 'i16', size: 2 },
    { fid: 5, name: 'birthMonth', type: 'i8', size: 1 },
    { fid: 6, name: 'happiness', type: 'i8', size: 1 },
    { fid: 7, name: 'baseMorality', type: 'i16', size: 2 },
    { fid: 8, name: 'orgInfo', type: 'obj', size: 8 },
    { fid: 18, name: 'baseMainAttributes', type: 'i16x6', size: 12 },
    { fid: 19, name: 'health', type: 'i16', size: 2 },
    { fid: 20, name: 'baseMaxHealth', type: 'i16', size: 2 },
    { fid: 21, name: 'disorderOfQi', type: 'i16', size: 2 },
    { fid: 22, name: 'haveLeftArm', type: 'u8', size: 1 },
    { fid: 23, name: 'haveRightArm', type: 'u8', size: 1 },
    { fid: 24, name: 'haveLeftLeg', type: 'u8', size: 1 },
    { fid: 25, name: 'haveRightLeg', type: 'u8', size: 1 },
    { fid: 26, name: 'injuries', type: 'u8x16', size: 16 },
    { fid: 27, name: 'extraNeili', type: 'i32', size: 4 },
    { fid: 28, name: 'consummateLevel', type: 'i8', size: 1 },
    { fid: 30, name: 'baseLifeSkillQual', type: 'i16x16', size: 32 },
    { fid: 31, name: 'lifeSkillGrowthType', type: 'i8', size: 1 },
    { fid: 32, name: 'baseCombatSkillQual', type: 'i16x14', size: 28 },
    { fid: 33, name: 'combatSkillGrowthType', type: 'i8', size: 1 },
    { fid: 34, name: 'resources', type: 'i32x8', size: 32 },
    { fid: 43, name: 'currMainAttributes', type: 'i16x6', size: 12 },
    { fid: 44, name: 'poisoned', type: 'i32x6', size: 24 },
    { fid: 45, name: 'currNeili', type: 'i32', size: 4 },
    { fid: 47, name: 'baseNeiliAlloc', type: 'i16x4', size: 8 },
    { fid: 48, name: 'extraNeiliAlloc', type: 'i16x4', size: 8 },
    { fid: 64, name: 'xiangshuInfection', type: 'u8', size: 1 },
    { fid: 65, name: 'currAge', type: 'i16', size: 2 },
    { fid: 66, name: 'exp', type: 'i32', size: 4 }
  ];

  function readCharFixedValue(raw, col, def) {
    var off = fieldOffset(col, def.fid);
    if (off < 0) return null;
    var r = new Reader(raw); r.offset = off;
    try {
      if (def.type === 'obj') {
        return { settlementId: r.i16(), orgTemplateId: r.i16(), grade: r.i8(), principal: r.u8(), rawTail: r.bytes(2) };
      }
      if (/x\d+$/.test(def.type)) {
        var n = parseInt(def.type.split('x')[1], 10), base = def.type.split('x')[0], arr = [];
        for (var i = 0; i < n; i++) arr.push(r[base]());
        return arr;
      }
      return r[def.type]();
    } catch (e) { return null; }
  }

  function decodeCharTail(raw, col) {
    var out = { _tailOrder: [], _rawTails: {} }; raw = asU8(raw);
    var fixedN = col && typeof col.fixedSizes === 'object' ? col.fixedSizes.length : 0;
    var ids = col && col.fieldIds ? col.fieldIds.slice(fixedN) : [];
    var r = new Reader(raw); r.offset = col ? col.fixedSum : 0;
    var remainingRaw = raw.slice(r.offset);
    out._origTailBytes = remainingRaw;
    for (var i = 0; i < ids.length; i++) {
      var fid = ids[i]; out._tailOrder.push(fid);
      try {
        if (fid === 17 || fid === 40 || fid === 59) {
          var n1 = r.u16(), a1 = [];
          for (var j = 0; j < n1; j++) a1.push(r.i16());
          if (fid === 17) out.featureIds = a1;
          else if (fid === 40) out.potentialFeatureIds = a1;
          else out.learnedCombatSkills = a1;
        } else if (fid === 29) {
          var n29 = r.u16(), a29 = [];
          for (var k = 0; k < n29; k++) {
            var sId = r.i16(), rs = r.u8(), pad = r.u8();
            a29.push({ skillId: sId, readingState: rs, pad: pad, rawBytes: new Uint8Array([sId & 255, (sId >> 8) & 255, rs, pad]) });
          }
          out.learnedLifeSkills = a29;
        } else if (fid === 39) {
          var len39 = r.i32(); out.avatarRaw = r.bytes(len39);
        } else if (fid === 41) {
          var n41 = r.u16(), a41 = [];
          for (var k41 = 0; k41 < n41; k41++) a41.push(r.bytes(8));
          out.fameActionRecordsRaw = a41;
        } else if (fid === 57) {
          var wrapSz = r.i32();
          if (wrapSz > 0) {
            var cnt57 = r.i32(), items = [];
            for (var i57 = 0; i57 < cnt57; i57++) {
              items.push({ itemType: r.i8(), modState: r.u8(), templateId: r.i16(), id: r.i32(), amount: r.i32() });
            }
            out.inventory = items;
          } else out.inventory = [];
        } else if (fid === 62) {
          var n62 = r.u16(), a62 = [];
          for (var k62 = 0; k62 < n62; k62++) a62.push(r.bytes(4));
          out.skillQualBonusesRaw = a62;
        } else if (fid === 71) {
          var n71 = r.u16(), a71 = [];
          for (var k71 = 0; k71 < n71; k71++) a71.push(r.bytes(16));
          out.npcTravelTargetsRaw = a71;
        } else if (fid === 74) {
          var len74 = r.u16(); out.wugKingDriveDataExRaw = r.bytes(len74);
        } else {
          var rest = raw.slice(r.offset);
          out._rawTails[fid] = rest;
          break;
        }
      } catch (e) {
        out._rawTails[fid] = remainingRaw.slice(Math.max(0, r.offset - (col ? col.fixedSum : 0)));
        break;
      }
    }
    return out;
  }

  function decodeCharactersModel(parsed) {
    var dom = getDomainSafe(parsed, 4), e0 = (getEntryMapSafe(dom)[0] || getEntryMapSafe(dom)['0']);
    var out = [], col = null;
    if (e0 && e0.rawBytes && hasWire('readObjCollection')) {
      try { col = Wire.readObjCollection(e0.rawBytes, 4); } catch (e) { col = null; }
    }
    if (!col) return { list: out, _charCollection: null, _dirty: false };
    var items = objCollectionItems(col);
    for (var i = 0; i < items.length; i++) {
      var item = items[i] || {}, objBytes = asU8(item.objBytes);
      if (!objBytes || objBytes.length < col.fixedSum) continue;
      var fixedRaw = objBytes.slice(0, col.fixedSum);
      var ch = { _fixedRaw: fixedRaw, _origObjBytes: objBytes, _col: col, _dirty: false, _keyBytes: asU8(item.keyBytes) };
      for (var d = 0; d < CHAR_FIXED_DEFS.length; d++) {
        var def = CHAR_FIXED_DEFS[d], v = readCharFixedValue(fixedRaw, col, def);
        if (v !== null) ch[def.name] = v;
      }
      var tail = decodeCharTail(objBytes, col);
      for (var k in tail) ch[k] = tail[k];
      ch.id = typeof ch.id === 'number' ? ch.id : (ch._keyBytes.length >= 4 ? new Reader(ch._keyBytes).i32() : 0);
      out.push(ch);
    }
    return { list: out, _charCollection: col, _dirty: false };
  }

  function encodeCharFixed(ch, col) {
    var raw = ch._fixedRaw ? asU8(ch._fixedRaw) : new Uint8Array(col.fixedSum);
    var fixed = new Uint8Array(col.fixedSum); fixed.set(raw.subarray(0, col.fixedSum));
    for (var d = 0; d < CHAR_FIXED_DEFS.length; d++) {
      var def = CHAR_FIXED_DEFS[d], off = fieldOffset(col, def.fid);
      if (off < 0) continue;
      var val = ch[def.name], w = new Writer();
      if (def.type === 'obj') {
        var o = val || {};
        w.i16(o.settlementId || 0); w.i16(o.orgTemplateId || 0); w.i8(o.grade || 0); w.u8(o.principal || 0);
        w.bytes(o.rawTail && o.rawTail.length >= 2 ? o.rawTail : new Uint8Array(2));
      } else if (/x\d+$/.test(def.type)) {
        var n = parseInt(def.type.split('x')[1], 10), base = def.type.split('x')[0], a = val || [];
        for (var i = 0; i < n; i++) w[base](a[i] || 0);
      } else {
        w[def.type](val || 0);
      }
      var b = w.finish(), size = def.size || b.length;
      fixed.set(b.subarray(0, Math.min(size, b.length)), off);
    }
    return fixed;
  }

  function encodeCharTail(ch, col) {
    var w = new Writer();
    var order = ch._tailOrder && ch._tailOrder.length ? ch._tailOrder : [17, 29, 39, 40, 41, 57, 59, 62, 71, 74];
    for (var i = 0; i < order.length; i++) {
      var fid = order[i];
      if (fid === 17) {
        var f = ch.featureIds || []; w.u16(f.length); for (var j = 0; j < f.length; j++) w.i16(f[j]);
      } else if (fid === 29) {
        var ls = ch.learnedLifeSkills || []; w.u16(ls.length);
        for (var j2 = 0; j2 < ls.length; j2++) {
          var s = ls[j2] || {}; w.i16(s.skillId || 0); w.u8(s.readingState || 0); w.u8(s.pad || 0);
        }
      } else if (fid === 39) {
        var av = asU8(ch.avatarRaw || new Uint8Array(0)); w.i32(av.length); w.bytes(av);
      } else if (fid === 40) {
        var pf = ch.potentialFeatureIds || []; w.u16(pf.length); for (var j3 = 0; j3 < pf.length; j3++) w.i16(pf[j3]);
      } else if (fid === 41) {
        var fa = ch.fameActionRecordsRaw || []; w.u16(fa.length); for (var j4 = 0; j4 < fa.length; j4++) { var b4 = asU8(fa[j4]); var t4 = new Uint8Array(8); t4.set(b4.subarray(0, 8)); w.bytes(t4); }
      } else if (fid === 57) {
        w.bytes(encodeInventory(ch.inventory));
      } else if (fid === 59) {
        var cs = ch.learnedCombatSkills || []; w.u16(cs.length); for (var j5 = 0; j5 < cs.length; j5++) w.i16(cs[j5]);
      } else if (fid === 62) {
        var sq = ch.skillQualBonusesRaw || []; w.u16(sq.length); for (var j6 = 0; j6 < sq.length; j6++) { var b6 = asU8(sq[j6]); var t6 = new Uint8Array(4); t6.set(b6.subarray(0, 4)); w.bytes(t6); }
      } else if (fid === 71) {
        var nt = ch.npcTravelTargetsRaw || []; w.u16(nt.length); for (var j7 = 0; j7 < nt.length; j7++) { var b7 = asU8(nt[j7]); var t7 = new Uint8Array(16); t7.set(b7.subarray(0, 16)); w.bytes(t7); }
      } else if (fid === 74) {
        var wd = asU8(ch.wugKingDriveDataExRaw || new Uint8Array(0)); w.u16(wd.length); w.bytes(wd);
      } else if (ch._rawTails && ch._rawTails[fid]) {
        w.bytes(ch._rawTails[fid]);
      }
    }
    return w.finish();
  }

  function encodeCharactersModel(charModel) {
    var col = charModel._charCollection;
    if (!col || !hasWire('writeObjCollection')) return null;
    var items = [];
    var list = charModel.list || [];
    for (var i = 0; i < list.length; i++) {
      var ch = list[i];
      if (!ch || ch._dirty === false) {
        if (ch && ch._origObjBytes) items.push({ keyBytes: ch._keyBytes, objBytes: ch._origObjBytes });
        continue;
      }
      var fixed = encodeCharFixed(ch, col);
      var tail = encodeCharTail(ch, col);
      var obj = new Uint8Array(fixed.length + tail.length);
      obj.set(fixed, 0); obj.set(tail, fixed.length);
      var kb = ch._keyBytes && ch._keyBytes.length === 4 ? ch._keyBytes : (function () { var w = new Writer(); w.i32(ch.id || 0); return w.finish(); })();
      items.push({ keyBytes: kb, objBytes: obj });
    }
    try { return Wire.writeObjCollection(col, 4, items); } catch (e) { return null; }
  }

  function decodeCombatSkillsModel(parsed) {
    var dom = getDomainSafe(parsed, 7), e0 = (getEntryMapSafe(dom)[0] || getEntryMapSafe(dom)['0']);
    var out = [], col = null;
    if (e0 && e0.rawBytes && hasWire('readObjCollection')) {
      try { col = Wire.readObjCollection(e0.rawBytes, 8); } catch (e) { col = null; }
    }
    if (!col) return { list: out, _collection: null, _dirty: false };
    var items = objCollectionItems(col);
    for (var i = 0; i < items.length; i++) {
      var item = items[i] || {}, obj = asU8(item.objBytes);
      var rec = { _objBytes: obj, _keyBytes: asU8(item.keyBytes), _dirty: false };
      if (rec._keyBytes.length >= 6) {
        var kr = new Reader(rec._keyBytes);
        rec.charId = kr.i32();
        rec.skillId = kr.i16();
      } else {
        rec.charId = 0;
        rec.skillId = 0;
      }
      if (obj.length >= col.fixedSum) {
        function fv(fid, method, def) { return readFixed(obj, col, fid, function (r) { return r[method](); }, def); }
        rec.readingState = fv(1, 'u16', 0);
        rec.activationState = fv(2, 'u16', 0);
        rec.forcedBreakoutStepsCount = fv(3, 'i8', 0);
        rec.breakoutStepsCount = fv(4, 'i8', 0);
        rec.innerRatio = fv(5, 'i8', 0);
        rec.obtainedNeili = fv(6, 'u16', 0);
        rec.revoked = fv(7, 'i8', 0);
        rec.specialEffectId = readFixed(obj, col, 8, function (r) { return r.u64Str(); }, '0');
      }
      out.push(rec);
    }
    return { list: out, _collection: col, _dirty: false };
  }

  function decodeStackableItems(parsed) {
    var raw = entryRaw(getDomainSafe(parsed, 6), 14), out = [];
    if (!raw) return out;
    var r = new Reader(raw);
    try {
      var cnt = r.i32(); if (cnt < 0 || cnt > 1000000) cnt = 0;
      for (var i = 0; i < cnt; i++) out.push({ itemType: r.i8(), templateId: r.i16(), count: r.i32() });
    } catch (e) {}
    return out;
  }
  function encodeStackableItems(arr) {
    var w = new Writer(); arr = arr || []; w.i32(arr.length);
    for (var i = 0; i < arr.length; i++) { var it = arr[i] || {}; w.i8(it.itemType || 0); w.i16(it.templateId || 0); w.i32(it.count || 0); }
    return w.finish();
  }

  function decodeObjectItems(parsed) {
    var dom = getDomainSafe(parsed, 6), out = [];
    for (var cat = 0; cat <= 12; cat++) {
      var e = (getEntryMapSafe(dom)[cat] || getEntryMapSafe(dom)[String(cat)]);
      if (!e || !e.rawBytes || !hasWire('readObjCollection')) continue;
      var col;
      try { col = Wire.readObjCollection(e.rawBytes, 4); } catch (x) { continue; }
      var items = objCollectionItems(col);
      for (var i = 0; i < items.length; i++) {
        var obj = asU8(items[i].objBytes);
        if (obj.length < col.fixedSum) continue;
        function gv(fid, method, def) { return readFixed(obj, col, fid, function (r) { return r[method](); }, def); }
        out.push({
          categoryId: cat, id: gv(0, 'i32', 0), templateId: gv(1, 'i16', 0),
          maxDurability: gv(2, 'i16', 0), currDurability: gv(cat === 0 ? 5 : 4, 'i16', 0),
          _objBytes: obj, _keyBytes: asU8(items[i].keyBytes), _collection: col, _dirty: false
        });
      }
    }
    return out;
  }

  function decodeArchiveModel(globalOrLocal, maybeLocal) {
    var globalParsed = globalOrLocal || null;
    var localParsed = maybeLocal || globalOrLocal || null;
    var chars = decodeCharactersModel(localParsed);
    var tw = decodeTaiwuModel(localParsed);
    var cs = decodeCombatSkillsModel(localParsed);
    return {
      global: decodeGlobalModel(globalParsed),
      world: decodeWorldModel(localParsed),
      taiwu: tw,
      characters: chars.list,
      _charCollection: chars._charCollection,
      taiwuCombatSkills: tw.taiwuCombatSkills,
      taiwuLifeSkills: tw.taiwuLifeSkills,
      combatSkills: cs.list,
      _combatSkillCollection: cs._collection,
      stackableItems: decodeStackableItems(localParsed),
      objectItems: decodeObjectItems(localParsed)
    };
  }

  function applyWorldInfo(parsed, world) {
    if (!parsed || !world) return;
    var wi = parsed.worldInfo || (parsed.worldInfo = {});
    if (world.taiwuSurname !== undefined && world.taiwuSurname !== wi.taiwuSurname) { wi.taiwuSurname = world.taiwuSurname; world._dirty = true; }
    if (world.taiwuGivenName !== undefined && world.taiwuGivenName !== wi.taiwuGivenName) { wi.taiwuGivenName = world.taiwuGivenName; world._dirty = true; }
    if (world.gender !== undefined && world.gender !== wi.gender) { wi.gender = world.gender; world._dirty = true; }
    if (world.taiwuGenerationsCount !== undefined && world.taiwuGenerationsCount !== wi.taiwuGenerationsCount) { wi.taiwuGenerationsCount = world.taiwuGenerationsCount; world._dirty = true; }
    if (world.dreamBackCount !== undefined && world.dreamBackCount !== wi.dreamBackCount) { wi.dreamBackCount = world.dreamBackCount; world._dirty = true; }
    if (world.mapStateName !== undefined && world.mapStateName !== wi.mapStateName) { wi.mapStateName = world.mapStateName; world._dirty = true; }
    if (world.mapAreaName !== undefined && world.mapAreaName !== wi.mapAreaName) { wi.mapAreaName = world.mapAreaName; world._dirty = true; }
    if (world._dirty && hasWire('writeWorldInfo')) {
      try { parsed.worldInfoBytes = Wire.writeWorldInfo(wi); } catch (e) {}
    }
  }

  function writeScalarById(parsed, domainId, dataId, method, val) {
    var w = new Writer(); w[method](val || 0); setRaw(parsed, domainId, dataId, w.finish());
  }
  function writeU64ById(parsed, domainId, dataId, val) {
    var w = new Writer(); w.u64Str(val); setRaw(parsed, domainId, dataId, w.finish());
  }

  function applyGlobal(parsed, g) {
    if (!g) return;
    if (g.globalFlags !== undefined) writeU64ById(parsed, 0, 4, g.globalFlags || '0');
    if (Array.isArray(g.ownedChickens)) {
      setRaw(parsed, 0, 5, writeI32Count(g.ownedChickens, function (w, v) { w.i16(v || 0); }));
    }
  }

  function applyWorld(parsed, wr) {
    if (!wr) return;
    writeScalarById(parsed, 1, 26, 'i32', wr.currDate);
    writeScalarById(parsed, 1, 4, 'i16', wr.mainStoryLineProgress);
    writeScalarById(parsed, 1, 5, 'u8', wr.beatRanChenZi);
    writeU64ById(parsed, 1, 6, wr.worldFunctionsStatuses || '0');
    writeScalarById(parsed, 1, 12, 'u8', wr.worldPopulationType);
    writeScalarById(parsed, 1, 13, 'u8', wr.characterLifespanType);
    writeScalarById(parsed, 1, 14, 'u8', wr.combatDifficulty);
    writeScalarById(parsed, 1, 15, 'u8', wr.hereticsAmountType);
    writeScalarById(parsed, 1, 16, 'u8', wr.bossInvasionSpeedType);
    writeScalarById(parsed, 1, 17, 'u8', wr.worldResourceAmountType);
    writeScalarById(parsed, 1, 18, 'u8', wr.allowRandomTaiwuHeir);
    writeScalarById(parsed, 1, 19, 'u8', wr.restrictOptionsBehaviorType);
    writeScalarById(parsed, 1, 35, 'u8', wr.professionUpgrade);
    writeScalarById(parsed, 1, 37, 'u8', wr.favorabilityChange);
    writeScalarById(parsed, 1, 38, 'u8', wr.enemyPracticeLevel);
    writeScalarById(parsed, 1, 39, 'u8', wr.loopingDifficulty);
    writeScalarById(parsed, 1, 40, 'u8', wr.readingDifficulty);
    writeScalarById(parsed, 1, 41, 'u8', wr.breakoutDifficulty);
    writeScalarById(parsed, 1, 42, 'i16', wr.lootYield);
    applyWorldInfo(parsed, wr);
  }

  function applyTaiwu(parsed, t) {
    if (!t) return;
    writeScalarById(parsed, 5, 0, 'i32', t.taiwuCharId);
    writeScalarById(parsed, 5, 1, 'i32', t.taiwuGenerationsCount);
    writeScalarById(parsed, 5, 2, 'i32', t.cricketLuckPoint);
    writeScalarById(parsed, 5, 11, 'i32', t.buildingSpaceExtraAdd);
    writeScalarById(parsed, 5, 35, 'i32', t.legacyPoint);
    writeScalarById(parsed, 5, 26, 'i16', t.babyBonusMainAttributes);
    writeScalarById(parsed, 5, 27, 'i16', t.babyBonusLifeSkillQualifications);
    writeScalarById(parsed, 5, 28, 'i16', t.babyBonusCombatSkillQualifications);
    writeScalarById(parsed, 5, 52, 'i16', t.taiwuVillageSettlementId);
    setRaw(parsed, 5, 13, encodeTaiwuCombatSkills(t.taiwuCombatSkills || []));
    setRaw(parsed, 5, 14, encodeTaiwuLifeSkills(t.taiwuLifeSkills || []));
    setRaw(parsed, 5, 89, encodeInventory(t.stock));
    setRaw(parsed, 5, 90, encodeInventory(t.trough));
    setRaw(parsed, 5, 91, encodeInventory(t.warehouse));
  }

  function applyCharacters(parsed, model) {
    var charModel = { list: model.characters || [], _charCollection: model._charCollection };
    var buf = encodeCharactersModel(charModel);
    if (buf) setRaw(parsed, 4, 0, buf);
  }

  function applyCombatSkills(parsed, model) {
    var col = model._combatSkillCollection || (model.combatSkills && model.combatSkills._collection);
    var list = Array.isArray(model.combatSkills) ? model.combatSkills : (model.combatSkills && model.combatSkills.list) || [];
    if (!col || !hasWire('writeObjCollection')) return;
    var items = [];
    for (var i = 0; i < list.length; i++) {
      var rec = list[i];
      if (!rec || rec._dirty === false) {
        if (rec && rec._objBytes) items.push({ keyBytes: rec._keyBytes, objBytes: rec._objBytes });
        continue;
      }
      var fixed = new Uint8Array(col.fixedSum);
      function wv(fid, method, val) {
        var off = fieldOffset(col, fid); if (off < 0) return;
        var tw = new Writer(); tw[method](val || 0); var b = tw.finish();
        fixed.set(b.subarray(0, Math.min(b.length, col.fixedSizes[col.fieldIds.indexOf(fid)] || b.length)), off);
      }
      wv(1, 'u16', rec.readingState); wv(2, 'u16', rec.activationState);
      wv(3, 'i8', rec.forcedBreakoutStepsCount); wv(4, 'i8', rec.breakoutStepsCount);
      wv(5, 'i8', rec.innerRatio); wv(6, 'u16', rec.obtainedNeili);
      wv(7, 'i8', rec.revoked);
      var off8 = fieldOffset(col, 8);
      if (off8 >= 0) { var tw8 = new Writer(); tw8.u64Str(rec.specialEffectId || '0'); var b8 = tw8.finish(); fixed.set(b8.subarray(0, 8), off8); }
      items.push({ keyBytes: rec._keyBytes, objBytes: fixed });
    }
    try { setRaw(parsed, 7, 0, Wire.writeObjCollection(col, 8, items)); } catch (e) {}
  }

  function applyItems(parsed, model) {
    setRaw(parsed, 6, 14, encodeStackableItems(model.stackableItems || []));
    var grouped = {};
    (model.objectItems || []).forEach(function (it) {
      if (!it || it._dirty !== true) return;
      var cat = it.categoryId | 0; (grouped[cat] || (grouped[cat] = [])).push(it);
    });
    Object.keys(grouped).forEach(function (catKey) {
      var cat = parseInt(catKey, 10), dom = getDomainSafe(parsed, 6);
      var e = (getEntryMapSafe(dom)[cat] || getEntryMapSafe(dom)[String(cat)]);
      if (!e || !hasWire('readObjCollection') || !hasWire('writeObjCollection')) return;
      var col;
      try { col = Wire.readObjCollection(e.rawBytes, 4); } catch (x) { return; }
      var map = {};
      grouped[cat].forEach(function (it) { map[it.id] = it; });
      var items = objCollectionItems(col).map(function (item) {
        var id = 0; try { id = new Reader(item.keyBytes).i32(); } catch (x) {}
        if (!map[id]) return { keyBytes: item.keyBytes, objBytes: item.objBytes };
        var src = map[id], fixed = new Uint8Array(col.fixedSum); fixed.set(asU8(item.objBytes).subarray(0, col.fixedSum));
        function setF(fid, method, val) {
          var off = fieldOffset(col, fid); if (off < 0) return;
          var w = new Writer(); w[method](val || 0); var b = w.finish(); fixed.set(b.subarray(0, b.length), off);
        }
        setF(0, 'i32', src.id); setF(1, 'i16', src.templateId); setF(2, 'i16', src.maxDurability);
        setF(cat === 0 ? 5 : 4, 'i16', src.currDurability);
        return { keyBytes: item.keyBytes, objBytes: fixed };
      });
      try { setRaw(parsed, 6, cat, Wire.writeObjCollection(col, 4, items)); } catch (x) {}
    });
  }

  function applyModelToParsed(a, b, c) {
    var globalParsed, localParsed, model;
    if (arguments.length >= 3) { globalParsed = a; localParsed = b; model = c; }
    else { globalParsed = a; localParsed = null; model = b; }
    if (!globalParsed || !model) return { globalParsed: globalParsed, localParsed: localParsed, model: model };
    var targetLocal = localParsed || globalParsed;
    if (model.global) applyGlobal(globalParsed, model.global);
    if (model.world) applyWorld(targetLocal, model.world);
    if (model.taiwu) applyTaiwu(targetLocal, model.taiwu);
    if (model.characters) applyCharacters(targetLocal, model);
    if (model.combatSkills) applyCombatSkills(targetLocal, model);
    if (model.stackableItems || model.objectItems) applyItems(targetLocal, model);
    return { globalParsed: globalParsed, localParsed: localParsed, model: model };
  }

  var CHAR_FIELD_IDS = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25,
    26, 27, 28, 30, 31, 32, 33, 34, 35, 36, 37, 38, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52,
    53, 54, 55, 56, 58, 60, 61, 63, 64, 65, 66, 67, 68, 69, 70, 72, 73,
    17, 29, 39, 40, 41, 57, 59, 62, 71, 74
  ];
  var FIXED_CHAR_SIZES = [
    4, 2, 1, 1, 2, 1, 1, 2, 8, 1, 1, 1, 1, 1, 1, 1, 1, 12, 2, 2, 2, 1, 1, 1, 1,
    16, 4, 1, 32, 1, 28, 1, 32, 2, 2, 10, 4, 64, 12, 24, 4, 2, 8, 8, 8, 4, 1, 1,
    1, 4, 4, 136, 90, 96, 252, 40, 1, 2, 4, 8, 4, 4, 4, 16, 2
  ];

  function createDemoSaveBundle() {
    function makeMeta(id) {
      return new Uint8Array([1, 0, id & 255, (id >> 8) & 255]);
    }
    function makeEmptyWireRaw(spec) {
      var tag = spec[1], a1 = spec[2] || 0;
      if (tag === 'u') return new Uint8Array(a1);
      if (tag === 'bin') return new Uint8Array(a1);
      if (tag === 'obj_u' || tag === 'obj_c') return new Uint8Array(12);
      return new Uint8Array(4);
    }
    function buildEmptyDomain(domainId) {
      var specs = (Wire.DOMAIN_WIRE_SPEC && Wire.DOMAIN_WIRE_SPEC[String(domainId)]) || [];
      return {
        domainId: domainId,
        domainMetaBytes: makeMeta(domainId),
        entries: specs.map(function (s) {
          return {
            domainId: domainId,
            dataId: s[0],
            metaBytes: makeMeta(s[0]),
            rawBytes: makeEmptyWireRaw(s),
            _dirty: false
          };
        })
      };
    }
    function keyI32(id) {
      var w = new Writer(); w.i32(id); return w.finish();
    }
    function keyCombatSkill(charId, skillId) {
      var w = new Writer(); w.i32(charId); w.i16(skillId); w.u16(0); return w.finish();
    }
    function buildFixedOffsets(fids, fsizes) {
      var off = {}, sum = 0;
      for (var i = 0; i < fsizes.length; i++) { off[fids[i]] = sum; sum += fsizes[i]; }
      return { fieldIds: fids.slice(), fixedSizes: fsizes.slice(), fixedSum: sum, fixedOffsets: off };
    }

    var globalParsed = {
      magic: 'T1G',
      version: 4,
      compressionAlgorithm: 0,
      meta: {
        fieldCount: 7, compressionAlgorithm: 0, compressionType: 2,
        gameVersion: '1', gameBuildDate: '20261116', incompatibilityMarkVersion: 2,
        initGameVersion: '1', initGameBuildDate: '20261116'
      },
      domains: [buildEmptyDomain(0)]
    };
    applyGlobal(globalParsed, { globalFlags: '0', ownedChickens: [1, 2], achievementsCount: 3 });

    var domains = [];
    for (var d = 1; d <= 20; d++) domains.push(buildEmptyDomain(d));

    var localParsed = {
      magic: 'T1L',
      version: 4,
      compressionAlgorithm: 0,
      meta: {
        fieldCount: 7, compressionAlgorithm: 0, compressionType: 2,
        gameVersion: '1', gameBuildDate: '20261116', incompatibilityMarkVersion: 4,
        initGameVersion: '1', initGameBuildDate: '20261116'
      },
      worldInfo: {
        fieldCount: 37, currDate: 15, taiwuGenerationsCount: 1, savingTimestamp: 1731715200,
        taiwuSurname: '임', taiwuGivenName: '청풍', gender: 1,
        avatarRelatedData: new Uint8Array(0),
        mapStateName: '태오촌', mapAreaName: '태오촌',
        charOpts: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
        stateTaskStatuses: [], xiangshuAvatarTaskStatuses: [],
        mainStoryLineProgress: 10, beatRanChenZi: 0, modIds: [],
        worldPopulationType: 1, enemyPracticeLevel: 1,
        gameVersionInfo: new Uint8Array(0), favorabilityChange: 1,
        dlcIds: [], professionUpgrade: 0, lootYield: 100,
        totalTaiwuLifeSummaryInfo: new Uint8Array(0),
        worldFunctionStatuses: '0', mapStateTemplateId: 0, mapAreaTemplateId: 0,
        totalTaiwuLifeSummaryInfoEx: new Uint8Array(0), dreamBackCount: 0,
        _dirty: true
      },
      domains: domains,
      workingDbBytes: new Uint8Array([83,81,76,105,116,101,32,102,111,114,109,97,116,32,51,0])
    };

    var charCol = buildFixedOffsets(CHAR_FIELD_IDS, FIXED_CHAR_SIZES);
    var demoChars = [
      {
        id: 1, templateId: 1, creatingType: 0, gender: 1, actualAge: 20, currAge: 20, birthMonth: 1,
        happiness: 80, baseMorality: 300, orgInfo: { settlementId: 1, orgTemplateId: 0, grade: 5, principal: 1, rawTail: new Uint8Array(2) },
        health: 120, baseMaxHealth: 120, disorderOfQi: 0, haveLeftArm: 1, haveRightArm: 1, haveLeftLeg: 1, haveRightLeg: 1,
        injuries: new Array(16).fill(0), extraNeili: 500, currNeili: 500, consummateLevel: 4,
        baseMainAttributes: [90, 88, 85, 82, 92, 78], currMainAttributes: [90, 88, 85, 82, 92, 78],
        baseLifeSkillQual: new Array(16).fill(80), lifeSkillGrowthType: 1,
        baseCombatSkillQual: new Array(14).fill(85), combatSkillGrowthType: 1,
        resources: [1200, 1000, 800, 600, 700, 5000, 300, 1500],
        poisoned: [0, 0, 0, 0, 0, 0], baseNeiliAlloc: [25, 25, 25, 25], extraNeiliAlloc: [10, 10, 10, 10],
        xiangshuInfection: 0, exp: 3000,
        featureIds: [0, 1], learnedLifeSkills: [{ skillId: 0, readingState: 31, pad: 0 }],
        potentialFeatureIds: [2], inventory: [
          { itemType: 0, modState: 0, templateId: 3, id: 101, amount: 1 },
          { itemType: 10, modState: 0, templateId: 1, id: 102, amount: 1 },
          { itemType: 8, modState: 0, templateId: 1, id: -1, amount: 3 }
        ],
        learnedCombatSkills: [0, 3]
      },
      {
        id: 2, templateId: 2, creatingType: 1, gender: 0, actualAge: 22, currAge: 22, birthMonth: 3,
        happiness: 70, baseMorality: 200, orgInfo: { settlementId: 1, orgTemplateId: 1, grade: 4, principal: 0, rawTail: new Uint8Array(2) },
        health: 100, baseMaxHealth: 100, disorderOfQi: 0, haveLeftArm: 1, haveRightArm: 1, haveLeftLeg: 1, haveRightLeg: 1,
        injuries: new Array(16).fill(0), extraNeili: 200, currNeili: 200, consummateLevel: 2,
        baseMainAttributes: [65, 72, 70, 68, 66, 75], currMainAttributes: [65, 72, 70, 68, 66, 75],
        baseLifeSkillQual: new Array(16).fill(60), lifeSkillGrowthType: 0,
        baseCombatSkillQual: new Array(14).fill(60), combatSkillGrowthType: 0,
        resources: [300, 200, 100, 100, 150, 800, 50, 400],
        poisoned: [0, 0, 0, 0, 0, 0], baseNeiliAlloc: [20, 20, 20, 20], extraNeiliAlloc: [0, 0, 0, 0],
        xiangshuInfection: 0, exp: 800,
        featureIds: [0], learnedLifeSkills: [], potentialFeatureIds: [], inventory: [], learnedCombatSkills: [0]
      },
      {
        id: 3, templateId: 3, creatingType: 1, gender: 1, actualAge: 25, currAge: 25, birthMonth: 7,
        happiness: 65, baseMorality: 100, orgInfo: { settlementId: 1, orgTemplateId: 2, grade: 3, principal: 0, rawTail: new Uint8Array(2) },
        health: 95, baseMaxHealth: 100, disorderOfQi: 10, haveLeftArm: 1, haveRightArm: 1, haveLeftLeg: 1, haveRightLeg: 1,
        injuries: new Array(16).fill(0), extraNeili: 150, currNeili: 150, consummateLevel: 2,
        baseMainAttributes: [78, 65, 74, 62, 70, 60], currMainAttributes: [78, 65, 74, 62, 70, 60],
        baseLifeSkillQual: new Array(16).fill(50), lifeSkillGrowthType: 0,
        baseCombatSkillQual: new Array(14).fill(65), combatSkillGrowthType: 0,
        resources: [250, 180, 120, 90, 80, 500, 30, 300],
        poisoned: [0, 0, 0, 0, 0, 0], baseNeiliAlloc: [20, 20, 20, 20], extraNeiliAlloc: [0, 0, 0, 0],
        xiangshuInfection: 0, exp: 600,
        featureIds: [1], learnedLifeSkills: [], potentialFeatureIds: [], inventory: [], learnedCombatSkills: [3]
      }
    ];
    var charItems = demoChars.map(function (ch) {
      var fx = encodeCharFixed(ch, charCol);
      var tl = encodeCharTail(ch, charCol);
      var obj = new Uint8Array(fx.length + tl.length);
      obj.set(fx, 0); obj.set(tl, fx.length);
      return { keyBytes: keyI32(ch.id), objBytes: obj };
    });
    setRaw(localParsed, 4, 0, Wire.writeObjCollection(charCol, 4, charItems));

    var weaponCol = buildFixedOffsets([0, 1, 2, 3, 5, 6, 7, 8, 4], [4, 2, 2, 2, 2, 1, 4, 12]);
    var ww = new Writer();
    ww.i32(101).i16(3).i16(100).i16(0).i16(95).u8(0).i32(1).bytes(new Uint8Array(12)).i32(0);
    setRaw(localParsed, 6, 0, Wire.writeObjCollection(weaponCol, 4, [{ keyBytes: keyI32(101), objBytes: ww.finish() }]));

    var bookCol = buildFixedOffsets([0, 1, 2, 3, 4, 5, 6], [4, 2, 2, 2, 1, 1, 2]);
    var bw = new Writer();
    bw.i32(102).i16(1).i16(10).i16(10).u8(0).u8(0).u16(0);
    setRaw(localParsed, 6, 10, Wire.writeObjCollection(bookCol, 4, [{ keyBytes: keyI32(102), objBytes: bw.finish() }]));
    setRaw(localParsed, 6, 14, encodeStackableItems([{ itemType: 5, templateId: 1, count: 50 }, { itemType: 8, templateId: 1, count: 3 }]));

    var csCol = buildFixedOffsets([0, 1, 2, 3, 4, 5, 6, 7, 8], [8, 2, 2, 1, 1, 1, 2, 1, 8]);
    function makeCsObj(charId, skillId, readState) {
      var w = new Writer();
      w.i32(charId).i16(skillId).u16(0).u16(readState).u16(0).i8(0).i8(5).i8(50).u16(100).i8(0).u64Str('0');
      return { keyBytes: keyCombatSkill(charId, skillId), objBytes: w.finish() };
    }
    setRaw(localParsed, 7, 0, Wire.writeObjCollection(csCol, 8, [makeCsObj(1, 0, 31), makeCsObj(1, 3, 15)]));

    applyWorld(localParsed, {
      currDate: 15, mainStoryLineProgress: 10, beatRanChenZi: 0, worldFunctionsStatuses: '0',
      worldPopulationType: 1, characterLifespanType: 1, combatDifficulty: 0, hereticsAmountType: 1,
      bossInvasionSpeedType: 1, worldResourceAmountType: 1, allowRandomTaiwuHeir: 1,
      restrictOptionsBehaviorType: 0, professionUpgrade: 0, favorabilityChange: 1,
      enemyPracticeLevel: 1, loopingDifficulty: 0, readingDifficulty: 0, breakoutDifficulty: 0, lootYield: 100
    });
    applyTaiwu(localParsed, {
      taiwuCharId: 1, taiwuGenerationsCount: 1, cricketLuckPoint: 50,
      buildingSpaceExtraAdd: 2, legacyPoint: 320,
      babyBonusMainAttributes: 5, babyBonusLifeSkillQualifications: 5, babyBonusCombatSkillQualifications: 5,
      taiwuVillageSettlementId: 1,
      taiwuCombatSkills: [
        { skillId: 0, readingProgress: [100,100,100,100,100,100,100,100,100,100,100,100,100,100,100], lastClearBreakPlateTime: 0, fullPowerCastTimes: 0 },
        { skillId: 3, readingProgress: [100,100,100,100,100,0,0,0,0,0,0,0,0,0,0], lastClearBreakPlateTime: 0, fullPowerCastTimes: 0 }
      ],
      taiwuLifeSkills: [{ skillId: 0, readingProgress: [100,100,100,100,100] }],
      warehouse: [{ itemType: 5, modState: 0, templateId: 1, id: -1, amount: 50 }],
      stock: [], trough: []
    });

    return {
      globalSav: Wire.serializeArchive(globalParsed),
      localSav: Wire.serializeArchive(localParsed)
    };
  }

  return {
    parseArchive: Wire.parseArchive,
    serializeArchive: Wire.serializeArchive,
    validateArchiveBytes: Wire.validateArchiveBytes,
    parseWorldInfo: Wire.parseWorldInfo,
    writeWorldInfo: Wire.writeWorldInfo,
    DOMAIN_WIRE_SPEC: Wire.DOMAIN_WIRE_SPEC,
    calculateCRC32: Deflate.calculateCRC32,
    ByteReader: Deflate.ByteReader,
    ByteWriter: Deflate.ByteWriter,
    inflateRaw: Deflate.inflateRaw,
    deflateRaw: Deflate.deflateRaw,
    decodeArchiveModel: decodeArchiveModel,
    applyModelToParsed: applyModelToParsed,
    createDemoSaveBundle: createDemoSaveBundle
  };
});
