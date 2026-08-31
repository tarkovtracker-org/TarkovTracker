#!/usr/bin/env python3
"""Unit tests for .eft_log_audit.py."""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from io import StringIO
from pathlib import Path
from unittest.mock import patch

# Dynamically import hidden script .eft_log_audit.py
script_path = Path(__file__).parent / ".eft_log_audit.py"
spec = importlib.util.spec_from_file_location("eft_log_audit", script_path)
mod = importlib.util.module_from_spec(spec)
sys.modules["eft_log_audit"] = mod
spec.loader.exec_module(mod)


class TestEftLogAuditHelpers(unittest.TestCase):
    def test_sanitized_shape_urls_and_endpoints(self):
        self.assertEqual(
            mod.sanitized_shape(b"Connecting to https://prod.escapefromtarkov.com/api"),
            "Connecting to <URL>",
        )
        self.assertEqual(
            mod.sanitized_shape(b"Connecting to wss://ws.escapefromtarkov.com/notifications"),
            "Connecting to <URL>",
        )
        self.assertEqual(
            mod.sanitized_shape(b"Connect address: 192.168.1.50:8080"),
            "Connect address: <ENDPOINT>",
        )
        self.assertEqual(
            mod.sanitized_shape(b"Server at [2001:db8::1]:443 active"),
            "Server at <ENDPOINT> active",
        )
        self.assertEqual(
            mod.sanitized_shape(b"Binding to fe80::1 interface"),
            "Binding to <ENDPOINT> interface",
        )

    def test_sanitized_shape_emails_and_paths(self):
        self.assertEqual(
            mod.sanitized_shape(b"User email is player@tarkov.org for login"),
            "User email is <EMAIL> for login",
        )
        self.assertEqual(
            mod.sanitized_shape(b"Loading from \\\\corp-nas\\logs\\session1\\game.log"),
            "Loading from <PATH>",
        )
        self.assertEqual(
            mod.sanitized_shape(b"Saved to C:\\Games\\Logs\\output.log"),
            "Saved to <PATH>",
        )

    def test_sanitized_shape_identifiers_and_tokens(self):
        self.assertEqual(
            mod.sanitized_shape(b"UUID: 550e8400-e29b-41d4-a716-446655440000 found"),
            "UUID: <ID> found",
        )
        self.assertEqual(
            mod.sanitized_shape(b"Item ID: 507f191e810c19729de860ea created"),
            "Item ID: <ID> created",
        )
        self.assertEqual(
            mod.sanitized_shape(b"Session token eyJhbGciOiJIUzI1NiI3 verified"),
            "Session token <TOKEN> verified",
        )
        self.assertEqual(
            mod.sanitized_shape(b"[507f191e810c19729de860ea|ScavPlayer_99|Profile] data"),
            "[<PROFILE_ID>|<NICKNAME>|Profile] data",
        )
        self.assertEqual(
            mod.sanitized_shape(b"Create corpse for PMC_Hero on spawn"),
            "Create corpse for <NICKNAME> on spawn",
        )
        self.assertEqual(
            mod.sanitized_shape(b"killerName: Boss_Killa recorded"),
            "Nickname:<NICKNAME> recorded",
        )

    def test_sanitized_shape_numbers_and_text(self):
        self.assertEqual(
            mod.sanitized_shape(b"Ping: 45 ms, lost: 0.005, code: 12345"),
            "Ping: <N> ms, lost: <N>, code: <N>",
        )
        self.assertEqual(
            mod.sanitized_shape(b'Message: "secret parameter value" reported'),
            'Message: "<TEXT>" reported',
        )

    def test_sanitized_shape_masks_unlabelled_values(self):
        shape = mod.sanitized_shape(
            b"PlayerName Bob connected to node prod-eu-1.example.invalid /home/bob/private.log"
        )
        self.assertNotIn("PlayerName", shape)
        self.assertNotIn("Bob", shape)
        self.assertNotIn("prod-eu-1", shape)
        self.assertNotIn("example.invalid", shape)
        self.assertNotIn("/home/bob/private.log", shape)

    def test_normalize_endpoint(self):
        self.assertEqual(
            mod.normalize_endpoint(b"/client/game/profile/507f191e810c19729de860ea/items/moving"),
            "/client/game/profile/<ID>/items/moving",
        )
        self.assertEqual(
            mod.normalize_endpoint(b"/client/match/group/status/550e8400-e29b-41d4-a716-446655440000"),
            "/client/match/group/status/<ID>",
        )
        self.assertEqual(
            mod.normalize_endpoint(b"/client/menu/locale/12345"),
            "/client/menu/locale/<ID>",
        )
        self.assertEqual(
            mod.normalize_endpoint(b"/client/game/version/"),
            "/client/game/version",
        )

    def test_normalize_documented_endpoint(self):
        self.assertEqual(
            mod.normalize_documented_endpoint("/client/game/profile/<profile_id>/items"),
            "/client/game/profile/<ID>/items",
        )

    def test_versions_and_channels(self):
        path = Path("Logs/2026-08-29_12-00-00_0.16.8.0.37972/2026-08-29_12-00-00_0.16.8.0.37972_application_0.log")
        self.assertEqual(mod.session_version(path), "0.16.8.0.37972")
        self.assertEqual(mod.directory_version(path.parent), "0.16.8.0.37972")
        self.assertEqual(mod.filename_channel(path), "application")

        versions = ["1.1.0.1.46911", "0.16.8.0.37972", "1.0.0.0.41760"]
        self.assertEqual(mod.sorted_versions(versions), ["0.16.8.0.37972", "1.0.0.0.41760", "1.1.0.1.46911"])


class TestEftLogAuditCLI(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.main_root = Path(self.tmp_dir.name) / "EFT"
        self.arena_root = Path(self.tmp_dir.name) / "Arena"
        self.main_root.mkdir()
        self.arena_root.mkdir()

        # Create mock EFT session
        main_sess = self.main_root / "2026-08-29_12-00-00_1.1.0.1.46911"
        main_sess.mkdir()
        app_log = main_sess / "2026-08-29_12-00-00_1.1.0.1.46911_application_0.log"
        app_log.write_bytes(
            b"2026-08-29 12:00:00.100 +00:00|1.1.0.1.46911|Info|application|Application awaken, updateQueue:'main'\n"
            b"2026-08-29 12:00:01.100 +00:00|1.1.0.1.46911|Info|application|Session mode: Regular\n"
            b"2026-08-29 12:00:02.100 +00:00|1.1.0.1.46911|Info|application|GameStarted\n"
        )

        backend_log = main_sess / "2026-08-29_12-00-00_1.1.0.1.46911_backend_0.log"
        backend_log.write_bytes(
            b"2026-08-29 12:00:03.100 +00:00|1.1.0.1.46911|Info|backend|---> Request HTTPS, id [123]: crc: 456 URL: https://gw-pvp.escapefromtarkov.com/client/game/profile/list\n"
            b"2026-08-29 12:00:04.100 +00:00|1.1.0.1.46911|Info|backend|<--- Response HTTPS, id [123]: URL: https://gw-pvp.escapefromtarkov.com/client/game/profile/list\n"
            b"2026-08-29 12:00:04.200 +00:00|1.1.0.1.46911|Info|backend|Unrelated https crc: marker\n"
        )

        push_log = main_sess / "2026-08-29_12-00-00_1.1.0.1.46911_push-notifications_0.log"
        push_log.write_bytes(
            b"2026-08-29 12:00:05.100 +00:00|1.1.0.1.46911|Info|push-notifications|Got notification | GroupMatchStartGame\n"
        )

        # Create mock seasonal session
        seasonal_sess = self.main_root / "2026-08-29_12-30-00_1.1.0.1.46911"
        seasonal_sess.mkdir()
        seasonal_backend = seasonal_sess / "2026-08-29_12-30-00_1.1.0.1.46911_backend_0.log"
        seasonal_backend.write_bytes(
            b"2026-08-29 12:30:03.100 +00:00|1.1.0.1.46911|Info|backend|---> Request HTTPS, id [124]: URL: https://gw-pvp_season.escapefromtarkov.com/client/match/group/status\n"
            b"2026-08-29 12:30:04.100 +00:00|1.1.0.1.46911|Info|backend|gw-pvpseason matchmaking\n"
        )

        # Create mock Arena session
        arena_sess = self.arena_root / "2026-08-29_13-00-00_0.4.2.5.42886"
        arena_sess.mkdir()
        arena_lc_log = arena_sess / "2026-08-29_13-00-00_0.4.2.5.42886_lifecycle_0.log"
        arena_lc_log.write_bytes(
            b"2026-08-29 13:00:00.100 +00:00|0.4.2.5.42886|Info|lifecycle|ApplicationState: Gameplay\n"
            b"2026-08-29 13:00:01.100 +00:00|0.4.2.5.42886|Info|lifecycle|MatchingProgressState: GameFound\n"
            b"2026-08-29 13:00:02.100 +00:00|0.4.2.5.42886|Info|lifecycle|GameplayState: Running\n"
        )

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_full_run_json(self):
        out_file = Path(self.tmp_dir.name) / "report.json"
        test_args = [
            ".eft_log_audit.py",
            "--main-root", str(self.main_root),
            "--arena-root", str(self.arena_root),
            "--section", "all",
            "--out", str(out_file),
        ]
        with patch.object(sys, "argv", test_args):
            mod.main()

        self.assertTrue(out_file.is_file())
        data = json.loads(out_file.read_text(encoding="utf-8"))
        self.assertIn("corpus", data)
        self.assertIn("signatures", data)
        self.assertIn("arena_structured_event_tokens", data)
        self.assertIn("unreadable_files", data)

        # Confirm Arena tokens are captured
        arena_tokens = {item["token"] for item in data["arena_structured_event_tokens"]}
        self.assertIn("Gameplay", arena_tokens)
        self.assertIn("GameFound", arena_tokens)
        self.assertIn("Running", arena_tokens)

        # Confirm start_game is not generated as a false signature
        sig_events = {item["event"] for item in data["signatures"]}
        self.assertNotIn("start_game", sig_events)
        self.assertIn("game_started", sig_events)
        self.assertIn("http_crc", sig_events)

        # Confirm notifications captured
        notif_markers = {item["marker"] for item in data["notifications"]}
        self.assertIn("GroupMatchStartGame", notif_markers)

        # Confirm seasonal session mode is S only, not double counted as P
        modes_by_session = {
            (item["game"], item["version"], item["mode"]): item["sessions"]
            for item in data["mode_session_counts"]
        }
        self.assertEqual(modes_by_session.get(("main", "1.1.0.1.46911", "S")), 1)
        self.assertEqual(modes_by_session.get(("main", "1.1.0.1.46911", "P")), 1)

    def test_missing_root_warning(self):
        non_existent = Path(self.tmp_dir.name) / "NonExistent"
        test_args = [
            ".eft_log_audit.py",
            "--main-root", str(self.main_root),
            "--arena-root", str(non_existent),
            "--section", "corpus",
            "--out", str(Path(self.tmp_dir.name) / "missing_root_report.json"),
        ]
        stderr_capture = StringIO()
        with patch.object(sys, "argv", test_args), patch("sys.stderr", stderr_capture), patch("sys.stdout", StringIO()):
            mod.main()

        self.assertIn("Warning: root directory for 'arena' not found", stderr_capture.getvalue())
        self.assertNotIn(str(non_existent), stderr_capture.getvalue())
        data = json.loads((Path(self.tmp_dir.name) / "missing_root_report.json").read_text(encoding="utf-8"))
        self.assertEqual(data["corpus_status"], "incomplete")
        self.assertEqual(data["missing_roots"], ["arena"])

    def test_unreadable_file_handling(self):
        unreadable_sess = self.main_root / "2026-08-29_14-00-00_1.1.0.1.46911"
        unreadable_sess.mkdir()
        locked_log = unreadable_sess / "2026-08-29_14-00-00_1.1.0.1.46911_application_0.log"
        locked_log.write_bytes(b"dummy")

        orig_open = Path.open
        def mock_open(self, *args, **kwargs):
            if Path(self).name == locked_log.name:
                raise PermissionError("Simulated locked file")
            return orig_open(self, *args, **kwargs)

        out_file = Path(self.tmp_dir.name) / "unreadable_report.json"
        test_args = [
            ".eft_log_audit.py",
            "--main-root", str(self.main_root),
            "--arena-root", str(self.arena_root),
            "--section", "corpus",
            "--out", str(out_file),
        ]
        with patch.object(sys, "argv", test_args), patch.object(Path, "open", side_effect=mock_open, autospec=True):
            mod.main()

        data = json.loads(out_file.read_text(encoding="utf-8"))
        self.assertIn("unreadable_files", data)
        self.assertEqual(data["unreadable_files"].get("PermissionError"), 1)
        self.assertEqual(data["corpus_status"], "incomplete")

    def test_reference_validation(self):
        missing_ref = Path(self.tmp_dir.name) / "missing.md"
        test_args = [
            ".eft_log_audit.py",
            "--main-root", str(self.main_root),
            "--arena-root", str(self.arena_root),
            "--section", "endpoints",
            "--reference", str(missing_ref),
        ]
        with patch.object(sys, "argv", test_args):
            with self.assertRaises(SystemExit) as cm:
                mod.main()
            self.assertIn("Reference file not found", str(cm.exception))

        invalid_anchor = Path(self.tmp_dir.name) / "no_anchor.md"
        invalid_anchor.write_text("# Just some notes\n", encoding="utf-8")
        test_args = [
            ".eft_log_audit.py",
            "--main-root", str(self.main_root),
            "--arena-root", str(self.arena_root),
            "--section", "endpoints",
            "--reference", str(invalid_anchor),
        ]
        with patch.object(sys, "argv", test_args):
            with self.assertRaises(SystemExit) as cm:
                mod.main()
            self.assertIn("Reference file has no '#### Complete observed endpoint inventory'", str(cm.exception))

    def test_valid_reference_delta(self):
        valid_ref = Path(self.tmp_dir.name) / "reference.md"
        valid_ref.write_text(
            "# Reference\n\n"
            "#### Complete observed endpoint inventory\n"
            "- `/client/game/profile/list`\n"
            "- `/client/game/profile/<ID>/items`\n"
            "- `/client/historical/only/route`\n\n"
            "### `backendCache`\n",
            encoding="utf-8",
        )
        out_file = Path(self.tmp_dir.name) / "endpoint_delta.json"
        test_args = [
            ".eft_log_audit.py",
            "--main-root", str(self.main_root),
            "--arena-root", str(self.arena_root),
            "--section", "endpoints",
            "--reference", str(valid_ref),
            "--out", str(out_file),
        ]
        with patch.object(sys, "argv", test_args):
            mod.main()

        data = json.loads(out_file.read_text(encoding="utf-8"))
        self.assertIn("endpoint_delta", data)
        delta = data["endpoint_delta"]
        self.assertIn("shared_count", delta)
        self.assertIn("historical_not_current", delta)
        self.assertIn("/client/historical/only/route", delta["historical_not_current"])

    def test_individual_sections(self):
        for section in ("corpus", "channels", "modes", "signatures", "endpoints", "notifications", "arena", "shapes"):
            out_file = Path(self.tmp_dir.name) / f"{section}.json"
            test_args = [
                ".eft_log_audit.py",
                "--main-root", str(self.main_root),
                "--arena-root", str(self.arena_root),
                "--section", section,
                "--out", str(out_file),
            ]
            with patch.object(sys, "argv", test_args):
                mod.main()
            self.assertTrue(out_file.is_file())
            data = json.loads(out_file.read_text(encoding="utf-8"))
            self.assertIsInstance(data, dict)


if __name__ == "__main__":
    unittest.main()
