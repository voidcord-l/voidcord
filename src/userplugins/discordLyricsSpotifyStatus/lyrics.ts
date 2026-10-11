import type { LyricLine } from "./types";

const BASE_URL = "https://lrclib.net/api";
const cache = new Map<string, LyricLine[] | null>();

let cspRequested = false;
let debugEnabled = false;

function debugLog(message: string, extra?: unknown) {
    if (!debugEnabled) return;
    extra === undefined
        ? console.info(`[DiscordLyricsSpotifyStatus] ${message}`)
        : console.info(`[DiscordLyricsSpotifyStatus] ${message}`, extra);
}

export function setLyricsDebugMode(enabled: boolean) { debugEnabled = enabled; }

export function clearLyricsCache(trackId?: string) {
    if (trackId) { cache.delete(trackId); return; }
    cache.clear();
}

function cacheAndReturn(trackId: string, value: LyricLine[] | null) {
    cache.set(trackId, value);
    return value;
}

export async function initLyricsNetworkAccess() {
    if (cspRequested) return;
    cspRequested = true;
    const url = "https://lrclib.net";
    const directives = ["connect-src"];
    try {
        const allowed = await VencordNative.csp.isDomainAllowed(url, directives);
        if (!allowed) {
            const result = await VencordNative.csp.requestAddOverride(url, directives, "DiscordLyricsSpotifyStatus");
            if (result === "ok") console.info("[DiscordLyricsSpotifyStatus] CSP granted for lrclib.net. Restart Discord to apply.");
        }
    } catch {
        // VencordNative.csp may not exist in all Equicord builds — fetch will fail gracefully if CSP blocks
    }
}

function parseLrc(lrc: string): LyricLine[] {
    const lines: LyricLine[] = [];
    const regex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)$/;
    for (const rawLine of lrc.split("\n")) {
        const match = rawLine.trim().match(regex);
        if (!match) continue;
        const [, mm, ss, cs, text] = match;
        const ms = parseInt(mm, 10) * 60_000 + parseInt(ss, 10) * 1_000
            + (cs.length === 3 ? parseInt(cs, 10) : parseInt(cs, 10) * 10);
        lines.push({ timeMs: ms, text: text.trim() });
    }
    return lines.sort((a, b) => a.timeMs - b.timeMs);
}

// Spotify formats featured artists as "Main, Feat1, Feat2" — lrclib stores "Main feat. Feat1"
// Strip everything after the first artist for a cleaner query
function primaryArtist(artistName: string): string {
    return artistName.split(/,|\s+feat\.|\s+ft\./i)[0].trim();
}

async function fetchSynced(trackName: string, artistName: string, albumName: string, durationMs: number): Promise<string | null> {
    // Try exact match first (/get), then fuzzy search (/search)
    const attempts: { endpoint: string; params: URLSearchParams; }[] = [
        {
            endpoint: "get",
            params: new URLSearchParams({
                track_name: trackName,
                artist_name: primaryArtist(artistName),
                ...(albumName ? { album_name: albumName } : {}),
                ...(durationMs > 0 ? { duration: Math.round(durationMs / 1000).toString() } : {}),
            }),
        },
        {
            endpoint: "search",
            params: new URLSearchParams({ track_name: trackName, artist_name: primaryArtist(artistName) }),
        },
        {
            endpoint: "search",
            params: new URLSearchParams({ track_name: trackName }),
        },
    ];

    for (const { endpoint, params } of attempts) {
        const res = await fetch(`${BASE_URL}/${endpoint}?${params}`);
        if (res.status === 404) continue;
        if (!res.ok) throw new Error(`LRCLIB HTTP ${res.status}`);
        const data = await res.json();

        if (endpoint === "search") {
            // /search returns array — pick first result with syncedLyrics
            const hit = (Array.isArray(data) ? data : []).find((r: any) => r?.syncedLyrics);
            if (hit?.syncedLyrics) return hit.syncedLyrics;
        } else {
            if (data?.syncedLyrics) return data.syncedLyrics;
        }
    }
    return null;
}

export async function getLyrics(
    trackId: string,
    trackName: string,
    artistName: string,
    albumName = "",
    durationMs = 0,
    forceRefresh = false,
): Promise<LyricLine[] | null> {
    if (forceRefresh) cache.delete(trackId);
    if (cache.has(trackId)) return cache.get(trackId) ?? null;
    try {
        const syncedLyrics = await fetchSynced(trackName, artistName, albumName, durationMs);
        if (!syncedLyrics) return cacheAndReturn(trackId, null);

        const lines = parseLrc(syncedLyrics);
        debugLog("Lyrics loaded", { trackId, lines: lines.length, artist: primaryArtist(artistName) });
        return cacheAndReturn(trackId, lines);
    } catch (err: any) {
        if (err?.message?.includes("CSP") || err?.message?.includes("net::ERR_BLOCKED")) {
            console.warn("[DiscordLyricsSpotifyStatus] lrclib.net blocked by CSP. Go to Equicord Settings → CSP and add https://lrclib.net (connect-src).");
        } else {
            debugLog("Fetch error", err?.message);
        }
        return cacheAndReturn(trackId, null);
    }
}
