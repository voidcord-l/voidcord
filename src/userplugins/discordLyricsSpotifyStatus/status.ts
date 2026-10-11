import { Logger } from "@utils/Logger";
import { RestAPI } from "@webpack/common";

const logger = new Logger("DiscordLyricsSpotifyStatus");

type QueueEntry = { body: any; label: string; fallbackBody?: any; };

const queue: QueueEntry[] = [];
let processing = false;
let lastText: string | null = null;
let debugEnabled = false;

function debugLog(message: string, extra?: unknown) {
    if (!debugEnabled) return;
    extra === undefined
        ? console.info(`[DiscordLyricsSpotifyStatus] ${message}`)
        : console.info(`[DiscordLyricsSpotifyStatus] ${message}`, extra);
}

export function setStatusDebugMode(enabled: boolean) { debugEnabled = enabled; }

function enqueueLatest(entry: QueueEntry) {
    if (!processing) {
        queue.length = 0;
        queue.push(entry);
        debugLog("Queued update", { label: entry.label });
        return;
    }
    const hasHead = queue.length > 0;
    queue.length = hasHead ? 1 : 0;
    queue.push(entry);
    debugLog("Replaced stale queue", { label: entry.label });
}

function enqueueClear(entry: QueueEntry) {
    queue.push(entry);
    debugLog("Queued clear");
}

async function processQueue() {
    if (processing) return;
    processing = true;

    while (queue.length > 0) {
        const entry = queue[0];
        try {
            await RestAPI.patch({ url: "/users/@me/settings", body: entry.body });
            logger.info(`Status: ${entry.label}`);
            queue.shift();
        } catch (error: any) {
            const retryAfterMs = Math.ceil((error?.body?.retry_after ?? 1) * 1000);
            if (error?.status === 429) {
                if (queue.length > 1) { queue.shift(); continue; }
                logger.warn(`Rate limited, retrying in ${retryAfterMs}ms`);
                await new Promise(resolve => setTimeout(resolve, retryAfterMs));
                continue;
            }
            if (entry.fallbackBody) {
                queue[0] = { body: entry.fallbackBody, label: entry.label };
                continue;
            }
            logger.error("Failed to update status", error);
            queue.shift();
        }
    }
    processing = false;
}

export function setCustomStatus(text: string, emojiName = "musical_note") {
    if (text === lastText) return;
    lastText = text;
    enqueueLatest({
        body: { custom_status: { text: text.slice(0, 128), emoji_name: emojiName, expires_at: null } },
        fallbackBody: { customStatus: { text: text.slice(0, 128), emojiName, expiresAt: null } },
        label: text,
    });
    void processQueue();
}

export function clearCustomStatus() {
    if (lastText === null) return;
    lastText = null;
    enqueueClear({
        body: { custom_status: null },
        fallbackBody: { customStatus: null },
        label: "(clear)",
    });
    void processQueue();
}

export function resetStatusCache() { lastText = null; }
