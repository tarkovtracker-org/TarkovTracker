#!/usr/bin/env python3
"""Read-only, privacy-safe EFT log evidence summarizer.

The script emits aggregate counts and named event-family/version presence only. It never emits raw
messages, identifiers, addresses, hostnames, player names, or session-folder names.
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import sys
from pathlib import Path


VERSION_RE = re.compile(r"(\d+\.\d+\.\d+\.\d+\.\d+)$")
VERSIONED_RE = re.compile(
    rb"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}(?: [+-]\d{2}:\d{2})?\|([^|]+)\|([^|]+)\|([^|]+)\|"
)
VERSIONLESS_RE = re.compile(
    rb"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}(?: [+-]\d{2}:\d{2})?\|([^|]+)\|([^|]+)\|"
)


# Each signature is (label, any_of, all_of).
# - any_of: alternative wording fragments; a line matches when AT LEAST ONE is present.
#   Use for build-to-build wording variants of the same event.
# - all_of: extra fragments that must ALL be present on the same line (conjunction).
#   Use when a single fragment is too generic on its own.
SIGNATURES: list[tuple[str, list[bytes], list[bytes]]] = [
    ("application_awaken", [b"application awaken"], []),
    ("select_profile_legacy", [b"selectprofile"], []),
    ("prepare_selected_profile", [b"prepareselectedprofilelocally"], []),
    ("complete_selected_profile", [b"completeselectedprofile"], []),
    ("session_mode", [b"session mode:", b"session mode :"], []),
    ("network_matching_trace", [b"trace-networkgamematching"], []),
    ("matching_group", [b"matching with group id"], []),
    ("matching_started", [b"matching datetime"], []),
    ("matching_completed", [b"matchingcompleted"], []),
    ("matching_cancelled", [b"network game matching cancelled", b"local game matching cancelled"], []),
    ("network_game_create", [b"trace-networkgamecreate"], []),
    ("location_loaded", [b"locationloaded"], []),
    ("game_created", [b"gamecreated"], []),
    ("game_pooled", [b"gamepooled"], []),
    ("game_prepared", [b"gameprepared"], []),
    ("player_spawn", [b"playerspawnevent"], []),
    ("game_spawn", [b"gamespawn"], []),
    ("game_runned", [b"gamerunned"], []),
    ("game_starting", [b"gamestarting"], []),
    ("game_started", [b"gamestarted"], []),
    ("transit", [b"[transit]"], []),
    ("scene_preset", [b"scene preset path"], []),
    ("world_spawn_confirmed", [b"world spawn confirmed"], []),
    ("on_game_session_end", [b"ongamesessionend"], []),
    ("game_stopped", [b"gamestopped"], []),
    ("exit_status", [b"exitstatus:", b"exitstatus :"], []),
    ("game_over_save_status", [b"gameoversavestatus"], []),
    ("post_raid_start", [b"postraid_start"], []),
    ("death_screen_shown", [b"deathscreen_shown"], []),
    ("interactive_menu_ready", [b"interactivemenuready"], []),
    ("http_request", [b"---> request https"], []),
    ("http_response", [b"<--- response https"], []),
    ("http_crc", [b"crc:", b"crc :"], [b"https"]),
    ("http_error", [b"<--- error https", b"<--- error! https"], []),
    ("http_retry", [b"will be retried after"], []),
    ("backend_cache_mismatch", [b"cache: mis-matched", b"cache: mismatched"], []),
    ("backend_server_exception", [b"backendserversideexception"], []),
    ("wss_lifecycle", [b"wss opened", b"wss closed", b"websocket reconnect", b"websocket termination"], []),
    ("notification_endpoint", [b"new params received url:"], []),
    ("long_polling_websocket", [b"longpollingwebsocketrequest"], []),
    ("notification_ping", [b"service notifications ping"], []),
    ("notification_channel_deleted", [b"service notifications channeldeleted"], []),
    ("connect_address", [b"connect (address:", b"connect (address :"], []),
    ("state_initial_exit", [b"exit to the 'initial' state"], []),
    ("state_connecting", [b"enter to the 'connecting' state", b"enter state connecting", b"entering state: connecting", b"entering state connecting"], []),
    ("state_connected", [b"enter to the 'connected' state", b"enter state connected", b"entering state: connected", b"entering state connected"], []),
    ("network_statistics", [b"statistics ("], []),
    ("disconnect", [b"disconnect ("], []),
    ("receive_disconnect", [b"receive disconnect ("], []),
    ("state_disconnected", [b"enter to the 'disconnected' state", b"enter state disconnected", b"entering state: disconnected", b"entering state disconnected"], []),
    ("network_thread_aborted", [b"thread was being aborted"], []),
    ("network_thread_limit", [b"thread processing exceeded the limit"], []),
    ("network_message_counters", [b"rpi:", b"rpi :"], []),
    ("spatial_dsp_buffer", [b"current dsp buffer length"], []),
    ("spatial_quality", [b"target audio quality"], []),
    ("spatial_initialized", [b"spatialaudiosystem initialized"], []),
    ("better_audio_initialized", [b"success initialize betteraudio"], []),
    ("reverb_checker", [b"reverbpluginchecker enabled"], []),
    ("reverb_reset", [b"reverb reset"], []),
    ("microphone_failed", [b"checkmicrophone failed"], []),
    ("object_pool_destroyed", [b"returning asset to pool when the pool is already destroyed"], []),
    ("object_create_failed", [b"failed to create item with id"], []),
    ("insurance_missing_item", [b"items to insure does not contain"], []),
    ("inventory_rejected", [b"client operation rejected by server"], []),
    ("inventory_slot_occupied", [b"cannot put item"], [b"because it contains item"]),
    ("inventory_no_parent", [b"no parent inventory"], [b"activity from item"]),
    ("inventory_missing_reference", [b"operation can't be created"], [b"cant find"]),
    ("inventory_blocked", [b" is blocked "], [b" with "]),
    ("inventory_too_far", [b" is too far away from "], []),
    ("inventory_clone_desync", [b"cloned item id desync"], []),
    ("player_missing_item", [b"could not find item with id"], []),
    ("condition_not_finishable", [b"conditional is not available for finish"], []),
    ("files_checker_path", [b"executablepath:", b"executablepath :"], []),
    ("files_checker_started", [b"consistency ensurance is launched"], []),
    ("files_checker_succeeded", [b"consistency ensurance is succeed"], []),
    ("map_spawn_marker_fix", [b"spawnpointmarker"], [b"fix message"]),
    ("map_spawn_marker_fix_count", [b"spawnpointmarkers fixes"], []),
    ("map_spawn_marker_delete", [b"spawnpointmarker will be deleted"], []),
]

ANCHOR_TO_SIGNATURES: dict[bytes, list[tuple[str, list[bytes], list[bytes]]]] = collections.defaultdict(list)
for signature in SIGNATURES:
    for anchor in signature[1]:
        ANCHOR_TO_SIGNATURES[anchor].append(signature)
SIGNATURE_ANCHOR_RE = re.compile(
    b"|".join(re.escape(anchor) for anchor in sorted(ANCHOR_TO_SIGNATURES, key=len, reverse=True)),
    re.IGNORECASE,
)
HTTP_CRC_ENVELOPE_MARKERS = (b"---> request https", b"<--- response https")

ENDPOINT_RE = re.compile(rb"(?:(?:https?|wss)://[^/\s\"']+)?((?:/v2)?/client/[A-Za-z0-9_./-]+|/router)(?:\?[^\s\"']*)?", re.I)
NOTIFICATION_RE = re.compile(rb"Got notification\s*\|\s*([A-Za-z][A-Za-z0-9_]*)", re.I)
SERVICE_NOTIFICATION_RE = re.compile(rb"Service Notifications\s+([A-Za-z][A-Za-z0-9_]*)", re.I)
ARENA_EVENT_RE = re.compile(
    rb"\b(?:event|message|type|method|action|ApplicationState|MatchingProgressState|GameplayState)\b\s*[:=]\s*[\"']?([A-Za-z][A-Za-z0-9_.-]{2,80})",
    re.I,
)
SAFE_SHAPE_WORDS = frozenset(
    {
        "active",
        "address",
        "and",
        "application",
        "at",
        "binding",
        "code",
        "connect",
        "connecting",
        "corpse",
        "create",
        "created",
        "data",
        "email",
        "for",
        "found",
        "from",
        "interface",
        "is",
        "item",
        "loading",
        "login",
        "lost",
        "message",
        "ms",
        "nickname",
        "on",
        "ping",
        "profile",
        "recorded",
        "reported",
        "saved",
        "server",
        "session",
        "spawn",
        "to",
        "token",
        "user",
        "uuid",
        "verified",
    }
)
SHAPE_PLACEHOLDERS = frozenset(
    {"email", "endpoint", "id", "nickname", "n", "path", "profile", "profile_id", "text", "token", "url"}
)
SHAPE_WORD_RE = re.compile(r"[^\W\d_][\w-]*", re.UNICODE)


def sanitized_shape(raw: bytes) -> str:
    """Sanitize and normalize raw log messages for privacy-safe aggregate shape reporting.

    Replaces URLs, network endpoints (IPv4/IPv6), emails, file paths (UNC/drive),
    unique identifiers, session tokens, profile IDs, nicknames, strings, and numeric
    values with standardized placeholders.
    """
    text = raw.decode("utf-8", "replace")
    text = re.sub(r"https?://\S+|wss?://\S+", "<URL>", text, flags=re.I)
    text = re.sub(r"\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b", "<ENDPOINT>", text)
    text = re.sub(r"\[[0-9a-f:]{2,45}\](?::\d+)?", "<ENDPOINT>", text, flags=re.I)
    text = re.sub(r"\b(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?::\d+)?\b", "<ENDPOINT>", text, flags=re.I)
    text = re.sub(r"[^\s@]+@[^\s@]+\.[A-Za-z]{2,}", "<EMAIL>", text)
    text = re.sub(r"\\\\[^\s\\]+(?:\\\S+)?", "<PATH>", text)
    text = re.sub(r"[A-Za-z]:\\\S+", "<PATH>", text)
    text = re.sub(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", "<ID>", text, flags=re.I)
    text = re.sub(r"\b[0-9a-f]{8}-[0-9a-f-]{27,}\b", "<ID>", text, flags=re.I)
    text = re.sub(r"\b[0-9a-f]{16,}\b", "<ID>", text, flags=re.I)
    text = re.sub(r"\b(?=[A-Za-z0-9_-]{20,}\b)(?=.*\d)[A-Za-z0-9_-]+", "<TOKEN>", text)
    text = re.sub(r"\[[^\]\r\n]{1,200}\|[^\]\r\n]{1,200}\|Profile\]", "[<PROFILE_ID>|<NICKNAME>|Profile]", text, flags=re.I)
    text = re.sub(r"(?i)(Create corpse for)\s+\S+", r"\1 <NICKNAME>", text)
    text = re.sub(r"(?i)(?:nickname|killername|savagenickname)\s*[:=]\s*\S+", "Nickname:<NICKNAME>", text)
    text = re.sub(r'"(?:\\.|[^"\\])*"', '"<TEXT>"', text)
    text = re.sub(r"'(?:\\.|[^'\\])*'", "'<TEXT>'", text)
    text = re.sub(r"\b\d+(?:\.\d+)*(?:[eE][+-]?\d+)?\b", "<N>", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = SHAPE_WORD_RE.sub(
        lambda match: match.group(0)
        if match.group(0).casefold() in SAFE_SHAPE_WORDS
        or match.group(0).casefold() in SHAPE_PLACEHOLDERS
        else "<TEXT>",
        text,
    )
    return text[:500]


def session_version(path: Path) -> str:
    """Extract the game version string from the parent session directory name."""
    match = VERSION_RE.search(path.parent.name)
    return match.group(1) if match else "unparsed"


def directory_version(path: Path) -> str:
    """Extract the game version string from a session directory name."""
    match = VERSION_RE.search(path.name)
    return match.group(1) if match else "unparsed"


def filename_channel(path: Path) -> str:
    """Extract the logical channel name from a log filename."""
    stem = path.stem
    version_match = re.search(r"\d+\.\d+\.\d+\.\d+\.\d+", stem)
    channel = stem[version_match.end():].lstrip(" _-") if version_match else stem
    return re.sub(r"_\d+$", "", channel)


def normalize_endpoint(raw: bytes) -> str:
    """Normalize dynamic identifiers in API endpoints to generic <ID> placeholders."""
    text = raw.decode("ascii", "ignore").rstrip(".,;:)]}")
    text = re.sub(
        r"/(?:[0-9a-f]{16,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f-]{15,})(?=/|$)",
        "/<ID>",
        text,
        flags=re.I,
    )
    text = re.sub(r"/\d{4,}(?=/|$)", "/<ID>", text)
    return text.rstrip("/") or "/"


def normalize_documented_endpoint(text: str) -> str:
    """Normalize angle-bracket placeholders in documented endpoint paths to <ID>."""
    text = re.sub(r"<[^>]+>", "<ID>", text)
    return text.rstrip("/") or "/"


def sorted_versions(values: collections.abc.Iterable[str]) -> list[str]:
    """Sort version strings chronologically/semantically by dot-separated numeric tuple."""
    def key(value: str):
        """Map version string to tuple of integers for sorting."""
        try:
            return tuple(int(part) for part in value.split("."))
        except ValueError:
            return (10**9, value)
    return sorted(values, key=key)


def main() -> None:
    """Parse command-line arguments and run the EFT log audit pipeline."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--main-root", type=Path, required=True)
    parser.add_argument("--arena-root", type=Path, required=True)
    parser.add_argument("--reference", type=Path)
    parser.add_argument(
        "--section",
        choices=("all", "corpus", "channels", "modes", "signatures", "endpoints", "notifications", "arena", "shapes"),
        default="all",
    )
    parser.add_argument("--channels", default="")
    parser.add_argument("--out", type=Path, help="Write the JSON report to this file instead of stdout")
    args = parser.parse_args()
    scan_signatures = args.section in {"all", "signatures"}
    scan_endpoints = args.section in {"all", "endpoints"}
    scan_notifications = args.section in {"all", "notifications"}
    scan_arena_tokens = args.section in {"all", "arena"}
    shape_channels = {value.strip().lower() for value in args.channels.split(",") if value.strip()}
    scan_shapes = args.section == "shapes"

    roots = [("main", args.main_root), ("arena", args.arena_root)]
    files: list[tuple[str, Path]] = []
    missing_roots: list[str] = []
    for game, root in roots:
        if root.is_dir():
            files.extend((game, path) for path in root.rglob("*.log"))
        else:
            missing_roots.append(game)
            sys.stderr.write(f"Warning: root directory for '{game}' not found or not a directory\n")

    version_sessions: dict[tuple[str, str], set[Path]] = collections.defaultdict(set)
    channel_files: collections.Counter[tuple[str, str, str]] = collections.Counter()
    canonical: collections.Counter[tuple[str, str]] = collections.Counter()
    versionless: collections.Counter[tuple[str, str]] = collections.Counter()
    continuations: collections.Counter[tuple[str, str]] = collections.Counter()
    malformed_prefix: collections.Counter[tuple[str, str]] = collections.Counter()
    session_modes: dict[Path, set[str]] = collections.defaultdict(set)
    session_signatures: dict[Path, set[tuple[str, str, str]]] = collections.defaultdict(set)
    session_endpoints: dict[Path, set[tuple[str, str]]] = collections.defaultdict(set)
    session_notifications: dict[Path, set[tuple[str, str]]] = collections.defaultdict(set)
    arena_fields: dict[Path, set[tuple[str, str]]] = collections.defaultdict(set)
    shapes: collections.Counter[tuple[str, str, str]] = collections.Counter()
    unreadable: collections.Counter[str] = collections.Counter()

    for game, path in files:
        version = session_version(path)
        session = path.parent
        file_channel = filename_channel(path)
        version_sessions[(game, version)].add(session)
        channel_files[(game, version, file_channel)] += 1
        if scan_shapes and shape_channels and file_channel.lower() not in shape_channels:
            continue
        try:
            with path.open("rb") as handle:
                for line in handle:
                    clean = line.rstrip(b"\r\n")
                    if not clean:
                        continue
                    envelope = VERSIONED_RE.match(clean)
                    if envelope:
                        embedded_version = envelope.group(1).decode("ascii", "ignore")
                        if re.fullmatch(r"\d+\.\d+\.\d+\.\d+\.\d+", embedded_version):
                            canonical[(game, version)] += 1
                            channel = envelope.group(3).decode("utf-8", "replace")
                        else:
                            legacy_envelope = VERSIONLESS_RE.match(clean)
                            versionless[(game, version)] += 1
                            channel = legacy_envelope.group(2).decode("utf-8", "replace")
                    else:
                        legacy_envelope = VERSIONLESS_RE.match(clean)
                        if legacy_envelope:
                            versionless[(game, version)] += 1
                            channel = legacy_envelope.group(2).decode("utf-8", "replace")
                        else:
                            continuations[(game, version)] += 1
                            channel = file_channel
                            if re.match(rb"^\d{4}-\d{2}-\d{2} ", clean):
                                malformed_prefix[(game, version)] += 1

                    lower = clean.lower()
                    if game == "arena":
                        session_modes[session].add("A")
                    else:
                        if b"session mode" in lower:
                            if b"pve" in lower:
                                session_modes[session].add("E")
                            if b"pvpseason" in lower or b"pvp season" in lower:
                                session_modes[session].add("S")
                            if b"regular" in lower:
                                session_modes[session].add("P")
                        if b"gw-pve" in lower or b"wsn-pve" in lower:
                            session_modes[session].add("E")
                        is_seasonal = any(
                            marker in lower for marker in (b"pvpseason", b"pvp season", b"pvp-season", b"pvp_season")
                        )
                        if is_seasonal:
                            session_modes[session].add("S")
                        if (b"gw-pvp" in lower or b"wsn-pvp" in lower) and not is_seasonal:
                            session_modes[session].add("P")

                    if scan_signatures:
                        for match in SIGNATURE_ANCHOR_RE.finditer(clean):
                            anchor = match.group(0).lower()
                            for label, any_of, all_of in ANCHOR_TO_SIGNATURES[anchor]:
                                if label == "http_crc" and not any(
                                    marker in lower for marker in HTTP_CRC_ENVELOPE_MARKERS
                                ):
                                    continue
                                if any(fragment in lower for fragment in any_of) and all(
                                    fragment in lower for fragment in all_of
                                ):
                                    session_signatures[session].add((label, channel, version))

                    if scan_endpoints and channel.lower() in {"backend", "output", "errors", "traces", "traces_all"} and (b"/client/" in lower or b"/router" in lower):
                        for match in ENDPOINT_RE.finditer(clean):
                            session_endpoints[session].add((normalize_endpoint(match.group(1)), version))

                    if scan_notifications and channel.lower() in {"push-notifications", "notifications", "output", "errors", "traces", "traces_all"} and b"notification" in lower:
                        for regex in (NOTIFICATION_RE, SERVICE_NOTIFICATION_RE):
                            for match in regex.finditer(clean):
                                marker = match.group(1).decode("ascii", "ignore")
                                session_notifications[session].add((marker, version))

                    if scan_arena_tokens and game == "arena":
                        for match in ARENA_EVENT_RE.finditer(clean):
                            arena_fields[session].add((match.group(1).decode("ascii", "ignore"), channel))

                    if scan_shapes and (not shape_channels or file_channel.lower() in shape_channels):
                        if envelope and re.fullmatch(rb"\d+\.\d+\.\d+\.\d+\.\d+", envelope.group(1)):
                            message = clean.split(b"|", 4)[4]
                        elif legacy_envelope:
                            message = clean.split(b"|", 3)[3]
                        else:
                            message = clean
                        shape = sanitized_shape(message)
                        if shape:
                            shapes[(game, file_channel, shape)] += 1
        except OSError as exc:
            unreadable[type(exc).__name__] += 1
            continue

    signature_evidence: dict[tuple[str, str, str], set[str]] = collections.defaultdict(set)
    endpoint_evidence: dict[tuple[str, str], set[str]] = collections.defaultdict(set)
    notification_evidence: dict[tuple[str, str], set[str]] = collections.defaultdict(set)
    for session, observations in session_signatures.items():
        modes = session_modes.get(session) or {"U"}
        for label, channel, version in observations:
            signature_evidence[(label, channel, version)].update(modes)
    for session, observations in session_endpoints.items():
        modes = session_modes.get(session) or {"U"}
        for endpoint, version in observations:
            endpoint_evidence[(endpoint, version)].update(modes)
    for session, observations in session_notifications.items():
        modes = session_modes.get(session) or {"U"}
        for marker, version in observations:
            notification_evidence[(marker, version)].update(modes)

    grouped_signatures: dict[str, dict[str, object]] = collections.defaultdict(
        lambda: {"channels": set(), "versions": collections.defaultdict(set)}
    )
    for (label, channel, version), modes in signature_evidence.items():
        grouped_signatures[label]["channels"].add(channel)
        grouped_signatures[label]["versions"][version].update(modes)
    grouped_endpoints: dict[str, dict[str, set[str]]] = collections.defaultdict(lambda: collections.defaultdict(set))
    for (endpoint, version), modes in endpoint_evidence.items():
        grouped_endpoints[endpoint][version].update(modes)
    grouped_notifications: dict[str, dict[str, set[str]]] = collections.defaultdict(lambda: collections.defaultdict(set))
    for (marker, version), modes in notification_evidence.items():
        grouped_notifications[marker][version].update(modes)

    result = {
        "corpus": {
            game: {
                "files": sum(1 for file_game, _ in files if file_game == game),
                "sessions": len({session for (g, _), sessions in version_sessions.items() if g == game for session in sessions}),
                "versions": [
                    {
                        "version": version,
                        "sessions": len(version_sessions[(game, version)]),
                        "versioned_records": canonical[(game, version)],
                        "versionless_records": versionless[(game, version)],
                        "continuation_lines": continuations[(game, version)],
                        "timestamp_prefixed_noncanonical": malformed_prefix[(game, version)],
                    }
                    for version in sorted_versions(version for g, version in version_sessions if g == game)
                ],
            }
            for game, _ in roots
        },
        "unreadable_files": dict(unreadable),
        "corpus_status": "incomplete" if missing_roots or unreadable else "complete",
        "missing_roots": sorted(missing_roots),
        "channels": [
            {
                "game": game,
                "channel": channel,
                "versions": {
                    version: channel_files[(game, version, channel)]
                    for version in sorted_versions({v for g, v, c in channel_files if g == game and c == channel})
                },
            }
            for game, channel in sorted({(g, c) for g, _, c in channel_files})
        ],
        "mode_session_counts": [
            {"game": game, "version": version, "mode": mode, "sessions": count}
            for (game, version, mode), count in sorted(
                collections.Counter(
                    ("arena" if "A" in modes else "main", directory_version(session), mode)
                    for session, modes in session_modes.items()
                    for mode in modes
                ).items()
            )
        ],
        "signatures": [
            {
                "event": label,
                "channels": sorted(data["channels"]),
                "versions": {version: "".join(sorted(data["versions"][version])) for version in sorted_versions(data["versions"])},
            }
            for label, data in sorted(grouped_signatures.items())
        ],
        "endpoints": [
            {"path": endpoint, "evidence": [{"version": version, "modes": "".join(sorted(per_version[version]))} for version in sorted_versions(per_version)]}
            for endpoint, per_version in sorted(grouped_endpoints.items())
        ],
        "notifications": [
            {"marker": marker, "evidence": [{"version": version, "modes": "".join(sorted(per_version[version]))} for version in sorted_versions(per_version)]}
            for marker, per_version in sorted(grouped_notifications.items())
        ],
        "arena_structured_event_tokens": [
            {"token": token, "channel": channel, "versions": sorted_versions({directory_version(session) for session, values in arena_fields.items() if (token, channel) in values})}
            for token, channel in sorted({value for values in arena_fields.values() for value in values})
        ],
        "shapes": [
            {"game": game, "channel": channel, "examples": [{"count": count, "shape": shape} for shape, count in collections.Counter({s: c for (g, ch, s), c in shapes.items() if g == game and ch == channel}).most_common(25)]}
            for game, channel in sorted({(g, ch) for g, ch, _ in shapes})
        ],
    }
    if args.section == "endpoints" and args.reference:
        if not args.reference.is_file():
            raise SystemExit("Reference file not found")
        reference_text = args.reference.read_text(encoding="utf-8")
        start_anchor = "#### Complete observed endpoint inventory"
        if start_anchor not in reference_text:
            raise SystemExit(f"Reference file has no '{start_anchor}' section")
        endpoint_section = reference_text.split(start_anchor, 1)[1].split("### `backendCache`", 1)[0]
        documented_paths = {
            normalize_documented_endpoint(value)
            for value in re.findall(r"`((?:/v2)?/client/[^`?]+|/router)(?:\?[^`]*)?`", endpoint_section)
        }
        current_paths = set(grouped_endpoints)
        result["endpoint_delta"] = {
            "shared_count": len(documented_paths & current_paths),
            "added_current": {
                path: {version: "".join(sorted(grouped_endpoints[path][version])) for version in sorted_versions(grouped_endpoints[path])}
                for path in sorted(current_paths - documented_paths)
            },
            "historical_not_current": sorted(documented_paths - current_paths),
        }
    section_keys = {
        "corpus": ("corpus", "corpus_status", "missing_roots", "unreadable_files"),
        "channels": ("channels",),
        "modes": ("mode_session_counts",),
        "signatures": ("signatures",),
        "endpoints": ("endpoint_delta",) if args.reference else ("endpoints",),
        "notifications": ("notifications",),
        "arena": ("arena_structured_event_tokens",),
        "shapes": ("shapes",),
    }
    if args.section != "all":
        result = {key: result[key] for key in section_keys[args.section]}
    payload = json.dumps(result, indent=2, sort_keys=False)
    if args.out:
        args.out.write_text(payload + "\n", encoding="utf-8")
    else:
        print(payload)


if __name__ == "__main__":
    main()
