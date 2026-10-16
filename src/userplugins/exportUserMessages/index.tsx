/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addContextMenuPatch, findGroupChildrenByChildId, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { EquicordDevs } from "@utils/constants";
import { sleep } from "@utils/misc";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { saveFile } from "@utils/web";
import type { Message } from "@vencord/discord-types";
import { strToU8, zipSync } from "fflate";
import { ChannelStore, Constants, Forms, GuildStore, IconUtils, Menu, RestAPI, TextInput, UserStore, useState } from "@webpack/common";

type ExportFormat = "html" | "md" | "txt" | "json" | "csv";
type ImageChoice = "none" | "builtin" | "custom";
type ExportScope = "person" | "channel";

interface ExportedMessage {
    id: string;
    timestamp: string;
    editedAt?: string;
    authorId: string;
    authorName: string;
    authorAvatarUrl: string;
    content: string;
    attachments: Array<{ url: string; filename: string; size: number; contentType: string; }>;
    embeds: Array<{ title?: string; description?: string; url?: string; image?: string; }>;
    stickers: Array<{ name: string; id: string; }>;
    reactions: Array<{ emoji: string; count: number; }>;
}

interface AssetRef { url: string; path: string; }

const settings = definePluginSettings({
    defaultFormat: {
        type: OptionType.SELECT,
        description: "Default export format.",
        options: [
            { label: "HTML", value: "html", default: true },
            { label: "Markdown", value: "md" },
            { label: "Plain text", value: "txt" },
            { label: "JSON", value: "json" },
            { label: "CSV", value: "csv" },
        ]
    },
    maxScan: {
        type: OptionType.SLIDER,
        description: "Max number of messages to scan back through the channel history per export.",
        markers: [500, 1000, 2500, 5000, 10000],
        default: 3000,
        stickToMarkers: true
    }
});

function ExportIcon({ width = 20, height = 20 }: { width?: number; height?: number; }) {
    return (
        <svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width={width} height={height} fill="none" viewBox="0 0 24 24">
            <path fill="currentColor" d="M13 16V5.41l3.3 3.3a1 1 0 1 0 1.4-1.42l-5-5a1 1 0 0 0-1.4 0l-5 5a1 1 0 0 0 1.4 1.42L11 5.4V16a1 1 0 1 0 2 0Z" />
            <path fill="currentColor" d="M4 15a1 1 0 0 1 1-1h2a1 1 0 1 0 0-2H5a3 3 0 0 0-3 3v4a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-4a3 3 0 0 0-3-3h-2a1 1 0 1 0 0 2h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4Z" />
        </svg>
    );
}

function getMediaType(url: string, contentType: string): "image" | "video" | "audio" | "file" {
    if (contentType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|avif|svg)(\?|$)/i.test(url)) return "image";
    if (contentType.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url)) return "video";
    if (contentType.startsWith("audio/") || /\.(mp3|ogg|wav|flac|m4a)(\?|$)/i.test(url)) return "audio";
    return "file";
}

function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeFilename(value: string, fallback = "file") {
    return value
        .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 100) || fallback;
}

function getUrlFilename(url: string, fallback = "file") {
    try {
        const path = new URL(url).pathname;
        const name = decodeURIComponent(path.split("/").filter(Boolean).pop() ?? "");
        return safeFilename(name, fallback);
    } catch {
        return safeFilename(fallback, "file");
    }
}

/** Fetches channel history. Pass `authorId` to filter to one person, or null for the whole conversation. */
async function fetchMessages(
    channelId: string,
    authorId: string | null,
    maxScan: number,
    onProgress: (scanned: number, found: number) => void
): Promise<ExportedMessage[]> {
    const results: ExportedMessage[] = [];
    let before: string | undefined;
    let scanned = 0;

    while (scanned < maxScan) {
        const batchSize = Math.min(100, maxScan - scanned);
        const res = await RestAPI.get({
            url: Constants.Endpoints.MESSAGES(channelId),
            query: { limit: batchSize, ...(before ? { before } : {}) },
            retries: 2
        }).catch(() => null as any);

        const batch: any[] = res?.body ?? [];
        if (!batch.length) break;

        for (const m of batch) {
            scanned++;
            if (authorId && m.author?.id !== authorId) continue;
            results.push({
                id: m.id,
                timestamp: m.timestamp,
                editedAt: m.edited_timestamp ?? undefined,
                authorId: m.author?.id,
                authorName: m.author?.global_name ?? m.author?.username ?? "Unknown",
                authorAvatarUrl: m.author?.avatar
                    ? IconUtils.getUserAvatarURL({ id: m.author.id, avatar: m.author.avatar } as any, false, 64)
                    : IconUtils.getDefaultAvatarURL(m.author?.id ?? "0"),
                content: m.content ?? "",
                attachments: (m.attachments ?? []).map((a: any) => ({
                    url: a.url,
                    filename: a.filename,
                    size: a.size,
                    contentType: a.content_type ?? "application/octet-stream"
                })),
                embeds: (m.embeds ?? []).map((e: any) => ({
                    title: e.title,
                    description: e.description,
                    url: e.url,
                    image: e.image?.url ?? e.thumbnail?.url
                })),
                stickers: (m.sticker_items ?? []).map((s: any) => ({ name: s.name, id: s.id })),
                reactions: (m.reactions ?? []).map((r: any) => ({ emoji: r.emoji?.name ?? r.emoji?.id, count: r.count }))
            });
        }

        onProgress(scanned, results.length);
        before = batch[batch.length - 1].id;
        if (batch.length < batchSize) break;
        await sleep(300);
    }

    return results.reverse();
}

/** Collects every image/video/audio/file URL referenced by the export so it can be downloaded for an offline archive. */
function collectAssets(messages: ExportedMessage[], headerImage: string | null): AssetRef[] {
    const assets: AssetRef[] = [];
    const seen = new Set<string>();

    function add(url: string | null | undefined, path: string) {
        if (!url || seen.has(url)) return;
        seen.add(url);
        assets.push({ url, path });
    }

    add(headerImage, `assets/header_${getUrlFilename(headerImage ?? "", "header.png")}`);

    for (const m of messages) {
        add(m.authorAvatarUrl, `assets/avatars/${m.authorId}_${getUrlFilename(m.authorAvatarUrl, "avatar.png")}`);
        m.attachments.forEach((a, i) => add(a.url, `assets/${m.id}_${i}_${safeFilename(a.filename, getUrlFilename(a.url))}`));
        m.embeds.forEach((e, i) => { if (e.image) add(e.image, `assets/${m.id}_embed${i}_${getUrlFilename(e.image)}`); });
    }

    return assets;
}

/** Downloads assets with a small worker pool; failures fall back to the original remote URL rather than aborting the export. */
async function downloadAssets(assets: AssetRef[], onProgress: (done: number, total: number) => void) {
    const files: Record<string, Uint8Array> = {};
    const assetMap = new Map<string, string>();
    let done = 0, failed = 0, next = 0;
    const workerCount = Math.min(4, assets.length) || 1;

    async function worker() {
        while (true) {
            const asset = assets[next++];
            if (!asset) return;
            try {
                const res = await fetch(asset.url);
                if (!res.ok) throw new Error(String(res.status));
                files[asset.path] = new Uint8Array(await res.arrayBuffer());
                assetMap.set(asset.url, asset.path);
            } catch {
                failed++;
            } finally {
                done++;
                onProgress(done, assets.length);
            }
        }
    }

    await Promise.all(Array.from({ length: workerCount }, worker));
    return { files, assetMap, failed };
}

function buildTxt(messages: ExportedMessage[], title: string, headerImage: string | null, showAuthor: boolean): string {
    const lines = [
        `=== ${title} ===`,
        `Exported on ${new Date().toLocaleString()}`,
        `Total: ${messages.length} messages`,
        ...(headerImage ? [`Image: ${headerImage}`] : []),
        ""
    ];
    for (const m of messages) {
        const d = new Date(m.timestamp).toLocaleString();
        const who = showAuthor ? `${m.authorName}: ` : "";
        lines.push(`[${d}]${m.editedAt ? " (edited)" : ""} ${who}${m.content}`);
        for (const a of m.attachments) lines.push(`  [${getMediaType(a.url, a.contentType).toUpperCase()}] ${a.filename} (${formatSize(a.size)}) — ${a.url}`);
        for (const e of m.embeds) if (e.url) lines.push(`  [LINK] ${e.title ?? "Embed"}: ${e.url}`);
        for (const s of m.stickers) lines.push(`  [STICKER] ${s.name}`);
        if (m.reactions.length) lines.push(`  ${m.reactions.map(r => `${r.emoji} x${r.count}`).join(" ")}`);
    }
    return lines.join("\n");
}

function buildMd(messages: ExportedMessage[], title: string, headerImage: string | null, showAuthor: boolean, assetMap?: Map<string, string>): string {
    const resolve = (url: string) => assetMap?.get(url) ?? url;
    const lines = [
        `# ${title}`,
        ...(headerImage ? [`![header](${resolve(headerImage)})`, ""] : []),
        `> Exported on ${new Date().toLocaleString()} · **${messages.length} messages**`,
        ""
    ];
    for (const m of messages) {
        const d = new Date(m.timestamp).toLocaleString();
        const avatar = `<img src="${resolve(m.authorAvatarUrl)}" width="20" height="20" style="border-radius:50%;vertical-align:middle">`;
        const who = showAuthor ? `**${m.authorName}** — ` : "";
        lines.push(`${avatar} ${who}*${d}*${m.editedAt ? " *(edited)*" : ""}`);
        if (m.content) lines.push(m.content);
        for (const a of m.attachments) {
            const type = getMediaType(a.url, a.contentType);
            lines.push(type === "image" ? `![${a.filename}](${resolve(a.url)})` : `[${a.filename}](${resolve(a.url)}) *(${formatSize(a.size)})*`);
        }
        for (const e of m.embeds) if (e.url) lines.push(`[${e.title ?? "Link"}](${e.url})`);
        for (const s of m.stickers) lines.push(`*Sticker: ${s.name}*`);
        if (m.reactions.length) lines.push(m.reactions.map(r => `${r.emoji} \`${r.count}\``).join(" "));
        lines.push("");
    }
    return lines.join("\n");
}

function buildJson(messages: ExportedMessage[], title: string, headerImage: string | null): string {
    return JSON.stringify({ title, headerImage, exported: new Date().toISOString(), count: messages.length, messages }, null, 2);
}

function buildCsv(messages: ExportedMessage[]): string {
    const esc = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const rows = [["ID", "Timestamp", "EditedAt", "AuthorId", "AuthorName", "AuthorAvatar", "Content", "Attachments", "Embeds", "Stickers", "Reactions"]];
    for (const m of messages) {
        rows.push([
            m.id, m.timestamp, m.editedAt ?? "", m.authorId, m.authorName, m.authorAvatarUrl, m.content,
            m.attachments.map(a => a.url).join("|"),
            m.embeds.map(e => e.url ?? e.title ?? "").join("|"),
            m.stickers.map(s => s.name).join("|"),
            m.reactions.map(r => `${r.emoji}:${r.count}`).join("|")
        ]);
    }
    return rows.map(r => r.map(esc).join(",")).join("\n");
}

function buildHtml(messages: ExportedMessage[], title: string, headerImage: string | null, showAuthor: boolean, assetMap?: Map<string, string>): string {
    const resolve = (url: string) => assetMap?.get(url) ?? url;
    const rows = messages.map(m => {
        const d = new Date(m.timestamp).toLocaleString();
        const edited = m.editedAt ? `<span class="epm-edited">(edited)</span>` : "";
        const avatar = `<img class="epm-avatar" src="${resolve(m.authorAvatarUrl)}" alt="">`;
        const author = showAuthor ? `<span class="epm-author">${m.authorName}</span>` : "";
        const content = m.content ? `<div class="epm-msg-content">${m.content.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</div>` : "";
        const mediaHtml = m.attachments.map(a => {
            const type = getMediaType(a.url, a.contentType);
            const src = resolve(a.url);
            if (type === "image") return `<div class="epm-media"><img src="${src}" alt="${a.filename}" loading="lazy"><div class="epm-media-name">${a.filename} (${formatSize(a.size)})</div></div>`;
            if (type === "video") return `<div class="epm-media"><video src="${src}" controls preload="none"></video><div class="epm-media-name">${a.filename}</div></div>`;
            if (type === "audio") return `<div class="epm-media"><audio src="${src}" controls></audio><div class="epm-media-name">${a.filename}</div></div>`;
            return `<div class="epm-attachment"><a href="${src}" target="_blank">${a.filename}</a> <span class="epm-size">${formatSize(a.size)}</span></div>`;
        }).join("");
        const embedHtml = m.embeds.map(e => {
            let html = `<div class="epm-embed">`;
            if (e.title) html += `<div class="epm-embed-title">${e.title.replace(/</g, "&lt;")}</div>`;
            if (e.description) html += `<div class="epm-embed-desc">${e.description.slice(0, 300).replace(/</g, "&lt;")}</div>`;
            if (e.image) html += `<img src="${resolve(e.image)}" class="epm-embed-img" loading="lazy">`;
            if (e.url) html += `<a href="${e.url}" target="_blank" class="epm-embed-url">${e.url}</a>`;
            return html + "</div>";
        }).join("");
        const stickerHtml = m.stickers.map(s => `<span class="epm-sticker">${s.name}</span>`).join("");
        const reactHtml = m.reactions.length
            ? `<div class="epm-reactions">${m.reactions.map(r => `<span class="epm-reaction">${r.emoji} ${r.count}</span>`).join("")}</div>`
            : "";
        return `<div class="epm-msg">${avatar}<div class="epm-msg-body"><div class="epm-msg-header">${author}<span class="epm-ts">${d}</span>${edited}</div>${content}${mediaHtml}${embedHtml}${stickerHtml}${reactHtml}</div></div>`;
    }).join("");

    const headerHtml = headerImage ? `<img class="epm-header-img" src="${resolve(headerImage)}" alt="${title}">` : "";

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#1e1f22;color:#dbdee1;font-family:system-ui,sans-serif;padding:20px;max-width:900px;margin:0 auto}.epm-header{display:flex;align-items:center;gap:12px;margin-bottom:4px}.epm-header-img{width:56px;height:56px;border-radius:50%;object-fit:cover}h1{color:#5865f2}.epm-meta{color:#949ba4;font-size:13px;margin-bottom:24px}.epm-msg{display:flex;gap:12px;padding:10px 12px;border-radius:4px;margin-bottom:2px}.epm-msg:hover{background:rgba(255,255,255,0.04)}.epm-avatar{width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0}.epm-msg-body{flex:1;min-width:0}.epm-msg-header{display:flex;align-items:center;gap:8px;margin-bottom:4px}.epm-author{font-weight:700;color:#f2f3f5;font-size:14px}.epm-ts{font-size:12px;color:#949ba4}.epm-edited{font-size:10px;color:#949ba4}.epm-msg-content{font-size:14px;line-height:1.5;color:#dbdee1;white-space:pre-wrap;word-break:break-word;margin-bottom:4px}.epm-media{margin:6px 0}.epm-media img,.epm-media video{max-width:400px;max-height:300px;border-radius:8px;display:block}.epm-media-name{font-size:11px;color:#949ba4;margin-top:2px}.epm-attachment{padding:6px 10px;background:rgba(0,0,0,0.2);border-radius:4px;margin:4px 0;display:inline-block}.epm-attachment a{color:#00aff4;text-decoration:none}.epm-embed{border-left:4px solid #5865f2;background:rgba(255,255,255,0.04);border-radius:0 4px 4px 0;padding:8px 12px;margin:6px 0}.epm-embed-title{font-weight:700;color:#00aff4;margin-bottom:4px}.epm-embed-desc{font-size:13px}.epm-embed-img{max-width:300px;border-radius:4px;margin-top:6px}.epm-embed-url{font-size:12px;color:#00aff4;display:block;margin-top:4px;text-decoration:none}.epm-sticker{font-size:12px;color:#b5bac1;background:rgba(255,255,255,0.06);border-radius:4px;padding:2px 6px;margin:2px}.epm-reactions{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}.epm-reaction{background:rgba(255,255,255,0.08);border-radius:8px;padding:2px 8px;font-size:12px}audio{width:300px;margin-top:4px}</style>
</head><body><div class="epm-header">${headerHtml}<h1>${title}</h1></div><p class="epm-meta">Exported on ${new Date().toLocaleString()} · ${messages.length} messages</p>${rows}</body></html>`;
}

interface ExportModalProps {
    rootProps: any;
    channelId: string;
    initialScope: ExportScope;
    authorId?: string;
    authorName?: string;
    authorAvatarUrl?: string;
}

function ExportUserMessagesModal({ rootProps, channelId, initialScope, authorId, authorName, authorAvatarUrl }: ExportModalProps) {
    const [scope, setScope] = useState<ExportScope>(authorId ? initialScope : "channel");
    const [format, setFormat] = useState<ExportFormat>(settings.store.defaultFormat as ExportFormat);
    const [imageChoice, setImageChoice] = useState<ImageChoice>("builtin");
    const [customUrl, setCustomUrl] = useState("");
    const [downloadLocally, setDownloadLocally] = useState(true);
    const [status, setStatus] = useState<"idle" | "fetching" | "done" | "error">("idle");
    const [progress, setProgress] = useState("");

    const channel = ChannelStore.getChannel(channelId);
    const channelName = channel?.name || "this conversation";
    const guild = (channel as any)?.guild_id ? GuildStore.getGuild((channel as any).guild_id) : null;

    const channelImageUrl = guild
        ? IconUtils.getGuildIconURL({ id: guild.id, icon: guild.icon, size: 256 })
        : (channel as any)?.icon
            ? IconUtils.getChannelIconURL({ id: channel!.id, icon: (channel as any).icon, size: 256 })
            : undefined;
    const channelImageLabel = guild ? "Server icon" : "Group icon";

    const builtinImageUrl = scope === "person" ? authorAvatarUrl : channelImageUrl;
    const canBundleAssets = format === "html" || format === "md";

    const FORMATS: Array<{ key: ExportFormat; label: string; desc: string; }> = [
        { key: "html", label: "HTML", desc: "Web page with images" },
        { key: "md", label: "MD", desc: "Markdown" },
        { key: "txt", label: "TXT", desc: "Plain text" },
        { key: "json", label: "JSON", desc: "Full structured" },
        { key: "csv", label: "CSV", desc: "Spreadsheet" },
    ];

    async function doExport() {
        setStatus("fetching");
        setProgress("Scanning channel history...");

        const headerImage =
            imageChoice === "builtin" && builtinImageUrl ? builtinImageUrl :
                imageChoice === "custom" && customUrl.trim() ? customUrl.trim() :
                    null;

        const scopedAuthorId = scope === "person" ? authorId! : null;
        const title = scope === "person" ? `Messages from ${authorName}` : `Conversation in #${channelName}`;
        const showAuthorPerLine = scope === "channel";

        try {
            const messages = await fetchMessages(channelId, scopedAuthorId, settings.store.maxScan, (scanned, found) => {
                setProgress(scope === "person"
                    ? `Scanned ${scanned} messages, found ${found} from ${authorName}...`
                    : `Scanned ${scanned} messages...`);
            });

            if (messages.length === 0) {
                setStatus("error");
                setProgress(scope === "person" ? `No messages from ${authorName} found in the scanned history.` : "No messages found in the scanned history.");
                return;
            }

            const safeName = (scope === "person" ? authorName! : channelName).replace(/[^a-z0-9_-]/gi, "_").slice(0, 40) || "export";
            const date = new Date().toISOString().slice(0, 10);

            let assetMap: Map<string, string> | undefined;
            let assetFiles: Record<string, Uint8Array> | undefined;

            if (downloadLocally && canBundleAssets) {
                const assets = collectAssets(messages, headerImage);
                if (assets.length) {
                    const result = await downloadAssets(assets, (done, total) => setProgress(`Downloading assets (${done}/${total})...`));
                    assetMap = result.assetMap;
                    assetFiles = result.files;
                }
            }

            setProgress(`Generating ${format.toUpperCase()} file...`);

            let content: string; let ext: string; let mime: string;
            switch (format) {
                case "json": content = buildJson(messages, title, headerImage); ext = "json"; mime = "application/json"; break;
                case "csv": content = buildCsv(messages); ext = "csv"; mime = "text/csv"; break;
                case "md": content = buildMd(messages, title, headerImage, showAuthorPerLine, assetMap); ext = "md"; mime = "text/markdown"; break;
                case "txt": content = buildTxt(messages, title, headerImage, showAuthorPerLine); ext = "txt"; mime = "text/plain"; break;
                default: content = buildHtml(messages, title, headerImage, showAuthorPerLine, assetMap); ext = "html"; mime = "text/html"; break;
            }

            if (assetFiles && Object.keys(assetFiles).length) {
                const zip = zipSync({ [`export.${ext}`]: strToU8(content), ...assetFiles }, { level: 0 });
                saveFile(new File([zip], `Messages_${safeName}_${date}.zip`, { type: "application/zip" }));
            } else {
                saveFile(new File([content], `Messages_${safeName}_${date}.${ext}`, { type: mime }));
            }

            setStatus("done");
            setProgress(`Exported ${messages.length} messages.`);
        } catch (err: any) {
            setStatus("error");
            setProgress(`Error: ${err?.message || "Failed to export messages"}`);
        }
    }

    return (
        <ModalRoot {...rootProps} size="medium">
            <ModalHeader separator={false}>
                <Forms.FormTitle tag="h4" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <ExportIcon width={16} height={16} /> Export Messages
                </Forms.FormTitle>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent className="epm-content">
                {authorId && (
                    <div className="epm-scope-row">
                        <button className={`epm-scope-btn ${scope === "person" ? "epm-scope-btn--active" : ""}`} onClick={() => { setScope("person"); setImageChoice("builtin"); }}>
                            This person only
                        </button>
                        <button className={`epm-scope-btn ${scope === "channel" ? "epm-scope-btn--active" : ""}`} onClick={() => { setScope("channel"); setImageChoice("builtin"); }}>
                            Whole conversation
                        </button>
                    </div>
                )}

                <div className="epm-target-row">
                    <img src={scope === "person" ? authorAvatarUrl : (channelImageUrl ?? authorAvatarUrl)} className="epm-target-avatar" alt="" />
                    <div className="epm-target-info">
                        <span className="epm-target-name">{scope === "person" ? authorName : channelName}</span>
                        <span className="epm-target-channel">{scope === "person" ? `in #${channelName}` : "every message, every author"}</span>
                    </div>
                </div>

                <Forms.FormTitle tag="h5" className="epm-label">EXPORT FORMAT</Forms.FormTitle>
                <div className="epm-format-row">
                    {FORMATS.map(f => (
                        <button key={f.key}
                            className={`epm-format-btn ${format === f.key ? "epm-format-btn--active" : ""}`}
                            onClick={() => setFormat(f.key)}
                            title={f.desc}>
                            <span className="epm-fmt-key">{f.label}</span>
                            <span className="epm-fmt-desc">{f.desc}</span>
                        </button>
                    ))}
                </div>

                <Forms.FormTitle tag="h5" className="epm-label">IMAGE</Forms.FormTitle>
                <div className="epm-image-row">
                    <button className={`epm-image-btn ${imageChoice === "none" ? "epm-image-btn--active" : ""}`} onClick={() => setImageChoice("none")}>None</button>
                    {builtinImageUrl && (
                        <button className={`epm-image-btn ${imageChoice === "builtin" ? "epm-image-btn--active" : ""}`} onClick={() => setImageChoice("builtin")}>
                            {scope === "person" ? "Their avatar" : channelImageLabel}
                        </button>
                    )}
                    <button className={`epm-image-btn ${imageChoice === "custom" ? "epm-image-btn--active" : ""}`} onClick={() => setImageChoice("custom")}>Custom image URL</button>
                </div>
                {imageChoice === "custom" && (
                    <TextInput
                        placeholder="https://example.com/image.png"
                        value={customUrl}
                        onChange={setCustomUrl}
                    />
                )}

                {canBundleAssets && (
                    <label className="epm-asset-toggle">
                        <input type="checkbox" checked={downloadLocally} onChange={e => setDownloadLocally(e.target.checked)} />
                        <span>Download images/videos into the export (.zip with an assets folder) instead of just linking to Discord</span>
                    </label>
                )}

                {status !== "idle" && (
                    <div className={`epm-status epm-status--${status}`}>{progress}</div>
                )}

                <button className="epm-export-btn" onClick={doExport} disabled={status === "fetching"}>
                    {status === "fetching" ? "Exporting..." : "Export"}
                </button>
            </ModalContent>
        </ModalRoot>
    );
}

function openExportModal(channelId: string, author: { id: string; username: string; globalName?: string; avatar?: string | null; } | undefined, initialScope: ExportScope) {
    const authorName = author ? (author.globalName || author.username || "Unknown") : undefined;
    const authorAvatarUrl = author
        ? (author.avatar ? IconUtils.getUserAvatarURL(author as any, true, 128) : IconUtils.getDefaultAvatarURL(author.id))
        : undefined;

    openModal(props => (
        <ExportUserMessagesModal
            rootProps={props}
            channelId={channelId}
            initialScope={initialScope}
            authorId={author?.id}
            authorName={authorName}
            authorAvatarUrl={authorAvatarUrl}
        />
    ));
}

const MessageContextPatch: NavContextMenuPatchCallback = (children, { message }: { message?: Message; }) => {
    if (!message?.author) return;
    const group = findGroupChildrenByChildId("copy-text", children);
    if (!group) return;

    const authorName = (message.author as any).globalName || message.author.username;
    group.push(
        <Menu.MenuItem
            id="epm-export-user-messages"
            label={`Export ${authorName}'s Messages`}
            icon={ExportIcon}
            action={() => openExportModal(message.channel_id, message.author as any, "person")}
        />
    );
};

const UserContextPatch: NavContextMenuPatchCallback = (children, { user }: any) => {
    if (!user?.id) return;
    const channelId = (ChannelStore as any).getDMFromUserId?.(user.id);
    if (!channelId) return;

    children.push(
        <Menu.MenuItem
            id="epm-export-conversation"
            label="Export Conversation"
            icon={ExportIcon}
            action={() => openExportModal(channelId, user, "channel")}
        />
    );
};

const ChannelContextPatch: NavContextMenuPatchCallback = (children, { channel }: any) => {
    if (!channel?.id) return;

    let author: any;
    if (channel.type === 1 && channel.recipients?.length) {
        author = UserStore.getUser(channel.recipients[0]);
    }

    children.push(
        <Menu.MenuItem
            id="epm-export-conversation"
            label="Export Conversation"
            icon={ExportIcon}
            action={() => openExportModal(channel.id, author, "channel")}
        />
    );
};

export default definePlugin({
    name: "ExportUserMessages",
    description: "Export a single person's messages or a whole conversation (DM, group, or channel), with images bundled locally and a choice of format.",
    authors: [EquicordDevs.nobody],
    tags: ["export", "messages", "user"],
    dependencies: ["ContextMenuAPI"],
    settings,

    contextMenus: {
        "user-context": UserContextPatch,
        "channel-context": ChannelContextPatch,
        "gdm-context": ChannelContextPatch
    },

    start() {
        addContextMenuPatch("message", MessageContextPatch);
    },

    stop() {
        removeContextMenuPatch("message", MessageContextPatch);
    },
});
