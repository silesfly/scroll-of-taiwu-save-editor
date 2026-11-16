#!/usr/bin/env python3
"""태오회권 세이브 에디터 — 오프라인 단일 HTML 빌드 스크립트."""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
import tempfile
from pathlib import Path

BASE = Path(__file__).resolve().parent
SRC = BASE / "src" / "editor-page.html"
DIST = BASE / "dist"
OUT = DIST / "ScrollOfTaiwuSaveEditor-v1.0.html"

SCRIPTS = [
    "taiwu-deflate.js",
    "taiwu-wire.js",
    "taiwu-codec.js",
    "catalog-data.js",
    "editor-core.js",
    "editor-ui.js",
]

SCRIPT_TAG_RE = re.compile(r'<script\s+src="([^"]+)"\s*>\s*</script>', re.IGNORECASE)
CJK_RE = re.compile(r'[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]')
URL_RE = re.compile(r'https?://', re.IGNORECASE)
MAX_BYTES = 10 * 1024 * 1024


def die(msg: str) -> int:
    print(f"오류: {msg}", file=sys.stderr)
    return 1


def load_script(name: str) -> str:
    path = BASE / "src" / name
    if not path.is_file():
        raise FileNotFoundError(f"스크립트를 찾을 수 없습니다: {path}")
    text = path.read_text(encoding="utf-8")
    return text.replace("</script", r"<\/script")


def build_html() -> str:
    if not SRC.is_file():
        raise FileNotFoundError(f"원본 HTML을 찾을 수 없습니다: {SRC}")

    html = SRC.read_text(encoding="utf-8")
    matches = list(SCRIPT_TAG_RE.finditer(html))
    if len(matches) != len(SCRIPTS):
        raise ValueError(f"스크립트 태그 수가 다릅니다: {len(matches)}개 (기대: {len(SCRIPTS)}개)")

    found: list[str] = []
    for match in matches:
        src = match.group(1)
        base_name = src.rsplit("/", 1)[-1]
        if base_name not in SCRIPTS:
            raise ValueError(f"예상하지 못한 스크립트 태그입니다: {src}")
        found.append(base_name)

    if found != SCRIPTS:
        raise ValueError(f"스크립트 순서가 다릅니다: {found} (기대: {SCRIPTS})")

    parts: list[str] = []
    pos = 0
    for idx, match in enumerate(matches):
        parts.append(html[pos : match.start()])
        js = load_script(SCRIPTS[idx])
        parts.append(f"<script>\n{js}\n</script>")
        pos = match.end()
    parts.append(html[pos:])

    return "".join(parts)


def validate(html: str, raw: bytes) -> None:
    if len(raw) >= MAX_BYTES:
        raise ValueError(f"출력 파일이 너무 큽니다: {len(raw)}바이트")

    if SCRIPT_TAG_RE.search(html):
        raise ValueError("해결되지 않은 <script src=...> 태그가 남아 있습니다")

    if URL_RE.search(html):
        raise ValueError("외부 http:// 또는 https:// URL이 남아 있습니다")

    if CJK_RE.search(html):
        raise ValueError("한자 문자가 남아 있습니다")

    last_pos = -1
    for expected in SCRIPTS:
        js = load_script(expected)
        idx = html.find(js)
        if idx <= last_pos:
            raise ValueError(f"인라인 스크립트 순서가 올바르지 않습니다: {expected}")
        last_pos = idx


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_name, path)
    except BaseException:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass
        raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="build.py",
        description="태오회권 세이브 에디터를 단일 HTML 파일로 빌드합니다.",
    )
    parser.parse_args(argv)

    try:
        html = build_html()
        raw = html.encode("utf-8")
        validate(html, raw)
        atomic_write(OUT, raw)
    except Exception as exc:
        return die(str(exc))

    digest = hashlib.sha256(raw).hexdigest()
    mib = len(raw) / (1024 * 1024)
    print("빌드 완료")
    print(f"출력 파일: {OUT}")
    print(f"바이트 수: {len(raw):,} 바이트")
    print(f"크기: {mib:.3f} MiB")
    print(f"SHA-256: {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
