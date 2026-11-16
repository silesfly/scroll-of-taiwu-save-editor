import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CLI = os.path.join(ROOT, "taiwu_editor.py")
SRC = os.path.join(ROOT, "src")


def _run(args, cwd=None):
    return subprocess.run(
        [sys.executable, "-W", "error", "-B", CLI] + args,
        cwd=cwd or ROOT,
        capture_output=True,
        text=True,
    )


class TestCli(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="taiwu-test-")
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def test_demo_creates_global_and_world_local(self):
        out = os.path.join(self.tmp, "save")
        r = _run(["demo", "--out-dir", out])
        self.assertEqual(r.returncode, 0, r.stderr)
        global_path = os.path.join(out, "global.sav")
        local_path = os.path.join(out, "world_1", "local.sav")
        self.assertTrue(os.path.isfile(global_path), "global.sav missing")
        self.assertTrue(os.path.isfile(local_path), "world_1/local.sav missing")

    def test_validate_passes_valid_and_fails_corrupt(self):
        out = os.path.join(self.tmp, "save")
        r = _run(["demo", "--out-dir", out])
        self.assertEqual(r.returncode, 0, r.stderr)
        gpath = os.path.join(out, "global.sav")
        r = _run(["validate", gpath])
        self.assertEqual(r.returncode, 0, r.stderr)

        with open(gpath, "rb") as f:
            data = bytearray(f.read())
        idx = min(len(data) - 1, len(data) - 4)
        data[idx] ^= 0xFF
        with open(gpath, "wb") as f:
            f.write(data)
        r = _run(["validate", gpath])
        self.assertNotEqual(r.returncode, 0, "validate must fail on corrupt save")

    def test_inspect_json_fields(self):
        out = os.path.join(self.tmp, "save")
        r = _run(["demo", "--out-dir", out])
        self.assertEqual(r.returncode, 0, r.stderr)
        gpath = os.path.join(out, "global.sav")
        r = _run(["inspect", "--json", gpath])
        self.assertEqual(r.returncode, 0, r.stderr)
        payload = json.loads(r.stdout)
        self.assertTrue(isinstance(payload, dict))

        # find hero name / currDate / charCount potentially nested
        name = payload.get("heroName") or payload.get("hero") or payload.get("name")
        if isinstance(name, dict):
            name = name.get("name")
        self.assertTrue(name is not None, "hero name missing in inspect")
        self.assertTrue(isinstance(name, str) and len(name) > 0, "hero name empty")

        curr = payload.get("currDate")
        if curr is None and isinstance(payload.get("date"), (int, float)):
            curr = payload["date"]
        self.assertIsNotNone(curr, "currDate missing")

        count = payload.get("charCount")
        if count is None and isinstance(payload.get("characters"), list):
            count = len(payload["characters"])
        self.assertIsNotNone(count)
        self.assertGreaterEqual(int(count), 3)

    def test_presets_lists_four_korean(self):
        r = _run(["presets"])
        self.assertEqual(r.returncode, 0, r.stderr)
        text = r.stdout
        for name in ("hero_max_stats", "heal_cleanse", "resources_abundant", "skills_complete"):
            self.assertIn(name, text, "preset missing: %s" % name)
        # US-ASCII only requirement -> Korean labels allowed but not hanzi
        self.assertNotRegex(text, r"[\u4e00-\u9fff]")

    def test_edit_preset_silver_currdate_in_place_creates_backup(self):
        out = os.path.join(self.tmp, "save")
        r = _run(["demo", "--out-dir", out])
        self.assertEqual(r.returncode, 0, r.stderr)
        gpath = os.path.join(out, "global.sav")
        r = _run([
            "edit", "--preset", "resources_abundant",
            "--silver", "777777", "--curr-date", "24",
            "--in-place", gpath,
        ])
        self.assertEqual(r.returncode, 0, r.stderr)

        backups = [f for f in os.listdir(out) if f.startswith("global.sav.bak.")]
        self.assertTrue(backups, "backup file .bak.* not created")

        r = _run(["validate", gpath])
        self.assertEqual(r.returncode, 0, r.stderr)

        r = _run(["inspect", "--json", gpath])
        self.assertEqual(r.returncode, 0, r.stderr)
        payload = json.loads(r.stdout)
        # silver should be one of the characters (find any 777777)
        text = json.dumps(payload, ensure_ascii=False)
        self.assertIn("777777", text, "edited silver not persisted")
        self.assertIn("24", text, "edited currDate not persisted")


class TestServer(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="taiwu-test-")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.save_root = os.path.join(self.tmp, "save")
        r = _run(["demo", "--out-dir", self.save_root])
        self.assertEqual(r.returncode, 0, r.stderr)

    def _spawn(self):
        sys.path.insert(0, ROOT)
        try:
            import taiwu_editor  # noqa
            from taiwu_editor import _make_server  # type: ignore
        except Exception as exc:  # pragma: no cover
            self.skipTest("taiwu_editor._make_server unavailable: %s" % exc)

        server = _make_server("127.0.0.1", 0, save_root=self.save_root)
        host, port = server.server_address[:2]
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

        def _stop():
            server.shutdown()
            server.server_close()

        self.addCleanup(_stop)
        return "http://%s:%d" % (host, port)

    def _request(self, url, method="GET", data=None, headers=None):
        req = urllib.request.Request(url, method=method, data=data, headers=headers or {})
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status, resp.read(), dict(resp.headers)
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read(), dict(exc.headers)

    def test_index_is_standalone_html(self):
        base = self._spawn()
        status, body, _ = self._request(base + "/")
        self.assertEqual(status, 200)
        text = body.decode("utf-8", "replace")
        self.assertNotIn("http://", text)
        self.assertNotIn("https://", text)

    def test_api_health(self):
        base = self._spawn()
        status, body, _ = self._request(base + "/api/health")
        self.assertEqual(status, 200)
        payload = json.loads(body.decode("utf-8"))
        self.assertEqual(payload.get("ok"), True)

    def test_api_saves_discovers_demo(self):
        base = self._spawn()
        status, body, _ = self._request(base + "/api/saves")
        self.assertEqual(status, 200)
        payload = json.loads(body.decode("utf-8"))
        text = json.dumps(payload, ensure_ascii=False)
        self.assertIn("global.sav", text)

    def test_api_load_rejects_traversal_and_loads_valid(self):
        base = self._spawn()
        # Traversal attempt
        status, _, _ = self._request(base + "/api/load?path=../etc/passwd", method="POST")
        self.assertEqual(status, 403)

        status, _, _ = self._request(base + "/api/load?path=../../etc/passwd", method="POST")
        self.assertEqual(status, 403)

        # Legit load
        slot = os.path.join(self.save_root, "global.sav")
        status, body, _ = self._request(base + "/api/load?path=" + urllib.request.quote(slot),
                                        method="POST")
        self.assertEqual(status, 200)

    def test_api_save_origin_and_backup(self):
        base = self._spawn()
        target = os.path.join(self.save_root, "global.sav")
        data = json.dumps({"currDate": 24, "characters": []}).encode("utf-8")
        # Non-local origin must be rejected
        status, _, _ = self._request(
            base + "/api/save?path=" + urllib.request.quote(target),
            method="POST", data=data,
            headers={"Content-Type": "application/json", "Origin": "http://evil.example.com"},
        )
        self.assertEqual(status, 403)

        # legitimate local save
        status, body, _ = self._request(
            base + "/api/save?path=" + urllib.request.quote(target),
            method="POST", data=data,
            headers={"Content-Type": "application/json", "Origin": base},
        )
        self.assertEqual(status, 200)

        backup_dirs = [n for n in os.listdir(self.save_root) if n.startswith("global.sav.bak.")]
        self.assertTrue(backup_dirs, "no .bak.* created by server")


if __name__ == "__main__":
    unittest.main()
