import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import definePlugin, { IconComponent, OptionType } from "@utils/types";
import { saveFile } from "@utils/web";
import { strToU8, zipSync } from "fflate";
import { Channel, RenderModalProps } from "@vencord/discord-types";
import { CloudUploadPlatform } from "@vencord/discord-types/enums";
import { findLazy } from "@webpack";
import {
    Alerts,
    ChannelStore,
    closeModal,
    Constants,
    FluxDispatcher,
    Modal,
    openModal,
    RestAPI,
    SnowflakeUtils,
    TextInput,
    Toasts,
    UserStore,
    useEffect,
    useState
} from "@webpack/common";

type LogLevel = "info" | "success" | "warn" | "error";
type DataTypeFilter = "all" | "text" | "attachments" | "links" | "embeds" | "stickers";

const CloudUploader = findLazy(m => m.prototype?.trackUploadFinished) as any;

interface SearchMessage {
    id: string;
    channel_id: string;
    attachments?: Array<{
        id?: string;
        filename?: string;
        name?: string;
        url?: string;
        proxy_url?: string;
        proxyURL?: string;
        content_type?: string;
        size?: number;
    }>;
    content?: string;
    embeds?: unknown[];
    hit?: boolean;
    pinned?: boolean;
    sticker_items?: unknown[];
    stickerItems?: unknown[];
    timestamp?: string;
    type: number;
    call?: unknown;
    author?: {
        id: string;
        username?: string;
        global_name?: string;
        discriminator?: string;
        avatar?: string | null;
        bot?: boolean;
    };
}

interface SearchResponse {
    messages?: SearchMessage[][];
    total_results?: number;
    retry_after?: number;
}

interface LogEntry {
    id: number;
    level: LogLevel;
    time: string;
    message: string;
}

interface RuntimeState {
    running: boolean;
    cancelled: boolean;
    phase: string;
    scannedPages: number;
    found: number;
    totalSearchResults: number;
    deleted: number;
    failed: number;
    skipped: number;
    totalToDelete: number;
    logs: LogEntry[];
}

interface RunOptions {
    deleteDelayMs: number;
    deleteBatchSize: number;
    deleteBatchPauseMs: number;
    searchOffsetPauseMs: number;
    maxMessagesPerRun: number;
    maxSearchPages: number;
    contentFilter: string;
    dataTypeFilter: DataTypeFilter;
    fromDate: string;
    toDate: string;
}

interface ExportUploadAttachment {
    id: string;
    filename: string;
    uploaded_filename: string;
}

interface TranscriptAsset {
    url: string;
    path: string;
    label: string;
}

interface PreparedExport {
    filename: string;
    data: string | Uint8Array;
    mimeType: string;
    message: string;
}

const PLUGIN_ID = "deleteExportMessages";
const DISCORD_EPOCH = 1420070400000n;
const SEARCH_PAGE_SIZE = 25;
const MESSAGE_FETCH_PAGE_SIZE = 100;
const MAX_LOGS = 500;
const GROUP_DM_CHANNEL_TYPE = 3;
const EXPORT_CHANNEL_NAME = "deleteExportMessages exports";

const DEFAULT_DELETE_DELAY_MS = 1500;
const DEFAULT_DELETE_BATCH_SIZE = 30;
const DEFAULT_DELETE_BATCH_PAUSE_MS = 30000;
const DEFAULT_SEARCH_OFFSET_PAUSE_MS = 30000;
const DEFAULT_MAX_RETRIES = 5;

const runtime: RuntimeState = {
    running: false,
    cancelled: false,
    phase: "idle",
    scannedPages: 0,
    found: 0,
    totalSearchResults: 0,
    deleted: 0,
    failed: 0,
    skipped: 0,
    totalToDelete: 0,
    logs: []
};

let logId = 0;
const runtimeListeners = new Set<(nextState: RuntimeState) => void>();

const settings = definePluginSettings({
    deleteDelayMs: {
        type: OptionType.NUMBER,
        description: "Default delay between each message deletion request, in milliseconds.",
        default: DEFAULT_DELETE_DELAY_MS,
        isValid: value => Number(value) >= 500 || "Use at least 500 ms."
    },
    deleteBatchSize: {
        type: OptionType.NUMBER,
        description: "Pause after this many deleted messages. Use 0 to disable batch pauses.",
        default: DEFAULT_DELETE_BATCH_SIZE,
        isValid: value => Number(value) >= 0 || "Use 0 or a positive number."
    },
    deleteBatchPauseMs: {
        type: OptionType.NUMBER,
        description: "Default pause after each delete batch, in milliseconds.",
        default: DEFAULT_DELETE_BATCH_PAUSE_MS,
        isValid: value => Number(value) >= 0 || "Use 0 or a positive number."
    },
    searchOffsetPauseMs: {
        type: OptionType.NUMBER,
        description: "Default pause between scanned message pages, in milliseconds.",
        default: DEFAULT_SEARCH_OFFSET_PAUSE_MS,
        isValid: value => Number(value) >= 0 || "Use 0 or a positive number."
    },
    maxMessagesPerRun: {
        type: OptionType.NUMBER,
        description: "Default maximum messages to delete per run. Use 0 for all found messages.",
        default: 0,
        isValid: value => Number(value) >= 0 || "Use 0 or a positive number."
    },
    maxSearchPages: {
        type: OptionType.NUMBER,
        description: "Default maximum message pages to scan. Use 0 for full history.",
        default: 0,
        isValid: value => Number(value) >= 0 || "Use 0 or a positive number."
    },
    contentFilter: {
        type: OptionType.STRING,
        description: "Default optional keyword filter for message search.",
        default: ""
    },
    dataTypeFilter: {
        type: OptionType.SELECT,
        description: "Default data type filter.",
        options: [
            { label: "All messages", value: "all", default: true },
            { label: "Text only", value: "text" },
            { label: "Attachments/files", value: "attachments" },
            { label: "Links", value: "links" },
            { label: "Embeds", value: "embeds" },
            { label: "Stickers", value: "stickers" }
        ]
    },
    fromDate: {
        type: OptionType.STRING,
        description: "Default start date. Use the modal datetime field format.",
        default: ""
    },
    toDate: {
        type: OptionType.STRING,
        description: "Default end date. Use the modal datetime field format.",
        default: ""
    }
});

const fieldStyle = {
    display: "grid",
    gap: "6px",
    minWidth: 0
};

const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
    marginTop: "12px"
};

const mutedStyle = {
    color: "var(--text-muted)",
    fontSize: "12px"
};

const selectStyle = {
    minHeight: "40px",
    borderRadius: "8px",
    border: "1px solid var(--input-border)",
    background: "var(--input-background)",
    color: "var(--text-normal)",
    padding: "8px"
};

const logBoxStyle = {
    height: "220px",
    overflowY: "auto" as const,
    border: "1px solid var(--background-modifier-accent)",
    borderRadius: "8px",
    padding: "8px",
    background: "var(--background-secondary-alt)",
    fontFamily: "var(--font-code)",
    fontSize: "12px",
    lineHeight: "18px"
};

const logColors: Record<LogLevel, string> = {
    info: "var(--text-normal)",
    success: "var(--status-positive)",
    warn: "var(--status-warning)",
    error: "var(--status-danger)"
};

const TrashIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg
        aria-hidden="true"
        width={width}
        height={height}
        viewBox="0 0 24 24"
        className={className}
    >
        <path fill="currentColor" d="M15 4V2H9v2H3v2h18V4h-6Z" />
        <path fill="currentColor" d="M5 7v12c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V7H5Zm6 10H9v-6h2v6Zm4 0h-2v-6h2v6Z" />
    </svg>
);

function snapshotRuntime(): RuntimeState {
    return {
        ...runtime,
        logs: [...runtime.logs]
    };
}

function notifyRuntimeListeners() {
    const nextState = snapshotRuntime();
    runtimeListeners.forEach(listener => listener(nextState));
}

function setRuntime(nextState: Partial<Omit<RuntimeState, "logs">>) {
    Object.assign(runtime, nextState);
    notifyRuntimeListeners();
}

function addLog(level: LogLevel, message: string) {
    runtime.logs = [
        ...runtime.logs,
        {
            id: ++logId,
            level,
            time: new Date().toLocaleTimeString(),
            message
        }
    ].slice(-MAX_LOGS);
    notifyRuntimeListeners();
}

function clearLogs() {
    runtime.logs = [];
    notifyRuntimeListeners();
}

function useRuntime() {
    const [currentState, setCurrentState] = useState(snapshotRuntime());

    useEffect(() => {
        runtimeListeners.add(setCurrentState);
        return () => void runtimeListeners.delete(setCurrentState);
    }, []);

    return currentState;
}

function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitWithCancel(ms: number) {
    const endTime = Date.now() + ms;
    while (!runtime.cancelled && Date.now() < endTime) {
        await wait(Math.min(1000, endTime - Date.now()));
    }
    return !runtime.cancelled;
}

function toast(message: string, type = Toasts.Type.MESSAGE) {
    Toasts.show({
        id: Toasts.genId(),
        message,
        type
    });
}

function getChannelLabel(channel: Channel) {
    if (channel.guild_id && channel.name) return `#${channel.name}`;
    if (channel.name) return channel.name;
    return "current conversation";
}

function getSearchUrl(channel: Channel) {
    return channel.guild_id
        ? Constants.Endpoints.SEARCH_GUILD(channel.guild_id)
        : `/channels/${channel.id}/messages/search`;
}

function toNumber(value: string, fallback: number, min: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.floor(parsed));
}

function toDateTimestamp(value: string) {
    if (!value.trim()) return null;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
}

function timestampToSnowflake(timestamp: number) {
    const adjusted = BigInt(Math.max(0, timestamp - Number(DISCORD_EPOCH)));
    return (adjusted << 22n).toString();
}

function getMessageTimestamp(message: SearchMessage) {
    if (!message.timestamp) return null;
    const timestamp = new Date(message.timestamp).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
}

function messageHasLink(message: SearchMessage) {
    return /https?:\/\/\S+/i.test(message.content ?? "");
}

function messageHasStickers(message: SearchMessage) {
    return Boolean(message.sticker_items?.length || message.stickerItems?.length);
}

function messageMatchesDataType(message: SearchMessage, dataTypeFilter: DataTypeFilter) {
    switch (dataTypeFilter) {
        case "text":
            return Boolean(message.content?.trim());
        case "attachments":
            return Boolean(message.attachments?.length);
        case "links":
            return messageHasLink(message);
        case "embeds":
            return Boolean(message.embeds?.length);
        case "stickers":
            return messageHasStickers(message);
        default:
            return true;
    }
}

function messageMatchesDateRange(message: SearchMessage, options: RunOptions) {
    const timestamp = getMessageTimestamp(message);
    if (timestamp == null) return true;

    const fromTimestamp = toDateTimestamp(options.fromDate);
    if (fromTimestamp != null && timestamp < fromTimestamp) return false;

    const toTimestamp = toDateTimestamp(options.toDate);
    if (toTimestamp != null && timestamp > toTimestamp) return false;

    return true;
}

function messageMatchesFilters(message: SearchMessage, options: RunOptions) {
    if (options.contentFilter && !message.content?.toLowerCase().includes(options.contentFilter.toLowerCase())) return false;
    if (!messageMatchesDataType(message, options.dataTypeFilter)) return false;
    if (!messageMatchesDateRange(message, options)) return false;

    return true;
}

function getDiscordSearchHasFilter(dataTypeFilter: DataTypeFilter) {
    if (dataTypeFilter === "attachments") return "file";
    if (dataTypeFilter === "links") return "link";
    return undefined;
}

function getRetryAfterMs(value: any) {
    const retryAfter =
        value?.body?.retry_after ??
        value?.retry_after ??
        value?.response?.body?.retry_after ??
        value?.headers?.["Retry-After"] ??
        value?.headers?.["retry-after"];

    const parsed = Number(retryAfter);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;

    const ms = parsed > 1000 ? parsed : parsed * 1000;
    return Math.ceil(ms + 1000);
}

async function requestWithRetry<T>(label: string, request: () => Promise<T>, maxRetries = DEFAULT_MAX_RETRIES): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await request();
            const status = (response as any)?.status ?? (response as any)?.statusCode;
            const retryAfterMs = getRetryAfterMs(response);

            if ((status === 429 || status === 202) && retryAfterMs != null) {
                addLog("warn", `${label}: Discord asked to retry after ${Math.round(retryAfterMs / 1000)}s.`);
                await waitWithCancel(retryAfterMs);
                continue;
            }

            return response;
        } catch (error) {
            const retryAfterMs = getRetryAfterMs(error);
            if (retryAfterMs != null && attempt < maxRetries) {
                addLog("warn", `${label}: rate limited, retry ${attempt}/${maxRetries} after ${Math.round(retryAfterMs / 1000)}s.`);
                await waitWithCancel(retryAfterMs);
                continue;
            }

            if (attempt < maxRetries) {
                addLog("warn", `${label}: request failed, retry ${attempt}/${maxRetries} in 3s.`);
                await waitWithCancel(3000);
                continue;
            }

            throw error;
        }
    }

    throw new Error(`${label}: retry limit reached`);
}

async function searchMessages(channel: Channel, offset: number, options: RunOptions, authorId?: string) {
    const query: Record<string, string | number | boolean> = {
        sort_by: "timestamp",
        sort_order: "desc",
        offset,
        include_nsfw: true
    };

    if (authorId) query.author_id = authorId;
    if (channel.guild_id) query.channel_id = channel.id;
    if (options.contentFilter) query.content = options.contentFilter;

    const fromTimestamp = toDateTimestamp(options.fromDate);
    if (fromTimestamp != null) query.min_id = timestampToSnowflake(fromTimestamp);

    const toTimestamp = toDateTimestamp(options.toDate);
    if (toTimestamp != null) query.max_id = timestampToSnowflake(toTimestamp);

    const hasFilter = getDiscordSearchHasFilter(options.dataTypeFilter);
    if (hasFilter) query.has = hasFilter;

    for (let attempt = 1; attempt <= DEFAULT_MAX_RETRIES; attempt++) {
        const response = await requestWithRetry(`search offset ${offset}`, () => RestAPI.get({
            url: getSearchUrl(channel),
            query,
            retries: 0
        }));

        const body = (response as any).body as SearchResponse;
        if (body?.retry_after != null && !body.messages) {
            const retryAfterMs = getRetryAfterMs(body) ?? DEFAULT_SEARCH_OFFSET_PAUSE_MS;
            addLog("warn", `Search index not ready, waiting ${Math.round(retryAfterMs / 1000)}s.`);
            await waitWithCancel(retryAfterMs);
            continue;
        }

        return body ?? {};
    }

    return {};
}

async function fetchChannelMessages(channel: Channel, before?: string) {
    const query: Record<string, string | number> = {
        limit: MESSAGE_FETCH_PAGE_SIZE
    };

    if (before) query.before = before;

    const response = await requestWithRetry(`fetch messages before ${before ?? "latest"}`, () => RestAPI.get({
        url: Constants.Endpoints.MESSAGES(channel.id),
        query,
        retries: 0
    }));

    const body = (response as any).body;
    return Array.isArray(body) ? body as SearchMessage[] : [];
}

function getHitMessages(searchResponse: SearchResponse, userId: string) {
    return (searchResponse.messages ?? [])
        .map(conversation => conversation.find(message => message.hit) ?? conversation.find(message => message.author?.id === userId))
        .filter(Boolean) as SearchMessage[];
}

function isDeletable(message: SearchMessage, userId: string, options: RunOptions) {
    if (message.author?.id !== userId) return false;
    if (message.call != null) return false;
    if (!messageMatchesFilters(message, options)) return false;

    return message.type === 0 || message.type >= 6 && message.type <= 21;
}

function confirmDelete(channel: Channel, count: number) {
    const limitText = count > 0 ? `up to ${count} ` : "";

    return new Promise<boolean>(resolve => {
        Alerts.show({
            title: "Delete messages?",
            body: `Delete ${limitText}matching messages from ${getChannelLabel(channel)}? The plugin will scan the conversation page by page and delete matches as it finds them. This cannot be undone.`,
            confirmText: "Delete",
            cancelText: "Cancel",
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false)
        });
    });
}

async function deleteMessage(channelId: string, messageId: string) {
    await requestWithRetry(`delete ${messageId}`, () => RestAPI.del({
        url: Constants.Endpoints.MESSAGE(channelId, messageId),
        retries: 0
    }));

    FluxDispatcher.dispatch({
        type: "MESSAGE_DELETE",
        channelId,
        id: messageId
    });
}

function getRemainingDeleteLimit(options: RunOptions, found: number) {
    return options.maxMessagesPerRun > 0
        ? Math.max(0, options.maxMessagesPerRun - found)
        : Number.POSITIVE_INFINITY;
}

async function getDeletionPage(
    channel: Channel,
    userId: string,
    options: RunOptions,
    seen: Set<string>,
    offset: number,
    page: number,
    found: number
) {
    addLog("info", `Searching offset ${offset} in ${getChannelLabel(channel)}.`);

    const searchResponse = await searchMessages(channel, offset, options, userId);
    const hits = getHitMessages(searchResponse, userId);
    const totalResults = Number(searchResponse.total_results ?? runtime.totalSearchResults);
    const remaining = getRemainingDeleteLimit(options, found);
    const messages: SearchMessage[] = [];
    let skipped = 0;

    for (const message of hits) {
        if (seen.has(message.id)) continue;
        seen.add(message.id);

        if (!isDeletable(message, userId, options)) {
            skipped++;
            continue;
        }

        if (messages.length < remaining) {
            messages.push(message);
        }

        if (messages.length >= remaining) break;
    }

    setRuntime({
        scannedPages: page,
        found: found + messages.length,
        skipped: runtime.skipped + skipped,
        totalSearchResults: totalResults
    });

    addLog("info", `Offset ${offset}: ${messages.length} deletable, ${skipped} skipped.`);

    return {
        messages,
        hitCount: hits.length,
        totalResults
    };
}

async function getDeletionFetchPage(
    channel: Channel,
    userId: string,
    options: RunOptions,
    seen: Set<string>,
    before: string | undefined,
    page: number,
    found: number
) {
    addLog("info", `Fetching page ${page}${before ? ` before ${before}` : ""} in ${getChannelLabel(channel)}.`);

    const pageMessages = await fetchChannelMessages(channel, before);
    const remaining = getRemainingDeleteLimit(options, found);
    const messages: SearchMessage[] = [];
    let skipped = 0;

    for (const message of pageMessages) {
        if (seen.has(message.id)) continue;
        seen.add(message.id);

        if (!isDeletable(message, userId, options)) {
            skipped++;
            continue;
        }

        if (messages.length < remaining) {
            messages.push(message);
        }

        if (messages.length >= remaining) break;
    }

    setRuntime({
        scannedPages: page,
        found: found + messages.length,
        skipped: runtime.skipped + skipped,
        totalSearchResults: runtime.totalSearchResults + pageMessages.length
    });

    addLog("info", `Page ${page}: ${messages.length} deletable, ${skipped} skipped, ${pageMessages.length} scanned.`);

    return {
        messages,
        pageCount: pageMessages.length,
        before: pageMessages[pageMessages.length - 1]?.id
    };
}

async function collectExportMessages(channel: Channel, options: RunOptions) {
    const seen = new Set<string>();
    const messages: SearchMessage[] = [];
    let before: string | undefined;
    let page = 0;

    setRuntime({
        running: true,
        cancelled: false,
        phase: "export scanning",
        scannedPages: 0,
        found: 0,
        totalSearchResults: 0,
        deleted: 0,
        failed: 0,
        skipped: 0,
        totalToDelete: 0
    });

    while (!runtime.cancelled) {
        page++;
        addLog("info", `Export fetch page ${page}${before ? ` before ${before}` : ""} in ${getChannelLabel(channel)}.`);
        const pageMessages = await fetchChannelMessages(channel, before);

        let added = 0;
        let skipped = 0;

        for (const message of pageMessages) {
            if (seen.has(message.id)) continue;
            seen.add(message.id);

            if (!messageMatchesFilters(message, options)) {
                skipped++;
                continue;
            }

            messages.push(message);
            added++;
        }

        setRuntime({
            scannedPages: page,
            found: messages.length,
            skipped: runtime.skipped + skipped,
            totalSearchResults: messages.length
        });

        addLog("info", `Export page ${page}: ${added} added, ${skipped} skipped, ${messages.length} collected.`);

        if (!pageMessages.length) break;

        before = pageMessages[pageMessages.length - 1]?.id;
        if (!before || pageMessages.length < MESSAGE_FETCH_PAGE_SIZE) break;
        if (options.maxSearchPages > 0 && page >= options.maxSearchPages) break;
    }

    return messages.sort((a, b) => (getMessageTimestamp(a) ?? 0) - (getMessageTimestamp(b) ?? 0));
}

function safeFilename(value: string) {
    return value
        .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 100) || "discord_transcript";
}

function safeArchiveFilename(value: string, fallback = "file") {
    return value
        .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^\.|_+$/g, "")
        .slice(0, 140) || fallback;
}

function escapeHtml(value: unknown) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeAttribute(value: unknown) {
    return escapeHtml(value).replace(/`/g, "&#96;");
}

function formatDate(value?: string) {
    if (!value) return "Unknown date";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

function formatBytes(size?: number) {
    if (size == null || !Number.isFinite(size)) return "";

    const units = ["B", "KB", "MB", "GB"];
    let value = Number(size);
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }

    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function getAuthorName(message: SearchMessage) {
    const author = message.author;
    if (!author) return "Unknown User";

    return author.global_name || author.username || author.id;
}

function getAuthorTag(message: SearchMessage) {
    const author = message.author;
    if (!author) return "Unknown User";
    if (author.username && author.discriminator && author.discriminator !== "0") return `${author.username}#${author.discriminator}`;
    return author.username || author.id;
}

function getAuthorAvatarUrl(message: SearchMessage) {
    const author = message.author;
    if (!author?.id || !author.avatar) return null;

    const extension = author.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.${extension}?size=64`;
}

function getExportUrl(url: string, assetPaths?: Map<string, string>) {
    return assetPaths?.get(url) ?? url;
}

function getAttachmentName(attachment: NonNullable<SearchMessage["attachments"]>[number]) {
    return attachment.filename || attachment.name || attachment.id || "attachment";
}

function getAttachmentUrl(attachment: NonNullable<SearchMessage["attachments"]>[number]) {
    return attachment.proxy_url || attachment.proxyURL || attachment.url || "";
}

function getFileExtension(filename: string) {
    return filename.split(".").pop()?.toLowerCase() ?? "";
}

function getUrlFilename(url: string, fallback = "file") {
    try {
        const path = new URL(url).pathname;
        const name = decodeURIComponent(path.split("/").filter(Boolean).pop() ?? "");
        return safeArchiveFilename(name, fallback);
    } catch {
        return safeArchiveFilename(fallback, "file");
    }
}

function getAttachmentKind(attachment: NonNullable<SearchMessage["attachments"]>[number]) {
    const contentType = attachment.content_type?.toLowerCase() ?? "";
    const extension = getFileExtension(getAttachmentName(attachment));

    if (contentType.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "avif"].includes(extension)) return "image";
    if (contentType.startsWith("video/") || ["mp4", "webm", "mov"].includes(extension)) return "video";
    if (contentType.startsWith("audio/") || ["mp3", "ogg", "wav", "m4a", "flac"].includes(extension)) return "audio";

    return "file";
}

function renderMessageContent(content?: string) {
    const escaped = escapeHtml(content ?? "");
    if (!escaped.trim()) return `<span class="dm-empty">(no text content)</span>`;

    return escaped.replace(/https?:\/\/[^\s<]+/g, url => {
        const safeUrl = escapeAttribute(url);
        return `<a href="${safeUrl}" target="_blank" rel="noreferrer noopener">${url}</a>`;
    });
}

function renderAttachments(message: SearchMessage, assetPaths?: Map<string, string>) {
    if (!message.attachments?.length) return "";

    return `<div class="dm-attachments">${message.attachments.map(attachment => {
        const name = getAttachmentName(attachment);
        const url = getAttachmentUrl(attachment);
        if (!url) return "";

        const safeUrl = escapeAttribute(getExportUrl(url, assetPaths));
        const safeName = escapeHtml(name);
        const details = formatBytes(attachment.size);
        const detailText = details ? ` <span class="dm-attachment-size">${escapeHtml(details)}</span>` : "";

        switch (getAttachmentKind(attachment)) {
            case "image":
                return `<figure class="dm-attachment"><a href="${safeUrl}" target="_blank" rel="noreferrer noopener"><img src="${safeUrl}" alt="${escapeAttribute(name)}" loading="lazy" /></a><figcaption>${safeName}${detailText}</figcaption></figure>`;
            case "video":
                return `<figure class="dm-attachment"><video src="${safeUrl}" controls preload="metadata"></video><figcaption><a href="${safeUrl}" target="_blank" rel="noreferrer noopener">${safeName}</a>${detailText}</figcaption></figure>`;
            case "audio":
                return `<figure class="dm-attachment"><audio src="${safeUrl}" controls preload="metadata"></audio><figcaption><a href="${safeUrl}" target="_blank" rel="noreferrer noopener">${safeName}</a>${detailText}</figcaption></figure>`;
            default:
                return `<div class="dm-file"><a href="${safeUrl}" target="_blank" rel="noreferrer noopener">${safeName}</a>${detailText}</div>`;
        }
    }).join("")}</div>`;
}

function renderEmbedValue(value: unknown) {
    if (value == null) return "";
    return renderMessageContent(String(value));
}

function renderEmbeds(message: SearchMessage, assetPaths?: Map<string, string>) {
    if (!message.embeds?.length) return "";

    return `<div class="dm-embeds">${message.embeds.map(rawEmbed => {
        const embed = rawEmbed as Record<string, any>;
        const color = typeof embed.color === "number" ? `#${embed.color.toString(16).padStart(6, "0")}` : "var(--accent)";
        const title = embed.title
            ? embed.url
                ? `<a class="dm-embed-title" href="${escapeAttribute(embed.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(embed.title)}</a>`
                : `<div class="dm-embed-title">${escapeHtml(embed.title)}</div>`
            : "";
        const author = embed.author?.name ? `<div class="dm-embed-author">${escapeHtml(embed.author.name)}</div>` : "";
        const description = embed.description ? `<div class="dm-embed-description">${renderEmbedValue(embed.description)}</div>` : "";
        const fields = Array.isArray(embed.fields)
            ? `<div class="dm-embed-fields">${embed.fields.map((field: any) => (
                `<div class="dm-embed-field${field?.inline ? " dm-embed-field-inline" : ""}"><div>${escapeHtml(field?.name ?? "")}</div><p>${renderEmbedValue(field?.value ?? "")}</p></div>`
            )).join("")}</div>`
            : "";
        const imageUrl = embed.image?.proxy_url || embed.image?.url || embed.thumbnail?.proxy_url || embed.thumbnail?.url;
        const safeImageUrl = imageUrl ? escapeAttribute(getExportUrl(imageUrl, assetPaths)) : "";
        const image = imageUrl ? `<a href="${safeImageUrl}" target="_blank" rel="noreferrer noopener"><img class="dm-embed-image" src="${safeImageUrl}" loading="lazy" /></a>` : "";
        const footer = embed.footer?.text ? `<div class="dm-embed-footer">${escapeHtml(embed.footer.text)}</div>` : "";

        return `<div class="dm-embed" style="border-left-color:${escapeAttribute(color)}">${author}${title}${description}${fields}${image}${footer}</div>`;
    }).join("")}</div>`;
}

function renderStickers(message: SearchMessage) {
    const stickers = message.sticker_items ?? message.stickerItems ?? [];
    if (!stickers.length) return "";

    return `<div class="dm-stickers">${stickers.map((sticker: any) => (
        `<span>${escapeHtml(sticker?.name ?? sticker?.id ?? "sticker")}</span>`
    )).join("")}</div>`;
}

function renderTranscriptMessage(message: SearchMessage, channel: Channel, assetPaths?: Map<string, string>) {
    const avatarUrl = getAuthorAvatarUrl(message);
    const avatar = avatarUrl
        ? `<img src="${escapeAttribute(getExportUrl(avatarUrl, assetPaths))}" alt="" loading="lazy" />`
        : `<span>${escapeHtml(getAuthorName(message).slice(0, 1).toUpperCase() || "?")}</span>`;
    const timestamp = formatDate(message.timestamp);
    const messageChannelId = message.channel_id ?? channel.id;
    const messageUrl = `https://discord.com/channels/${channel.guild_id ?? "@me"}/${messageChannelId}/${message.id}`;

    return `<article class="dm-message" id="message-${escapeAttribute(message.id)}">
        <div class="dm-avatar">${avatar}</div>
        <div class="dm-message-main">
            <header>
                <span class="dm-author" title="${escapeAttribute(getAuthorTag(message))}">${escapeHtml(getAuthorName(message))}</span>
                ${message.author?.bot ? `<span class="dm-bot">BOT</span>` : ""}
                <a class="dm-time" href="${escapeAttribute(messageUrl)}" target="_blank" rel="noreferrer noopener">${escapeHtml(timestamp)}</a>
                ${message.pinned ? `<span class="dm-pinned">Pinned</span>` : ""}
            </header>
            <div class="dm-content">${renderMessageContent(message.content)}</div>
            ${renderAttachments(message, assetPaths)}
            ${renderEmbeds(message, assetPaths)}
            ${renderStickers(message)}
        </div>
    </article>`;
}

function renderFilterSummary(options: RunOptions) {
    const filters = [
        ["Keyword", options.contentFilter || "none"],
        ["Data type", options.dataTypeFilter],
        ["After", options.fromDate || "none"],
        ["Before", options.toDate || "none"],
        ["Max pages", options.maxSearchPages || "all"]
    ];

    return filters.map(([label, value]) => `<span><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</span>`).join("");
}

function generateHtmlTranscript(channel: Channel, messages: SearchMessage[], participantCount: number, options: RunOptions, assetPaths?: Map<string, string>) {
    const title = `${getChannelLabel(channel)} transcript`;
    const generatedAt = new Date().toLocaleString();

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:dark;--bg:#101114;--panel:#16181d;--text:#f2f3f5;--muted:#a3a8b3;--line:#2a2d35;--accent:#5865f2;--link:#8ea1e1}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
.dm-wrap{max-width:1100px;margin:0 auto;padding:32px 18px 48px}.dm-head{position:sticky;top:0;z-index:1;margin:-32px -18px 20px;padding:24px 18px 16px;background:linear-gradient(var(--bg) 70%,rgba(16,17,20,.88));border-bottom:1px solid var(--line)}
h1{margin:0 0 8px;font-size:24px;line-height:1.2}.dm-meta,.dm-filters{display:flex;flex-wrap:wrap;gap:8px 16px;color:var(--muted);font-size:13px}.dm-filters{margin-top:10px}
.dm-log{display:grid;gap:2px}.dm-message{display:grid;grid-template-columns:42px minmax(0,1fr);gap:12px;padding:10px 8px;border-radius:6px}.dm-message:hover{background:rgba(255,255,255,.035)}
.dm-avatar{width:42px;height:42px;border-radius:50%;overflow:hidden;background:#30343c;display:grid;place-items:center;color:#fff;font-weight:700}.dm-avatar img{width:100%;height:100%;object-fit:cover}
header{display:flex;align-items:baseline;gap:8px;min-width:0}.dm-author{font-weight:700;color:#fff}.dm-time,.dm-pinned{color:var(--muted);font-size:12px}.dm-bot{font-size:10px;font-weight:700;background:var(--accent);color:white;border-radius:3px;padding:1px 4px}.dm-content{white-space:pre-wrap;overflow-wrap:anywhere}.dm-empty{color:var(--muted);font-style:italic}
.dm-attachments,.dm-embeds{display:grid;gap:8px;margin-top:8px}.dm-attachment{margin:0}.dm-attachment img,.dm-attachment video{max-width:min(520px,100%);max-height:420px;border-radius:6px;border:1px solid var(--line);background:#0b0c0f}.dm-attachment audio{width:min(520px,100%)}figcaption,.dm-attachment-size{color:var(--muted);font-size:12px}.dm-file{max-width:520px;padding:10px 12px;border:1px solid var(--line);border-radius:6px;background:var(--panel)}
.dm-embed{max-width:560px;padding:10px 12px;border-left:4px solid var(--accent);border-radius:4px;background:var(--panel)}.dm-embed-title{display:block;font-weight:700;margin-bottom:4px}.dm-embed-author,.dm-embed-footer{color:var(--muted);font-size:12px}.dm-embed-description{white-space:pre-wrap;overflow-wrap:anywhere}.dm-embed-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-top:8px}.dm-embed-field>div{font-weight:700}.dm-embed-field p{margin:2px 0 0;white-space:pre-wrap}.dm-embed-image{display:block;max-width:min(420px,100%);max-height:320px;margin-top:8px;border-radius:6px}
.dm-stickers{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.dm-stickers span{border:1px solid var(--line);border-radius:999px;padding:2px 8px;color:var(--muted);font-size:12px}
@media(max-width:640px){.dm-wrap{padding:20px 10px 36px}.dm-head{margin:-20px -10px 14px;padding:18px 10px 12px}.dm-message{grid-template-columns:34px minmax(0,1fr);gap:10px}.dm-avatar{width:34px;height:34px}header{flex-wrap:wrap}}
</style>
</head>
<body>
<main class="dm-wrap">
    <section class="dm-head">
        <h1>${escapeHtml(title)}</h1>
        <div class="dm-meta">
            <span><b>Channel ID:</b> ${escapeHtml(channel.id)}</span>
            <span><b>Generated:</b> ${escapeHtml(generatedAt)}</span>
            <span><b>Messages:</b> ${messages.length}</span>
            <span><b>Participants:</b> ${participantCount}</span>
        </div>
        <div class="dm-filters">${renderFilterSummary(options)}</div>
    </section>
    <section class="dm-log">
        ${messages.map(message => renderTranscriptMessage(message, channel, assetPaths)).join("\n")}
    </section>
</main>
</body>
</html>`;
}

function collectTranscriptAssets(messages: SearchMessage[]) {
    const assets: TranscriptAsset[] = [];
    const seenUrls = new Set<string>();

    function add(url: string, path: string, label: string) {
        if (!url || seenUrls.has(url)) return;
        seenUrls.add(url);
        assets.push({ url, path, label });
    }

    for (const message of messages) {
        const avatarUrl = getAuthorAvatarUrl(message);
        if (avatarUrl && message.author?.id) {
            add(avatarUrl, `avatars/${message.author.id}_${getUrlFilename(avatarUrl, "avatar.png")}`, `${getAuthorName(message)} avatar`);
        }

        message.attachments?.forEach((attachment, index) => {
            const url = getAttachmentUrl(attachment);
            if (!url) return;

            const name = safeArchiveFilename(getAttachmentName(attachment), `attachment_${index}`);
            add(url, `attachments/${message.id}/${index}_${name}`, name);
        });

        message.embeds?.forEach((rawEmbed, index) => {
            const embed = rawEmbed as Record<string, any>;
            const urls = [
                embed.image?.proxy_url || embed.image?.url,
                embed.thumbnail?.proxy_url || embed.thumbnail?.url
            ].filter(Boolean) as string[];

            urls.forEach((url, urlIndex) => {
                add(url, `embeds/${message.id}/${index}_${urlIndex}_${getUrlFilename(url, "embed_media")}`, "embed media");
            });
        });
    }

    return assets;
}

async function downloadTranscriptAsset(asset: TranscriptAsset) {
    const response = await fetch(asset.url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

    return new Uint8Array(await response.arrayBuffer());
}

async function downloadTranscriptAssets(assets: TranscriptAsset[]) {
    const assetPaths = new Map<string, string>();
    const files: Record<string, Uint8Array> = {};
    let completed = 0;
    let failed = 0;
    let nextIndex = 0;
    const workerCount = Math.min(4, assets.length);

    async function worker() {
        while (!runtime.cancelled) {
            const asset = assets[nextIndex++];
            if (!asset) return;

            try {
                const data = await downloadTranscriptAsset(asset);
                files[asset.path] = data;
                assetPaths.set(asset.url, asset.path);
            } catch (error) {
                failed++;
                addLog("warn", `Could not download ${asset.label}; keeping CDN URL in transcript.`);
                console.warn(`[${PLUGIN_ID}] Could not download ${asset.url}`, error);
            } finally {
                completed++;
                if (completed === assets.length || completed % 10 === 0) {
                    setRuntime({ phase: `export downloading ${completed}/${assets.length}` });
                }
            }
        }
    }

    await Promise.all(Array.from({ length: workerCount }, worker));

    return {
        assetPaths,
        files,
        downloaded: Object.keys(files).length,
        failed
    };
}

async function prepareOfflineArchive(channel: Channel, messages: SearchMessage[], participantCount: number, options: RunOptions, baseFilename: string) {
    const assets = collectTranscriptAssets(messages);
    setRuntime({ phase: "export downloading" });
    addLog("info", `Downloading ${assets.length} export asset(s) for offline archive.`);

    const downloadedAssets = await downloadTranscriptAssets(assets);
    if (runtime.cancelled) throw new Error("Export cancelled.");

    const html = generateHtmlTranscript(channel, messages, participantCount, options, downloadedAssets.assetPaths);
    const zipEntries: Record<string, Uint8Array> = {
        "transcript.html": strToU8(html),
        ...downloadedAssets.files
    };

    setRuntime({ phase: "export zipping" });
    const zip = zipSync(zipEntries, { level: 0 });
    addLog("success", `Offline archive ready: ${downloadedAssets.downloaded}/${assets.length} asset(s) downloaded, ${downloadedAssets.failed} failed.`);

    return {
        filename: `${baseFilename}.zip`,
        data: zip,
        mimeType: "application/zip",
        message: `deleteExportMessages offline ZIP transcript for ${getChannelLabel(channel)} (${messages.length} messages, ${participantCount} participant(s), ${downloadedAssets.downloaded}/${assets.length} asset(s)).`
    };
}

function prepareHtmlExport(channel: Channel, messages: SearchMessage[], participantCount: number, options: RunOptions, baseFilename: string): PreparedExport {
    return {
        filename: `${baseFilename}.html`,
        data: generateHtmlTranscript(channel, messages, participantCount, options),
        mimeType: "text/html",
        message: `deleteExportMessages HTML transcript for ${getChannelLabel(channel)} (${messages.length} messages, ${participantCount} participant(s)).`
    };
}

async function saveExportFile(filename: string, content: string | Uint8Array, mimeType: string) {
    if (IS_DISCORD_DESKTOP && DiscordNative.fileManager?.saveWithDialog) {
        const data = typeof content === "string" ? new TextEncoder().encode(content) : content;
        await DiscordNative.fileManager.saveWithDialog(data, filename);
        return;
    }

    const fileContent = typeof content === "string"
        ? content
        : content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);

    saveFile(new File([fileContent], filename, { type: mimeType }));
}

function getPrivateChannelId(candidate: any) {
    if (typeof candidate === "string") return candidate;
    return candidate?.id ?? candidate?.channelId ?? null;
}

function findExistingExportChannelId() {
    const privateChannels = (ChannelStore as any).getSortedPrivateChannels?.() ?? [];

    for (const candidate of privateChannels) {
        const channelId = getPrivateChannelId(candidate);
        if (!channelId) continue;

        const channel = ChannelStore.getChannel(channelId) ?? candidate;
        if (channel?.type === GROUP_DM_CHANNEL_TYPE && channel?.name === EXPORT_CHANNEL_NAME) return channelId as string;
    }

    return null;
}

async function createPrivateExportChannel() {
    const response = await requestWithRetry("create private export group", () => RestAPI.post({
        url: "/users/@me/channels",
        body: {
            recipients: []
        },
        retries: 0
    }));

    const channel = (response as any).body as Channel | undefined;
    if (!channel?.id) throw new Error("Discord did not return an export channel id.");

    FluxDispatcher.dispatch({ type: "CHANNEL_CREATE", channel });

    try {
        await requestWithRetry("rename private export group", () => RestAPI.patch({
            url: Constants.Endpoints.CHANNEL(channel.id),
            body: {
                name: EXPORT_CHANNEL_NAME
            },
            retries: 0
        }), 2);
    } catch (error) {
        addLog("warn", `Could not rename the private export group. Using channel ${channel.id}.`);
        console.warn(`[${PLUGIN_ID}] Could not rename export channel`, error);
    }

    return channel.id;
}

async function resolveExportChannelId() {
    const existingChannelId = findExistingExportChannelId();
    if (existingChannelId) return existingChannelId;

    return createPrivateExportChannel();
}

function uploadFileToDiscord(channelId: string, file: File) {
    const upload = new CloudUploader({ file, platform: CloudUploadPlatform.WEB }, channelId);

    return new Promise<ExportUploadAttachment>((resolve, reject) => {
        upload.on("complete", () => {
            resolve({
                id: "0",
                filename: upload.filename,
                uploaded_filename: upload.uploadedFilename
            });
        });

        upload.on("error", () => reject(new Error(`Failed to upload ${file.name}`)));
        upload.upload();
    });
}

async function sendExportFile(channelId: string, filename: string, content: string | Uint8Array, mimeType: string, message: string) {
    const fileContent = typeof content === "string"
        ? content
        : content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
    const file = new File([fileContent], filename, { type: mimeType });
    const attachment = await uploadFileToDiscord(channelId, file);

    await requestWithRetry("send export file", () => RestAPI.post({
        url: Constants.Endpoints.MESSAGES(channelId),
        body: {
            flags: 0,
            channel_id: channelId,
            content: message,
            nonce: SnowflakeUtils.fromTimestamp(Date.now()),
            sticker_ids: [],
            type: 0,
            attachments: [attachment]
        },
        retries: 0
    }));
}

async function sendExportFileToResolvedChannel(filename: string, content: string | Uint8Array, mimeType: string, message: string) {
    const channelId = await resolveExportChannelId();

    try {
        await sendExportFile(channelId, filename, content, mimeType, message);
        return channelId;
    } catch (error) {
        addLog("warn", "Stored export channel failed. Creating a fresh private export group.");
        const fallbackChannelId = await createPrivateExportChannel();
        await sendExportFile(fallbackChannelId, filename, content, mimeType, message);
        return fallbackChannelId;
    }
}

async function runExport(channel: Channel, options: RunOptions, offlineArchive: boolean) {
    if (runtime.running) {
        setRuntime({ cancelled: true });
        addLog("warn", "Stop requested. Waiting for the current export request/pause to finish.");
        return;
    }

    addLog("info", `Export started for ${getChannelLabel(channel)}.`);

    try {
        const messages = await collectExportMessages(channel, options);
        if (runtime.cancelled) {
            addLog("warn", "Export cancelled.");
            return;
        }

        const participants = Array.from(
            new Map(
                messages
                    .filter(message => message.author?.id)
                    .map(message => [message.author!.id, {
                        id: message.author!.id,
                        username: message.author?.username ?? "unknown"
                    }])
            ).values()
        );

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const baseFilename = `discord_transcript_${safeFilename(getChannelLabel(channel))}_${timestamp}`;
        const preparedExport = offlineArchive
            ? await prepareOfflineArchive(channel, messages, participants.length, options, baseFilename)
            : prepareHtmlExport(channel, messages, participants.length, options, baseFilename);
        let uploaded = false;

        setRuntime({ phase: "export upload" });
        addLog("info", `Uploading ${offlineArchive ? "offline ZIP archive" : "online HTML transcript"} to private channel.`);

        try {
            const exportChannelId = await sendExportFileToResolvedChannel(
                preparedExport.filename,
                preparedExport.data,
                preparedExport.mimeType,
                preparedExport.message
            );
            uploaded = true;
            addLog("success", `Export uploaded to private channel ${exportChannelId}.`);
        } catch (error) {
            addLog("error", "Could not upload export to Discord. Falling back to local save.");
            console.error(`[${PLUGIN_ID}] Export upload failed`, error);
        }

        if (!uploaded) {
            setRuntime({ phase: "export saving" });
            await saveExportFile(preparedExport.filename, preparedExport.data, preparedExport.mimeType);
            addLog("success", `Export saved locally as ${preparedExport.filename}.`);
        }

        setRuntime({
            phase: "idle",
            totalToDelete: 0,
            found: messages.length
        });
        addLog("success", `Export complete: ${messages.length} messages, ${participants.length} participant(s).`);
        toast(`Export complete: ${messages.length} messages.`, Toasts.Type.SUCCESS);
    } catch (error) {
        addLog("error", "Export failed. Check the console for details.");
        console.error(`[${PLUGIN_ID}] Export failed`, error);
        toast("Chat export failed. Check the modal log and console.", Toasts.Type.FAILURE);
    } finally {
        setRuntime({
            running: false,
            cancelled: false,
            phase: "idle"
        });
    }
}

async function deleteExportMessagesPage(messages: SearchMessage[], options: RunOptions) {
    for (let index = 0; index < messages.length; index++) {
        if (runtime.cancelled) break;

        const message = messages[index];
        const done = runtime.deleted + runtime.failed + 1;

        try {
            await deleteMessage(message.channel_id, message.id);
            setRuntime({ deleted: runtime.deleted + 1 });
            addLog("success", `[${done}] Deleted ${message.id}.`);
        } catch (error) {
            setRuntime({ failed: runtime.failed + 1 });
            addLog("error", `[${done}] Failed ${message.id}.`);
            console.error(`[${PLUGIN_ID}] Failed to delete message ${message.id}`, error);
        }

        if (runtime.cancelled) break;

        if (options.deleteDelayMs > 0) {
            setRuntime({ phase: "delete delay" });
            if (!await waitWithCancel(options.deleteDelayMs)) break;
            setRuntime({ phase: "deleting" });
        }

        const processed = runtime.deleted + runtime.failed;
        if (
            options.deleteBatchSize > 0 &&
            processed > 0 &&
            processed % options.deleteBatchSize === 0 &&
            options.deleteBatchPauseMs > 0
        ) {
            setRuntime({ phase: "batch pause" });
            addLog("info", `Batch ${options.deleteBatchSize} processed (${processed}); pause ${Math.round(options.deleteBatchPauseMs / 1000)}s.`);
            if (!await waitWithCancel(options.deleteBatchPauseMs)) break;
            setRuntime({ phase: "deleting" });
        }
    }
}

async function runDeletion(channel: Channel, options: RunOptions) {
    if (runtime.running) {
        setRuntime({ cancelled: true });
        addLog("warn", "Stop requested. Waiting for the current request/pause to finish.");
        return;
    }

    const currentUser = UserStore.getCurrentUser();
    if (!currentUser?.id) {
        toast("Could not find your current user id.", Toasts.Type.FAILURE);
        return;
    }

    setRuntime({
        running: true,
        cancelled: false,
        phase: "searching",
        scannedPages: 0,
        found: 0,
        totalSearchResults: 0,
        deleted: 0,
        failed: 0,
        skipped: 0,
        totalToDelete: options.maxMessagesPerRun > 0 ? options.maxMessagesPerRun : 0
    });

    addLog("info", `Started for ${getChannelLabel(channel)}.`);

    try {
        const seen = new Set<string>();
        let before: string | undefined;
        let page = 0;
        let found = 0;
        let confirmed = false;

        while (!runtime.cancelled) {
            if (getRemainingDeleteLimit(options, found) <= 0) break;

            page++;
            setRuntime({ phase: "searching" });
            const result = await getDeletionFetchPage(channel, currentUser.id, options, seen, before, page, found);
            found += result.messages.length;

            if (result.messages.length && !confirmed) {
                setRuntime({
                    phase: "confirming",
                    totalToDelete: options.maxMessagesPerRun > 0 ? options.maxMessagesPerRun : 0
                });

                if (!await confirmDelete(channel, options.maxMessagesPerRun || result.messages.length)) {
                    addLog("warn", "Deletion cancelled before delete phase.");
                    return;
                }

                confirmed = true;
                setRuntime({ phase: "deleting" });
                addLog("info", "Deletion phase started. Messages will be deleted page by page.");
            }

            if (confirmed && result.messages.length) {
                setRuntime({ phase: "deleting" });
                await deleteExportMessagesPage(result.messages, options);
            }

            if (runtime.cancelled || getRemainingDeleteLimit(options, found) <= 0) break;

            if (options.maxSearchPages > 0 && page >= options.maxSearchPages) break;
            if (!result.before || result.pageCount < MESSAGE_FETCH_PAGE_SIZE) break;

            before = result.before;

            if (options.searchOffsetPauseMs > 0) {
                setRuntime({ phase: "search pause" });
                addLog("info", `Pause ${Math.round(options.searchOffsetPauseMs / 1000)}s before next page.`);
                if (!await waitWithCancel(options.searchOffsetPauseMs)) break;
            }
        }

        if (!found) {
            addLog("success", "No deletable messages found.");
            toast("No deletable messages found.", Toasts.Type.SUCCESS);
            return;
        }

        const level = runtime.failed ? "warn" : "success";
        addLog(level, `Finished: ${runtime.deleted} deleted, ${runtime.failed} failed, ${runtime.skipped} skipped.`);
        toast(`Finished: ${runtime.deleted} deleted, ${runtime.failed} failed.`, runtime.failed ? Toasts.Type.FAILURE : Toasts.Type.SUCCESS);
    } catch (error) {
        addLog("error", "Run failed. Check the console for details.");
        console.error(`[${PLUGIN_ID}] Run failed`, error);
        toast("deleteExportMessages failed. Check the modal log and console.", Toasts.Type.FAILURE);
    } finally {
        setRuntime({
            running: false,
            cancelled: false,
            phase: "idle"
        });
    }
}

function DeleteExportMessagesModal({ channel, rootProps, close }: {
    channel: Channel;
    rootProps: RenderModalProps;
    close: () => void;
}) {
    const currentRuntime = useRuntime();

    const [deleteDelayMs, setDeleteDelayMs] = useState(String(settings.store.deleteDelayMs ?? DEFAULT_DELETE_DELAY_MS));
    const [deleteBatchSize, setDeleteBatchSize] = useState(String(settings.store.deleteBatchSize ?? DEFAULT_DELETE_BATCH_SIZE));
    const [deleteBatchPauseMs, setDeleteBatchPauseMs] = useState(String(settings.store.deleteBatchPauseMs ?? DEFAULT_DELETE_BATCH_PAUSE_MS));
    const [searchOffsetPauseMs, setSearchOffsetPauseMs] = useState(String(settings.store.searchOffsetPauseMs ?? DEFAULT_SEARCH_OFFSET_PAUSE_MS));
    const [maxMessagesPerRun, setMaxMessagesPerRun] = useState(String(settings.store.maxMessagesPerRun ?? 0));
    const [maxSearchPages, setMaxSearchPages] = useState(String(settings.store.maxSearchPages ?? 0));
    const [contentFilter, setContentFilter] = useState(settings.store.contentFilter || "");
    const [dataTypeFilter, setDataTypeFilter] = useState<DataTypeFilter>((settings.store.dataTypeFilter as DataTypeFilter) || "all");
    const [fromDate, setFromDate] = useState(settings.store.fromDate || "");
    const [toDate, setToDate] = useState(settings.store.toDate || "");

    const buildOptions = (): RunOptions => ({
        deleteDelayMs: toNumber(deleteDelayMs, DEFAULT_DELETE_DELAY_MS, 0),
        deleteBatchSize: toNumber(deleteBatchSize, DEFAULT_DELETE_BATCH_SIZE, 0),
        deleteBatchPauseMs: toNumber(deleteBatchPauseMs, DEFAULT_DELETE_BATCH_PAUSE_MS, 0),
        searchOffsetPauseMs: toNumber(searchOffsetPauseMs, DEFAULT_SEARCH_OFFSET_PAUSE_MS, 0),
        maxMessagesPerRun: toNumber(maxMessagesPerRun, 0, 0),
        maxSearchPages: toNumber(maxSearchPages, 0, 0),
        contentFilter: contentFilter.trim(),
        dataTypeFilter,
        fromDate: fromDate.trim(),
        toDate: toDate.trim()
    });

    const saveOptions = (options: RunOptions) => {
        settings.store.deleteDelayMs = options.deleteDelayMs;
        settings.store.deleteBatchSize = options.deleteBatchSize;
        settings.store.deleteBatchPauseMs = options.deleteBatchPauseMs;
        settings.store.searchOffsetPauseMs = options.searchOffsetPauseMs;
        settings.store.maxMessagesPerRun = options.maxMessagesPerRun;
        settings.store.maxSearchPages = options.maxSearchPages;
        settings.store.contentFilter = options.contentFilter;
        settings.store.dataTypeFilter = options.dataTypeFilter;
        settings.store.fromDate = options.fromDate;
        settings.store.toDate = options.toDate;
    };

    const start = () => {
        const options = buildOptions();
        saveOptions(options);
        void runDeletion(channel, options);
    };

    const exportOnline = () => {
        const options = buildOptions();
        saveOptions(options);
        void runExport(channel, options, false);
    };

    const exportOffline = () => {
        const options = buildOptions();
        saveOptions(options);
        void runExport(channel, options, true);
    };

    return (
        <Modal
            {...rootProps}
            size="lg"
            title="deleteExportMessages"
            actions={[
                {
                    text: "Close",
                    variant: "secondary",
                    onClick: close
                }
            ]}
        >
            <div style={{ display: "grid", gap: "14px" }}>
                <div>
                    <Heading tag="h4">Target: {getChannelLabel(channel)}</Heading>
                    <div style={mutedStyle}>
                        Phase: {currentRuntime.phase} | Pages: {currentRuntime.scannedPages} | Found: {currentRuntime.found} | Deleted: {currentRuntime.deleted} | Failed: {currentRuntime.failed} | Skipped: {currentRuntime.skipped}
                    </div>
                </div>

                <div style={gridStyle}>
                    <label style={fieldStyle}>
                        <span style={mutedStyle}>Delete delay (ms)</span>
                        <TextInput value={deleteDelayMs} onChange={setDeleteDelayMs} type="number" />
                    </label>
                    <label style={fieldStyle}>
                        <span style={mutedStyle}>Delete batch size</span>
                        <TextInput value={deleteBatchSize} onChange={setDeleteBatchSize} type="number" />
                    </label>
                    <label style={fieldStyle}>
                        <span style={mutedStyle}>Delete batch pause (ms)</span>
                        <TextInput value={deleteBatchPauseMs} onChange={setDeleteBatchPauseMs} type="number" />
                    </label>
                    <label style={fieldStyle}>
                        <span style={mutedStyle}>Scan page pause (ms)</span>
                        <TextInput value={searchOffsetPauseMs} onChange={setSearchOffsetPauseMs} type="number" />
                    </label>
                    <label style={fieldStyle}>
                        <span style={mutedStyle}>Max messages, 0 = all</span>
                        <TextInput value={maxMessagesPerRun} onChange={setMaxMessagesPerRun} type="number" />
                    </label>
                    <label style={fieldStyle}>
                        <span style={mutedStyle}>Max scan pages, 0 = all</span>
                        <TextInput value={maxSearchPages} onChange={setMaxSearchPages} type="number" />
                    </label>
                </div>

                <label style={fieldStyle}>
                    <span style={mutedStyle}>Keyword, optional</span>
                    <TextInput value={contentFilter} onChange={setContentFilter} placeholder="Only messages containing this keyword" />
                </label>

                <div style={gridStyle}>
                    <label style={fieldStyle}>
                        <span style={mutedStyle}>Data type</span>
                        <select
                            value={dataTypeFilter}
                            onChange={event => setDataTypeFilter(event.currentTarget.value as DataTypeFilter)}
                            style={selectStyle}
                        >
                            <option value="all">All messages</option>
                            <option value="text">Text only</option>
                            <option value="attachments">Attachments/files</option>
                            <option value="links">Links</option>
                            <option value="embeds">Embeds</option>
                            <option value="stickers">Stickers</option>
                        </select>
                    </label>
                    <label style={fieldStyle}>
                        <span style={mutedStyle}>After date</span>
                        <input
                            type="datetime-local"
                            value={fromDate}
                            onChange={event => setFromDate(event.currentTarget.value)}
                            style={selectStyle}
                        />
                    </label>
                    <label style={fieldStyle}>
                        <span style={mutedStyle}>Before date</span>
                        <input
                            type="datetime-local"
                            value={toDate}
                            onChange={event => setToDate(event.currentTarget.value)}
                            style={selectStyle}
                        />
                    </label>
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <Button
                        size="small"
                        variant="dangerPrimary"
                        disabled={currentRuntime.running}
                        onClick={start}
                    >
                        Scan and delete
                    </Button>
                    <Button
                        size="small"
                        variant="primary"
                        disabled={currentRuntime.running}
                        onClick={exportOnline}
                    >
                        Export online
                    </Button>
                    <Button
                        size="small"
                        variant="secondary"
                        disabled={currentRuntime.running}
                        onClick={exportOffline}
                    >
                        Export offline
                    </Button>
                    <Button
                        size="small"
                        variant="secondary"
                        disabled={!currentRuntime.running}
                        onClick={() => {
                            setRuntime({ cancelled: true });
                            addLog("warn", "Stop requested by user.");
                        }}
                    >
                        Stop
                    </Button>
                    <Button size="small" variant="secondary" onClick={clearLogs}>
                        Clear log
                    </Button>
                </div>

                <div style={logBoxStyle}>
                    {currentRuntime.logs.length ? currentRuntime.logs.map(log => (
                        <div key={log.id} style={{ color: logColors[log.level] }}>
                            [{log.time}] {log.message}
                        </div>
                    )) : (
                        <div style={{ color: "var(--text-muted)" }}>No logs yet.</div>
                    )}
                </div>
            </div>
        </Modal>
    );
}

const SafeDeleteExportMessagesModal = ErrorBoundary.wrap(DeleteExportMessagesModal, { noop: true });

function openDeleteExportMessagesModal(channel: Channel) {
    const key = openModal(props => (
        <SafeDeleteExportMessagesModal
            channel={channel}
            rootProps={props}
            close={() => closeModal(key)}
        />
    ));
}

const DeleteExportMessagesButton: ChatBarButtonFactory = ({ channel, isMainChat }) => {
    const currentRuntime = useRuntime();

    if (!isMainChat) return null;

    const tooltip = currentRuntime.running
        ? `deleteExportMessages running: ${currentRuntime.deleted}/${currentRuntime.totalToDelete || currentRuntime.found}`
        : "Delete your messages in this conversation";

    return (
        <ChatBarButton
            tooltip={tooltip}
            onClick={() => openDeleteExportMessagesModal(channel)}
            buttonProps={{ "aria-haspopup": "dialog", "aria-busy": currentRuntime.running }}
        >
            <TrashIcon color={currentRuntime.running ? "var(--status-danger)" : undefined} />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "deleteExportMessages",
    description: "Adds a chat bar button to scan and delete your own messages in the current conversation.",
    authors: [{ name: "local", id: 0n }],
    dependencies: ["ChatInputButtonAPI"],
    tags: ["Chat", "Utility"],
    settings,

    chatBarButton: {
        icon: TrashIcon,
        render: DeleteExportMessagesButton
    }
});
