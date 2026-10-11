/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { ApplicationAssetUtils, FluxDispatcher, showToast, Toasts } from "@webpack/common";
const Native = VencordNative.pluginHelpers.YoutubeRPC as PluginNative<typeof import("./native")>;

const settings = definePluginSettings({
    applicationId: {
        type: OptionType.STRING,
        description: "The Discord Application ID to use for the rich presence",
        default: "1",
    },
    activityType: {
        type: OptionType.SELECT,
        description: "The type of activity to display",
        options: [
            { label: "Playing", value: 0 },
            { label: "Streaming", value: 1 },
            { label: "Listening", value: 2 },
            { label: "Watching", value: 3 },
            { label: "Competing", value: 5 },
        ],
        default: 3,
    },
    detailsFormat: {
        type: OptionType.STRING,
        description: "Template for the details line. Variables: $title, $artist, $album",
        default: "$artist",
    },
    stateFormat: {
        type: OptionType.STRING,
        description: "Template for the state line. Variables: $title, $artist, $album",
        default: "$title",
    },
    buttonText: {
        type: OptionType.STRING,
        description: "Text for the activity button",
        default: "Watch on YouTube",
    },
    showTimestamps: {
        type: OptionType.BOOLEAN,
        description: "Show elapsed time in the rich presence",
        default: true,
    },
});

interface ActivityAssets {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
}

interface Activity {
    state?: string;
    details?: string;
    timestamps?: {
        start?: number;
        end?: number;
    };
    assets?: ActivityAssets;
    buttons?: Array<string>;
    name: string;
    application_id: string;
    metadata?: {
        button_urls?: Array<string>;
    };
    type: ActivityType;
    url?: string;
    flags: number;
}

const enum ActivityType {
    PLAYING = 0,
    STREAMING = 1,
    LISTENING = 2,
    WATCHING = 3,
    COMPETING = 5
}

function formatTemplate(template: string, meta: { title: string; artist: string; album: string; }) {
    return template
        .replace(/\$title/g, meta.title)
        .replace(/\$artist/g, meta.artist.replace(/ - Topic$/, ''))
        .replace(/\$album/g, meta.album);
}

async function createActivity(metadata: any) {
    if (!metadata) return;

    const meta = {
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
    };

    const activity: Activity = {
        application_id: settings.store.applicationId,
        name: metadata.title,
        type: settings.store.activityType as ActivityType,
        details: formatTemplate(settings.store.detailsFormat, meta),
        state: formatTemplate(settings.store.stateFormat, meta),
        assets: {
            large_image: await getAsset("https://wsrv.nl/?url=" + metadata.artwork),
        },
        buttons: [settings.store.buttonText],
        metadata: {
            button_urls: [metadata.url]
        },
        flags: 1 << 0
    };

    if (settings.store.showTimestamps) {
        activity.timestamps = {
            start: Date.now() - metadata.currentTime * 1000,
            end: Date.now() + (metadata.duration - metadata.currentTime) * 1000
        };
    }

    return activity;
}

function dispatchActivity(activity: Activity | null = null) {
    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: activity,
        socketId: "YoutubeRPC",
    });
}

let ws: WebSocket;
let interval: NodeJS.Timer;
let wsDebuggerUrl: string;

export default definePlugin({
    name: "YoutubeRPC",
    description: "Youtube RPC from Chrome Remote Debugger --remote-debugging-port=9222 --remote-allow-origins=https://discord.com",
    authors: [Devs.AutumnVN],
    settings,

    async start() {
        await updatePresence();
        interval = setInterval(updatePresence, 3000);
    },
    stop() {
        clearInterval(interval);
        dispatchActivity(null);
        ws.close();
    },

});

async function updatePresence() {
    try {
        const webSocketDebuggerUrl = await Native.getWebSocketDebuggerUrl();
        if (!webSocketDebuggerUrl) {
            console.error("[YoutubeRPC] No Chrome debugger available. Make sure Chrome/Edge is running with --remote-debugging-port=9222 --remote-allow-origins=https://discord.com");
            return dispatchActivity(null);
        }

        if (wsDebuggerUrl !== webSocketDebuggerUrl) {
            wsDebuggerUrl = webSocketDebuggerUrl;
            ws = new WebSocket(wsDebuggerUrl);
            ws.onopen = () => {
                console.log("[YoutubeRPC] Connected to Chrome debugger");
                requestMetadata();
            };
            ws.onmessage = async ({ data }) => {
                const response = JSON.parse(data);
                const metadata = response.result?.result?.value;
                if (response.id === 1) {
                    if (!metadata) {
                        console.warn("[YoutubeRPC] No MediaSession metadata found on YouTube page");
                        dispatchActivity(null);
                    } else if (metadata.playbackState === "playing") {
                        dispatchActivity(await createActivity(metadata));
                    } else {
                        dispatchActivity(null);
                    }
                }
            };
            ws.onerror = () => {
                console.error("[YoutubeRPC] WebSocket connection error");
            };
        } else {
            requestMetadata();
        }
    } catch (e) {
        console.error("[YoutubeRPC] Failed to update presence:", e);
        showToast("YouTubeRPC: Cannot connect to Chrome debugger. Launch Chrome with --remote-debugging-port=9222", Toasts.Type.FAILURE);
        dispatchActivity(null);
    }
}

function requestMetadata() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: {
            expression: `(() => {
                return {
                    "playbackState" : navigator.mediaSession.playbackState,
                    "title"         : navigator.mediaSession.metadata.title,
                    "artist"        : navigator.mediaSession.metadata.artist,
                    "album"         : navigator.mediaSession.metadata.album,
                    "artwork"       : navigator.mediaSession.metadata.artwork[0].src,
                    "currentTime"   : document.querySelector('video.video-stream').currentTime || document.querySelectorAll('video.video-stream')[1].currentTime,
                    "duration"      : document.querySelector('video.video-stream').duration || document.querySelectorAll('video.video-stream')[1].duration,
                    "url"           : window.location.href,
                }
            })();`,
            returnByValue: true
        }
    }));
}

async function getAsset(key: string): Promise<string> {
    if (/https?:\/\/(cdn|media)\.discordapp\.(com|net)\/attachments\//.test(key)) return "mp:" + key.replace(/https?:\/\/(cdn|media)\.discordapp\.(com|net)\//, "");
    return (await ApplicationAssetUtils.fetchAssetIds('1', [key]))[0];
}
