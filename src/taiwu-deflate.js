(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TaiwuDeflate = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var IS_NODE = (typeof process !== 'undefined' && process.versions && process.versions.node);

  /* ------------------------------------------------------------------ */
  /* CRC32                                                              */
  /* ------------------------------------------------------------------ */

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) {
        if (c & 1) {
          c = 0xEDB88320 ^ (c >>> 1);
        } else {
          c = c >>> 1;
        }
      }
      t[n] = c >>> 0;
    }
    return t;
  })();

  function calculateCRC32(bytes, start, len) {
    if (!bytes) {
      throw new Error('CRC32 계산에 사용할 바이트 배열이 없습니다.');
    }
    var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var s = (start === undefined || start === null) ? 0 : (start | 0);
    var l = (len === undefined || len === null) ? (u8.length - s) : (len | 0);
    if (s < 0 || l < 0 || s + l > u8.length) {
      throw new Error('CRC32 계산 범위가 올바르지 않습니다.');
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < l; i++) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ u8[s + i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  /* ------------------------------------------------------------------ */
  /* ByteReader                                                         */
  /* ------------------------------------------------------------------ */

  function ByteReader(u8) {
    if (!(u8 instanceof Uint8Array)) {
      if (u8 instanceof ArrayBuffer) {
        u8 = new Uint8Array(u8);
      } else if (u8 && typeof u8.length === 'number') {
        u8 = new Uint8Array(u8);
      } else {
        throw new Error('바이트 리더에 올바른 바이트 배열이 필요합니다.');
      }
    }
    this.bytes = u8;
    this.offset = 0;
    this.length = u8.length;
  }

  ByteReader.prototype.remaining = function () {
    return this.length - this.offset;
  };

  ByteReader.prototype._need = function (n) {
    if (n < 0) {
      throw new Error('바이트 리더에서 음수 길이를 요청했습니다.');
    }
    if (this.offset + n > this.length) {
      throw new Error('바이트 리더 범위를 초과했습니다. (필요 ' + n + '바이트, 남음 ' + this.remaining() + '바이트)');
    }
  };

  ByteReader.prototype.readU8 = function () {
    this._need(1);
    return this.bytes[this.offset++];
  };

  ByteReader.prototype.readI8 = function () {
    var v = this.readU8();
    return (v & 0x80) ? (v - 0x100) : v;
  };

  ByteReader.prototype.readU16 = function () {
    this._need(2);
    var b = this.bytes;
    var o = this.offset;
    this.offset = o + 2;
    return (b[o] | (b[o + 1] << 8)) & 0xFFFF;
  };

  ByteReader.prototype.readI16 = function () {
    var v = this.readU16();
    return (v & 0x8000) ? (v - 0x10000) : v;
  };

  ByteReader.prototype.readU32 = function () {
    this._need(4);
    var b = this.bytes;
    var o = this.offset;
    this.offset = o + 4;
    return ((b[o]) | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  };

  ByteReader.prototype.readI32 = function () {
    return this.readU32() | 0;
  };

  ByteReader.prototype.readU64BigInt = function () {
    var lo = this.readU32();
    var hi = this.readU32();
    return (BigInt(hi) << BigInt(32)) | BigInt(lo);
  };

  ByteReader.prototype.readU64Str = function () {
    return this.readU64BigInt().toString(10);
  };

  ByteReader.prototype.readI64 = function () {
    var v = this.readU64BigInt();
    var signed = BigInt.asIntN(64, v);
    var n = Number(signed);
    if (!Number.isSafeInteger(n)) {
      throw new Error('64비트 정수가 자바스크립트 안전 정수 범위를 벗어났습니다.');
    }
    return n;
  };

  ByteReader.prototype.readBytes = function (n) {
    this._need(n);
    var out = this.bytes.slice(this.offset, this.offset + n);
    this.offset += n;
    return out;
  };

  ByteReader.prototype.slice = function (n) {
    this._need(n);
    var out = this.bytes.subarray(this.offset, this.offset + n);
    this.offset += n;
    return out;
  };

  ByteReader.prototype.skip = function (n) {
    this._need(n);
    this.offset += n;
  };

  ByteReader.prototype._readUtf16 = function (count) {
    if (count < 0) {
      throw new Error('문자열 길이가 음수입니다.');
    }
    this._need(count * 2);
    var b = this.bytes;
    var o = this.offset;
    var parts = [];
    var CHUNK = 4096;
    for (var i = 0; i < count; i += CHUNK) {
      var end = i + CHUNK;
      if (end > count) {
        end = count;
      }
      var codes = new Array(end - i);
      for (var j = i; j < end; j++) {
        var p = o + j * 2;
        codes[j - i] = b[p] | (b[p + 1] << 8);
      }
      parts.push(String.fromCharCode.apply(null, codes));
    }
    this.offset = o + count * 2;
    return parts.join('');
  };

  ByteReader.prototype.readU16String = function () {
    var n = this.readU16();
    return this._readUtf16(n);
  };

  ByteReader.prototype.readI32String = function () {
    var n = this.readI32();
    return this._readUtf16(n);
  };

  /* ------------------------------------------------------------------ */
  /* ByteWriter                                                         */
  /* ------------------------------------------------------------------ */

  function ByteWriter(initialCap) {
    var cap = (initialCap === undefined || initialCap === null) ? 256 : (initialCap | 0);
    if (cap < 1) {
      cap = 1;
    }
    this.buffer = new Uint8Array(cap);
    this.length = 0;
  }

  ByteWriter.prototype._ensure = function (extra) {
    var need = this.length + extra;
    if (need <= this.buffer.length) {
      return;
    }
    var cap = this.buffer.length;
    while (cap < need) {
      cap = cap * 2;
      if (cap < 1 || cap > 0x7FFFFFFF) {
        cap = need;
        break;
      }
    }
    var nb = new Uint8Array(cap);
    nb.set(this.buffer.subarray(0, this.length));
    this.buffer = nb;
  };

  ByteWriter.prototype.writeU8 = function (v) {
    this._ensure(1);
    this.buffer[this.length++] = v & 0xFF;
  };

  ByteWriter.prototype.writeI8 = function (v) {
    this.writeU8(v & 0xFF);
  };

  ByteWriter.prototype.writeU16 = function (v) {
    this._ensure(2);
    var b = this.buffer;
    var o = this.length;
    var x = v & 0xFFFF;
    b[o] = x & 0xFF;
    b[o + 1] = (x >>> 8) & 0xFF;
    this.length = o + 2;
  };

  ByteWriter.prototype.writeI16 = function (v) {
    this.writeU16(v & 0xFFFF);
  };

  ByteWriter.prototype.writeU32 = function (v) {
    this._ensure(4);
    var b = this.buffer;
    var o = this.length;
    var x = v >>> 0;
    b[o] = x & 0xFF;
    b[o + 1] = (x >>> 8) & 0xFF;
    b[o + 2] = (x >>> 16) & 0xFF;
    b[o + 3] = (x >>> 24) & 0xFF;
    this.length = o + 4;
  };

  ByteWriter.prototype.writeI32 = function (v) {
    this.writeU32(v >>> 0);
  };

  ByteWriter.prototype._writeU64Big = function (big) {
    var u = BigInt.asUintN(64, big);
    var mask = BigInt(0xFFFFFFFF);
    var lo = Number(u & mask) >>> 0;
    var hi = Number((u >> BigInt(32)) & mask) >>> 0;
    this.writeU32(lo);
    this.writeU32(hi);
  };

  ByteWriter.prototype.writeI64 = function (n) {
    if (typeof n === 'string') {
      this._writeU64Big(BigInt(n));
      return;
    }
    if (typeof n === 'bigint') {
      this._writeU64Big(n);
      return;
    }
    if (typeof n !== 'number' || !isFinite(n)) {
      throw new Error('64비트 정수 기록에 올바르지 않은 값이 들어왔습니다.');
    }
    this._writeU64Big(BigInt(Math.trunc(n)));
  };

  ByteWriter.prototype.writeU64Str = function (s) {
    if (typeof s !== 'string') {
      s = String(s);
    }
    var big;
    try {
      big = BigInt(s);
    } catch (e) {
      throw new Error('64비트 정수 문자열을 해석하지 못했습니다.');
    }
    this._writeU64Big(big);
  };

  ByteWriter.prototype.writeBytes = function (u8) {
    if (u8 === null || u8 === undefined) {
      throw new Error('기록할 바이트 배열이 없습니다.');
    }
    var src = (u8 instanceof Uint8Array) ? u8 : new Uint8Array(u8);
    var n = src.length;
    if (n === 0) {
      return;
    }
    this._ensure(n);
    this.buffer.set(src, this.length);
    this.length += n;
  };

  ByteWriter.prototype.writeZeros = function (n) {
    if (n < 0) {
      throw new Error('0으로 채울 길이가 음수입니다.');
    }
    if (n === 0) {
      return;
    }
    this._ensure(n);
    this.buffer.fill(0, this.length, this.length + n);
    this.length += n;
  };

  ByteWriter.prototype._writeUtf16 = function (str) {
    var s = (str === null || str === undefined) ? '' : String(str);
    var n = s.length;
    this._ensure(n * 2);
    var b = this.buffer;
    var o = this.length;
    for (var i = 0; i < n; i++) {
      var c = s.charCodeAt(i);
      b[o] = c & 0xFF;
      b[o + 1] = (c >>> 8) & 0xFF;
      o += 2;
    }
    this.length = o;
  };

  ByteWriter.prototype.writeU16String = function (str) {
    var s = (str === null || str === undefined) ? '' : String(str);
    if (s.length > 0xFFFF) {
      throw new Error('문자열이 너무 길어 16비트 길이로 기록할 수 없습니다.');
    }
    this.writeU16(s.length);
    this._writeUtf16(s);
  };

  ByteWriter.prototype.writeI32String = function (str) {
    var s = (str === null || str === undefined) ? '' : String(str);
    if (s.length > 0x7FFFFFFF) {
      throw new Error('문자열이 너무 길어 32비트 길이로 기록할 수 없습니다.');
    }
    this.writeI32(s.length);
    this._writeUtf16(s);
  };

  ByteWriter.prototype.toUint8Array = function () {
    return this.buffer.slice(0, this.length);
  };

  /* ------------------------------------------------------------------ */
  /* Browser Inflate (RFC1951 raw)                                      */
  /* ------------------------------------------------------------------ */

  var LEN_BASE = [
    3, 4, 5, 6, 7, 8, 9, 10,
    11, 13, 15, 17, 19, 23, 27, 31,
    35, 43, 51, 59, 67, 83, 99, 115,
    131, 163, 195, 227, 258
  ];
  var LEN_EXTRA = [
    0, 0, 0, 0, 0, 0, 0, 0,
    1, 1, 1, 1, 2, 2, 2, 2,
    3, 3, 3, 3, 4, 4, 4, 4,
    5, 5, 5, 5, 0
  ];
  var DIST_BASE = [
    1, 2, 3, 4, 5, 7, 9, 13,
    17, 25, 33, 49, 65, 97, 129, 193,
    257, 385, 513, 769, 1025, 1537, 2049, 3073,
    4097, 6145, 8193, 12289, 16385, 24577
  ];
  var DIST_EXTRA = [
    0, 0, 0, 0, 1, 1, 2, 2,
    3, 3, 4, 4, 5, 5, 6, 6,
    7, 7, 8, 8, 9, 9, 10, 10,
    11, 11, 12, 12, 13, 13
  ];
  var CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  function buildHuffman(lengths) {
    // returns { counts: Int32Array(16), symbols: Int32Array(n) }
    var n = lengths.length;
    var counts = new Int32Array(16);
    var i;
    for (i = 0; i < n; i++) {
      counts[lengths[i]]++;
    }
    counts[0] = 0;
    var offsets = new Int32Array(16);
    var total = 0;
    for (i = 1; i < 16; i++) {
      offsets[i] = total;
      total += counts[i];
    }
    var symbols = new Int32Array(total);
    for (i = 0; i < n; i++) {
      var l = lengths[i];
      if (l !== 0) {
        symbols[offsets[l]++] = i;
      }
    }
    return { counts: counts, symbols: symbols };
  }

  function inflateRawBrowser(u8) {
    if (!(u8 instanceof Uint8Array)) {
      u8 = new Uint8Array(u8);
    }
    var total = u8.length;
    var pos = 0;
    var bitBuf = 0;
    var bitCnt = 0;

    var out = new Uint8Array(Math.max(1024, total * 4));
    var outLen = 0;

    function ensureOut(extra) {
      var need = outLen + extra;
      if (need <= out.length) {
        return;
      }
      var cap = out.length;
      while (cap < need) {
        cap = cap * 2;
        if (cap < 1) {
          cap = need;
          break;
        }
      }
      var nb = new Uint8Array(cap);
      nb.set(out.subarray(0, outLen));
      out = nb;
    }

    function fillBits(n) {
      while (bitCnt < n) {
        if (pos >= total) {
          throw new Error('압축 데이터가 예기치 않게 끝났습니다.');
        }
        bitBuf |= u8[pos++] << bitCnt;
        bitCnt += 8;
      }
    }

    function takeBits(n) {
      if (n === 0) {
        return 0;
      }
      fillBits(n);
      var v = bitBuf & ((1 << n) - 1);
      bitBuf >>>= n;
      bitCnt -= n;
      return v;
    }

    function decodeSymbol(tbl) {
      var counts = tbl.counts;
      var symbols = tbl.symbols;
      var code = 0;
      var first = 0;
      var index = 0;
      for (var len = 1; len < 16; len++) {
        fillBits(1);
        code |= bitBuf & 1;
        bitBuf >>>= 1;
        bitCnt -= 1;
        var count = counts[len];
        if (code - first < count) {
          return symbols[index + (code - first)];
        }
        index += count;
        first = (first + count) << 1;
        code <<= 1;
      }
      throw new Error('허프만 부호를 해독하지 못했습니다. 압축 데이터가 손상되었습니다.');
    }

    var FIXED_LIT = null;
    var FIXED_DIST = null;

    function getFixedTables() {
      if (FIXED_LIT) {
        return;
      }
      var lens = new Uint8Array(288);
      var i;
      for (i = 0; i < 144; i++) {
        lens[i] = 8;
      }
      for (i = 144; i < 256; i++) {
        lens[i] = 9;
      }
      for (i = 256; i < 280; i++) {
        lens[i] = 7;
      }
      for (i = 280; i < 288; i++) {
        lens[i] = 8;
      }
      FIXED_LIT = buildHuffman(lens);
      var dl = new Uint8Array(32);
      for (i = 0; i < 32; i++) {
        dl[i] = 5;
      }
      FIXED_DIST = buildHuffman(dl);
    }

    function copyBack(dist, len) {
      if (dist < 1 || dist > outLen) {
        throw new Error('역참조 거리가 올바르지 않습니다. 압축 데이터가 손상되었습니다.');
      }
      ensureOut(len);
      var src = outLen - dist;
      for (var i = 0; i < len; i++) {
        out[outLen++] = out[src + i];
      }
    }

    var finalBlock = false;
    while (!finalBlock) {
      finalBlock = takeBits(1) === 1;
      var btype = takeBits(2);

      if (btype === 0) {
        // 저장 블록
        bitBuf = 0;
        bitCnt = 0;
        if (pos + 4 > total) {
          throw new Error('저장 블록의 길이 정보가 잘렸습니다.');
        }
        var len = u8[pos] | (u8[pos + 1] << 8);
        var nlen = u8[pos + 2] | (u8[pos + 3] << 8);
        pos += 4;
        if (((len ^ 0xFFFF) & 0xFFFF) !== nlen) {
          throw new Error('저장 블록의 길이 검사값이 일치하지 않습니다.');
        }
        if (pos + len > total) {
          throw new Error('저장 블록의 데이터가 잘렸습니다.');
        }
        ensureOut(len);
        out.set(u8.subarray(pos, pos + len), outLen);
        outLen += len;
        pos += len;
      } else if (btype === 1 || btype === 2) {
        var litTbl;
        var distTbl;
        if (btype === 1) {
          getFixedTables();
          litTbl = FIXED_LIT;
          distTbl = FIXED_DIST;
        } else {
          var hlit = takeBits(5) + 257;
          var hdist = takeBits(5) + 1;
          var hclen = takeBits(4) + 4;
          if (hlit > 286 || hdist > 30) {
            throw new Error('동적 허프만 헤더의 부호 개수가 올바르지 않습니다.');
          }
          var clLens = new Uint8Array(19);
          for (var ci = 0; ci < hclen; ci++) {
            clLens[CL_ORDER[ci]] = takeBits(3);
          }
          var clTbl = buildHuffman(clLens);
          var allLens = new Uint8Array(hlit + hdist);
          var li = 0;
          while (li < allLens.length) {
            var sym = decodeSymbol(clTbl);
            if (sym < 16) {
              allLens[li++] = sym;
            } else if (sym === 16) {
              if (li === 0) {
                throw new Error('반복할 이전 부호 길이가 없습니다.');
              }
              var rep = takeBits(2) + 3;
              var prev = allLens[li - 1];
              while (rep-- > 0) {
                if (li >= allLens.length) {
                  throw new Error('부호 길이 반복이 범위를 초과했습니다.');
                }
                allLens[li++] = prev;
              }
            } else if (sym === 17) {
              var r17 = takeBits(3) + 3;
              while (r17-- > 0) {
                if (li >= allLens.length) {
                  throw new Error('0 길이 반복이 범위를 초과했습니다.');
                }
                allLens[li++] = 0;
              }
            } else if (sym === 18) {
              var r18 = takeBits(7) + 11;
              while (r18-- > 0) {
                if (li >= allLens.length) {
                  throw new Error('긴 0 길이 반복이 범위를 초과했습니다.');
                }
                allLens[li++] = 0;
              }
            } else {
              throw new Error('알 수 없는 부호 길이 부호입니다.');
            }
          }
          var litLens = allLens.subarray(0, hlit);
          var distLens = allLens.subarray(hlit, hlit + hdist);
          if (litLens[256] === 0) {
            throw new Error('동적 허프만 블록에 종료 부호가 없습니다.');
          }
          litTbl = buildHuffman(litLens);
          distTbl = buildHuffman(distLens);
        }

        while (true) {
          var s = decodeSymbol(litTbl);
          if (s < 256) {
            ensureOut(1);
            out[outLen++] = s;
          } else if (s === 256) {
            break;
          } else {
            var li2 = s - 257;
            if (li2 < 0 || li2 >= 29) {
              throw new Error('길이 부호가 올바르지 않습니다.');
            }
            var length = LEN_BASE[li2] + takeBits(LEN_EXTRA[li2]);
            var ds = decodeSymbol(distTbl);
            if (ds >= 30) {
              throw new Error('거리 부호가 올바르지 않습니다.');
            }
            var distance = DIST_BASE[ds] + takeBits(DIST_EXTRA[ds]);
            copyBack(distance, length);
          }
        }
      } else {
        throw new Error('알 수 없는 블록 형식입니다. 압축 데이터가 손상되었습니다.');
      }
    }

    return out.slice(0, outLen);
  }

  /* ------------------------------------------------------------------ */
  /* Browser Deflate (RFC1951 raw) - LZ77 + Fixed Huffman               */
  /* ------------------------------------------------------------------ */

  var FIXED_LIT_CODES = null;
  var FIXED_DIST_CODES = null;

  function buildFixedCodes() {
    if (FIXED_LIT_CODES) {
      return;
    }
    FIXED_LIT_CODES = new Array(288);
    var i;
    for (i = 0; i < 288; i++) {
      var code;
      var len;
      if (i < 144) {
        code = 0x30 + i;
        len = 8;
      } else if (i < 256) {
        code = 0x190 + (i - 144);
        len = 9;
      } else if (i < 280) {
        code = i - 256;
        len = 7;
      } else {
        code = 0xC0 + (i - 280);
        len = 8;
      }
      FIXED_LIT_CODES[i] = { code: code, len: len };
    }
    FIXED_DIST_CODES = new Array(32);
    for (i = 0; i < 32; i++) {
      FIXED_DIST_CODES[i] = { code: i, len: 5 };
    }
  }

  // 길이 -> (부호 인덱스, 추가 비트 수, 추가 비트 값)
  function lengthToCode(len) {
    // len in [3, 258]
    for (var i = 28; i >= 0; i--) {
      var base = LEN_BASE[i];
      if (len >= base) {
        var extra = LEN_EXTRA[i];
        if (extra === 0) {
          return { idx: i, extra: 0, val: 0 };
        }
        var max = base + ((1 << extra) - 1);
        if (len <= max) {
          return { idx: i, extra: extra, val: len - base };
        }
      }
    }
    return { idx: 28, extra: 0, val: 0 };
  }

  function distToCode(dist) {
    for (var i = 29; i >= 0; i--) {
      var base = DIST_BASE[i];
      if (dist >= base) {
        var extra = DIST_EXTRA[i];
        if (extra === 0) {
          return { idx: i, extra: 0, val: 0 };
        }
        var max = base + ((1 << extra) - 1);
        if (dist <= max) {
          return { idx: i, extra: extra, val: dist - base };
        }
      }
    }
    return { idx: 0, extra: 0, val: 0 };
  }

  function BitWriter(cap) {
    this.buf = new Uint8Array(cap || 1024);
    this.len = 0;
    this.bitBuf = 0;
    this.bitCnt = 0;
  }

  BitWriter.prototype._ensure = function (extra) {
    var need = this.len + extra;
    if (need <= this.buf.length) {
      return;
    }
    var cap = this.buf.length;
    while (cap < need) {
      cap = cap * 2;
      if (cap < 1) {
        cap = need;
        break;
      }
    }
    var nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
  };

  BitWriter.prototype.writeBits = function (value, count) {
    if (count === 0) {
      return;
    }
    this.bitBuf |= (value & ((1 << count) - 1)) << this.bitCnt;
    this.bitCnt += count;
    while (this.bitCnt >= 8) {
      this._ensure(1);
      this.buf[this.len++] = this.bitBuf & 0xFF;
      this.bitBuf >>>= 8;
      this.bitCnt -= 8;
    }
  };

  BitWriter.prototype.writeHuff = function (code) {
    // 허프만 부호는 최상위 비트부터 기록되므로 역순으로 넣는다.
    var c = code.code;
    var l = code.len;
    var rev = 0;
    for (var i = 0; i < l; i++) {
      rev = (rev << 1) | (c & 1);
      c >>>= 1;
    }
    this.writeBits(rev, l);
  };

  BitWriter.prototype.flushByte = function () {
    if (this.bitCnt > 0) {
      this._ensure(1);
      this.buf[this.len++] = this.bitBuf & 0xFF;
      this.bitBuf = 0;
      this.bitCnt = 0;
    }
  };

  BitWriter.prototype.finish = function () {
    this.flushByte();
    return this.buf.slice(0, this.len);
  };

  function deflateStored(u8) {
    // 순수 저장 블록으로만 구성 (BTYPE=0)
    var bw = new ByteWriter(Math.max(64, u8.length + Math.ceil(u8.length / 65535) * 5 + 8));
    var pos = 0;
    var total = u8.length;
    if (total === 0) {
      bw.writeU8(0x01);
      bw.writeU16(0);
      bw.writeU16(0xFFFF);
      return bw.toUint8Array();
    }
    while (pos < total) {
      var remain = total - pos;
      var chunk = remain > 0xFFFF ? 0xFFFF : remain;
      var final = (pos + chunk >= total) ? 1 : 0;
      bw.writeU8(final);
      bw.writeU16(chunk);
      bw.writeU16((~chunk) & 0xFFFF);
      bw.writeBytes(u8.subarray(pos, pos + chunk));
      pos += chunk;
    }
    return bw.toUint8Array();
  }

  var HASH_BITS = 15;
  var HASH_SIZE = 1 << HASH_BITS;
  var WINDOW_SIZE = 32768;
  var MIN_MATCH = 3;
  var MAX_MATCH = 258;
  var MAX_CHAIN = 64;
  var NICE_MATCH = 128;

  function deflateFixed(u8) {
    buildFixedCodes();
    var total = u8.length;
    var bw = new BitWriter(Math.max(1024, (total >>> 1) + 64));

    // 헤더: BFINAL=1, BTYPE=01 (고정 허프만)
    bw.writeBits(1, 1);
    bw.writeBits(1, 2);

    var head = new Int32Array(HASH_SIZE);
    for (var hi = 0; hi < HASH_SIZE; hi++) {
      head[hi] = -1;
    }
    var prev = new Int32Array(Math.max(1, total));
    for (var pi = 0; pi < prev.length; pi++) {
      prev[pi] = -1;
    }

    function hash3(a, b, c) {
      return ((a << 10) ^ (b << 5) ^ c) & (HASH_SIZE - 1);
    }

    function insert(p) {
      if (p + MIN_MATCH > total) {
        return -1;
      }
      var h = hash3(u8[p], u8[p + 1], u8[p + 2]);
      var cand = head[h];
      prev[p] = cand;
      head[h] = p;
      return cand;
    }

    var pos = 0;
    while (pos < total) {
      var bestLen = 0;
      var bestDist = 0;
      var cand2 = insert(pos);
      if (cand2 >= 0 && pos - cand2 <= WINDOW_SIZE) {
        var maxLen = total - pos;
        if (maxLen > MAX_MATCH) {
          maxLen = MAX_MATCH;
        }
        var chain = 0;
        var c = cand2;
        while (c >= 0 && chain < MAX_CHAIN) {
          var dist = pos - c;
          if (dist > WINDOW_SIZE) {
            break;
          }
          // 첫 세 바이트가 같은지 빠르게 확인
          if (u8[c + bestLen] === u8[pos + bestLen]) {
            var l = 0;
            while (l < maxLen && u8[c + l] === u8[pos + l]) {
              l++;
            }
            if (l > bestLen && l >= MIN_MATCH) {
              bestLen = l;
              bestDist = dist;
              if (l >= NICE_MATCH || l >= maxLen) {
                break;
              }
            }
          }
          var nxt = prev[c];
          if (nxt >= c) {
            break;
          }
          c = nxt;
          chain++;
        }
      }

      if (bestLen >= MIN_MATCH) {
        var lc = lengthToCode(bestLen);
        bw.writeHuff(FIXED_LIT_CODES[257 + lc.idx]);
        if (lc.extra > 0) {
          bw.writeBits(lc.val, lc.extra);
        }
        var dc = distToCode(bestDist);
        bw.writeHuff(FIXED_DIST_CODES[dc.idx]);
        if (dc.extra > 0) {
          bw.writeBits(dc.val, dc.extra);
        }
        // 해시 체인에 중간 위치들 삽입
        var end = pos + bestLen;
        var p2 = pos + 1;
        while (p2 < end) {
          insert(p2);
          p2++;
        }
        pos = end;
      } else {
        bw.writeHuff(FIXED_LIT_CODES[u8[pos]]);
        pos++;
      }
    }

    // 종료 부호 256
    bw.writeHuff(FIXED_LIT_CODES[256]);
    return bw.finish();
  }

  function deflateRawBrowser(u8) {
    if (!(u8 instanceof Uint8Array)) {
      u8 = new Uint8Array(u8);
    }
    try {
      var fixed = deflateFixed(u8);
      var stored = deflateStored(u8);
      return fixed.length <= stored.length ? fixed : stored;
    } catch (e) {
      return deflateStored(u8);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Public inflateRaw / deflateRaw                                     */
  /* ------------------------------------------------------------------ */

  function inflateRaw(u8) {
    if (!(u8 instanceof Uint8Array)) {
      u8 = new Uint8Array(u8);
    }
    if (IS_NODE) {
      return new Uint8Array(require('zlib').inflateRawSync(Buffer.from(u8)));
    }
    return inflateRawBrowser(u8);
  }

  function deflateRaw(u8) {
    if (!(u8 instanceof Uint8Array)) {
      u8 = new Uint8Array(u8);
    }
    if (IS_NODE) {
      return new Uint8Array(require('zlib').deflateRawSync(Buffer.from(u8)));
    }
    return deflateRawBrowser(u8);
  }

  return {
    calculateCRC32: calculateCRC32,
    ByteReader: ByteReader,
    ByteWriter: ByteWriter,
    inflateRaw: inflateRaw,
    deflateRaw: deflateRaw
  };
});
