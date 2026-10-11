/*
 * AutoPingAll - Advanced bulk mention plugin
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { addContextMenuPatch, findGroupChildrenByChildId, removeContextMenuPatch } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { copyToClipboard } from "@utils/clipboard";
import { sendMessage } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import {
    GuildChannelStore,
    GuildMemberStore,
    GuildRoleStore,
    GuildStore,
    Menu,
    Modal,
    openModal,
    React,
    SelectedChannelStore,
    SelectedGuildStore,
    showToast,
    Toasts,
    UserStore,
    VoiceStateStore,
} from "@webpack/common";

const PURPLE = "#a855f7", TEAL = "#06b6d4", PINK = "#ff6b9d", YELLOW = "#eab308";

const settings = definePluginSettings({
    maxPerChunk: { type: OptionType.SLIDER, description: "Max mentions per message", markers: [5, 25, 50, 75, 100], default: 50, stickToMarkers: true },
    sendDelay: { type: OptionType.SLIDER, description: "Delay between messages (seconds)", markers: [0, 1, 2, 3, 5], default: 1, stickToMarkers: true },
    skipBots: { type: OptionType.BOOLEAN, description: "Skip bot accounts", default: true },
    includeSelf: { type: OptionType.BOOLEAN, description: "Include yourself", default: false },
});

function buildChunks(ids: string[], maxPerChunk: number, maxChars: number, prefix: string, suffix: string): string[] {
    const chunks: string[] = [];
    let current = "";
    let count = 0;
    for (const id of ids) {
        const mention = `${prefix}<@${id}>${suffix}`;
        if (current.length + mention.length + 1 > maxChars || count >= maxPerChunk) {
            if (current) chunks.push(current.trim());
            current = "";
            count = 0;
        }
        current += mention + " ";
        count++;
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
}

function buildRoleChunks(roleIds: string[], maxPerChunk: number, maxChars: number): string[] {
    const chunks: string[] = [];
    let current = "";
    let count = 0;
    for (const id of roleIds) {
        const mention = `<@&${id}>`;
        if (current.length + mention.length + 1 > maxChars || count >= maxPerChunk) {
            if (current) chunks.push(current.trim());
            current = "";
            count = 0;
        }
        current += mention + " ";
        count++;
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
}

const PingAllIcon = ({ width = 24, height = 24 }: { width?: number; height?: number }) => (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
    </svg>
);

function AutoPingModalContent(props: { onClose: () => void }) {
    const [selectedGuildId, setSelectedGuildId] = React.useState<string>("");
    const [selectedVoiceChannelId, setSelectedVoiceChannelId] = React.useState("");
    const [selectedRoleIds, setSelectedRoleIds] = React.useState<Set<string>>(new Set());
    const [selectedUserIds, setSelectedUserIds] = React.useState<Set<string>>(new Set());
    const [search, setSearch] = React.useState("");
    const [tab, setTab] = React.useState<"servers" | "users" | "roles" | "voice" | "preview">("servers");
    const [source, setSource] = React.useState<"users" | "roles" | "voice">("users");
    const [loading, setLoading] = React.useState(false);
    const [sending, setSending] = React.useState(false);
    const [sendProgress, setSendProgress] = React.useState(0);
    const [sendTotal, setSendTotal] = React.useState(0);
    const [cancelled, setCancelled] = React.useState(false);
    const [customPrefix, setCustomPrefix] = React.useState("");
    const [customSuffix, setCustomSuffix] = React.useState("");
    const [colorFilter, setColorFilter] = React.useState("");
    const [memberIds, setMemberIds] = React.useState<string[]>([]);
    const [guildRolesList, setGuildRolesList] = React.useState<any[]>([]);
    const [voiceChannelsList, setVoiceChannelsList] = React.useState<any[]>([]);

    const myId = UserStore.getCurrentUser()?.id ?? "";
    const currentChannelId = SelectedChannelStore.getChannelId();

    const allGuilds = React.useMemo(() => {
        try {
            return Object.values(GuildStore.getGuilds() || {});
        } catch {
            return [];
        }
    }, []);

    const selectedGuild = React.useMemo(() => {
        return allGuilds.find((g: any) => g.id === selectedGuildId) || null;
    }, [allGuilds, selectedGuildId]);

    React.useEffect(() => {
        if (!selectedGuildId) {
            setMemberIds([]);
            setGuildRolesList([]);
            setVoiceChannelsList([]);
            return;
        }

        try {
            const ids = GuildMemberStore.getMemberIds(selectedGuildId) || [];
            let filtered = ids;
            if (!settings.store.includeSelf) filtered = filtered.filter(id => id !== myId);
            if (settings.store.skipBots) filtered = filtered.filter(id => !UserStore.getUser(id)?.bot);
            if (filtered.length > 2000) filtered = filtered.slice(0, 2000);
            setMemberIds(filtered);
        } catch {
            setMemberIds([]);
        }

        try {
            const rolesObj = GuildRoleStore.getRolesSnapshot(selectedGuildId) || {};
            const roles = Object.values(rolesObj).filter((r: any) => r.id !== selectedGuildId && r.name !== "@everyone");
            setGuildRolesList(roles.map((r: any) => ({
                id: r.id,
                name: r.name,
                color: r.colorString || "#99aab5",
            })));
        } catch {
            setGuildRolesList([]);
        }

        try {
            const channels = GuildChannelStore.getChannels(selectedGuildId);
            if (!channels) { setVoiceChannelsList([]); return; }
            const vc = [...(channels.VOCAL || []), ...(channels.STAGE_CHANNEL || [])];
            setVoiceChannelsList(vc.map((ch: any) => ({
                id: ch.id,
                name: ch.name,
                userCount: Object.keys(VoiceStateStore.getVoiceStatesForChannel(ch.id) || {}).length,
            })));
        } catch {
            setVoiceChannelsList([]);
        }
    }, [selectedGuildId, myId]);

    const allUsers = React.useMemo(() => {
        return memberIds.map(id => {
            try {
                const user = UserStore.getUser(id);
                const member = GuildMemberStore.getMember(selectedGuildId, id);
                return {
                    id,
                    username: user?.username || id,
                    globalName: user?.globalName || user?.username || id,
                    isBot: !!user?.bot,
                    roles: member?.roles || [],
                    colorString: member?.colorString || null,
                };
            } catch {
                return { id, username: id, globalName: id, isBot: false, roles: [] as string[], colorString: null as string | null };
            }
        });
    }, [memberIds, selectedGuildId]);

    const filteredUsers = React.useMemo(() => {
        let users = allUsers;
        if (search) {
            const q = search.toLowerCase();
            users = users.filter(u => u.globalName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.id.includes(q));
        }
        if (colorFilter) {
            users = users.filter(u => u.colorString?.toLowerCase().includes(colorFilter.toLowerCase()));
        }
        return users;
    }, [allUsers, search, colorFilter]);

    const voiceUsers = React.useMemo(() => {
        if (!selectedVoiceChannelId) return [];
        try {
            const vs = VoiceStateStore.getVoiceStatesForChannel(selectedVoiceChannelId) || {};
            return Object.keys(vs).filter(id => {
                if (!settings.store.includeSelf && id === myId) return false;
                if (settings.store.skipBots && UserStore.getUser(id)?.bot) return false;
                return true;
            }).map(id => {
                const user = UserStore.getUser(id);
                return { id, username: user?.username || id, globalName: user?.globalName || id };
            });
        } catch {
            return [];
        }
    }, [selectedVoiceChannelId, myId]);

    const uniqueColors = React.useMemo(() => {
        const colors = new Set<string>();
        allUsers.forEach(u => { if (u.colorString) colors.add(u.colorString); });
        return [...colors].slice(0, 20);
    }, [allUsers]);

    const chunks = React.useMemo(() => {
        if (source === "roles" && selectedRoleIds.size > 0) {
            return buildRoleChunks([...selectedRoleIds], settings.store.maxPerChunk, 1900);
        }
        const ids = source === "voice" ? voiceUsers.map(u => u.id) : [...selectedUserIds];
        return buildChunks(ids, settings.store.maxPerChunk, 1900, customPrefix, customSuffix);
    }, [selectedUserIds, selectedRoleIds, source, voiceUsers, customPrefix, customSuffix]);

    function selectGuild(guildId: string) {
        setSelectedGuildId(guildId);
        setTab("users");
    }

    function toggleUser(id: string) {
        setSelectedUserIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    function toggleRole(id: string) {
        setSelectedRoleIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    function selectAll() {
        if (selectedUserIds.size === filteredUsers.length) setSelectedUserIds(new Set());
        else setSelectedUserIds(new Set(filteredUsers.map(u => u.id)));
    }

    async function handleAction(action: "copy" | "send") {
        if (chunks.length === 0) { showToast("Nothing to mention!", Toasts.Type.FAILURE); return; }

        if (action === "copy") {
            copyToClipboard(chunks.join("\n\n"));
            showToast(`Copied ${chunks.length} message(s) to clipboard!`, Toasts.Type.SUCCESS);
            props.onClose();
            return;
        }

        setSending(true);
        setSendTotal(chunks.length);
        setSendProgress(0);
        setCancelled(false);
        const delay = settings.store.sendDelay * 1000;

        for (let i = 0; i < chunks.length; i++) {
            if (cancelled) break;
            sendMessage(currentChannelId, { content: chunks[i] });
            setSendProgress(i + 1);
            if (i < chunks.length - 1 && delay > 0) await new Promise(r => setTimeout(r, delay));
        }

        setSending(false);
        if (!cancelled) {
            showToast(`Done! Sent ${chunks.length} messages.`, Toasts.Type.SUCCESS);
            props.onClose();
        } else {
            showToast(`Cancelled. Sent ${sendProgress}/${chunks.length}.`, Toasts.Type.INFO);
        }
    }

    return (
        <Modal {...props} size={Modal.Size?.SMALL ?? "sm"}>
            <div style={{ padding: "0 20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Header */}
                <div style={{ textAlign: "center", marginBottom: 4, paddingTop: 20 }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "#5865f2" }}>AutoPingAll</div>
                    <div style={{ fontSize: 11, color: "#5865f2", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase" }}>Bulk Mention Power Tool</div>
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                    {([
                        { key: "servers" as const, label: "Servers", count: allGuilds.length, color: PURPLE },
                        { key: "users" as const, label: "Users", count: selectedUserIds.size, color: TEAL },
                        { key: "roles" as const, label: "Roles", count: selectedRoleIds.size, color: PINK },
                        { key: "voice" as const, label: "Voice", count: voiceUsers.length, color: YELLOW },
                        { key: "preview" as const, label: "Preview", count: chunks.length, color: "#5865f2" },
                    ]).map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)} style={{
                            padding: "6px 14px", border: "none", borderRadius: 10, cursor: "pointer",
                            background: tab === t.key ? "rgba(88,101,242,0.2)" : "rgba(255,255,255,0.04)",
                            color: tab === t.key ? t.color : "var(--text-muted)", fontWeight: 700, fontSize: 12,
                            display: "flex", alignItems: "center", gap: 6,
                        }}>
                            {t.label}
                            {t.count > 0 && <span style={{ background: t.color, color: "#fff", borderRadius: 6, padding: "0 6px", fontSize: 10, fontWeight: 800, lineHeight: "16px" }}>{t.count > 99 ? "99+" : t.count}</span>}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div style={{ maxHeight: "400px", overflow: "auto" }}>

                    {/* SERVERS TAB */}
                    {tab === "servers" && (
                        <div style={{ borderRadius: 12, padding: 14, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: PURPLE, marginBottom: 10 }}>
                                YOUR SERVERS — Select one to ping
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {allGuilds.map((guild: any) => (
                                    <div key={guild.id} onClick={() => selectGuild(guild.id)} style={{
                                        display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10,
                                        background: selectedGuildId === guild.id ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.04)",
                                        borderLeft: selectedGuildId === guild.id ? "3px solid #a855f7" : "3px solid transparent",
                                        cursor: "pointer",
                                    }}>
                                        {guild.icon ? (
                                            <img src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${guild.icon.startsWith("a_") ? "gif" : "png"}?size=32`} style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} />
                                        ) : (
                                            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#5865f2", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                                                {(guild.name || "?")[0].toUpperCase()}
                                            </div>
                                        )}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--header-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{guild.name}</div>
                                        </div>
                                        <span style={{ color: "var(--text-muted)", fontSize: 14 }}>{">"}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* USERS TAB */}
                    {tab === "users" && (
                        <div style={{ borderRadius: 12, padding: 14, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: TEAL, marginBottom: 10 }}>
                                MEMBERS {selectedGuild ? `— ${selectedGuild.name}` : ""}
                            </div>
                            {!selectedGuildId ? (
                                <div style={{ textAlign: "center", padding: 20, color: "var(--text-muted)", fontSize: 13 }}>Select a server first</div>
                            ) : (
                                <>
                                    <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or ID..." style={{
                                        width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--background-modifier-accent)",
                                        background: "rgba(0,0,0,0.2)", color: "var(--text-normal)", fontSize: 12, outline: "none", boxSizing: "border-box" as const, marginBottom: 8,
                                    }} />

                                    {uniqueColors.length > 0 && (
                                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                                            <div onClick={() => setColorFilter("")} style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid var(--background-modifier-accent)", cursor: "pointer", background: "var(--background-secondary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "var(--text-muted)" }}>x</div>
                                            {uniqueColors.map(c => (
                                                <div key={c} onClick={() => setColorFilter(colorFilter === c ? "" : c)} style={{ width: 18, height: 18, borderRadius: "50%", background: c, cursor: "pointer", border: colorFilter === c ? "2px solid #fff" : "2px solid transparent" }} />
                                            ))}
                                        </div>
                                    )}

                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                        <div onClick={selectAll} style={{ cursor: "pointer", color: TEAL, fontSize: 12, fontWeight: 700 }}>{selectedUserIds.size === filteredUsers.length ? "Deselect All" : "Select All"}</div>
                                        <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{selectedUserIds.size} / {filteredUsers.length}</div>
                                    </div>

                                    <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: "200px", overflow: "auto" }}>
                                        {filteredUsers.slice(0, 100).map(user => (
                                            <div key={user.id} onClick={() => toggleUser(user.id)} style={{
                                                display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8,
                                                background: selectedUserIds.has(user.id) ? "rgba(6,182,212,0.15)" : "transparent",
                                                borderLeft: selectedUserIds.has(user.id) ? "3px solid #06b6d4" : "3px solid transparent",
                                                cursor: "pointer",
                                            }}>
                                                <div style={{
                                                    width: 16, height: 16, borderRadius: 4,
                                                    border: `2px solid ${selectedUserIds.has(user.id) ? "#06b6d4" : "var(--background-modifier-accent)"}`,
                                                    background: selectedUserIds.has(user.id) ? "#06b6d4" : "transparent",
                                                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                                                    fontSize: 10, color: "#fff", fontWeight: 700,
                                                }}>{selectedUserIds.has(user.id) ? "v" : ""}</div>
                                                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--background-accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
                                                    {(user.globalName || "?")[0].toUpperCase()}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: user.colorString || "var(--header-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                                                        {user.globalName}
                                                        {user.isBot && <span style={{ marginLeft: 4, padding: "1px 4px", borderRadius: 3, background: "#5865f2", color: "#fff", fontSize: 9, fontWeight: 700 }}>BOT</span>}
                                                    </div>
                                                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>@{user.username}</div>
                                                </div>
                                            </div>
                                        ))}
                                        {filteredUsers.length > 100 && <div style={{ color: "var(--text-muted)", fontSize: 11, textAlign: "center" as const, padding: 6 }}>Showing 100 of {filteredUsers.length}</div>}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* ROLES TAB */}
                    {tab === "roles" && (
                        <div style={{ borderRadius: 12, padding: 14, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: PINK, marginBottom: 10 }}>
                                ROLES — Click to ping
                            </div>
                            {!selectedGuildId ? (
                                <div style={{ textAlign: "center", padding: 20, color: "var(--text-muted)", fontSize: 13 }}>Select a server first</div>
                            ) : (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                    {guildRolesList.map((r: any) => (
                                        <div key={r.id} onClick={() => toggleRole(r.id)} style={{
                                            padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 700,
                                            background: selectedRoleIds.has(r.id) ? r.color : "rgba(255,255,255,0.06)",
                                            color: selectedRoleIds.has(r.id) ? "#fff" : "var(--text-normal)",
                                            border: `1.5px solid ${selectedRoleIds.has(r.id) ? r.color : "var(--background-modifier-accent)"}`,
                                        }}>
                                            @{r.name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* VOICE TAB */}
                    {tab === "voice" && (
                        <div style={{ borderRadius: 12, padding: 14, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: YELLOW, marginBottom: 10 }}>
                                VOICE CHANNELS
                            </div>
                            {!selectedGuildId ? (
                                <div style={{ textAlign: "center", padding: 20, color: "var(--text-muted)", fontSize: 13 }}>Select a server first</div>
                            ) : voiceChannelsList.length === 0 ? (
                                <div style={{ textAlign: "center", padding: 20, color: "var(--text-muted)", fontSize: 13 }}>No voice channels found</div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    {voiceChannelsList.map((ch: any) => (
                                        <div key={ch.id} onClick={() => { setSelectedVoiceChannelId(ch.id); setSource("voice"); setTab("users"); }} style={{
                                            display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10,
                                            background: selectedVoiceChannelId === ch.id ? "rgba(234,179,8,0.15)" : "rgba(255,255,255,0.04)",
                                            borderLeft: selectedVoiceChannelId === ch.id ? "3px solid #eab308" : "3px solid transparent",
                                            cursor: "pointer",
                                        }}>
                                            <span style={{ fontSize: 18 }}>v</span>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--header-primary)" }}>{ch.name}</div>
                                                <div style={{ fontSize: 10, color: ch.userCount > 0 ? YELLOW : "var(--text-muted)" }}>
                                                    {ch.userCount} user{ch.userCount !== 1 ? "s" : ""} connected
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* PREVIEW TAB */}
                    {tab === "preview" && (
                        <div style={{ borderRadius: 12, padding: 14, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "#5865f2", marginBottom: 10 }}>
                                PREVIEW & SEND
                            </div>

                            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontWeight: 800, fontSize: 10, letterSpacing: "1px", textTransform: "uppercase" as const, color: "var(--header-secondary)", marginBottom: 6, display: "block" }}>Prefix</label>
                                    <input type="text" value={customPrefix} onChange={e => setCustomPrefix(e.target.value)} placeholder="e.g. Hey " style={{
                                        width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--background-modifier-accent)",
                                        background: "rgba(0,0,0,0.2)", color: "var(--text-normal)", fontSize: 12, outline: "none", boxSizing: "border-box" as const,
                                    }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontWeight: 800, fontSize: 10, letterSpacing: "1px", textTransform: "uppercase" as const, color: "var(--header-secondary)", marginBottom: 6, display: "block" }}>Suffix</label>
                                    <input type="text" value={customSuffix} onChange={e => setCustomSuffix(e.target.value)} placeholder="e.g. ! check this" style={{
                                        width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--background-modifier-accent)",
                                        background: "rgba(0,0,0,0.2)", color: "var(--text-normal)", fontSize: 12, outline: "none", boxSizing: "border-box" as const,
                                    }} />
                                </div>
                            </div>

                            <div style={{ padding: 12, borderRadius: 10, background: "rgba(0,0,0,0.2)", marginBottom: 10 }}>
                                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4, color: "var(--header-primary)" }}>
                                    {source === "roles" && selectedRoleIds.size > 0
                                        ? `${selectedRoleIds.size} role(s) selected`
                                        : `${source === "voice" ? voiceUsers.length : selectedUserIds.size} user(s) selected`}
                                </div>
                                <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                                    {chunks.length} message(s) will be sent
                                </div>
                            </div>

                            <div style={{ maxHeight: "120px", overflow: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                                {chunks.map((chunk, i) => (
                                    <div key={i} style={{ padding: 8, borderRadius: 8, background: "rgba(0,0,0,0.2)", fontSize: 11, color: "var(--text-muted)", whiteSpace: "pre-wrap" as const, wordBreak: "break-all" as const, maxHeight: 50, overflow: "hidden" }}>
                                        <span style={{ color: "#5865f2", fontWeight: 700 }}>Msg {i + 1}: </span>{chunk.substring(0, 150)}{chunk.length > 150 ? "..." : ""}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                    <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                        {sending ? `${sendProgress}/${sendTotal}` : chunks.length > 0 ? `${chunks.length} msg(s) ready` : "Nothing to send"}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {sending && (
                            <div style={{ width: 80, height: 6, borderRadius: 3, background: "rgba(0,0,0,0.3)", overflow: "hidden" }}>
                                <div style={{ width: `${(sendProgress / sendTotal) * 100}%`, height: "100%", background: "#5865f2", borderRadius: 3, transition: "width 0.3s ease" }} />
                            </div>
                        )}
                        {sending ? (
                            <button onClick={() => setCancelled(true)} style={{ padding: "6px 14px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", background: "rgba(237,66,69,0.7)" }}>Cancel</button>
                        ) : (
                            <>
                                <button onClick={props.onClose} style={{ padding: "6px 14px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.08)" }}>Cancel</button>
                                <button onClick={() => handleAction("copy")} style={{ padding: "6px 14px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", background: "#06b6d4" }} disabled={chunks.length === 0}>Copy</button>
                                <button onClick={() => handleAction("send")} style={{ padding: "6px 14px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", background: "#5865f2" }} disabled={chunks.length === 0}>Send</button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}

function openPingModal() {
    openModal(props => (
        <ErrorBoundary>
            <AutoPingModalContent {...props} />
        </ErrorBoundary>
    ));
}

const AutoPingChatBarButton: ChatBarButtonFactory = ({ isAnyChat }) => {
    if (!isAnyChat) return null;
    return (
        <ChatBarButton tooltip="AutoPingAll" onClick={openPingModal}>
            <PingAllIcon />
        </ChatBarButton>
    );
};

const ContextMenuPatch: NavContextMenuPatchCallback = (children) => {
    const group = findGroupChildrenByChildId("copy-text", children);
    if (!group) return;
    group.push(
        <Menu.MenuItem id="vc-autopingall" label="AutoPingAll" action={openPingModal} />
    );
};

export default definePlugin({
    name: "AutoPingAll",
    authors: [{ name: "x870", id: 1389444830882562131n }],
    description: "Advanced bulk mention: ping users/roles with full UI, server selection, voice channels, role colors, search, preview, progress.",
    tags: ["ping", "bulk", "mention", "role", "mass", "voice"],
    settings,
    dependencies: ["ChatInputButtonAPI"],

    chatBarButton: {
        icon: PingAllIcon,
        render: AutoPingChatBarButton,
    },

    start() {
        addContextMenuPatch("message", ContextMenuPatch);
    },
    stop() {
        removeContextMenuPatch("message", ContextMenuPatch);
    },
});
