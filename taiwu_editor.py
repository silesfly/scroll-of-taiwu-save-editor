#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""태오회권 저장 에디터: Archive v4 검증 + Node 코덱 브리지 CLI/HTTP."""
from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import threading
import time
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

APP_DIR = Path(__file__).resolve().parent
SRC_DIR = APP_DIR / "src"
DIST_HTML = APP_DIR / "dist" / "ScrollOfTaiwuSaveEditor-v1.0.html"
CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0
MAGICS = (b"T1G", b"T1L")
PRESETS = {
    "hero_max_stats": "주인공 능력치 최대",
    "heal_cleanse": "치료 및 정화",
    "resources_abundant": "자원 풍족",
    "skills_complete": "기예 완성",
}


def _kr(msg: str) -> str:
    return msg


def _u32(b: bytes, off: int) -> int:
    if off < 0 or off + 4 > len(b):
        raise ValueError(_kr("보관 파일 헤더가 잘렸습니다."))
    return struct.unpack_from("<I", b, off)[0]


def _i32(b: bytes, off: int) -> int:
    if off < 0 or off + 4 > len(b):
        raise ValueError(_kr("보관 파일 헤더가 잘렸습니다."))
    return struct.unpack_from("<i", b, off)[0]


def _read_u16_string(b: bytes, off: int) -> tuple[str, int]:
    if off + 2 > len(b):
        raise ValueError(_kr("문자열 길이가 잘렸습니다."))
    n = struct.unpack_from("<H", b, off)[0]
    off += 2
    raw = b[off:off + n * 2]
    if len(raw) != n * 2:
        raise ValueError(_kr("문자열 데이터가 잘렸습니다."))
    return raw.decode("utf-16-le", "replace"), off + n * 2


def _find_compression_algorithm(meta: bytes) -> int:
    """ArchiveFileMeta에서 압축 알고리즘(오프셋 +2)을 읽는다."""
    if len(meta) >= 4 and meta[2] in (0, 255):
        return meta[2]
    raise ValueError(_kr("압축 알고리즘을 확인할 수 없습니다."))


def _parse_world_info(wi: bytes) -> dict[str, Any]:
    out: dict[str, Any] = {}
    try:
        off = 2  # uint16 fieldCount 건너뜀
        out["currDate"] = _i32(wi, off)
        off += 4
        out["generations"] = _i32(wi, off)
        off += 4
        off += 8  # int64 savingTimestamp
        surname, off = _read_u16_string(wi, off)
        given, off = _read_u16_string(wi, off)
        out["surname"] = surname
        out["givenName"] = given
    except Exception:
        pass
    return out


def validate_archive_bytes_py(blob: bytes) -> dict[str, Any]:
    """Archive v4 바이트를 순수 파이썬으로 검증한다."""
    if not isinstance(blob, (bytes, bytearray)):
        raise ValueError(_kr("보관 데이터가 바이트 형식이 아닙니다."))
    blob = bytes(blob)
    if len(blob) < 16:
        raise ValueError(_kr("보관 파일이 너무 짧습니다."))
    magic = blob[:3]
    if magic not in MAGICS:
        raise ValueError(_kr("지원하지 않는 보관 파일 표식입니다."))
    version = blob[3]
    if version != 4:
        raise ValueError(_kr("보관 파일 버전이 4가 아닙니다."))
    pos = 4
    meta_len = _i32(blob, pos)
    pos += 4
    if meta_len < 0 or pos + meta_len > len(blob):
        raise ValueError(_kr("메타데이터 길이가 올바르지 않습니다."))
    meta_bytes = blob[pos:pos + meta_len]
    pos += meta_len
    compression_algorithm = _find_compression_algorithm(meta_bytes)
    world_info: dict[str, Any] = {}
    if magic == b"T1L":
        wi_len = _i32(blob, pos)
        pos += 4
        if wi_len < 0 or pos + wi_len > len(blob):
            raise ValueError(_kr("월드 정보 길이가 올바르지 않습니다."))
        wi_bytes = blob[pos:pos + wi_len]
        world_info = _parse_world_info(wi_bytes)
        pos += wi_len
    hdr_end = pos
    if hdr_end + 4 > len(blob):
        raise ValueError(_kr("헤더 검증값이 없습니다."))
    header_crc = _u32(blob, hdr_end)
    calc_header_crc = zlib.crc32(blob[:hdr_end]) & 0xFFFFFFFF
    if header_crc != calc_header_crc:
        raise ValueError(_kr("헤더 검증값이 일치하지 않습니다."))
    if hdr_end + 8 > len(blob):
        raise ValueError(_kr("본문 데이터가 없습니다."))
    content_slice = blob[hdr_end + 4:-4]
    content_crc = _u32(blob, len(blob) - 4)
    try:
        if compression_algorithm == 0:
            uncompressed = zlib.decompress(content_slice, -15)
        elif compression_algorithm == 255:
            uncompressed = content_slice
        else:
            raise ValueError(_kr("압축 알고리즘 값이 올바르지 않습니다."))
    except zlib.error as exc:
        raise ValueError(_kr("본문 압축 해제에 실패했습니다.")) from exc
    calc_content_crc = zlib.crc32(uncompressed) & 0xFFFFFFFF
    if content_crc != calc_content_crc:
        raise ValueError(_kr("본문 검증값이 일치하지 않습니다."))
    return {
        "ok": True,
        "magic": magic.decode("ascii"),
        "version": version,
        "compressionAlgorithm": compression_algorithm,
        "metaLength": meta_len,
        "headerEnd": hdr_end,
        "contentLength": len(content_slice),
        "uncompressedLength": len(uncompressed),
        "worldInfo": world_info,
    }


def _node_script_src() -> str:
    return r"""
const fs = require('fs');
const path = require('path');
const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
const base = process.env.TAIWU_SRC || path.join(process.cwd(), 'src');
function req(name) {
  return require(path.join(base, name));
}
function out(obj) { process.stdout.write(JSON.stringify(obj)); }
try {
  const codec = req('taiwu-codec.js');
  const core = req('editor-core.js');
  const catalog = req('catalog-data.js');
  const action = input.action;
  if (action === 'demo') {
    const bundle = codec.createDemoSaveBundle();
    out({ ok: true, globalSavB64: Buffer.from(bundle.globalSav).toString('base64'), localSavB64: Buffer.from(bundle.localSav).toString('base64') });
  } else if (action === 'validate') {
    const raw = Buffer.from(input.blobB64 || '', 'base64');
    const parsed = codec.parseArchive(raw, { strictCrc: true });
    out({ ok: true, magic: parsed.magic, version: parsed.version });
  } else if (action === 'inspect') {
    const g = input.globalSavB64 ? Buffer.from(input.globalSavB64, 'base64') : null;
    const l = input.localSavB64 ? Buffer.from(input.localSavB64, 'base64') : null;
    const session = core.createSession(catalog);
    session.loadBuffers(g, l);
    const sum = session.getSummary();
    const hid = session._heroId();
    const detail = hid != null ? (session.getCharacterDetail(hid) || {}) : {};
    out({
      ok: true,
      heroName: sum.heroName,
      currDate: sum.currDate,
      generation: sum.generation,
      charCount: sum.charCount,
      summary: sum,
      heroes: session.listCharacters('', false),
      characters: session.model.characters.map(c => ({ id: c.id, resources: c.resources })),
      resources: detail.resources || [],
      skills: session.model.combatSkills || [],
      inventoryCount: sum.itemCount
    });
  } else if (action === 'edit') {
    const g = input.globalSavB64 ? Buffer.from(input.globalSavB64, 'base64') : null;
    const l = input.localSavB64 ? Buffer.from(input.localSavB64, 'base64') : null;
    const session = core.createSession(catalog);
    session.loadBuffers(g, l);
    const edits = input.edits || {};
    const targetCid = edits.charId != null ? Number(edits.charId) : session._heroId();
    if (edits.preset) session.applyPreset(edits.preset, targetCid);
    if (edits.silver != null) {
      const ch = session._findChar(targetCid) || {};
      const res = Array.isArray(ch.resources) ? ch.resources.slice() : [0,0,0,0,0,0,0,0];
      res[6] = Number(edits.silver);
      session.updateCharacter(targetCid, { resources: res });
    }
    if (edits.legacy != null) session.updateTaiwu({ legacyPoint: Number(edits.legacy) });
    if (edits.currDate != null) session.updateWorld({ currDate: Number(edits.currDate) });
    if (edits.heal) session.healCharacter(targetCid);
    const built = session.exportBuffers();
    out({
      ok: true,
      globalSavB64: built.globalSav ? Buffer.from(built.globalSav).toString('base64') : null,
      localSavB64: Buffer.from(built.localSav).toString('base64')
    });
  } else {
    out({ ok: false, error: '알 수 없는 작업입니다.' });
  }
} catch (e) {
  out({ ok: false, error: String(e && e.message ? e.message : e) });
}
"""


def _run_node(script: str, payload: dict[str, Any]) -> dict[str, Any]:
    env = os.environ.copy()
    env["TAIWU_SRC"] = str(SRC_DIR)
    proc = subprocess.run(
        ["node", "-e", script],
        input=json.dumps(payload, ensure_ascii=False),
        text=True,
        capture_output=True,
        env=env,
        cwd=str(APP_DIR),
        creationflags=CREATE_NO_WINDOW,
        timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(_kr("Node 실행에 실패했습니다: ") + (proc.stderr.strip() or _kr("알 수 없는 오류")))
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(_kr("Node 응답을 해석하지 못했습니다.")) from exc
    if not data.get("ok"):
        raise RuntimeError(_kr("Node 작업 실패: ") + str(data.get("error", _kr("알 수 없는 오류"))))
    return data


def _atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass


def _backup(path: Path) -> Path:
    ts = time.strftime("%Y%m%d%H%M%S")
    dst = path.with_name(path.name + f".bak.{ts}")
    shutil.copy2(path, dst)
    return dst


def _find_save_pair(target: Path) -> tuple[Path | None, Path | None, Path]:
    if target.is_dir():
        g = target / "global.sav"
        if not g.exists() and (target.parent / "global.sav").exists():
            g = target.parent / "global.sav"
        l = target / "local.sav"
        if not l.exists():
            worlds = sorted(target.glob("world_*/local.sav"))
            if worlds:
                l = worlds[0]
        return (g if g.exists() else None, l if l.exists() else None, target)
    if target.name == "local.sav":
        gp = target.parent.parent / "global.sav"
        if not gp.exists():
            gp = target.parent / "global.sav"
        return (gp if gp.exists() else None, target, target.parent)
    if target.name == "global.sav":
        worlds = sorted(target.parent.glob("world_*/local.sav"))
        l = worlds[0] if worlds else (target.parent / "local.sav")
        return (target, l if l.exists() else None, target.parent)
    raise ValueError(_kr("global.sav 또는 local.sav 경로가 필요합니다."))


def _b64(data: bytes | None) -> str | None:
    return base64.b64encode(data).decode("ascii") if data is not None else None


def cmd_demo(args: argparse.Namespace) -> int:
    r = _run_node(_node_script_src(), {"action": "demo"})
    out_dir = Path(args.out_dir).resolve()
    g = out_dir / "global.sav"
    l = out_dir / "world_1" / "local.sav"
    _atomic_write(g, base64.b64decode(r["globalSavB64"]))
    _atomic_write(l, base64.b64decode(r["localSavB64"]))
    validate_archive_bytes_py(g.read_bytes())
    validate_archive_bytes_py(l.read_bytes())
    print(_kr("예제 저장 파일을 생성했습니다."))
    print(str(g))
    print(str(l))
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    target = Path(args.target).resolve()
    g, l, _ = _find_save_pair(target)
    if not g and not l:
        print(_kr("저장 파일을 찾지 못했습니다."))
        return 1
    ok = True
    for p in (g, l):
        if not p:
            continue
        try:
            validate_archive_bytes_py(p.read_bytes())
            try:
                _run_node(_node_script_src(), {"action": "validate", "blobB64": _b64(p.read_bytes())})
            except Exception:
                pass
            print(_kr("검증 통과: ") + str(p))
        except Exception as exc:
            ok = False
            print(_kr("검증 실패: ") + str(p))
            print(str(exc))
    return 0 if ok else 1


def cmd_inspect(args: argparse.Namespace) -> int:
    target = Path(args.target).resolve()
    g, l, _ = _find_save_pair(target)
    payload = {
        "action": "inspect",
        "globalSavB64": _b64(g.read_bytes()) if g else None,
        "localSavB64": _b64(l.read_bytes()) if l else None,
    }
    r = _run_node(_node_script_src(), payload)
    if args.json:
        print(json.dumps(r, ensure_ascii=False, indent=2))
        return 0
    print(_kr("태오회권 저장 요약"))
    print(_kr("요약: ") + json.dumps(r.get("summary", {}), ensure_ascii=False))
    print(_kr("영웅 수: ") + str(len(r.get("heroes", []))))
    for h in r.get("heroes", [])[:10]:
        print(" - " + json.dumps(h, ensure_ascii=False))
    print(_kr("자원: ") + json.dumps(r.get("resources", {}), ensure_ascii=False))
    print(_kr("기예 수: ") + str(len(r.get("skills", []))))
    print(_kr("소지품 수: ") + str(r.get("inventoryCount", 0)))
    return 0


def cmd_presets(_: argparse.Namespace) -> int:
    for key, label in PRESETS.items():
        print(f"{key}: {label}")
    return 0


def cmd_edit(args: argparse.Namespace) -> int:
    target = Path(args.target).resolve()
    g, l, base = _find_save_pair(target)
    if not g and not l:
        print(_kr("저장 파일을 찾지 못했습니다."))
        return 1
    payload = {
        "action": "edit",
        "globalSavB64": _b64(g.read_bytes()) if g else None,
        "localSavB64": _b64(l.read_bytes()) if l else None,
        "edits": {
            "preset": args.preset,
            "charId": args.char_id,
            "silver": args.silver,
            "legacy": args.legacy,
            "currDate": args.curr_date,
            "heal": args.heal,
        },
    }
    r = _run_node(_node_script_src(), payload)
    ng = base64.b64decode(r["globalSavB64"])
    nl = base64.b64decode(r["localSavB64"]) if r.get("localSavB64") else None
    validate_archive_bytes_py(ng)
    if nl:
        validate_archive_bytes_py(nl)

    if args.in_place:
        backups: list[str] = []
        if g:
            backups.append(str(_backup(g)))
        if l:
            backups.append(str(_backup(l)))
        _atomic_write(g, ng)
        if l and nl:
            _atomic_write(l, nl)
        print(_kr("저장 파일을 수정했습니다."))
        for b in backups:
            print(_kr("백업: ") + b)
        return 0

    out_dir = Path(args.out_dir).resolve() if args.out_dir else base
    og = out_dir / "global.sav"
    ol = out_dir / "world_1" / "local.sav"
    _atomic_write(og, ng)
    if nl:
        _atomic_write(ol, nl)
    print(_kr("수정된 저장 파일을 저장했습니다."))
    print(str(og))
    if nl:
        print(str(ol))
    return 0


def _default_save_roots() -> list[Path]:
    roots = []
    home = Path.home()
    for p in (
        home / "AppData" / "LocalLow" / "ConchShip" / "Taiwu",
        home / ".local" / "share" / "Steam" / "steamapps" / "compatdata",
        home / "Library" / "Application Support" / "Steam" / "steamapps" / "compatdata",
    ):
        if p.exists():
            roots.append(p)
    return roots


def _discover_saves(root: Path | None) -> list[dict[str, Any]]:
    roots = [root] if root else _default_save_roots()
    found = []
    seen = set()
    for base in roots:
        if not base or not base.exists():
            continue
        for lp in base.rglob("local.sav"):
            if lp in seen:
                continue
            seen.add(lp)
            gp = lp.parent.parent / "global.sav"
            found.append({
                "slotName": lp.parent.name,
                "slotDir": str(lp.parent),
                "hasGlobal": gp.exists(),
                "localPath": str(lp),
                "globalPath": str(gp) if gp.exists() else "",
            })
    return found


def _safe_contained(path: Path, root: Path) -> bool:
    try:
        rp = path.resolve()
        rr = root.resolve()
        rp.relative_to(rr)
        if path.is_symlink():
            return False
        if sys.platform == "win32":
            attrs = getattr(path, "stat")().st_file_attributes
            if attrs & 0x400:
                return False
        return True
    except Exception:
        return False


def _html_bundle() -> bytes:
    if DIST_HTML.exists():
        return DIST_HTML.read_bytes()
    parts = []
    for name in ("catalog-data.js", "taiwu-codec.js", "editor-core.js", "editor-ui.js"):
        p = SRC_DIR / name
        if p.exists():
            parts.append(p.read_text(encoding="utf-8"))
    body = "<!doctype html><meta charset='utf-8'><title>태오회권 에디터</title>"
    body += "<div id='app'></div><script>" + "\n".join(parts) + "</script>"
    return body.encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    server_version = "TaiwuEditor/1.0"

    def _send(self, code: int, body: bytes, ctype: str = "application/octet-stream") -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, obj: dict[str, Any]) -> None:
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def _secure(self) -> bool:
        host = (self.headers.get("Host") or "").split(":")[0]
        origin = self.headers.get("Origin")
        if host not in ("127.0.0.1", "localhost"):
            self._json(403, {"ok": False, "error": "로컬 호스트만 허용됩니다."})
            return False
        if origin:
            oh = urlparse(origin).hostname
            if oh not in ("127.0.0.1", "localhost"):
                self._json(403, {"ok": False, "error": "로컬 출처만 허용됩니다."})
                return False
        return True

    def do_GET(self) -> None:
        if not self._secure():
            return
        parsed = urlparse(self.path)
        if parsed.path in ("/", "/index.html"):
            self._send(200, _html_bundle(), "text/html; charset=utf-8")
        elif parsed.path == "/api/health":
            self._json(200, {"ok": True, "mode": "python-server"})
        elif parsed.path == "/api/saves":
            self._json(200, {"ok": True, "saves": _discover_saves(self.server.save_root)})
        else:
            self._json(404, {"ok": False, "error": "찾을 수 없습니다."})

    def do_POST(self) -> None:
        from urllib.parse import parse_qs
        if not self._secure():
            return
        try:
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)
            n = int(self.headers.get("Content-Length", "0") or 0)
            raw_body = self.rfile.read(n).decode("utf-8") if n > 0 else "{}"
            data = json.loads(raw_body or "{}")
            root = (self.server.save_root or Path.home()).resolve()
            raw_target = (qs.get("path") or [None])[0] or data.get("slotDir") or data.get("path") or ""
            raw_str = str(raw_target)
            if not raw_str or ".." in Path(raw_str).parts:
                self._json(403, {"ok": False, "error": "허용된 저장 경로가 아닙니다."})
                return
            cand = Path(raw_str)
            if not cand.is_absolute():
                cand = root / cand
            if not _safe_contained(cand, root):
                self._json(403, {"ok": False, "error": "허용된 저장 경로가 아닙니다."})
                return
            target_path = cand.resolve()
            if parsed.path == "/api/load":
                g, l, _ = _find_save_pair(target_path)
                self._json(200, {
                    "ok": True,
                    "globalSavB64": _b64(g.read_bytes()) if g and g.exists() else None,
                    "localSavB64": _b64(l.read_bytes()) if l and l.exists() else None,
                })
            elif parsed.path == "/api/save":
                g, l, _ = _find_save_pair(target_path) if target_path.exists() else (target_path.parent / "global.sav", target_path / "local.sav", target_path)
                if data.get("globalSavB64") or data.get("localSavB64"):
                    gb = base64.b64decode(data["globalSavB64"]) if data.get("globalSavB64") else None
                    lb = base64.b64decode(data["localSavB64"]) if data.get("localSavB64") else None
                else:
                    res = _run_node(_node_script_src(), {
                        "action": "edit",
                        "globalSavB64": _b64(g.read_bytes()) if g and g.exists() else None,
                        "localSavB64": _b64(l.read_bytes()) if l and l.exists() else None,
                        "edits": data,
                    })
                    gb = base64.b64decode(res["globalSavB64"]) if res.get("globalSavB64") else None
                    lb = base64.b64decode(res["localSavB64"]) if res.get("localSavB64") else None
                if gb:
                    validate_archive_bytes_py(gb)
                if lb:
                    validate_archive_bytes_py(lb)
                backups = []
                if gb and g:
                    if g.exists():
                        backups.append(str(_backup(g)))
                    _atomic_write(g, gb)
                if lb and l:
                    if l.exists():
                        backups.append(str(_backup(l)))
                    _atomic_write(l, lb)
                self._json(200, {"ok": True, "backups": backups})
            else:
                self._json(404, {"ok": False, "error": "찾을 수 없습니다."})
        except Exception as exc:
            self._json(400, {"ok": False, "error": str(exc)})


def _make_server(host: str = "127.0.0.1", port: int = 0, save_root: str | Path | None = None) -> ThreadingHTTPServer:
    if host not in ("127.0.0.1", "localhost"):
        raise ValueError(_kr("루프백 주소만 허용됩니다."))
    srv = ThreadingHTTPServer((host, int(port)), Handler)
    srv.save_root = Path(save_root).resolve() if save_root else None
    return srv


def cmd_serve(args: argparse.Namespace) -> int:
    srv = _make_server("127.0.0.1", args.port, save_root=args.save_dir)
    host, port = srv.server_address
    print(_kr("서버 주소: ") + f"http://{host}:{port}/")
    if args.open:
        import webbrowser
        webbrowser.open(f"http://{host}:{port}/")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="taiwu_editor.py", description="태오회권 저장 에디터")
    sub = p.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("demo", help="예제 저장 생성")
    d.add_argument("--out-dir", required=True)
    d.set_defaults(func=cmd_demo)
    v = sub.add_parser("validate", help="저장 검증")
    v.add_argument("target")
    v.set_defaults(func=cmd_validate)
    i = sub.add_parser("inspect", help="저장 조회")
    i.add_argument("target")
    i.add_argument("--json", action="store_true")
    i.set_defaults(func=cmd_inspect)
    pr = sub.add_parser("presets", help="프리셋 목록")
    pr.set_defaults(func=cmd_presets)
    e = sub.add_parser("edit", help="저장 수정")
    e.add_argument("target")
    e.add_argument("--preset", choices=sorted(PRESETS))
    e.add_argument("--char-id", type=int)
    e.add_argument("--silver", type=int)
    e.add_argument("--legacy", type=int)
    e.add_argument("--curr-date", type=int)
    e.add_argument("--heal", action="store_true")
    e.add_argument("--out-dir")
    e.add_argument("--in-place", action="store_true")
    e.set_defaults(func=cmd_edit)
    s = sub.add_parser("serve", help="웹 서버")
    s.add_argument("--save-dir")
    s.add_argument("--port", type=int, default=0)
    s.add_argument("--open", action="store_true")
    s.set_defaults(func=cmd_serve)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return int(args.func(args))
    except Exception as exc:
        print(_kr("오류: ") + str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
