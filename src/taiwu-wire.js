(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./taiwu-deflate.js'));
  } else {
    root.TaiwuWire = factory(root.TaiwuDeflate);
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function (TaiwuDeflate) {
  'use strict';

  var DOMAIN_WIRE_SPEC = {"0":[[3,"d_c_c",8],[4,"u",8],[5,"u_arr",2],[7,"d_c_u",8,4],[8,"d_u_u",2,8],[9,"d_u_c",2],[10,"c"],[11,"u",8]],"1":[[0,"u",4],[2,"c_arr"],[3,"u_arr",1],[4,"u",2],[5,"u",1],[6,"u",8],[7,"d_u_str",4],[8,"u",4],[9,"bin",8],[12,"u",1],[13,"u",1],[14,"u",1],[15,"u",1],[16,"u",1],[17,"u",1],[18,"u",1],[19,"u",1],[20,"u",1],[21,"u",1],[25,"u",4],[26,"u",4],[34,"d_u_u",2,4],[35,"u",1],[36,"u",1],[37,"u",1],[38,"u",1],[39,"u",1],[40,"u",1],[41,"u",1],[42,"u",2],[43,"d_u_c",2],[44,"d_u_u",1,1],[45,"c_arr"],[46,"u_arr",4],[47,"u_arr",4],[48,"c"],[49,"u_arr",4],[50,"u_arr",8],[51,"c"],[52,"u",1],[53,"c_arr"],[54,"d_u_c",2],[55,"d_u_u",2,1],[57,"d_u_u",2,1],[58,"u_arr",4],[59,"u",4]],"2":[[0,"c_arr"],[1,"d_u_c",2],[2,"d_u_c",2],[3,"d_u_c",2],[4,"d_u_c",2],[5,"d_u_c",2],[6,"d_u_c",2],[7,"d_u_c",2],[8,"d_u_c",2],[9,"d_u_c",2],[10,"d_u_c",2],[11,"d_u_c",2],[12,"d_u_c",2],[13,"d_u_c",2],[14,"d_u_c",2],[15,"d_u_c",2],[16,"d_u_c",2],[17,"d_u_c",2],[18,"d_u_c",2],[19,"d_u_c",2],[20,"d_u_c",2],[21,"d_u_c",2],[22,"d_u_c",2],[23,"d_u_c",2],[24,"d_u_c",2],[25,"d_u_c",2],[26,"d_u_c",2],[27,"d_u_c",2],[28,"d_u_c",2],[29,"d_u_c",2],[30,"d_u_c",2],[31,"d_u_c",2],[32,"d_u_c",2],[33,"d_u_c",2],[34,"d_u_c",2],[35,"d_u_c",2],[36,"d_u_c",2],[37,"d_u_c",2],[38,"d_u_c",2],[39,"d_u_c",2],[40,"d_u_c",2],[41,"d_u_c",2],[42,"d_u_c",2],[43,"d_u_c",2],[44,"d_u_c",2],[45,"d_u_c",2],[46,"d_u_c",2],[47,"d_u_c",2],[48,"d_u_c",2],[49,"d_u_c",2],[50,"d_u_c",2],[51,"d_c_c",4],[52,"d_c_c",4],[53,"c_arr"],[54,"d_u_c",2],[55,"c_arr"],[56,"c"],[58,"c_arr"],[67,"c_arr"],[68,"c_arr"],[69,"c_arr"],[70,"d_u_c",2],[72,"d_u_c",2],[73,"d_c_c",4],[75,"d_c_u",4,4]],"3":[[0,"obj_u",2],[1,"obj_u",2],[2,"u",2],[3,"obj_u",4],[4,"obj_u",4],[5,"d_u_c",4],[6,"u_arr",1],[8,"u_arr",2],[9,"c_arr"],[10,"u_arr",2],[11,"d_u_c",2],[12,"d_u_c",2],[13,"d_u_c",2],[14,"d_u_c",2],[15,"d_u_c",2],[16,"u",2],[17,"u",4],[18,"u",4]],"4":[[0,"obj_u",4],[1,"u",4],[2,"d_u_c",4],[3,"d_u_c",4],[4,"d_c_c",8],[5,"d_c_c",8],[6,"obj_u",4],[7,"d_u_c",4],[8,"d_u_u",4,4],[9,"c"],[10,"d_u_c",4],[11,"d_c_c",8],[12,"d_c_u",8,4],[13,"d_u_c",4],[14,"d_u_u",4,4],[15,"d_u_c",4],[16,"d_u_c",4],[17,"u_str"],[19,"d_u_c",4],[20,"d_u_c",4],[21,"u_arr",4],[22,"u_arr",4],[25,"u",4],[27,"u",4],[28,"d_u_c",4],[30,"d_u_c",4],[31,"d_u_c",4],[32,"d_u_c",4],[33,"d_u_c",4],[34,"d_c_c",8],[35,"d_u_u",2,4],[36,"d_c_u",8,4],[37,"d_u_c",4],[38,"d_u_c",4],[39,"u",4],[40,"d_c_u",8,4],[41,"d_c_u",8,4],[42,"d_c_u",8,2],[43,"d_u_c",4],[44,"c"],[45,"d_u_c",4],[48,"c"],[49,"d_u_c",4],[50,"d_u_c",4],[51,"c"],[53,"d_u_c",4],[54,"d_u_c",4],[55,"d_u_u",4,4]],"5":[[0,"u",4],[1,"u",4],[2,"u",4],[3,"u_arr",4],[4,"u",1],[11,"u",4],[12,"u",1],[13,"d_u_c",2],[14,"d_u_c",2],[15,"c_arr"],[16,"u",4],[17,"u_arr",1],[18,"d_u_c",4],[19,"d_u_c",4],[20,"u_arr",2],[21,"u_arr",1],[25,"d_u_c",4],[26,"u",2],[27,"u",2],[28,"u",2],[29,"c_arr"],[30,"u",4],[31,"c"],[32,"u_arr",4],[35,"u",4],[36,"u_arr",2],[39,"c_arr"],[40,"d_u_c",2],[41,"d_u_c",2],[42,"d_c_c",8],[43,"c"],[44,"c_arr"],[47,"u",1],[51,"u_arr",2],[52,"u",2],[53,"d_u_c",4],[72,"u",4],[73,"u",4],[74,"u",1],[75,"d_u_c",2],[76,"d_u_u",4,2],[77,"c"],[78,"d_u_c",2],[79,"u_arr",2],[80,"d_u_u",2,2],[81,"d_u_u",4,4],[82,"c"],[83,"d_u_c",4],[84,"d_u_c",2],[85,"u_arr",1],[86,"u",1],[87,"u",1],[88,"c"],[89,"c"],[90,"c"],[91,"c"],[92,"bin",8],[93,"d_u_u",2,1],[94,"d_c_u",8,4],[95,"d_c_u",8,4],[96,"d_c_c",8],[97,"d_u_c",4],[98,"u",1],[99,"c"],[100,"c_arr"],[102,"u_arr",1],[103,"c_arr"],[104,"c"],[105,"d_u_c",2],[106,"c"],[107,"u_arr",4],[108,"d_u_c",4],[109,"u_arr",4],[110,"d_u_u",4,1],[111,"d_u_u",2,1],[112,"c"],[113,"u_arr",2],[114,"d_u_c",2],[115,"d_u_c",2],[116,"d_u_c",2],[117,"u",2],[118,"u",1],[119,"u",2],[120,"d_u_u",2,4]],"6":[[0,"obj_u",4],[1,"obj_u",4],[2,"obj_u",4],[3,"obj_u",4],[4,"obj_u",4],[5,"obj_u",4],[6,"obj_u",4],[7,"obj_u",4],[8,"obj_u",4],[9,"obj_u",4],[10,"obj_u",4],[11,"obj_u",4],[12,"obj_u",4],[13,"u",4],[14,"d_c_u",3,4],[16,"d_u_c",4],[17,"c"],[18,"c"],[19,"c"],[21,"d_u_c",4],[22,"d_u_u",4,4]],"7":[[0,"obj_c",8]],"8":[[33,"u",2],[34,"u",1],[35,"u",1],[36,"u",1],[37,"u",1],[38,"u",1],[39,"u",4],[40,"c_arr"]],"9":[[0,"d_c_c",4],[1,"d_c_c",8],[2,"c_arr"],[3,"d_c_u",8,1],[5,"d_c_u",8,4],[6,"c_arr"],[7,"d_u_c",4],[9,"d_c_c",8],[10,"d_c_c",8],[11,"c"],[12,"c"],[13,"c"],[14,"c"],[15,"c_arr"],[16,"d_u_c",4],[17,"d_c_c",8],[19,"c"],[20,"u",2],[21,"d_c_c",4],[22,"d_c_u",8,1],[23,"d_c_c",8],[24,"d_c_c",8],[26,"u",4],[27,"bin",8],[28,"u_arr",2],[29,"d_c_c",8],[30,"d_u_c",1],[31,"u_arr",4]],"10":[[0,"u_arr",2],[1,"d_u_c",4],[2,"c"],[4,"d_u_c",4],[5,"c"],[6,"c"]],"11":[[0,"u_arr",4],[2,"d_u_u",4,4],[3,"d_u_c",1],[4,"c"],[5,"d_u_c",1],[6,"c"],[7,"u",1],[8,"d_u_c",1],[9,"d_u_c",1],[10,"u",1],[11,"u",1],[12,"d_u_c",1]],"12":[[0,"c"],[7,"u",1],[8,"u",1],[9,"u",1],[19,"c_arr"],[21,"u_arr",4],[22,"u_arr",4],[23,"u_arr",4],[26,"d_u_c",4],[27,"u",1],[28,"u",1]],"13":[],"14":[[0,"d_u_c",4],[1,"u_arr",4],[2,"u_arr",4],[3,"c_arr"],[4,"u",4],[5,"d_u_c",4],[6,"d_u_c",4],[7,"d_u_c",4]],"15":[],"16":[[0,"d_c_c",20]],"17":[[0,"d_u_c",8],[1,"u",8]],"18":[[0,"d_u_c",4],[1,"bin",8],[5,"d_u_c",4],[6,"d_c_c",4],[7,"d_c_c",4],[8,"u_arr",4]],"19":[[0,"u_arr",4],[1,"d_u_u",4,2],[2,"d_u_u",4,1],[3,"u",4],[4,"u_arr",4],[5,"d_u_c",4],[6,"u_arr",2],[7,"u_arr",2],[8,"c_arr"],[9,"u_arr",1],[10,"u_arr",4],[11,"d_u_c",2],[12,"bin",8],[13,"c"],[14,"u_arr",2],[15,"c_arr"],[16,"d_u_c",1],[17,"d_u_c",1],[18,"d_u_c",2],[19,"d_u_c",1],[20,"c_arr"],[21,"d_u_c",4],[22,"d_u_u",4,4],[23,"d_u_u",1,1],[24,"d_u_c",1],[25,"d_u_u",1,8],[26,"d_u_c",1],[27,"d_u_c",1],[28,"c"],[29,"c"],[34,"d_u_c",4],[36,"d_u_c",4],[37,"d_u_u",4,1],[38,"d_u_u",4,1],[39,"d_c_u",8,4],[40,"d_u_u",4,4],[41,"c_arr"],[43,"c_arr"],[44,"c_arr"],[45,"c_arr"],[46,"u",4],[47,"c"],[48,"d_u_c",4],[49,"c_arr"],[51,"u_arr",2],[52,"u_arr",2],[53,"u_arr",2],[54,"u",1],[55,"d_u_c",4],[56,"u_arr",4],[57,"bin",8],[58,"u",4],[59,"d_u_c",4],[60,"u",1],[61,"c_arr"],[62,"c_arr"],[63,"c_arr"],[64,"u_arr",4],[65,"u_arr",1],[66,"u_arr",2],[67,"u",1],[68,"u",2],[69,"u",1],[70,"d_u_u",4,4],[71,"c_arr"],[72,"d_u_u",4,1],[73,"u_arr",2],[74,"d_u_u",2,2],[75,"u",8],[76,"bin",4],[77,"c"],[78,"c_arr"],[79,"d_u_c",2],[80,"d_u_c",4],[81,"u",4],[82,"c"],[83,"d_u_c",8],[84,"c"],[85,"c"],[86,"c_arr"],[87,"c"],[88,"d_u_c",4],[89,"d_u_u",4,4],[90,"u_arr",4],[91,"d_u_c",8],[92,"c_arr"],[93,"d_u_c",4],[94,"d_u_c",4],[95,"d_u_c",2],[96,"c_arr"],[97,"d_u_c",8],[99,"d_u_u",2,4],[100,"d_u_u",2,4],[101,"d_u_u",8,4],[102,"c"],[103,"c"],[104,"c_arr"],[105,"d_u_c",8],[106,"d_u_c",4],[107,"d_u_u",4,2],[108,"c_arr"],[109,"d_u_c",4],[110,"u",4],[111,"d_u_c",4],[112,"d_c_c",8],[113,"u",1],[114,"u",2],[115,"u",2],[116,"c_arr"],[117,"c"],[118,"bin",8],[119,"d_u_c",4],[120,"u_arr",2],[121,"d_u_c",2],[122,"u_arr",2],[123,"d_u_c",2],[124,"d_u_c",2],[125,"u",1],[126,"u",1],[127,"d_u_c",4],[128,"u_arr",4],[129,"d_u_u",4,4],[130,"c_arr"],[131,"u_arr",4],[132,"d_u_c",2],[133,"c_arr"],[134,"d_u_c",4],[135,"d_u_c",4],[136,"u_arr",4],[137,"d_u_c",4],[138,"d_c_u",3,4],[139,"d_u_u",2,4],[140,"d_u_u",2,4],[141,"d_u_c",4],[142,"d_c_u",4,4],[143,"d_u_u",4,4],[144,"d_u_c",2],[145,"d_u_u",2,4],[146,"d_u_c",4],[147,"c"],[148,"d_u_c",2],[149,"c_arr"],[150,"d_u_c",4],[151,"d_u_c",4],[152,"u_arr",4],[153,"d_u_c",4],[154,"d_c_c",8],[155,"d_u_c",4],[156,"c_arr"],[157,"d_u_c",4],[158,"u",4],[159,"d_u_u",2,1],[160,"d_u_c",4],[161,"c"],[162,"u",1],[163,"u",1],[164,"c"],[165,"d_u_u",4,1],[166,"d_u_c",4],[167,"d_c_c",8],[168,"d_c_u",8,4],[171,"c"],[172,"u",4],[173,"d_c_c",4],[174,"u",4],[175,"c"],[176,"d_u_u",2,8],[177,"c_arr"],[178,"d_u_c",8],[179,"d_u_u",4,1],[180,"d_u_c",4],[181,"d_u_c",4],[182,"u",1],[183,"u",1],[184,"u_arr",2],[185,"d_c_c",4],[186,"bin",4],[187,"d_u_u",4,2],[188,"d_u_c",2],[189,"c_arr"],[190,"c"],[191,"d_u_c",8],[192,"u_arr",2],[193,"d_u_c",8],[194,"d_u_c",2],[195,"c"],[196,"d_u_u",1,1],[197,"c"],[198,"c"],[199,"u",4],[200,"d_u_u",4,4],[201,"u_arr",1],[202,"u_arr",2],[203,"u_arr",2],[204,"d_u_u",2,1],[205,"c"],[206,"u_arr",2],[207,"u",1]],"20":[[0,"u_arr",1],[1,"c"],[2,"d_u_c",2],[3,"d_u_c",2],[4,"d_u_c",2],[6,"u_arr",4],[7,"u",4],[8,"u_arr",1],[9,"c"],[11,"c"],[12,"c_arr"],[13,"d_u_c",4],[15,"u",1]]};

  if (!TaiwuDeflate) {
    throw new Error('압축도구를 불러오지 못했습니다');
  }

  var calculateCRC32 = TaiwuDeflate.calculateCRC32;
  var ByteReader = TaiwuDeflate.ByteReader;
  var ByteWriter = TaiwuDeflate.ByteWriter;
  var inflateRaw = TaiwuDeflate.inflateRaw;
  var deflateRaw = TaiwuDeflate.deflateRaw;

  if (!calculateCRC32 || !ByteReader || !ByteWriter || !inflateRaw || !deflateRaw) {
    throw new Error('압축도구 구성이 올바르지 않습니다');
  }

  function ensureObject(value) {
    if (value && typeof value === 'object') {
      return value;
    }
    return {};
  }

  function specToObject(spec) {
    if (!spec) {
      return null;
    }
    return {
      dataId: spec[0],
      tag: spec[1],
      a1: spec.length > 2 ? spec[2] : 0,
      a2: spec.length > 3 ? spec[3] : 0
    };
  }

  function buildSpecMaps() {
    var byDomain = {};
    var flat = {};
    var raw = ensureObject(DOMAIN_WIRE_SPEC);
    var domainKeys = Object.keys(raw);
    for (var i = 0; i < domainKeys.length; i++) {
      var domainKey = domainKeys[i];
      var domainSpecs = raw[domainKey] || [];
      var domainMap = {};
      for (var j = 0; j < domainSpecs.length; j++) {
        var spec = domainSpecs[j];
        if (spec && spec.length >= 2) {
          var objectSpec = specToObject(spec);
          domainMap[String(objectSpec.dataId)] = objectSpec;
          flat[String(domainKey) + ':' + String(objectSpec.dataId)] = objectSpec;
        }
      }
      byDomain[String(domainKey)] = domainMap;
    }
    return {
      byDomain: byDomain,
      flat: flat
    };
  }

  var SPEC_MAP = buildSpecMaps();

  function newDataView(uint8, offset, length) {
    if (typeof DataView === 'undefined') {
      throw new Error('자료형식기를 사용할 수 없습니다');
    }
    return new DataView(uint8.buffer, uint8.byteOffset + (offset || 0), length);
  }

  function readLittleU16At(bytes, offset) {
    return newDataView(bytes, offset, 2).getUint16(0, true);
  }

  function readMetaU16(bytes, offset) {
    return readLittleU16At(bytes, offset);
  }

  function metaDataId(metaBytes) {
    if (!metaBytes || metaBytes.length < 4) {
      return null;
    }
    return metaBytes.length >= 8 ? readLittleU16At(metaBytes, 6) : readLittleU16At(metaBytes, 2);
  }

  function domainIdFromMeta(metaBytes) {
    if (!metaBytes || metaBytes.length < 4) {
      return null;
    }
    return metaBytes.length >= 8 ? readLittleU16At(metaBytes, 6) : readLittleU16At(metaBytes, 2);
  }

  function bytesEqual(a, b) {
    if (!a || !b || a.length !== b.length) {
      return false;
    }
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }

  function copyUint8(value) {
    if (value instanceof Uint8Array) {
      return new Uint8Array(value);
    }
    if (typeof value === 'string') {
      return stringToU16Bytes(value);
    }
    if (value && value.length !== undefined) {
      return new Uint8Array(value);
    }
    return new Uint8Array(0);
  }

  function ensureUint8(value) {
    if (!value) {
      return new Uint8Array(0);
    }
    if (value instanceof Uint8Array) {
      return value;
    }
    if (value && value.length !== undefined) {
      return new Uint8Array(value);
    }
    return new Uint8Array(0);
  }

  function stringToU16Bytes(text) {
    var source = String(text == null ? '' : text);
    var out = new Uint8Array(source.length * 2);
    var view = new DataView(out.buffer);
    for (var i = 0; i < source.length; i++) {
      view.setUint16(i * 2, source.charCodeAt(i) & 0xffff, true);
    }
    return out;
  }

  function getSpec(domainId, dataId) {
    var domainMap = SPEC_MAP.byDomain[String(domainId)];
    if (!domainMap) {
      return null;
    }
    return domainMap[String(dataId)] || null;
  }

  function skipWire(reader, spec) {
    if (!spec) {
      return;
    }
    var tag = spec.tag;
    var a1 = spec.a1 || 0;
    var a2 = spec.a2 || 0;
    var i;
    var n;
    var sz;
    var l;

    if (tag === 'u') {
      reader.skip(a1);
      return;
    }

    if (tag === 'u_str') {
      n = reader.readI32();
      if (n > 0) {
        reader.skip(n * 2);
      }
      return;
    }

    if (tag === 'u_arr') {
      n = reader.readI32();
      if (n > 0) {
        reader.skip(n * a1);
      }
      return;
    }

    if (tag === 'c') {
      sz = reader.readI32();
      if (sz > 0) {
        reader.skip(sz);
      }
      return;
    }

    if (tag === 'c_arr') {
      n = reader.readI32();
      for (i = 0; i < n; i++) {
        sz = reader.readI32();
        if (sz > 0) {
          reader.skip(sz);
        }
      }
      return;
    }

    if (tag === 'd_u_str') {
      n = reader.readI32();
      for (i = 0; i < n; i++) {
        reader.skip(a1);
        l = reader.readI32();
        if (l > 0) {
          reader.skip(l * 2);
        }
      }
      return;
    }

    if (tag === 'd_u_u') {
      n = reader.readI32();
      if (n > 0) {
        reader.skip(n * (a1 + a2));
      }
      return;
    }

    if (tag === 'd_u_c') {
      n = reader.readI32();
      for (i = 0; i < n; i++) {
        reader.skip(a1);
        sz = reader.readI32();
        if (sz > 0) {
          reader.skip(sz);
        }
      }
      return;
    }

    if (tag === 'd_c_u') {
      n = reader.readI32();
      if (n > 0) {
        reader.skip(n * (a1 + a2));
      }
      return;
    }

    if (tag === 'd_c_c') {
      n = reader.readI32();
      for (i = 0; i < n; i++) {
        reader.skip(a1);
        sz = reader.readI32();
        if (sz > 0) {
          reader.skip(sz);
        }
      }
      return;
    }

    if (tag === 'obj_u' || tag === 'obj_c') {
      var fc = reader.readI32();
      if (fc > 0) {
        reader.skip(fc * 2);
      }
      var sc = reader.readI32();
      if (sc > 0) {
        reader.skip(sc * 4);
      }
      var cnt = reader.readI32();
      for (i = 0; i < cnt; i++) {
        reader.skip(a1);
        var osz = reader.readI32();
        if (osz > 0) {
          reader.skip(osz);
        }
      }
      return;
    }

    if (tag === 'bin') {
      if (a1 === 4 || a1 === 8) {
        reader.skip(a1 - 4);
        var rawSz = reader.readI32();
        if (rawSz > 0) {
          reader.skip(rawSz);
        }
      }
      return;
    }

    throw new Error('알 수 없는 전선 표식입니다');
  }

  function readWorldInfoBytes(rawBytes) {
    var bytes = ensureUint8(rawBytes);
    var r = new ByteReader(bytes);
    var parsed = {
      rawBytes: new Uint8Array(bytes),
      _dirty: false,
      fieldCount: 0,
      currDate: 0,
      taiwuGenerationsCount: 0,
      savingTimestamp: '0',
      taiwuSurname: '',
      taiwuGivenName: '',
      gender: 0,
      avatarRelatedData: new Uint8Array(0),
      mapStateName: '',
      mapAreaName: '',
      charOpts: new Uint8Array(10),
      stateTaskStatuses: new Uint8Array(0),
      xiangshuAvatarTaskStatuses: [],
      mainStoryLineProgress: 0,
      beatRanChenZi: 0,
      modIds: [],
      worldPopulationType: 0,
      enemyPracticeLevel: 0,
      gameVersionInfo: new Uint8Array(0),
      favorabilityChange: 0,
      dlcIds: [],
      professionUpgrade: 0,
      lootYield: 0,
      totalTaiwuLifeSummaryInfo: new Uint8Array(0),
      worldFunctionStatuses: '0',
      mapStateTemplateId: 0,
      mapAreaTemplateId: 0,
      totalTaiwuLifeSummaryInfoEx: new Uint8Array(0),
      dreamBackCount: 0,
      trailingBytes: new Uint8Array(0)
    };

    try {
      parsed.fieldCount = r.readU16();
      parsed.currDate = r.readI32();
      parsed.taiwuGenerationsCount = r.readI32();
      parsed.savingTimestamp = r.readI64();
      parsed.taiwuSurname = r.readU16String();
      parsed.taiwuGivenName = r.readU16String();
      parsed.gender = r.readI8();

      var avatarLen = r.readU16();
      parsed.avatarRelatedData = avatarLen > 0 ? new Uint8Array(r.readBytes(avatarLen)) : new Uint8Array(0);

      parsed.mapStateName = r.readU16String();
      parsed.mapAreaName = r.readU16String();

      parsed.charOpts = new Uint8Array(10);
      for (var ci = 0; ci < 10; ci++) {
        parsed.charOpts[ci] = r.readU8();
      }

      var stateTaskCount = r.readU16();
      parsed.stateTaskStatuses = stateTaskCount > 0 ? new Uint8Array(r.readBytes(stateTaskCount)) : new Uint8Array(0);

      var xiangshuCount = r.readU16();
      parsed.xiangshuAvatarTaskStatuses = [];
      for (var xi = 0; xi < xiangshuCount; xi++) {
        parsed.xiangshuAvatarTaskStatuses.push(new Uint8Array(r.readBytes(8)));
      }

      parsed.mainStoryLineProgress = r.readI16();
      parsed.beatRanChenZi = r.readU8();

      var modCount = r.readU16();
      parsed.modIds = [];
      for (var mi = 0; mi < modCount; mi++) {
        parsed.modIds.push(new Uint8Array(r.readBytes(20)));
      }

      parsed.worldPopulationType = r.readU8();
      parsed.enemyPracticeLevel = r.readU8();

      var versionLen = r.readU16();
      parsed.gameVersionInfo = versionLen > 0 ? new Uint8Array(r.readBytes(versionLen)) : new Uint8Array(0);

      parsed.favorabilityChange = r.readU8();

      var dlcCount = r.readU16();
      parsed.dlcIds = [];
      for (var di = 0; di < dlcCount; di++) {
        parsed.dlcIds.push(new Uint8Array(r.readBytes(16)));
      }

      parsed.professionUpgrade = r.readU8();
      parsed.lootYield = r.readI16();

      var summaryLen = r.readU16();
      parsed.totalTaiwuLifeSummaryInfo = summaryLen > 0 ? new Uint8Array(r.readBytes(summaryLen)) : new Uint8Array(0);

      parsed.worldFunctionStatuses = r.readU64Str();
      parsed.mapStateTemplateId = r.readI8();
      parsed.mapAreaTemplateId = r.readI16();

      var summaryExLen = r.readI32();
      parsed.totalTaiwuLifeSummaryInfoEx = summaryExLen > 0 ? new Uint8Array(r.readBytes(summaryExLen)) : new Uint8Array(0);

      parsed.dreamBackCount = r.readI32();
      parsed.trailingBytes = new Uint8Array(r.readBytes(r.remaining()));
    } catch (err) {
      parsed.trailingBytes = new Uint8Array(bytes);
      parsed._parseError = true;
    }

    parsed._dirty = false;
    return parsed;
  }

  function parseWorldInfo(rawBytes) {
    return readWorldInfoBytes(rawBytes);
  }

  function worldInfoNeedsCleanWrite(worldInfo) {
    return !!(worldInfo && (worldInfo._dirty || !worldInfo.rawBytes));
  }

  function writeWorldInfo(worldInfo) {
    var info = ensureObject(worldInfo);
    var w = new ByteWriter();

    w.writeU16(info.fieldCount || 0);
    w.writeI32(info.currDate || 0);
    w.writeI32(info.taiwuGenerationsCount || 0);
    w.writeI64(info.savingTimestamp == null ? '0' : info.savingTimestamp);
    w.writeU16String(info.taiwuSurname || '');
    w.writeU16String(info.taiwuGivenName || '');
    w.writeI8(info.gender || 0);

    var avatar = ensureUint8(info.avatarRelatedData);
    w.writeU16(avatar.length);
    if (avatar.length > 0) {
      w.writeBytes(avatar);
    }

    w.writeU16String(info.mapStateName || '');
    w.writeU16String(info.mapAreaName || '');

    var charOpts = ensureUint8(info.charOpts);
    for (var ci = 0; ci < 10; ci++) {
      w.writeU8(ci < charOpts.length ? charOpts[ci] : 0);
    }

    var stateTask = ensureUint8(info.stateTaskStatuses);
    w.writeU16(stateTask.length);
    if (stateTask.length > 0) {
      w.writeBytes(stateTask);
    }

    var xiangshu = info.xiangshuAvatarTaskStatuses || [];
    w.writeU16(xiangshu.length);
    for (var xi = 0; xi < xiangshu.length; xi++) {
      var xiangshuBytes = ensureUint8(xiangshu[xi]);
      if (xiangshuBytes.length >= 8) {
        w.writeBytes(xiangshuBytes.subarray(0, 8));
      } else {
        w.writeBytes(xiangshuBytes);
        w.writeZeros(8 - xiangshuBytes.length);
      }
    }

    w.writeI16(info.mainStoryLineProgress || 0);
    w.writeU8(info.beatRanChenZi || 0);

    var modIds = info.modIds || [];
    w.writeU16(modIds.length);
    for (var mi = 0; mi < modIds.length; mi++) {
      var modBytes = ensureUint8(modIds[mi]);
      if (modBytes.length >= 20) {
        w.writeBytes(modBytes.subarray(0, 20));
      } else {
        w.writeBytes(modBytes);
        w.writeZeros(20 - modBytes.length);
      }
    }

    w.writeU8(info.worldPopulationType || 0);
    w.writeU8(info.enemyPracticeLevel || 0);

    var versionInfo = ensureUint8(info.gameVersionInfo);
    w.writeU16(versionInfo.length);
    if (versionInfo.length > 0) {
      w.writeBytes(versionInfo);
    }

    w.writeU8(info.favorabilityChange || 0);

    var dlcIds = info.dlcIds || [];
    w.writeU16(dlcIds.length);
    for (var di = 0; di < dlcIds.length; di++) {
      var dlcBytes = ensureUint8(dlcIds[di]);
      if (dlcBytes.length >= 16) {
        w.writeBytes(dlcBytes.subarray(0, 16));
      } else {
        w.writeBytes(dlcBytes);
        w.writeZeros(16 - dlcBytes.length);
      }
    }

    w.writeU8(info.professionUpgrade || 0);
    w.writeI16(info.lootYield || 0);

    var summary = ensureUint8(info.totalTaiwuLifeSummaryInfo);
    w.writeU16(summary.length);
    if (summary.length > 0) {
      w.writeBytes(summary);
    }

    w.writeU64Str(info.worldFunctionStatuses == null ? '0' : info.worldFunctionStatuses);
    w.writeI8(info.mapStateTemplateId || 0);
    w.writeI16(info.mapAreaTemplateId || 0);

    var summaryEx = ensureUint8(info.totalTaiwuLifeSummaryInfoEx);
    w.writeI32(summaryEx.length);
    if (summaryEx.length > 0) {
      w.writeBytes(summaryEx);
    }

    w.writeI32(info.dreamBackCount || 0);

    var trailing = ensureUint8(info.trailingBytes);
    if (trailing.length > 0) {
      w.writeBytes(trailing);
    }

    return w.toUint8Array();
  }

  function readObjectCollectionFromReader(reader, count, keyLen) {
    var fieldIds = [];
    var fixedSizes = [];
    var items = [];
    var i;
    var j;

    var fieldCount = reader.readI32();
    for (i = 0; i < fieldCount; i++) {
      fieldIds.push(reader.readU16());
    }

    var sizeCount = reader.readI32();
    for (i = 0; i < sizeCount; i++) {
      fixedSizes.push(reader.readI32());
    }

    var fixedSum = 0;
    var fixedOffsets = {};
    for (i = 0; i < fixedSizes.length; i++) {
      if (i < fieldIds.length) {
        fixedOffsets[fieldIds[i]] = fixedSum;
      }
      fixedSum += fixedSizes[i];
    }

    var itemCount = reader.readI32();
    for (j = 0; j < itemCount; j++) {
      var keyBytes = new Uint8Array(reader.readBytes(keyLen));
      var objSize = reader.readI32();
      var objBytes = null;
      if (objSize > 0) {
        objBytes = new Uint8Array(reader.readBytes(objSize));
      } else if (objSize === 0) {
        objBytes = new Uint8Array(0);
      }
      items.push({
        keyBytes: keyBytes,
        objBytes: objBytes
      });
    }

    return {
      fieldIds: fieldIds,
      fixedSizes: fixedSizes,
      fixedSum: fixedSum,
      fixedOffsets: fixedOffsets,
      items: items
    };
  }

  function readObjCollection(rawBytes, keyLen) {
    var r = new ByteReader(ensureUint8(rawBytes));
    return readObjectCollectionFromReader(r, 0, keyLen || 0);
  }

  function writeObjCollection(parsedCol, keyLen, items) {
    var col = ensureObject(parsedCol);
    var fieldIds = col.fieldIds || [];
    var fixedSizes = col.fixedSizes || [];
    var writeItems = items || col.items || [];
    var w = new ByteWriter();
    var i;

    w.writeI32(fieldIds.length);
    for (i = 0; i < fieldIds.length; i++) {
      w.writeU16(fieldIds[i]);
    }

    w.writeI32(fixedSizes.length);
    for (i = 0; i < fixedSizes.length; i++) {
      w.writeI32(fixedSizes[i]);
    }

    w.writeI32(writeItems.length);
    for (i = 0; i < writeItems.length; i++) {
      var item = writeItems[i] || {};
      var keyBytes = ensureUint8(item.keyBytes);
      var objBytes = item.objBytes;

      if (keyBytes.length >= keyLen) {
        w.writeBytes(keyBytes.subarray(0, keyLen));
      } else {
        w.writeBytes(keyBytes);
        w.writeZeros(keyLen - keyBytes.length);
      }

      if (objBytes == null) {
        w.writeI32(0);
      } else {
        var data = ensureUint8(objBytes);
        w.writeI32(data.length);
        if (data.length > 0) {
          w.writeBytes(data);
        }
      }
    }

    return w.toUint8Array();
  }

  function parseArchive(u8, opts) {
    opts = opts || {};
    var bytes = ensureUint8(u8);
    if (bytes.length < 16) {
      throw new Error('보관 파일이 너무 짧습니다');
    }

    var r = new ByteReader(bytes);
    var magicBytes = r.readBytes(3);
    var magic = String.fromCharCode(magicBytes[0], magicBytes[1], magicBytes[2]);
    if (magic !== 'T1G' && magic !== 'T1L') {
      throw new Error('보관 표식이 올바르지 않습니다');
    }

    var version = r.readU8();
    if (version !== 4) {
      throw new Error('보관 판본이 올바르지 않습니다');
    }

    var metaLen = r.readI32();
    if (metaLen < 0) {
      throw new Error('상위 정보 길이가 올바르지 않습니다');
    }
    var metaBytes = new Uint8Array(r.readBytes(metaLen));

    var metaParsed = {
      fieldCount: 0,
      compressionAlgorithm: 0,
      compressionType: 0,
      gameVersion: '0',
      gameBuildDate: '0',
      incompatibilityMarkVersion: 0,
      initGameVersion: '0',
      initGameBuildDate: '0'
    };

    try {
      var mr = new ByteReader(metaBytes);
      metaParsed.fieldCount = mr.readU16();
      metaParsed.compressionAlgorithm = mr.readU8();
      metaParsed.compressionType = mr.readU8();
      metaParsed.gameVersion = mr.readU64Str();
      metaParsed.gameBuildDate = mr.readU64Str();
      metaParsed.incompatibilityMarkVersion = mr.readU16();
      metaParsed.initGameVersion = mr.readU64Str();
      metaParsed.initGameBuildDate = mr.readU64Str();
    } catch (metaErr) {
      metaParsed.fieldCount = metaBytes.length >= 2 ? readMetaU16(metaBytes, 0) : 0;
      metaParsed.compressionAlgorithm = metaBytes.length >= 3 ? metaBytes[2] : 0;
      metaParsed.compressionType = metaBytes.length >= 4 ? metaBytes[3] : 0;
    }

    var worldInfo = null;
    if (magic === 'T1L') {
      var wiLen = r.readI32();
      if (wiLen < 0) {
        throw new Error('세계 정보 길이가 올바르지 않습니다');
      }
      var worldInfoBytes = new Uint8Array(r.readBytes(wiLen));
      worldInfo = readWorldInfoBytes(worldInfoBytes);
    }

    var hdrEnd = r.offset;
    var headerCrc = r.readU32();
    var actualHeaderCrc = calculateCRC32(bytes, 0, hdrEnd);
    var headerCrcValid = headerCrc === actualHeaderCrc;

    var contentEnd = bytes.length - 4;
    if (contentEnd < hdrEnd + 4) {
      throw new Error('본문 길이가 올바르지 않습니다');
    }

    var compSlice = bytes.subarray(hdrEnd + 4, bytes.length - 4);
    var expectedContentCrc = newDataView(bytes, bytes.length - 4, 4).getUint32(0, true);

    var uncompressed;
    if (metaParsed.compressionAlgorithm === 0) {
      uncompressed = inflateRaw(compSlice);
    } else if (metaParsed.compressionAlgorithm === 255) {
      uncompressed = new Uint8Array(compSlice);
    } else {
      throw new Error('압축 방식이 올바르지 않습니다');
    }

    var actualContentCrc = calculateCRC32(uncompressed, 0, uncompressed.length);
    var contentCrcValid = expectedContentCrc === actualContentCrc;

    if (opts.strictCrc !== false) {
      if (!headerCrcValid || !contentCrcValid) {
        throw new Error('검사값이 올바르지 않습니다');
      }
    }

    var parsed = {
      magic: magic,
      version: version,
      metaBytes: metaBytes,
      rawMetaPayload: metaBytes,
      meta: metaParsed,
      compressionAlgorithm: metaParsed.compressionAlgorithm,
      worldInfo: worldInfo,
      headerCrc: headerCrc,
      actualHeaderCrc: actualHeaderCrc,
      headerCrcValid: headerCrcValid,
      expectedContentCrc: expectedContentCrc,
      actualContentCrc: actualContentCrc,
      contentCrcValid: contentCrcValid,
      uncompressed: uncompressed,
      domains: [],
      workingDbLen: 0,
      workingDbBytes: new Uint8Array(0),
      originalBytes: bytes
    };

    var cr = new ByteReader(uncompressed);

    if (magic === 'T1G') {
      var domain0 = {
        domainId: 0,
        domainMetaBytes: null,
        dataCount: 0,
        entries: []
      };

      var dataCountZero = cr.readU16();
      domain0.dataCount = dataCountZero;
      var zeroMap = SPEC_MAP.byDomain['0'] || {};
      for (var g = 0; g < dataCountZero; g++) {
        var gMetaLen = cr.readI32();
        var gMetaBytes = new Uint8Array(cr.readBytes(gMetaLen));
        var gDataId = metaDataId(gMetaBytes);
        if (gDataId == null) {
          throw new Error('자료 식별자가 올바르지 않습니다');
        }
        var gSpec = zeroMap[String(gDataId)] || null;
        var gStart = cr.offset;
        skipWire(cr, gSpec);
        var gRaw = new Uint8Array(uncompressed.slice(gStart, cr.offset));
        domain0.entries.push({
          domainId: 0,
          dataId: gDataId,
          metaBytes: gMetaBytes,
          rawBytes: gRaw,
          _dirty: false
        });
      }
      parsed.domains.push(domain0);
    } else {
      var domainCount = cr.readU16();
      for (var d = 0; d < domainCount; d++) {
        var domainMetaLen = cr.readI32();
        var domainMetaBytes = new Uint8Array(cr.readBytes(domainMetaLen));
        var domainId = domainIdFromMeta(domainMetaBytes);
        var dataCount = cr.readU16();
        var domain = {
          domainId: domainId,
          domainMetaBytes: domainMetaBytes,
          dataCount: dataCount,
          entries: []
        };
        var domainSpecMap = SPEC_MAP.byDomain[String(domainId)] || {};

        for (var k = 0; k < dataCount; k++) {
          var entryMetaLen = cr.readI32();
          var entryMetaBytes = new Uint8Array(cr.readBytes(entryMetaLen));
          var entryDataId = metaDataId(entryMetaBytes);
          if (entryDataId == null) {
            throw new Error('자료 식별자가 올바르지 않습니다');
          }
          var entrySpec = domainSpecMap[String(entryDataId)] || null;
          var entryStart = cr.offset;
          skipWire(cr, entrySpec);
          var entryRaw = new Uint8Array(uncompressed.slice(entryStart, cr.offset));
          domain.entries.push({
            domainId: domainId,
            dataId: entryDataId,
            metaBytes: entryMetaBytes,
            rawBytes: entryRaw,
            _dirty: false
          });
        }

        parsed.domains.push(domain);
      }
      var workingDbLen = cr.readI64();
      parsed.workingDbLen = workingDbLen;
      parsed.workingDbBytes = new Uint8Array(cr.readBytes(workingDbLen));
    }

    return parsed;
  }

  function createMetaBytes(parsed) {
    var raw = parsed && parsed.rawMetaPayload ? parsed.rawMetaPayload : parsed && parsed.metaBytes;
    if (raw && raw.length > 0) {
      var copied = new Uint8Array(raw);
      if (Math.abs(copied.length) >= 3) {
        copied[2] = parsed.compressionAlgorithm == null ? (parsed.meta ? parsed.meta.compressionAlgorithm : 0) : parsed.compressionAlgorithm;
      }
      return copied;
    }

    var meta = parsed && parsed.meta ? parsed.meta : {};
    var w = new ByteWriter();
    w.writeU16(meta.fieldCount || 0);
    w.writeU8(parsed.compressionAlgorithm == null ? 0 : parsed.compressionAlgorithm);
    w.writeU8(meta.compressionType || 0);
    w.writeU64Str(meta.gameVersion || '0');
    w.writeU64Str(meta.gameBuildDate || '0');
    w.writeU16(meta.incompatibilityMarkVersion || 0);
    w.writeU64Str(meta.initGameVersion || '0');
    w.writeU64Str(meta.initGameBuildDate || '0');
    return w.toUint8Array();
  }

  function serializeArchive(parsed, opts) {
    opts = opts || {};
    if (!parsed) {
      throw new Error('보관 정보가 없습니다');
    }

    var compressionAlgorithm = parsed.compressionAlgorithm;
    if (compressionAlgorithm == null && parsed.meta) {
      compressionAlgorithm = parsed.meta.compressionAlgorithm;
    }
    if (compressionAlgorithm == null) {
      compressionAlgorithm = 0;
    }

    var contentWriter = new ByteWriter();
    var magic = parsed.magic || 'T1L';

    if (magic === 'T1G') {
      var domain0 = parsed.domains && parsed.domains.length > 0 ? parsed.domains[0] : { entries: [] };
      var entries0 = domain0.entries || [];
      contentWriter.writeU16(entries0.length);
      for (var i = 0; i < entries0.length; i++) {
        var e0 = entries0[i];
        var e0Meta = ensureUint8(e0.metaBytes);
        contentWriter.writeI32(e0Meta.length);
        if (e0Meta.length > 0) {
          contentWriter.writeBytes(e0Meta);
        }
        var e0Raw = ensureUint8(e0.rawBytes);
        if (e0Raw.length > 0) {
          contentWriter.writeBytes(e0Raw);
        }
      }
    } else {
      var domains = parsed.domains || [];
      contentWriter.writeU16(domains.length);
      for (var d = 0; d < domains.length; d++) {
        var domain = domains[d];
        var domainMeta = ensureUint8(domain.domainMetaBytes);
        contentWriter.writeI32(domainMeta.length);
        if (domainMeta.length > 0) {
          contentWriter.writeBytes(domainMeta);
        }

        var entries = domain.entries || [];
        contentWriter.writeU16(entries.length);
        for (var k = 0; k < entries.length; k++) {
          var entry = entries[k];
          var entryMeta = ensureUint8(entry.metaBytes);
          contentWriter.writeI32(entryMeta.length);
          if (entryMeta.length > 0) {
            contentWriter.writeBytes(entryMeta);
          }
          var entryRaw = ensureUint8(entry.rawBytes);
          if (entryRaw.length > 0) {
            contentWriter.writeBytes(entryRaw);
          }
        }
      }
      var workingDb = parsed.workingDbBytes ? ensureUint8(parsed.workingDbBytes) : new Uint8Array(0);
      contentWriter.writeI64(workingDb.length);
      if (workingDb.length > 0) {
        contentWriter.writeBytes(workingDb);
      }
    }

    var uncompressed = contentWriter.toUint8Array();

    var headerWriter = new ByteWriter();
    headerWriter.writeBytes(new Uint8Array([magic.charCodeAt(0), magic.charCodeAt(1), magic.charCodeAt(2)]));
    headerWriter.writeU8(parsed.version == null ? 4 : parsed.version);

    var metaBytes = createMetaBytes(parsed);
    headerWriter.writeI32(metaBytes.length);
    if (metaBytes.length > 0) {
      headerWriter.writeBytes(metaBytes);
    }

    if (magic === 'T1L') {
      var worldInfo = parsed.worldInfo || null;
      if (worldInfo && !worldInfoNeedsCleanWrite(worldInfo) && worldInfo.rawBytes) {
        var wiRaw = ensureUint8(worldInfo.rawBytes);
        headerWriter.writeI32(wiRaw.length);
        if (wiRaw.length > 0) {
          headerWriter.writeBytes(wiRaw);
        }
      } else {
        var wiBody = writeWorldInfo(worldInfo || {});
        headerWriter.writeI32(wiBody.length);
        if (wiBody.length > 0) {
          headerWriter.writeBytes(wiBody);
        }
      }
    }

    var headerWithoutCrc = headerWriter.toUint8Array();
    var headerCrc = calculateCRC32(headerWithoutCrc, 0, headerWithoutCrc.length);

    var outputWriter = new ByteWriter();
    outputWriter.writeBytes(headerWithoutCrc);
    outputWriter.writeU32(headerCrc);

    var contentBytes;
    if (compressionAlgorithm === 0) {
      contentBytes = deflateRaw(uncompressed);
    } else if (compressionAlgorithm === 255) {
      contentBytes = uncompressed;
    } else {
      throw new Error('압축 방식이 올바르지 않습니다');
    }

    if (contentBytes.length > 0) {
      outputWriter.writeBytes(contentBytes);
    }

    var contentCrc = calculateCRC32(uncompressed, 0, uncompressed.length);
    outputWriter.writeU32(contentCrc);

    return outputWriter.toUint8Array();
  }

  function getDomain(parsed, domainId) {
    if (!parsed || !parsed.domains) {
      return null;
    }
    for (var i = 0; i < parsed.domains.length; i++) {
      if (String(parsed.domains[i].domainId) === String(domainId)) {
        return parsed.domains[i];
      }
    }
    return null;
  }

  function getEntryMap(domain) {
    var map = {};
    if (!domain || !domain.entries) {
      return map;
    }
    for (var i = 0; i < domain.entries.length; i++) {
      var entry = domain.entries[i];
      map[String(entry.dataId)] = entry;
    }
    return map;
  }

  function setEntryRaw(domainOrParsed, domainIdOrDataId, dataIdOrRaw, maybeRaw) {
    var domain = null;
    var dataId = null;
    var rawBytes = null;

    if (domainOrParsed && domainOrParsed.domains) {
      domain = getDomain(domainOrParsed, domainIdOrDataId);
      dataId = dataIdOrRaw;
      rawBytes = maybeRaw;
    } else if (domainOrParsed && domainOrParsed.domainId !== undefined) {
      domain = domainOrParsed;
      dataId = domainIdOrDataId;
      rawBytes = dataIdOrRaw;
    } else {
      throw new Error('영역 정보가 올바르지 않습니다');
    }

    if (!domain) {
      throw new Error('영역을 찾지 못했습니다');
    }

    var map = getEntryMap(domain);
    var entry = map[String(dataId)];
    if (!entry) {
      entry = {
        domainId: domain.domainId,
        dataId: dataId,
        metaBytes: null,
        rawBytes: new Uint8Array(0),
        _dirty: false
      };
      domain.entries.push(entry);
    }
    entry.rawBytes = ensureUint8(rawBytes);
    entry._dirty = true;
    return entry;
  }

  function validateArchiveBytes(globalSav, localSav) {
    var result = {
      ok: true,
      errors: [],
      global: null,
      local: null
    };

    function validateOne(name, input) {
      try {
        var parsed = parseArchive(input, { strictCrc: true });
        if (name === 'global' || parsed.magic === 'T1G') {
          result.global = parsed;
        } else {
          result.local = parsed;
        }
        var reserialized = serializeArchive(parsed, {});
        var reprocessed = parseArchive(reserialized, { strictCrc: true });
        var equalLength = parsed.uncompressed.length === reprocessed.uncompressed.length;
        var equalBytes = equalLength && bytesEqual(parsed.uncompressed, reprocessed.uncompressed);
        if (!equalBytes) {
          result.ok = false;
          result.errors.push('본문 다시 만들기가 원본과 다릅니다');
        }
      } catch (err) {
        result.ok = false;
        result.errors.push(err && err.message ? err.message : '보관 검사에 실패했습니다');
      }
    }

    if (globalSav) {
      validateOne('global', globalSav);
    }
    if (localSav) {
      validateOne('local', localSav);
    }

    return result;
  }

  return {
    DOMAIN_WIRE_SPEC: DOMAIN_WIRE_SPEC,
    SPEC_MAP: SPEC_MAP,
    parseArchive: parseArchive,
    serializeArchive: serializeArchive,
    parseWorldInfo: parseWorldInfo,
    writeWorldInfo: writeWorldInfo,
    getDomain: getDomain,
    getEntryMap: getEntryMap,
    setEntryRaw: setEntryRaw,
    readObjCollection: readObjCollection,
    writeObjCollection: writeObjCollection,
    validateArchiveBytes: validateArchiveBytes
  };
});
