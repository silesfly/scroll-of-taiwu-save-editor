'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const SRC = path.join(__dirname, '..', 'src');

const Deflate = require(path.join(SRC, 'taiwu-deflate.js'));
const Wire = require(path.join(SRC, 'taiwu-wire.js'));
const Codec = require(path.join(SRC, 'taiwu-codec.js'));
const Core = require(path.join(SRC, 'editor-core.js'));
const Catalog = require(path.join(SRC, 'catalog-data.js'));

// ---------------------------------------------------------------------------
// tiny harness
// ---------------------------------------------------------------------------
let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (err) {
    failures.push({ name, err });
    console.log('  FAIL ' + name + '\n        ' + (err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n        ') : err));
  }
}
function eq(a, b, msg) { assert.strictEqual(a, b, msg); }
function ok(v, msg) { assert.ok(v, msg); }
function deepEq(a, b, msg) { assert.deepStrictEqual(a, b, msg); }

// ===========================================================================
// SECTION 1 — taiwu-deflate.js
// ===========================================================================
console.log('\n[Section 1] taiwu-deflate.js');

test('calculateCRC32("123456789") === 0xCBF43926', () => {
  const out = Deflate.calculateCRC32(Buffer.from('123456789', 'utf8'));
  eq(out >>> 0, 0xCBF43926);
});

test('calculateCRC32(empty) === 0', () => {
  eq(Deflate.calculateCRC32(new Uint8Array(0)) >>> 0, 0);
});

test('ByteWriter / ByteReader primitive roundtrip', () => {
  const w = new Deflate.ByteWriter();
  w.writeU8(0x12);
  w.writeU16(0xabcd);
  w.writeI32(-123456789);
  w.writeU32(0xdeadbeef);
  w.writeI64(-9876543210123);
  w.writeU64Str('18446744073709551615');
  w.writeU16String('hello 태오');
  w.writeI32String('world 회권');
  const buf = w.toUint8Array();
  ok(buf instanceof Uint8Array, 'toUint8Array returns Uint8Array');

  const r = new Deflate.ByteReader(buf);
  eq(r.readU8(), 0x12);
  eq(r.readU16(), 0xabcd);
  eq(r.readI32(), -123456789);
  eq(r.readU32(), 0xdeadbeef);
  eq(Number(r.readI64()), -9876543210123);
  eq(String(r.readU64Str()), '18446744073709551615');
  eq(r.readU16String(), 'hello 태오');
  eq(r.readI32String(), 'world 회권');
});

test('ByteWriter / ByteReader at arbitrary offsets do not bleed', () => {
  const w = new Deflate.ByteWriter();
  for (let i = 0; i < 8; i++) w.writeU8(i * 3);
  w.writeU16(0x0102);
  w.writeI32String('xyz');
  const buf = w.toUint8Array();
  const r = new Deflate.ByteReader(buf);
  r.skip ? r.skip(0) : null;
  for (let i = 0; i < 8; i++) eq(r.readU8(), i * 3);
  eq(r.readU16(), 0x0102);
  eq(r.readI32String(), 'xyz');
});

test('deflateRaw / inflateRaw Node roundtrip', () => {
  const payload = Buffer.from('The quick brown fox jumps over the lazy dog. '.repeat(20), 'utf8');
  const packed = Deflate.deflateRaw(payload);
  ok(packed instanceof Uint8Array, 'deflateRaw → Uint8Array');
  ok(packed.length < payload.length, 'compressed smaller than input');
  const back = Deflate.inflateRaw(packed);
  ok(Buffer.from(back).equals(payload), 'inflateRaw(deflateRaw(x)) === x');
});

test('deflateRaw / inflateRaw empty + binary payloads', () => {
  const empty = Deflate.deflateRaw(new Uint8Array(0));
  eq(Buffer.from(Deflate.inflateRaw(empty)).length, 0);

  const bin = new Uint8Array(4096);
  for (let i = 0; i < bin.length; i++) bin[i] = (i * 37 + 11) & 0xff;
  const back = Deflate.inflateRaw(Deflate.deflateRaw(bin));
  ok(Buffer.from(back).equals(Buffer.from(bin)), 'binary roundtrip');
});

test('browser fallback sandbox: TaiwuDeflate.deflateRaw / inflateRaw + zlib interop', () => {
  const src = fs.readFileSync(path.join(SRC, 'taiwu-deflate.js'), 'utf8');
  const sandbox = {
    // deliberately absent: process, require, Buffer, module, exports
    console: { log() {}, warn() {}, error() {} },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'taiwu-deflate.js' });

  ok(sandbox.TaiwuDeflate, 'sandbox exposes TaiwuDeflate');
  ok(typeof sandbox.TaiwuDeflate.deflateRaw === 'function', 'sandbox deflateRaw is fn');
  ok(typeof sandbox.TaiwuDeflate.inflateRaw === 'function', 'sandbox inflateRaw is fn');

  const payload = Buffer.from('browser-fallback interop 순수 자바스크립트 압축 테스트 '.repeat(18), 'utf8');

  // (a) sandbox deflate → zlib.inflateRawSync
  const packed = Buffer.from(sandbox.TaiwuDeflate.deflateRaw(payload));
  const zlibInflated = zlib.inflateRawSync(packed);
  ok(zlibInflated.equals(payload), 'sandbox deflateRaw output inflates with zlib.inflateRawSync');

  // (b) zlib.deflateRawSync → sandbox inflate
  const zpacked = zlib.deflateRawSync(payload);
  const sandboxInflated = Buffer.from(sandbox.TaiwuDeflate.inflateRaw(zpacked));
  ok(sandboxInflated.equals(payload), 'sandbox inflateRaw accepts zlib.deflateRawSync output');

  // (c) sandbox → sandbox roundtrip
  const round = Buffer.from(sandbox.TaiwuDeflate.inflateRaw(sandbox.TaiwuDeflate.deflateRaw(payload)));
  ok(round.equals(payload), 'sandbox roundtrip');
});

// ===========================================================================
// SECTION 2 — taiwu-wire.js / taiwu-codec.js
// SECTION 2: Codec / Wire / Catalog
console.log('\n[Section 2] taiwu-wire.js + taiwu-codec.js');

test('Codec.createDemoSaveBundle returns buffers', () => {
  ok(typeof Codec.createDemoSaveBundle === 'function', 'Codec.createDemoSaveBundle is function');
  const b = Codec.createDemoSaveBundle();
  ok(b.globalSav instanceof Uint8Array, 'globalSav is Uint8Array');
  ok(b.localSav instanceof Uint8Array, 'localSav is Uint8Array');
  ok(b.globalSav.length > 0 && b.localSav.length > 0, 'both buffers non-empty');
});

test('Codec parser round-trips strict CRC & preserves workingDb', () => {
  const { globalSav, localSav } = Codec.createDemoSaveBundle();
  const single = Codec.parseArchive(globalSav, { strictCrc: true });
  const out = Codec.serializeArchive(single);
  ok(out instanceof Uint8Array && out.length > 0, 'serialized global');
  Codec.parseArchive(out, { strictCrc: true });

  const singleL = Codec.parseArchive(localSav, { strictCrc: true });
  const outL = Codec.serializeArchive(singleL);
  const reL = Codec.parseArchive(outL, { strictCrc: true });
  ok(reL.workingDbBytes instanceof Uint8Array && reL.workingDbBytes.length === singleL.workingDbBytes.length, 'workingDbBytes preserved');
});

test('Wire.validateArchiveBytes ok & rejects 1-byte corruption', () => {
  const { globalSav, localSav } = Codec.createDemoSaveBundle();
  const r = Wire.validateArchiveBytes(globalSav, localSav);
  eq(r.ok, true, 'validateArchiveBytes returns ok:true');

  const badH = Uint8Array.from(localSav);
  badH[10] ^= 0xff;
  assert.throws(() => Codec.parseArchive(badH, { strictCrc: true }));
  eq(Wire.validateArchiveBytes(globalSav, badH).ok, false, 'corrupt header fails validation');

  const badC = Uint8Array.from(localSav);
  badC[badC.length - 10] ^= 0xff;
  assert.throws(() => Codec.parseArchive(badC, { strictCrc: true }));
  eq(Wire.validateArchiveBytes(globalSav, badC).ok, false, 'corrupt content fails validation');
});

test('decode/apply model round-trip persists mutations', () => {
  const { globalSav, localSav } = Codec.createDemoSaveBundle();
  const pG = Codec.parseArchive(globalSav, { strictCrc: true });
  const pL = Codec.parseArchive(localSav, { strictCrc: true });
  const model = Codec.decodeArchiveModel(pG, pL);
  ok(model && Array.isArray(model.characters) && model.characters.length >= 3, '3 demo characters');
  ok(Array.isArray(model.combatSkills) && model.combatSkills.length > 0, 'has combatSkills');

  model.characters[0].resources[6] = 777;
  model.characters[0]._dirty = true;
  model.taiwu.legacyPoint = 42;
  model.combatSkills[0].readingState = 3;
  model.combatSkills[0]._dirty = true;
  model.world.currDate = 12345;

  Codec.applyModelToParsed(pG, pL, model);
  const g2 = Codec.serializeArchive(pG);
  const l2 = Codec.serializeArchive(pL);

  const pG2 = Codec.parseArchive(g2, { strictCrc: true });
  const pL2 = Codec.parseArchive(l2, { strictCrc: true });
  const m2 = Codec.decodeArchiveModel(pG2, pL2);
  eq(m2.characters[0].resources[6], 777, 'resources[6] persisted');
  eq(m2.taiwu.legacyPoint, 42, 'legacyPoint persisted');
  eq(m2.combatSkills[0].readingState, 3, 'readingState persisted');
  eq(m2.world.currDate, 12345, 'currDate persisted');
});

// SECTION 3: editor-core.js + catalog-data.js
console.log('\n[Section 3] editor-core.js + catalog-data.js');

test('Catalog collections are non-empty plain objects & pure Korean', () => {
  ok(Catalog && typeof Catalog === 'object', 'Catalog is object');
  for (const k of ['organizations', 'features', 'combatSkills', 'items']) {
    ok(Catalog[k] && typeof Catalog[k] === 'object' && !Array.isArray(Catalog[k]), k + ' is plain object');
    ok(Object.keys(Catalog[k]).length > 0, k + ' non-empty');
  }
  const probe = JSON.stringify(Catalog);
  ok(!/[\u4e00-\u9fff]/.test(probe), 'Catalog has zero Hanzi');
  ok(!/<[^>]+>/.test(probe), 'Catalog has zero <...> tags');
});

test('Core.createSession + loadDemo + getSummary pure Korean', () => {
  const s = Core.createSession(Catalog).loadDemo();
  const sum = s.getSummary();
  ok(sum && sum.heroName && !/[\u4e00-\u9fff]/.test(JSON.stringify(sum)), 'summary valid & pure Korean');
  const list = s.listCharacters('', false);
  ok(Array.isArray(list) && list.length >= 3, 'characters list non-empty');
  ok(s.getCharacterDetail(1) != null, 'detail for id 1 exists');
});

test('All 4 presets + computeDiff', () => {
  const presets = ['hero_max_stats', 'heal_cleanse', 'resources_abundant', 'skills_complete'];
  for (const p of presets) {
    const s = Core.createSession(Catalog).loadDemo();
    const r = s.applyPreset(p, 1);
    ok(r && r.ok !== false, 'preset ' + p + ' applied');
  }
  const s = Core.createSession(Catalog).loadDemo();
  s.applyPreset('hero_max_stats', 1);
  const d = s.computeDiff();
  ok(Array.isArray(d) && d.length > 0, 'computeDiff non-empty');
});

test('add/removeCharacterFeature & add/removeInventoryItem', () => {
  const s = Core.createSession(Catalog).loadDemo();
  const fid = Number(Object.keys(Catalog.features).slice(-1)[0]);
  s.addCharacterFeature(1, fid);
  ok(s.getCharacterDetail(1).features.some((f) => Number(f.id) === fid), 'feature added');
  s.removeCharacterFeature(1, fid);
  ok(!s.getCharacterDetail(1).features.some((f) => Number(f.id) === fid), 'feature removed');

  const beforeLen = s.getCharacterDetail(1).inventory.length;
  s.addInventoryItem(1, 5, 1, 5);
  const invAfterAdd = s.getCharacterDetail(1).inventory;
  eq(invAfterAdd.length, beforeLen + 1, 'inventory item added');
  const addedId = invAfterAdd[invAfterAdd.length - 1].id;
  s.removeInventoryItem(1, addedId);
  eq(s.getCharacterDetail(1).inventory.length, beforeLen, 'inventory item removed');
});

test('exportJsonSnapshot & exportBuffers roundtrip', () => {
  const s = Core.createSession(Catalog).loadDemo();
  s.applyPreset('resources_abundant', 1);
  const snap = s.exportJsonSnapshot();
  ok(typeof snap === 'string' && snap.length > 10, 'snapshot exported');
  const sSnap = Core.createSession(Catalog).loadDemo();
  sSnap.importJsonSnapshot(snap);
  eq(sSnap.model.taiwu.legacyPoint, s.model.taiwu.legacyPoint, 'snapshot restored legacyPoint');

  const bufs = s.exportBuffers();
  ok(bufs.globalSav instanceof Uint8Array && bufs.localSav instanceof Uint8Array, 'exportBuffers ok');
  const s2 = Core.createSession(Catalog).loadBuffers(bufs.globalSav, bufs.localSav);
  eq(s2.getCharacterDetail(1).resources[6], 999999, 'silver persisted after reload');
  eq(s2.model.taiwu.legacyPoint, 999999, 'legacyPoint persisted after reload');
  eq(s2.getSummary().heroName, s.getSummary().heroName, 'heroName persisted');
});

test('single local.sav, single global.sav, swapped order, and attach preserve edits', () => {
  const { globalSav, localSav } = Codec.createDemoSaveBundle();
  eq(Core.detectArchiveKind(globalSav), 'global', 'detectArchiveKind T1G');
  eq(Core.detectArchiveKind(localSav), 'local', 'detectArchiveKind T1L');

  // 1) local.sav only (passed as 1st arg or 2nd arg)
  const sLocalOnly = Core.createSession(Catalog).loadBuffers(localSav, null);
  eq(sLocalOnly.getSummary().hasLocal, true, 'local-only hasLocal');
  eq(sLocalOnly.getSummary().hasGlobal, false, 'local-only hasGlobal false');
  sLocalOnly.addCharacterFeature(1, 606);
  const outLocal = sLocalOnly.exportBuffers();
  eq(outLocal.globalSav, null, 'local-only export has null globalSav');
  ok(outLocal.localSav instanceof Uint8Array && outLocal.localSav.length > 0, 'local-only export localSav valid');
  const reloadLocal = Core.createSession(Catalog).loadBuffers(null, outLocal.localSav);
  ok(reloadLocal.getCharacterDetail(1).featureIds.includes(606), 'added feature #606 persisted in local-only roundtrip');

  // 2) global.sav only
  const sGlobalOnly = Core.createSession(Catalog).loadBuffers(globalSav, null);
  eq(sGlobalOnly.getSummary().hasLocal, false, 'global-only hasLocal false');
  eq(sGlobalOnly.getSummary().hasGlobal, true, 'global-only hasGlobal true');
  sGlobalOnly.updateGlobal({ ownedChickens: [1, 2, 7] });
  const outGlobal = sGlobalOnly.exportBuffers();
  eq(outGlobal.localSav, null, 'global-only export has null localSav');
  ok(outGlobal.globalSav instanceof Uint8Array && outGlobal.globalSav.length > 0, 'global-only export globalSav valid');
  const reloadGlobal = Core.createSession(Catalog).loadBuffers(outGlobal.globalSav, null);
  deepEq(reloadGlobal.model.global.ownedChickens, [1, 2, 7], 'global-only mutation persisted');

  // 3) swapped order (localSav, globalSav)
  const sSwapped = Core.createSession(Catalog).loadBuffers(localSav, globalSav);
  eq(sSwapped.getSummary().hasLocal, true, 'swapped hasLocal');
  eq(sSwapped.getSummary().hasGlobal, true, 'swapped hasGlobal');
  ok(sSwapped.listCharacters('', false).length >= 3, 'swapped decoded characters');

  // 4) attachGlobalBuffer preserves pending local edits
  const sAttach = Core.createSession(Catalog).loadBuffers(null, localSav);
  sAttach.addCharacterFeature(1, 929);
  sAttach.attachGlobalBuffer(globalSav);
  eq(sAttach.getSummary().hasGlobal, true, 'attached global');
  ok(sAttach.getCharacterDetail(1).featureIds.includes(929), 'local edit preserved after attachGlobalBuffer');

  // 5) attachLocalBuffer preserves pending global edits
  const sAttach2 = Core.createSession(Catalog).loadBuffers(globalSav, null);
  sAttach2.updateGlobal({ ownedChickens: [9] });
  sAttach2.attachLocalBuffer(localSav);
  eq(sAttach2.getSummary().hasLocal, true, 'attached local');
  deepEq(sAttach2.model.global.ownedChickens, [9], 'global edit preserved after attachLocalBuffer');
});

test('Catalog includes all 955 features (#0..#954) with pure Korean metadata', () => {
  eq(Object.keys(Catalog.features).length, 955, '955 features in catalog');
  ok(Catalog.featureMeta && Object.keys(Catalog.featureMeta).length === 955, '955 featureMeta entries');
  eq(Catalog.features['0'], '공무유력', '#0 feature');
  eq(Catalog.features['606'], '의사', '#606 org feature');
  eq(Catalog.features['954'], '만귀유조', '#954 evil immortal feature');
});

console.log('\n────────────────────────────────────────');
console.log('passed: ' + passed + ', failed: ' + failures.length);
if (failures.length) {
  for (const f of failures) console.error(f.name, f.err);
  process.exit(1);
}
process.exit(0);
