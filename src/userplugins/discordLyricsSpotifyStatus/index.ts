/*
 * Discord Lyrics Spotify Status — Equicord userplugin
 * Author: Naxiwow — https://github.com/Naxiwow
 * Based on original work by Tona Shiin — https://github.com/Shiin2ii
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

import { clearLyricsCache, getLyrics, initLyricsNetworkAccess, setLyricsDebugMode } from "./lyrics";
import { LyricScheduler } from "./scheduler";
import { getCurrentTrack } from "./spotify";
import { clearCustomStatus, resetStatusCache, setCustomStatus, setStatusDebugMode } from "./status";
import type { LyricLine, SpotifyTrackState } from "./types";

// ── Constants ──────────────────────────────────────────────────────────────────
const BOOST_POLL_INTERVAL_MS = 180;
const TRACK_SWITCH_BOOST_WINDOW_MS = 3_000;
const SEEK_THRESHOLD_MS = 2_000;
const MIN_LYRIC_LENGTH = 2;

// Patterns treated as instrumental (silent) sections
const INSTRUMENTAL_RE = /^(\[.*\]|♪+|🎵+|\s*)$/i;

// ── Settings ───────────────────────────────────────────────────────────────────
const settings = definePluginSettings({
    lyricPrefix: {
        type: OptionType.STRING,
        description: "Prefix shown before each lyric line (emoji or text). Leave empty for none.",
        default: "♪",
        restartNeeded: false,
    },
    fallbackTrackText: {
        type: OptionType.BOOLEAN,
        description: "Show track name when synced lyrics are unavailable",
        default: true,
        restartNeeded: false,
    },
    cleanInstrumentals: {
        type: OptionType.BOOLEAN,
        description: "Replace empty/instrumental sections with just the prefix instead of showing garbage",
        default: true,
        restartNeeded: false,
    },
    clearOnStop: {
        type: OptionType.BOOLEAN,
        description: "Clear custom status when Spotify pauses or plugin stops",
        default: true,
        restartNeeded: false,
    },
    pollIntervalMs: {
        type: OptionType.SLIDER,
        description: "Poll interval (ms) — lower = more accurate, higher = lighter on resources",
        markers: [250, 500, 750, 1000, 1500, 2000],
        default: 500,
        stickToMarkers: true,
        restartNeeded: false,
    },
    trackSwitchBoost: {
        type: OptionType.BOOLEAN,
        description: "Temporarily poll faster for 3s after a track switch",
        default: true,
        restartNeeded: false,
    },
    syncOffsetMs: {
        type: OptionType.SLIDER,
        description: "Sync offset (ms) — increase if lyrics appear too late, decrease if too early",
        markers: [0, 100, 200, 300, 400, 500, 750, 1000],
        default: 250,
        stickToMarkers: false,
        restartNeeded: false,
    },
    forceRefreshOnTrackSwitch: {
        type: OptionType.BOOLEAN,
        description: "Bypass lyrics cache when switching tracks",
        default: true,
        restartNeeded: false,
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Detailed debug logs in console",
        default: false,
        restartNeeded: false,
    },
});

// ── Runtime state ──────────────────────────────────────────────────────────────
let currentTrackId: string | null = null;
let scheduler: LyricScheduler | null = null;
let lastProgressMs = 0;
let lastPollTime = 0;
let pollTimer: number | null = null;
let pollingActive = false;
let trackLoadToken = 0;
let boostUntilMs = 0;

// ── Helpers ────────────────────────────────────────────────────────────────────
function debugLog(msg: string, extra?: unknown) {
    if (!settings.store.debugMode) return;
    extra === undefined
        ? console.info(`[LyricsStatus] ${msg}`)
        : console.info(`[LyricsStatus] ${msg}`, extra);
}

function getPrefix(): string {
    const p = settings.store.lyricPrefix?.trim() ?? "";
    return p ? `${p} ` : "";
}

function normalizeLyricLine(line: LyricLine): string {
    const raw = line.text?.trim() ?? "";

    // Instrumental / empty section
    if (settings.store.cleanInstrumentals && INSTRUMENTAL_RE.test(raw)) {
        return settings.store.lyricPrefix?.trim() || "♪";
    }

    if (raw.length < MIN_LYRIC_LENGTH) {
        return settings.store.lyricPrefix?.trim() || "♪";
    }

    return `${getPrefix()}${raw}`.slice(0, 128);
}

function getNextPollDelayMs() {
    const base = settings.store.pollIntervalMs ?? 500;
    if (!settings.store.trackSwitchBoost) return base;
    return Date.now() < boostUntilMs ? BOOST_POLL_INTERVAL_MS : base;
}

function stopScheduler() {
    if (!scheduler) return;
    scheduler.stop();
    scheduler = null;
}

function onLineChange(line: LyricLine) {
    setCustomStatus(normalizeLyricLine(line));
}

function resetRuntimeState() {
    currentTrackId = null;
    lastProgressMs = 0;
    lastPollTime = 0;
    trackLoadToken = 0;
    boostUntilMs = 0;
}

function setFallbackTrackStatus(track: SpotifyTrackState) {
    if (!settings.store.fallbackTrackText) { clearCustomStatus(); return; }
    const prefix = getPrefix();
    // Artist separator · is cleaner than -
    setCustomStatus(`${prefix}${track.trackName} · ${track.artistName}`.slice(0, 128));
}

function shouldIgnore(loadToken: number, trackId: string) {
    return loadToken !== trackLoadToken || currentTrackId !== trackId;
}

// ── Core logic ─────────────────────────────────────────────────────────────────
async function handleTrackChange(track: SpotifyTrackState, now: number) {
    debugLog("Track changed", { from: currentTrackId, to: track.trackId, name: track.trackName });

    currentTrackId = track.trackId;
    const loadToken = ++trackLoadToken;
    const requestStartedAt = Date.now();

    if (settings.store.trackSwitchBoost) boostUntilMs = now + TRACK_SWITCH_BOOST_WINDOW_MS;

    stopScheduler();
    setFallbackTrackStatus(track);

    const lyrics = await getLyrics(
        track.trackId,
        track.trackName,
        track.artistName,
        track.albumName,
        track.durationMs,
        settings.store.forceRefreshOnTrackSwitch,
    );

    const liveTrack = getCurrentTrack();
    if (!liveTrack?.isPlaying || liveTrack.trackId !== track.trackId) {
        debugLog("Dropping lyrics — track changed during fetch");
        return;
    }
    if (shouldIgnore(loadToken, track.trackId)) {
        debugLog("Ignoring stale lyric response");
        return;
    }
    if (!lyrics?.length) {
        debugLog("No synced lyrics found, keeping fallback");
        return;
    }

    const rawProgress = liveTrack.progressMs || (track.progressMs + (Date.now() - requestStartedAt));
    const freshProgressMs = rawProgress + (settings.store.syncOffsetMs ?? 250);
    scheduler = new LyricScheduler(lyrics, onLineChange);
    scheduler.start(freshProgressMs);
    debugLog("Scheduler started", { lines: lyrics.length, progress: freshProgressMs });
}

function syncSchedulerDrift(track: SpotifyTrackState, now: number) {
    if (!scheduler || lastPollTime <= 0) return;
    const drift = Math.abs(track.progressMs - (lastProgressMs + (now - lastPollTime)));
    if (drift <= SEEK_THRESHOLD_MS) return;
    debugLog("Drift detected, resyncing", { drift, progress: track.progressMs });
    scheduler.restart(track.progressMs + (settings.store.syncOffsetMs ?? 250));
}

async function poll() {
    const track = getCurrentTrack();
    const now = Date.now();

    if (!track?.isPlaying) {
        if (currentTrackId !== null) {
            stopScheduler();
            currentTrackId = null;
            if (settings.store.clearOnStop) clearCustomStatus();
        }
        lastPollTime = now;
        return;
    }

    if (track.trackId !== currentTrackId) {
        void handleTrackChange(track, now);
    } else {
        syncSchedulerDrift(track, now);
    }

    lastProgressMs = track.progressMs;
    lastPollTime = now;
}

function startPolling() {
    stopPolling();
    resetRuntimeState();
    stopScheduler();
    resetStatusCache();
    applyDebugSettings();
    pollingActive = true;

    const loop = async () => {
        if (!pollingActive) return;
        await poll();
        if (!pollingActive) return;
        pollTimer = window.setTimeout(() => void loop(), getNextPollDelayMs());
    };

    void loop();
}

function stopPolling() {
    pollingActive = false;
    if (pollTimer !== null) { window.clearTimeout(pollTimer); pollTimer = null; }
}

function applyDebugSettings() {
    setLyricsDebugMode(settings.store.debugMode);
    setStatusDebugMode(settings.store.debugMode);
}

function forceRefresh() {
    if (!currentTrackId) return;
    clearLyricsCache(currentTrackId);
    trackLoadToken++;
    currentTrackId = null;
    void poll();
}

// ── Plugin ─────────────────────────────────────────────────────────────────────
export default definePlugin({
    name: "DiscordLyricsSpotifyStatus",
    description: "Shows synced Spotify lyrics as your Discord custom status in real time — by Naxiwow (github.com/Naxiwow)",
    tags: ["Spotify", "Lyrics", "Status", "Music"],
    authors: [
        { name: "Naxiwow", id: 875342291001278504n },
    ],
    settings,
    requiresRestart: false,

    start() {
        void initLyricsNetworkAccess();
        (globalThis as any).discordLyricsSpotifyStatusForceRefresh = forceRefresh;
        startPolling();
    },

    stop() {
        stopPolling();
        stopScheduler();
        currentTrackId = null;
        trackLoadToken++;
        delete (globalThis as any).discordLyricsSpotifyStatusForceRefresh;
        if (settings.store.clearOnStop) clearCustomStatus();
    },
});
