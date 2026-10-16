/*
 * MessageKeeper - Log and display deleted messages
 */

import { get as dsGet, set as dsSet } from "@api/DataStore";
import { addContextMenuPatch, findGroupChildrenByChildId, removeContextMenuPatch } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { copyToClipboard } from "@utils/clipboard";
import definePlugin, { OptionType } from "@utils/types";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { FluxDispatcher, Menu, MessageStore, Modal, openModal, React, showToast, Toasts } from "@webpack/common";

const DATA_KEY = "MessageKeeper_DeletedMessages";

interface DeletedMessage {
    id: string;
    channelId: string;
    guildId: string | null;
    author: { id: string; username: string; globalName: string; avatar: string | null; };
    content: string;
    timestamp: string;
    deletedAt: string;
}

const settings = definePluginSettings({
    detectDeletes: { type: OptionType.BOOLEAN, description: "Detect and log deleted messages from all users", default: true },
    maxLogSize: { type: OptionType.SLIDER, description: "Maximum number of deleted messages to keep in logs", markers: [100, 500, 1000, 2500, 5000], default: 1000, stickToMarkers: true },
    accentColor: { type: OptionType.STRING, description: "Accent color for deleted message badge (hex)", default: "#a855f7" },
});

async function getDeletedMessages(): Promise<DeletedMessage[]> {
    try {
        return (await dsGet(DATA_KEY)) || [];
    } catch {
        return [];
    }
}

async function saveDeletedMessage(msg: DeletedMessage) {
    try {
        const messages = await getDeletedMessages();
        messages.unshift(msg);
        const maxSize = settings.store.maxLogSize;
        if (messages.length > maxSize) messages.length = maxSize;
        await dsSet(DATA_KEY, messages);
    } catch (e) {
        console.error("[MessageKeeper] Failed to save:", e);
    }
}

const msgCache = new Map<string, any>();

function onMessageCreate(e: any) {
    try {
        if (e.message) {
            msgCache.set(`${e.message.channel_id}:${e.message.id}`, e.message);
            if (msgCache.size > 2000) {
                const first = msgCache.keys().next().value;
                if (first) msgCache.delete(first);
            }
        }
    } catch { }
}

function onMessageDelete(e: any) {
    if (!settings.store.detectDeletes) return;
    try {
        const { id, channel_id } = e;
        if (!id || !channel_id) return;

        const cached = msgCache.get(`${channel_id}:${id}`);
        if (cached) {
            const author = cached.author || {};
            saveDeletedMessage({
                id: cached.id,
                channelId: channel_id,
                guildId: cached.guild_id || null,
                author: {
                    id: author.id || "unknown",
                    username: author.username || "unknown",
                    globalName: author.globalName || author.username || "unknown",
                    avatar: author.avatar || null,
                },
                content: cached.content || "",
                timestamp: cached.timestamp || new Date().toISOString(),
                deletedAt: new Date().toISOString(),
            });
            msgCache.delete(`${channel_id}:${id}`);
        } else {
            const msg = MessageStore?.getMessage(channel_id, id);
            if (!msg) return;
            const author = msg.author || {};
            saveDeletedMessage({
                id: msg.id,
                channelId: channel_id,
                guildId: msg.guild_id || null,
                author: {
                    id: author.id || "unknown",
                    username: author.username || "unknown",
                    globalName: author.globalName || author.username || "unknown",
                    avatar: author.avatar || null,
                },
                content: msg.content || "",
                timestamp: msg.timestamp || new Date().toISOString(),
                deletedAt: new Date().toISOString(),
            });
        }
    } catch (e) {
        console.error("[MessageKeeper] Error handling delete:", e);
    }
}

function LogModal(props: { onClose: () => void }) {
    const [messages, setMessages] = React.useState<DeletedMessage[]>([]);
    const [search, setSearch] = React.useState("");
    const [channelFilter, setChannelFilter] = React.useState("");

    React.useEffect(() => {
        getDeletedMessages().then(setMessages);
    }, []);

    const filtered = React.useMemo(() => {
        let list = messages;
        if (search) {
            const q = search.toLowerCase();
            list = list.filter(m =>
                m.content.toLowerCase().includes(q) ||
                m.author.username.toLowerCase().includes(q) ||
                m.author.globalName.toLowerCase().includes(q)
            );
        }
        if (channelFilter) {
            list = list.filter(m => m.channelId === channelFilter);
        }
        return list;
    }, [messages, search, channelFilter]);

    const channels = React.useMemo(() => {
        const set = new Set(messages.map(m => m.channelId));
        return [...set];
    }, [messages]);

    async function clearLogs() {
        await dsSet(DATA_KEY, []);
        setMessages([]);
        showToast("Logs cleared!", Toasts.Type.SUCCESS);
    }

    return (
        <Modal {...props} size={Modal.Size?.SMALL ?? "sm"}>
            <div style={{ padding: "0 20px 24px" }}>
                <div style={{ textAlign: "center", paddingTop: 20, marginBottom: 16 }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "#a855f7" }}>MessageKeeper</div>
                    <div style={{ fontSize: 11, color: "#a855f7", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase" }}>Deleted Message Log</div>
                </div>

                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search messages..."
                        style={{
                            flex: 1, padding: "8px 12px", borderRadius: 8,
                            border: "1px solid var(--background-modifier-accent)",
                            background: "rgba(0,0,0,0.2)", color: "var(--text-normal)",
                            fontSize: 12, outline: "none", boxSizing: "border-box" as const,
                        }}
                    />
                    <select
                        value={channelFilter}
                        onChange={e => setChannelFilter(e.target.value)}
                        style={{
                            padding: "8px 10px", borderRadius: 8,
                            border: "1px solid var(--background-modifier-accent)",
                            background: "rgba(0,0,0,0.2)", color: "var(--text-normal)",
                            fontSize: 12, outline: "none",
                        }}
                    >
                        <option value="">All Channels</option>
                        {channels.map(c => <option key={c} value={c}>#{c}</option>)}
                    </select>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
                        {filtered.length} message(s) logged
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                        <button
                            onClick={() => { copyToClipboard(JSON.stringify(filtered, null, 2)); showToast("Copied!", Toasts.Type.SUCCESS); }}
                            style={{
                                padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                                fontSize: 11, fontWeight: 700, color: "#fff", background: "#06b6d4",
                            }}
                        >Export</button>
                        <button
                            onClick={clearLogs}
                            style={{
                                padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                                fontSize: 11, fontWeight: 700, color: "#fff", background: "rgba(237,66,69,0.7)",
                            }}
                        >Clear All</button>
                    </div>
                </div>

                <div style={{ maxHeight: "350px", overflow: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                    {filtered.length === 0 && (
                        <div style={{ textAlign: "center", padding: 30, color: "var(--text-muted)", fontSize: 13 }}>
                            No deleted messages logged yet
                        </div>
                    )}
                    {filtered.map(m => (
                        <div key={m.id} style={{
                            padding: 10, borderRadius: 10,
                            background: "rgba(168,85,247,0.08)",
                            borderLeft: "3px solid #a855f7",
                        }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <div style={{
                                        width: 20, height: 20, borderRadius: "50%", background: "#a855f7",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        color: "#fff", fontWeight: 700, fontSize: 9,
                                    }}>
                                        {(m.author.globalName || "?")[0].toUpperCase()}
                                    </div>
                                    <div>
                                        <span style={{ fontWeight: 700, fontSize: 12, color: "var(--header-primary)" }}>
                                            {m.author.globalName}
                                        </span>
                                        <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 4 }}>
                                            @{m.author.username}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                                    {new Date(m.deletedAt).toLocaleTimeString()}
                                </div>
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-normal)", lineHeight: "1.4" }}>
                                {m.content || <em style={{ color: "var(--text-muted)" }}>[No text content]</em>}
                            </div>
                            <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>
                                Channel: {m.channelId}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </Modal>
    );
}

function openLogModal() {
    openModal(props => <LogModal {...props} />);
}

const ContextMenuPatch: NavContextMenuPatchCallback = (children) => {
    const group = findGroupChildrenByChildId("copy-text", children);
    if (!group) return;
    group.push(
        <Menu.MenuItem id="vc-messagekeeper" label="MessageKeeper Logs" action={openLogModal} />
    );
};

export default definePlugin({
    name: "MessageKeeper",
    authors: [{ name: "HENTUX", id: 0n }],
    description: "Log and view deleted messages with animated UI and full logging.",
    tags: ["deleted", "messages", "log", "keeper", "recovery"],
    settings,

    start() {
        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);
        FluxDispatcher.subscribe("MESSAGE_DELETE", onMessageDelete);
        addContextMenuPatch("message", ContextMenuPatch);
    },

    stop() {
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate);
        FluxDispatcher.unsubscribe("MESSAGE_DELETE", onMessageDelete);
        removeContextMenuPatch("message", ContextMenuPatch);
    },
});
