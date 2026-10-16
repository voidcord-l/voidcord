/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { Activity } from "@vencord/discord-types";
import { ActivityType } from "@vencord/discord-types/enums";
import { ApplicationAssetUtils, FluxDispatcher, Forms, React, TextInput } from "@webpack/common";

const logger = new Logger("TraktUserPlugin");

const TRAKT_APP_ID = "1444225620207730688";

const settings = definePluginSettings({
    traktClientId: {
        type: OptionType.STRING,
        description: "Trakt client ID",
    },
    traktClientSecret: {
        type: OptionType.STRING,
        description: "Trakt client secret (stored locally, do not share)",
    },
    traktUsername: {
        type: OptionType.STRING,
        description: "Trakt username",
    },
    enableOAuth: {
        type: OptionType.BOOLEAN,
        description: "Use OAuth to access your Trakt account (recommended)",
        default: false,
    },
    traktAccessToken: {
        type: OptionType.STRING,
        description: "Trakt OAuth access token (set automatically when using OAuth)",
    },
    traktRefreshToken: {
        type: OptionType.STRING,
        description: "Trakt OAuth refresh token (set automatically when using OAuth)",
    },
    traktRefreshTokenExpiresAt: {
        type: OptionType.STRING,
        description: "UNIX timestamp when refresh token expires (set automatically)",
    },
    tmdbToken: {
        type: OptionType.STRING,
        description: "TMDB API key for posters",
    },
    useHistoryFallback: {
        type: OptionType.BOOLEAN,
        description: "If /watching is empty, use recent /sync/history scrobble as presence",
        default: false,
    },
    historyMaxAgeMinutes: {
        type: OptionType.SLIDER,
        description: "Maximum age (in minutes) of last scrobble to count as 'currently watching'",
        markers: [5, 10, 15, 30, 60, 120],
        default: 30,
        stickToMarkers: true,
    },
    pollingInterval: {
        type: OptionType.SLIDER,
        description: "Polling interval in seconds",
        markers: [15, 20, 30, 45, 60],
        default: 15,
        stickToMarkers: true,
    },
});

interface TraktIds {
    trakt: number;
    slug?: string;
    tvdb?: number;
    imdb?: string;
    tmdb?: number;
    tvrage?: number;
}

interface TraktMovie {
    title: string;
    year: number;
    ids: TraktIds;
}

interface TraktShow {
    title: string;
    year: number;
    ids: TraktIds;
}

interface TraktEpisode {
    season: number;
    number: number;
    title: string;
    ids: TraktIds;
}

interface TraktWatchingResponse {
    expires_at: string;
    started_at: string;
    action: string;
    type: string;
    movie?: TraktMovie;
    show?: TraktShow;
    episode?: TraktEpisode;
}

interface TraktAccessTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    scope: string;
    created_at: number;
}

let interval: number | null = null;
const imageCache = new Map<string, string>();

async function getApplicationAsset(key: string): Promise<string> {
    return (await ApplicationAssetUtils.fetchAssetIds(TRAKT_APP_ID, [key]))[0];
}

const OAUTH_REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";
const THREE_MONTHS_SECONDS = 60 * 60 * 24 * 30 * 3;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
    try {
        const res = await fetch(url, init);
        // 204 No Content is expected for "not watching"; just return null silently
        if (res.status === 204 && url.includes("/watching")) {
            return null;
        }

        if (!res.ok) {
            logger.warn("HTTP", res.status, "for", url);

            try {
                const text = await res.text();
                if (text) logger.debug("Body for", url, "->", text);
            } catch { }

            return null;
        }

        try {
            return await res.json();
        } catch (e) {
            logger.error("Failed to parse JSON for", url, e);
            return null;
        }
    } catch (e) {
        logger.error("Network error for", url, e);
        return null;
    }
}

async function getWatching(): Promise<TraktWatchingResponse | null> {
    const cfg = settings.store;
    if (!cfg.traktClientId || !cfg.traktUsername) return null;

    const url = `https://api.trakt.tv/users/${encodeURIComponent(cfg.traktUsername)}/watching`;
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": cfg.traktClientId,
    };
    if (cfg.traktAccessToken) headers.Authorization = `Bearer ${cfg.traktAccessToken}`;

    return fetchJson<TraktWatchingResponse>(url, { headers });
}

interface TraktHistoryItem {
    id: number;
    watched_at: string;
    action: string;
    type: "movie" | "episode";
    movie?: TraktMovie;
    show?: TraktShow;
    episode?: TraktEpisode;
}

async function getLastHistoryItem(): Promise<TraktHistoryItem | null> {
    const cfg = settings.store as any;
    if (!cfg.traktClientId || !cfg.traktAccessToken) return null;

    const url = "https://api.trakt.tv/sync/history?limit=1";
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": cfg.traktClientId,
        Authorization: `Bearer ${cfg.traktAccessToken}`,
    };

    const items = await fetchJson<TraktHistoryItem[]>(url, { headers });
    if (!items || !items.length) return null;
    return items[0];
}

function getNowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

function checkOAuth() {
    const cfg = settings.store as any;

    if (!cfg.enableOAuth) return;

    if (!cfg.traktAccessToken || !cfg.traktRefreshToken) {
        logger.info("No OAuth tokens found, please authorize Trakt in plugin settings.");
        return;
    }

    const refreshExpiresAt = cfg.traktRefreshTokenExpiresAt ? Number(cfg.traktRefreshTokenExpiresAt) : null;
    if (!refreshExpiresAt) {
        logger.warn("No refresh token expiry stored, skipping automatic refresh.");
        return;
    }

    const now = getNowSeconds();
    if (now >= refreshExpiresAt) {
        logger.info("Trakt refresh token expired, please re-authorize.");
        return;
    }

    logger.info("Refreshing Trakt access token using refresh token");
    exchangeRefreshTokenForAccessToken();
}

export async function authorizeApp() {
    const cfg = settings.store as any;
    if (!cfg.traktClientId || !cfg.traktClientSecret) {
        logger.warn("traktClientId or traktClientSecret missing, cannot start OAuth flow");
        return;
    }

    const url = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${encodeURIComponent(cfg.traktClientId)}&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}`;

    window.open(url, "_blank");
    logger.info("Opened Trakt OAuth authorization page in browser. Paste the code into the plugin settings after authorizing.");
}

export async function exchangeCodeForAccessToken(code: string) {
    const cfg = settings.store as any;
    if (!cfg.traktClientId || !cfg.traktClientSecret) {
        logger.warn("traktClientId or traktClientSecret missing, cannot exchange code");
        return;
    }

    logger.info("Exchanging Trakt authorization code for access token");

    const body = {
        code,
        client_id: cfg.traktClientId,
        client_secret: cfg.traktClientSecret,
        redirect_uri: OAUTH_REDIRECT_URI,
        grant_type: "authorization_code",
    };

    const res = await fetchJson<TraktAccessTokenResponse>("https://api.trakt.tv/oauth/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    if (!res) {
        logger.error("Failed to exchange Trakt authorization code for tokens");
        return;
    }

    const now = getNowSeconds();
    const refreshExpiresAt = now + THREE_MONTHS_SECONDS;

    cfg.traktAccessToken = res.access_token;
    cfg.traktRefreshToken = res.refresh_token;
    cfg.traktRefreshTokenExpiresAt = String(refreshExpiresAt);

    logger.info("Stored Trakt OAuth access & refresh tokens.");
}

async function exchangeRefreshTokenForAccessToken() {
    const cfg = settings.store as any;

    const refreshToken = cfg.traktRefreshToken as string | undefined;
    if (!refreshToken) {
        logger.warn("No Trakt refresh token available, cannot refresh");
        return;
    }

    if (!cfg.traktClientId || !cfg.traktClientSecret) {
        logger.warn("traktClientId or traktClientSecret missing, cannot refresh token");
        return;
    }

    logger.info("Attempting to refresh Trakt OAuth access token");

    const body = {
        refresh_token: refreshToken,
        client_id: cfg.traktClientId,
        client_secret: cfg.traktClientSecret,
        redirect_uri: OAUTH_REDIRECT_URI,
        grant_type: "refresh_token",
    };

    const res = await fetchJson<TraktAccessTokenResponse>("https://api.trakt.tv/oauth/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    if (!res) {
        logger.error("Failed to refresh Trakt access token. You may need to re-authorize.");
        return;
    }

    const now = getNowSeconds();
    const refreshExpiresAt = now + THREE_MONTHS_SECONDS;

    cfg.traktAccessToken = res.access_token;
    cfg.traktRefreshToken = res.refresh_token;
    cfg.traktRefreshTokenExpiresAt = String(refreshExpiresAt);

    logger.info("Successfully refreshed Trakt OAuth access token.");
}

const OAuthSettingsComponent = () => {
    const cfg = settings.use();
    const [code, setCode] = React.useState("");

    const hasTokens = Boolean(cfg.traktAccessToken && cfg.traktRefreshToken);

    const handleOpenAuth = () => {
        authorizeApp();
    };

    const handleSubmitCode = async () => {
        const trimmed = code.trim();
        if (!trimmed) return;
        await exchangeCodeForAccessToken(trimmed);
        setCode("");
    };

    return React.createElement(
        Forms.FormSection,
        { title: "Trakt OAuth" },
        React.createElement(
            Forms.FormText,
            null,
            "1. Fill in your Trakt Client ID, Client Secret and Username above."
        ),
        React.createElement(
            Forms.FormText,
            null,
            '2. Click "Open Trakt auth page" and approve access.'
        ),
        React.createElement(
            Forms.FormText,
            null,
            '3. Paste the shown code here and click "Exchange code".'
        ),
        React.createElement(Forms.FormDivider, null),
        React.createElement(
            Forms.FormText,
            {
                onClick: handleOpenAuth,
                style: { cursor: "pointer", color: "var(--text-link)" },
            } as any,
            "Open Trakt auth page"
        ),
        React.createElement(Forms.FormDivider, null),
        React.createElement(TextInput, {
            value: code,
            onChange: setCode,
            placeholder: "Paste Trakt authorization code",
        }),
        React.createElement(
            Forms.FormText,
            {
                onClick: handleSubmitCode,
                style: {
                    cursor: code.trim() ? "pointer" : "not-allowed",
                    color: code.trim() ? "var(--text-link)" : "var(--text-muted)",
                    marginTop: 8,
                },
            } as any,
            "Exchange code"
        ),
        React.createElement(Forms.FormDivider, null),
        React.createElement(
            Forms.FormText,
            {
                onClick: () => {
                    if (!hasTokens) return;
                    logger.info(
                        `Access token: ${cfg.traktAccessToken ? "present" : "missing"}, ` +
                        `Refresh token: ${cfg.traktRefreshToken ? "present" : "missing"}, ` +
                        `Expiry: ${cfg.traktRefreshTokenExpiresAt || "unknown"}`
                    );
                },
                style: {
                    cursor: hasTokens ? "pointer" : "not-allowed",
                    color: hasTokens ? "var(--text-link)" : "var(--text-muted)",
                },
            } as any,
            "Show token status (logs to console)"
        )
    );
};

async function getPosterUrl(type: "movie" | "show" | "episode", tmdbId?: number, season?: number, episode?: number): Promise<string | null> {
    if (!tmdbId) return null;

    const cacheKey = `${type}:${tmdbId}:${season ?? "-"}:${episode ?? "-"}`;
    const cached = imageCache.get(cacheKey);
    if (cached) return cached;

    const cfg = settings.store;
    if (!cfg.tmdbToken) return null;

    const base = "https://api.themoviedb.org/3";
    let url: string;

    if (type === "movie") {
        url = `${base}/movie/${tmdbId}/images?api_key=${encodeURIComponent(cfg.tmdbToken)}`;
    } else if (type === "episode" && season != null && episode != null) {
        url = `${base}/tv/${tmdbId}/season/${season}/episode/${episode}/images?api_key=${encodeURIComponent(cfg.tmdbToken)}`;
    } else {
        url = `${base}/tv/${tmdbId}/images?api_key=${encodeURIComponent(cfg.tmdbToken)}`;
    }

    const data = await fetchJson<any>(url);
    let posters: any[] =
        (data && Array.isArray(data.posters) && data.posters) ||
        (data && Array.isArray(data.stills) && data.stills) ||
        [];

    // Fallback: if we requested a show-wide or episode poster and got none,
    // try season-level images before giving up.
    if (!posters.length && type !== "movie" && season != null) {
        const seasonUrl = `${base}/tv/${tmdbId}/season/${season}/images?api_key=${encodeURIComponent(cfg.tmdbToken)}`;
        const seasonData = await fetchJson<any>(seasonUrl);
        posters =
            (seasonData && Array.isArray(seasonData.posters) && seasonData.posters) ||
            (seasonData && Array.isArray(seasonData.stills) && seasonData.stills) ||
            [];
    }

    if (!posters.length) return null;

    const filePath = posters[0].file_path;
    if (!filePath) return null;

    const imageUrl = `https://image.tmdb.org/t/p/w600_and_h600_bestv2${filePath}`;
    imageCache.set(cacheKey, imageUrl);
    return imageUrl;
}

async function createActivity(nowPlaying: TraktWatchingResponse, tmdbImageUrl: string | null): Promise<Activity> {
    const details = nowPlaying.movie
        ? nowPlaying.movie.title
        : nowPlaying.show && nowPlaying.episode
            ? nowPlaying.episode.title
            : "Watching on Trakt";

    const state = nowPlaying.movie
        ? undefined
        : nowPlaying.show && nowPlaying.episode
            ? `${nowPlaying.show.title} (S${nowPlaying.episode.season}:E${nowPlaying.episode.number})`
            : undefined;

    const timestamps: { start?: number; end?: number; } = {};
    try {
        const start = Date.parse(nowPlaying.started_at);
        const end = Date.parse(nowPlaying.expires_at);
        if (!Number.isNaN(start)) timestamps.start = Math.floor(start);
        if (!Number.isNaN(end)) timestamps.end = Math.floor(end);
    } catch { /* ignore */ }

    let assets: any = {};

    if (tmdbImageUrl) {
        try {
            assets.large_image = await getApplicationAsset(tmdbImageUrl);
            assets.large_text = details;
        } catch {
            // fall back below to static assets
        }
    }

    if (nowPlaying.show && nowPlaying.episode) {
        try {
            if (tmdbImageUrl && !assets.large_image) {
                assets.large_image = await getApplicationAsset(tmdbImageUrl);
                assets.large_text = `${nowPlaying.show.title} - ${nowPlaying.episode.title}`;
            }

            const showIds = nowPlaying.show.ids;
            const seasonNumber = nowPlaying.episode.season;

            if (showIds?.tmdb && seasonNumber != null) {
                const seasonPosterUrl = await getPosterUrl("show", showIds.tmdb, seasonNumber);
                if (seasonPosterUrl) {
                    assets.small_image = await getApplicationAsset(seasonPosterUrl);
                    assets.small_text = `${nowPlaying.show.title} - Season ${seasonNumber}`;
                }
            }
        } catch {
            // fall back below to static assets
        }
    }

    // Fallbacks to static Trakt assets if we have nothing from TMDB
    if (!assets.large_image) {
        try {
            assets.large_image = await getApplicationAsset("trakt-large");
            assets.large_text ||= details;
        } catch {
            assets = assets || {};
        }
    }

    const activity = {
        application_id: TRAKT_APP_ID as any,
        name: nowPlaying.show && nowPlaying.episode
            ? nowPlaying.show.title
            : nowPlaying.movie
                ? nowPlaying.movie.title
                : "Trakt",
        type: ActivityType.WATCHING,
        details,
        state,
        timestamps,
        assets,
    } as Activity;

    console.log("Created Trakt activity:", activity);

    return activity;
}

async function updatePresence() {
    const cfg = settings.store;
    if (!cfg.traktClientId || !cfg.traktUsername) {
        logger.debug("Missing Trakt config, skipping update");
        return;
    }

    let watching = await getWatching();

    if (!watching || (!watching.movie && !watching.show)) {
        let fromHistory: TraktHistoryItem | null = null;

        if (cfg.useHistoryFallback) {
            fromHistory = await getLastHistoryItem();
        }

        if (!fromHistory) {
            FluxDispatcher.dispatch({
                type: "LOCAL_ACTIVITY_UPDATE",
                activity: null,
                socketId: "TraktRichPresence",
                platform: "desktop",
            });
            return;
        }

        const watchedAt = Date.parse(fromHistory.watched_at);
        if (Number.isNaN(watchedAt)) {
            FluxDispatcher.dispatch({
                type: "LOCAL_ACTIVITY_UPDATE",
                activity: null,
                socketId: "TraktRichPresence",
                platform: "desktop",
            });
            return;
        }

        const ageMinutes = (Date.now() - watchedAt) / (1000 * 60);
        const maxAge = cfg.historyMaxAgeMinutes || 30;
        if (ageMinutes > maxAge) {
            FluxDispatcher.dispatch({
                type: "LOCAL_ACTIVITY_UPDATE",
                activity: null,
                socketId: "TraktRichPresence",
                platform: "desktop",
            });
            return;
        }

        if (fromHistory.type === "movie" && fromHistory.movie) {
            watching = {
                expires_at: new Date(watchedAt + maxAge * 60 * 1000).toISOString(),
                started_at: new Date(watchedAt).toISOString(),
                action: fromHistory.action,
                type: "movie",
                movie: fromHistory.movie,
                show: undefined,
                episode: undefined,
            };
        } else if (fromHistory.type === "episode" && fromHistory.show && fromHistory.episode) {
            watching = {
                expires_at: new Date(watchedAt + maxAge * 60 * 1000).toISOString(),
                started_at: new Date(watchedAt).toISOString(),
                action: fromHistory.action,
                type: "episode",
                movie: undefined,
                show: fromHistory.show,
                episode: fromHistory.episode,
            };
        } else {
            FluxDispatcher.dispatch({
                type: "LOCAL_ACTIVITY_UPDATE",
                activity: null,
                socketId: "TraktRichPresence",
                platform: "desktop",
            });
            return;
        }
    }

    let tmdbId: number | undefined;
    let season: number | undefined;
    let slug: string | undefined;
    let episodeNumber: number | undefined;

    if (watching.movie && watching.movie.ids) {
        tmdbId = watching.movie.ids.tmdb;
        slug = watching.movie.ids.slug || String(watching.movie.ids.trakt);
    } else if (watching.show && watching.episode && watching.show.ids) {
        tmdbId = watching.show.ids.tmdb || watching.show?.ids.tmdb;
        season = watching.episode.season;
        episodeNumber = watching.episode.number;
        slug = watching.show?.ids.slug || String(watching.show?.ids.trakt ?? "");
    }

    const [posterUrl] = await Promise.all([
        getPosterUrl(
            watching.movie ? "movie" : watching.episode ? "episode" : "show",
            tmdbId,
            season,
            episodeNumber,
        ),
    ]);

    const activity = await createActivity(watching, posterUrl);

    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity,
        socketId: "TraktRichPresence",
    } as any);
}

export default definePlugin({
    name: "TraktRichPresence",
    description: "Sets a Discord rich presence based on your current Trakt watching status.",
    authors: [{
        name: "Oggetto",
        id: 619203349954166804n
    }],
    settings,
    settingsAboutComponent: OAuthSettingsComponent,

    start() {
        const cfg = settings.store;
        if (cfg.enableOAuth) {
            checkOAuth();
        }
        const intervalMs = (cfg.pollingInterval || 15) * 1000;

        updatePresence();
        interval = window.setInterval(updatePresence, intervalMs);
    },

    stop() {
        if (interval != null) {
            window.clearInterval(interval);
            interval = null;
        }

        FluxDispatcher.dispatch({
            type: "LOCAL_ACTIVITY_UPDATE",
            activity: null,
            socketId: "TraktRichPresence",
            platform: "desktop",
        });
    },
});
