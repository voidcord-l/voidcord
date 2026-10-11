import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { IconComponent, OptionType } from "@utils/types";
import { ApplicationCommandInputType } from "@api/Commands";
import { findByPropsLazy } from "@webpack";
import { Constants, FluxDispatcher, Modal, openModal, React, RelationshipStore, RestAPI, Toasts, UserStore, useState, useEffect, useRef } from "@webpack/common";

const settings = definePluginSettings({
    fakeUserIds: { type: OptionType.STRING, description: "", default: "" },
    fakeFriendIds: { type: OptionType.STRING, description: "", default: "" },
    fakeMutualGuilds: { type: OptionType.STRING, description: "", default: "[]" },
    fakeDetails: { type: OptionType.STRING, description: "", default: "{}" },
    presets: { type: OptionType.STRING, description: "", default: "[]" },
    fakeDmChannels: { type: OptionType.STRING, description: "", default: "[]" },
});

const PINK = "#ff6b9d", PINK_DARK = "#c44569", PURPLE = "#a855f7", TEAL = "#06b6d4", YELLOW = "#eab308";

const C = {
    glass: "rgba(0,0,0,0.3)", glassBorder: "rgba(255,255,255,0.06)",
    pinkGrad: `linear-gradient(135deg, ${PINK}, ${PINK_DARK})`,
    purpleGrad: `linear-gradient(135deg, ${PURPLE}, #7c3aed)`,
    tealGrad: `linear-gradient(135deg, ${TEAL}, #0891b2)`,
    yellowGrad: `linear-gradient(135deg, ${YELLOW}, #ca8a04)`,
};

const baseInput: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 10,
    border: "1.5px solid var(--background-modifier-accent)",
    background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)",
    color: "var(--text-normal)", fontSize: 14, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit",
};

const STATUSES = ["online", "idle", "dnd", "offline"] as const;
const ACTIVITY_TYPES = [
    { value: 0, label: "Playing" },
    { value: 1, label: "Streaming" },
    { value: 2, label: "Listening" },
    { value: 3, label: "Watching" },
    { value: 5, label: "Competing" },
];

const BADGE_BITS: { label: string; bit: number }[] = [
    { label: "Nitro", bit: 1 << 9 },
    { label: "Nitro Classic", bit: 1 << 8 },
    { label: "Nitro Basic", bit: 1 << 23 },
    { label: "HypeSquad Events", bit: 1 << 2 },
    { label: "HypeSquad Bravery", bit: 1 << 6 },
    { label: "HypeSquad Brilliance", bit: 1 << 7 },
    { label: "HypeSquad Balance", bit: 1 << 8 },
    { label: "Bug Hunter lv1", bit: 1 << 3 },
    { label: "Bug Hunter lv2", bit: 1 << 14 },
    { label: "Early Supporter", bit: 1 << 17 },
    { label: "Verified Bot Dev", bit: 1 << 16 },
    { label: "Active Developer", bit: 1 << 19 },
    { label: "Discord Employee", bit: 1 << 0 },
    { label: "Partner", bit: 1 << 1 },
    { label: "Premium Early Sub", bit: 1 << 18 },
    { label: "Mod Alumni", bit: 1 << 20 },
];

interface FakeGuild { id: string; name: string; }
interface FakeDetail { status?: string; activity?: { type: number; name: string; state?: string }; badges?: number; }
interface FakeDmChannel { userId: string; messages: { author: string; content: string; time: string }[]; }
interface Preset { name: string; reqIds: string[]; friendIds: string[]; guilds: FakeGuild[]; details: Record<string, FakeDetail>; dms: FakeDmChannel[]; }

let injectedRequestIds: string[] = [];
let injectedFriendIds: string[] = [];
let relStorePatch: (() => void) | null = null;
let storePatches: (() => void)[] = [];

function loadDetails(): Record<string, FakeDetail> { try { return JSON.parse(settings.store.fakeDetails || "{}"); } catch { return {}; } }
function saveDetails(d: Record<string, FakeDetail>) { settings.store.fakeDetails = JSON.stringify(d); }
function loadGuilds(): FakeGuild[] { try { return JSON.parse(settings.store.fakeMutualGuilds || "[]"); } catch { return []; } }
function saveGuilds(g: FakeGuild[]) { settings.store.fakeMutualGuilds = JSON.stringify(g); }
function loadPresets(): Preset[] { try { return JSON.parse(settings.store.presets || "[]"); } catch { return []; } }
function savePresets(p: Preset[]) { settings.store.presets = JSON.stringify(p); }
function loadDms(): FakeDmChannel[] { try { return JSON.parse(settings.store.fakeDmChannels || "[]"); } catch { return []; } }
function saveDms(d: FakeDmChannel[]) { settings.store.fakeDmChannels = JSON.stringify(d); }
function loadIds(key: "fakeUserIds" | "fakeFriendIds"): string[] {
    const r = settings.store[key]; return r ? r.split(",").filter(Boolean) : [];
}

function persistIds() {
    settings.store.fakeUserIds = [...new Set(injectedRequestIds)].join(",");
    settings.store.fakeFriendIds = [...new Set(injectedFriendIds)].join(",");
}

function genId(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function fakeUserId(): string {
    return String(Math.floor(Math.random() * 9_000_000_000_000_000_000 + 1_000_000_000_000_000_000));
}

const FAKE_USERNAMES = ["Luna", "Kai", "Raven", "Ace", "Nova", "Echo", "Zara", "Jett", "Ryo", "Maya", "Orion", "Sage", "Vex", "Kira", "Ash", "Nyx", "Zen", "Lyra", "Koda", "Rei"];
const FAKE_GUILD_NAMES = ["The Hideout", "Midnight Club", "Arcade", "Vibes Only", "The Basement", "Cloud Nine", "Dark Side", "Neon Nights", "The Den", "Paradise"];

async function ensureUserInStore(userId: string): Promise<boolean> {
    if (UserStore.getUser(userId)) return true;
    try {
        const res = await RestAPI.get({ url: Constants.Endpoints.USER(userId) });
        FluxDispatcher.dispatch({ type: "USER_UPDATE", user: res.body });
        return true;
    } catch { return false; }
}

function patchPresenceStore() {
    try {
        const PS = findByPropsLazy("getStatus") as any;
        if (!PS) return;
        const origStatus = PS.getStatus.bind(PS);
        const origActivities = PS.getActivities?.bind(PS);
        PS.getStatus = (userId: string) => {
            const d = loadDetails()[userId];
            if (d?.status && d.status !== "offline" && d.status !== "unknown") return d.status;
            return origStatus(userId);
        };
        if (origActivities) {
            PS.getActivities = (userId: string) => {
                const d = loadDetails()[userId];
                if (d?.activity) return [d.activity];
                return origActivities(userId);
            };
        }
        storePatches.push(() => { PS.getStatus = origStatus; if (origActivities) PS.getActivities = origActivities; });
    } catch {}
}

function dispatchPresenceUpdates() {
    try {
        const userIds = [...new Set([...injectedFriendIds, ...injectedRequestIds])];
        const updates = userIds.map(id => ({ user: { id }, status: loadDetails()[id]?.status ?? "offline", activities: [] }));
        FluxDispatcher.dispatch({ type: "PRESENCE_UPDATES", updates });
    } catch {}
}



function patchPendingCount() {
    try {
        const RelStore = findByPropsLazy("getPendingCount") as any;
        if (!RelStore?.getPendingCount) return;
        const orig = RelStore.getPendingCount.bind(RelStore);
        RelStore.getPendingCount = () => injectedRequestIds.length + orig();
        relStorePatch = () => { RelStore.getPendingCount = orig; };
    } catch {}
}

function unpatchAll() {
    if (relStorePatch) { relStorePatch(); relStorePatch = null; }
    for (const u of storePatches) { try { u(); } catch {} }
    storePatches = [];
}

async function addFakeRequest(userId: string): Promise<boolean> {
    if (!userId || injectedRequestIds.includes(userId)) return false;
    if (RelationshipStore.getRelationshipType(userId) > 0) return false;
    const ok = await ensureUserInStore(userId);
    if (!ok) return false;
    const relationships = RelationshipStore.getMutableRelationships();
    relationships.set(userId, 3);
    RelationshipStore.emitChange();
    injectedRequestIds.push(userId);
    persistIds();
    const user = UserStore.getUser(userId);
    if (user) {
        showFakeToast(user.username);
        showFakeNotification(user.username, userId);
    }
    return true;
}

function removeFakeRequest(userId: string) {
    const relationships = RelationshipStore.getMutableRelationships();
    relationships.delete(userId);
    RelationshipStore.emitChange();
    injectedRequestIds = injectedRequestIds.filter(id => id !== userId);
    persistIds();
    dispatchPresenceUpdates();
}

async function addFakeFriend(userId: string, applyBadge = false): Promise<boolean> {
    if (!userId || injectedFriendIds.includes(userId)) return false;
    if (RelationshipStore.getRelationshipType(userId) > 0) return false;
    const ok = await ensureUserInStore(userId);
    if (!ok) return false;
    const relationships = RelationshipStore.getMutableRelationships();
    relationships.set(userId, 1);
    RelationshipStore.emitChange();
    injectedFriendIds.push(userId);
    persistIds();
    dispatchPresenceUpdates();
    if (applyBadge) {
        const details = loadDetails();
        if (!details[userId]) details[userId] = {};
        details[userId].badges = (details[userId].badges ?? 0) | (1 << 9) | (1 << 2) | (1 << 16);
        saveDetails(details);
    }
    return true;
}

function removeFakeFriend(userId: string) {
    const relationships = RelationshipStore.getMutableRelationships();
    relationships.delete(userId);
    RelationshipStore.emitChange();
    injectedFriendIds = injectedFriendIds.filter(id => id !== userId);
    persistIds();
    const details = loadDetails();
    delete details[userId];
    saveDetails(details);
    dispatchPresenceUpdates();
}

function getAvatarUrl(user: any): string | null {
    if (!user || !user.avatar) return null;
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=32`;
}

function showFakeNotification(username: string, userId: string) {
    try {
        const u = UserStore.getUser(userId);
        const n = new Notification("Discord", {
            body: `New friend request from ${username}`,
            icon: getAvatarUrl(u) ?? "https://cdn.discordapp.com/logo.png",
            silent: false,
        });
        setTimeout(() => n.close(), 6000);
    } catch {}
}

function showFakeToast(username: string) {
    try { Toasts.show({ message: `New friend request from ${username}`, type: Toasts.Type.MESSAGE }); } catch {}
}

function UserAvatar({ userId, size = 28 }: { userId: string; size?: number }) {
    const user = UserStore.getUser(userId);
    const url = getAvatarUrl(user);
    if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0 }} />;
    return <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: "var(--background-accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: Math.round(size * 0.43) }}>
        {user ? user.username[0].toUpperCase() : "?"}
    </div>;
}

function UserName({ userId }: { userId: string }) {
    const user = UserStore.getUser(userId);
    return <span>{user ? user.username : "Unknown User"}</span>;
}

function Section({ title, subtitle, children, accent }: any) {
    return <div style={{
        borderRadius: 12, padding: 14, background: C.glass,
        border: `1px solid ${accent ? `color-mix(in srgb, ${accent} 30%, transparent)` : C.glassBorder}`,
        backdropFilter: "blur(12px)", boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
    }}>
        {title && <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: accent ?? "var(--header-secondary)", marginBottom: subtitle ? 2 : 10, display: "flex", alignItems: "center", gap: 6 }}>
            {title}
        </div>}
        {subtitle && <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 10 }}>{subtitle}</div>}
        {children}
    </div>;
}

const Icon: IconComponent = ({ height = 24, width = 24, className }) => (
    <div className="ffr-container">
        <svg width={width} height={height} viewBox="0 0 24 24" className={className}>
            <path fill="currentColor" d="M14 8.00598C14 10.211 12.205 12.006 10 12.006C7.795 12.006 6 10.211 6 8.00598C6 5.80098 7.795 4.00598 10 4.00598C12.205 4.00598 14 5.80098 14 8.00598ZM2 19.006C2 15.526 5.29 13.006 10 13.006C14.71 13.006 18 15.526 18 19.006V20.006H2V19.006Z" />
            <path fill="currentColor" d="M19 11.006V8.00598H17V11.006H14V13.006H17V16.006H19V13.006H22V11.006H19Z" />
        </svg>
        {injectedRequestIds.length > 0 && <div className="ffr-badge">{injectedRequestIds.length > 9 ? "9+" : injectedRequestIds.length}</div>}
    </div>
);

function FriendRow({ userId, onRemove, details, onDetailChange, isRequest }: { userId: string; onRemove: () => void; details: Record<string, FakeDetail>; onDetailChange: (d: Record<string, FakeDetail>) => void; isRequest?: boolean }) {
    const [expanded, setExpanded] = useState(false);
    const d = details[userId] ?? {};
    const statusColor: Record<string, string> = { online: "#23a55a", idle: "#f0b232", dnd: "#f23f43", offline: "#80848e" };
    return <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ position: "relative" }}>
                <UserAvatar userId={userId} />
                {d.status && d.status !== "offline" && <div style={{
                    position: "absolute", bottom: 0, right: 0, width: 10, height: 10, borderRadius: "50%",
                    background: statusColor[d.status] ?? "#80848e", border: "2px solid var(--background-primary)",
                }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--header-primary)", display: "flex", alignItems: "center", gap: 4 }}>
                    <UserName userId={userId} />
                    {d.badges != null && d.badges > 0 && <span style={{ fontSize: 10, color: YELLOW }}>✦</span>}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", gap: 6 }}>
                    <span style={{ fontFamily: "monospace" }}>{userId}</span>
                    {d.status && <span style={{ color: statusColor[d.status], fontWeight: 600, fontSize: 9, textTransform: "uppercase" }}>{d.status}</span>}
                    {d.activity && <span style={{ color: "var(--text-link)", fontSize: 9 }}>{ACTIVITY_TYPES.find(a => a.value === d.activity.type)?.label ?? ""} {d.activity.name}</span>}
                </div>
            </div>
            {!isRequest && <button className="ffr-mini-btn" onClick={e => { e.stopPropagation(); setExpanded(!expanded); }} style={{
                width: 22, height: 22, border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12,
                background: expanded ? "rgba(168,85,247,0.4)" : "rgba(255,255,255,0.08)", color: "#fff",
            }}>⚙</button>}
            <button className="ffr-mini-btn" onClick={onRemove} style={{
                width: 22, height: 22, border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14,
                background: "rgba(237,66,69,0.6)", color: "#fff",
            }}>×</button>
        </div>
        {expanded && <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {STATUSES.map(s => <button key={s} onClick={() => {
                    const nd = { ...details };
                    if (!nd[userId]) nd[userId] = {};
                    nd[userId].status = nd[userId].status === s ? undefined : s;
                    onDetailChange(nd);
                }} style={{
                    padding: "3px 10px", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 10, fontWeight: 700,
                    background: d.status === s ? statusColor[s] : "rgba(255,255,255,0.06)", color: "#fff", textTransform: "uppercase",
                }}>{s === "dnd" ? "DND" : s}</button>)}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
                <select value={d.activity?.type ?? ""} onChange={e => {
                    const nd = { ...details };
                    if (!nd[userId]) nd[userId] = {};
                    if (!e.target.value) { delete nd[userId].activity; } else { nd[userId].activity = { ...nd[userId].activity, type: Number(e.target.value) }; }
                    onDetailChange(nd);
                }} style={{ ...baseInput, fontSize: 10, padding: "4px 8px", width: "auto" }}>
                    <option value="">No activity</option>
                    {ACTIVITY_TYPES.map(at => <option key={at.value} value={at.value}>{at.label}</option>)}
                </select>
                {d.activity != null && <input value={d.activity.name ?? ""} onChange={e => {
                    const nd = { ...details };
                    if (!nd[userId]) nd[userId] = {};
                    nd[userId].activity = { ...nd[userId].activity, type: nd[userId].activity?.type ?? 0, name: e.target.value };
                    onDetailChange(nd);
                }} style={{ ...baseInput, fontSize: 10, padding: "4px 8px", flex: 1 }} placeholder="Game name..." />}
            </div>
            <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase" }}>Badges</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                    {BADGE_BITS.map(bb => {
                        const has = (d.badges ?? 0) & bb.bit;
                        return <button key={bb.label} onClick={() => {
                            const nd = { ...details };
                            if (!nd[userId]) nd[userId] = {};
                            nd[userId].badges = (nd[userId].badges ?? 0) ^ bb.bit;
                            onDetailChange(nd);
                        }} style={{
                            padding: "2px 6px", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 9, fontWeight: 600,
                            background: has ? YELLOW : "rgba(255,255,255,0.06)", color: has ? "#000" : "#fff",
                        }}>{bb.label}</button>;
                    })}
                </div>
            </div>
        </div>}
    </div>;
}

function RequestSection({ ids, setIds }: { ids: string[]; setIds: (ids: string[]) => void }) {
    const [inputId, setInputId] = useState("");
    const [massInput, setMassInput] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleAdd = async () => {
        const trimmed = inputId.trim();
        if (!trimmed) return;
        setLoading(true); setError("");
        const ok = await addFakeRequest(trimmed);
        setLoading(false);
        if (ok) { setIds([...injectedRequestIds]); setInputId(""); }
        else setError(ids.includes(trimmed) ? "Already added" : "Invalid ID or fetch failed");
    };

    const handleMassAdd = async () => {
        const raw = massInput.trim();
        if (!raw) return;
        const idList = raw.split(/[\s,;\n]+/).filter(Boolean);
        setLoading(true); setError("");
        let added = 0;
        for (const id of idList) { if (await addFakeRequest(id)) added++; }
        setLoading(false); setIds([...injectedRequestIds]); setMassInput("");
        setError(added > 0 ? `Added ${added} request(s)` : "No valid IDs found");
    };

    return <Section title="INCOMING REQUESTS" subtitle="Appear in your Pending tab" accent={PINK}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "var(--header-secondary)", marginBottom: 8 }}>Add by ID</div>
        <div style={{ display: "flex", gap: 6 }}>
            <input style={{ ...baseInput, flex: 1, fontSize: 12 }} value={inputId} onChange={e => setInputId(e.currentTarget.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} placeholder="Discord User ID..." />
            <button className="ffr-btn" style={{ padding: "8px 16px", border: "none", borderRadius: 8, cursor: "pointer", background: C.pinkGrad, color: "#fff", fontWeight: 700, fontSize: 14, opacity: loading || !inputId.trim() ? 0.5 : 1 }} onClick={handleAdd} disabled={loading || !inputId.trim()}>{loading ? <span className="ffr-spinner" /> : "Add ✦"}</button>
        </div>
        <div style={{ marginTop: 8, fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "var(--header-secondary)", marginBottom: 8 }}>Mass Add</div>
        <textarea style={{ ...baseInput, fontSize: 12, minHeight: 40, resize: "vertical", marginBottom: 6 }} value={massInput} onChange={e => setMassInput(e.currentTarget.value)} placeholder="Multiple IDs (comma/space/newline)" />
        <button className="ffr-btn" style={{ padding: "6px 14px", border: "none", borderRadius: 8, cursor: "pointer", background: C.purpleGrad, color: "#fff", fontWeight: 700, fontSize: 12, opacity: loading || !massInput.trim() ? 0.5 : 1 }} onClick={handleMassAdd} disabled={loading || !massInput.trim()}>{loading ? <span className="ffr-spinner" /> : "Add All ►"}</button>
        {error && <div style={{ fontSize: 11, color: error.startsWith("Added") ? TEAL : "var(--text-danger)", marginTop: 6 }}>{error}</div>}
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            {ids.length > 0 ? ids.map((id, i) => <FriendRow key={id} userId={id} isRequest onRemove={() => { removeFakeRequest(id); setIds([...injectedRequestIds]); }} details={{}} onDetailChange={() => { }} />)
                : <div style={{ textAlign: "center", padding: "8px 0", color: "var(--text-muted)", fontSize: 12 }}>No fake requests added</div>}
        </div>
    </Section>;
}

function FriendsSection({ ids, setIds, details, setDetails }: { ids: string[]; setIds: (ids: string[]) => void; details: Record<string, FakeDetail>; setDetails: (d: Record<string, FakeDetail>) => void }) {
    const [inputId, setInputId] = useState("");
    const [loading, setLoading] = useState(false);

    const handleAdd = async () => {
        const trimmed = inputId.trim();
        if (!trimmed) return;
        setLoading(true);
        const ok = await addFakeFriend(trimmed);
        setLoading(false);
        if (ok) { setIds([...injectedFriendIds]); setInputId(""); }
    };

    return <Section title="FAKE FRIENDS" subtitle="Appear in your Friends list" accent={TEAL}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "var(--header-secondary)", marginBottom: 8 }}>Add by ID</div>
        <div style={{ display: "flex", gap: 6 }}>
            <input style={{ ...baseInput, flex: 1, fontSize: 12 }} value={inputId} onChange={e => setInputId(e.currentTarget.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} placeholder="Discord User ID..." />
            <button className="ffr-btn" style={{ padding: "8px 16px", border: "none", borderRadius: 8, cursor: "pointer", background: C.tealGrad, color: "#fff", fontWeight: 700, fontSize: 14, opacity: loading || !inputId.trim() ? 0.5 : 1 }} onClick={handleAdd} disabled={loading || !inputId.trim()}>{loading ? <span className="ffr-spinner" /> : "Add ✦"}</button>
        </div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            {ids.length > 0 ? ids.map(id => <FriendRow key={id} userId={id} details={details} onDetailChange={nd => { saveDetails(nd); setDetails(nd); dispatchPresenceUpdates(); }} onRemove={() => { removeFakeFriend(id); setIds([...injectedFriendIds]); dispatchPresenceUpdates(); }} />)
                : <div style={{ textAlign: "center", padding: "8px 0", color: "var(--text-muted)", fontSize: 12 }}>No fake friends added</div>}
        </div>
    </Section>;
}

function GuildsSection({ guilds, setGuilds }: { guilds: FakeGuild[]; setGuilds: (g: FakeGuild[]) => void }) {
    const [inputName, setInputName] = useState("");
    const handleAdd = () => {
        const name = inputName.trim();
        if (!name) return;
        const updated = [...guilds, { id: genId(), name }];
        setGuilds(updated); saveGuilds(updated); setInputName("");
    };
    return <Section title="FAKE MUTUAL SERVERS" subtitle="Appear on user profiles" accent={PURPLE}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "var(--header-secondary)", marginBottom: 8 }}>Add Server</div>
        <div style={{ display: "flex", gap: 6 }}>
            <input style={{ ...baseInput, flex: 1, fontSize: 12 }} value={inputName} onChange={e => setInputName(e.currentTarget.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} placeholder="Server name..." />
            <button className="ffr-btn" style={{ padding: "8px 16px", border: "none", borderRadius: 8, cursor: "pointer", background: C.purpleGrad, color: "#fff", fontWeight: 700, fontSize: 14, opacity: !inputName.trim() ? 0.5 : 1 }} onClick={handleAdd} disabled={!inputName.trim()}>Add ✦</button>
        </div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            {guilds.length > 0 ? guilds.map(g => <div key={g.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #a855f7, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 13 }}>{g.name[0].toUpperCase()}</div>
                    <div><div style={{ fontSize: 12, fontWeight: 600, color: "var(--header-primary)" }}>{g.name}</div><div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>{g.id}</div></div>
                </div>
                <button className="ffr-mini-btn" onClick={() => { const u = guilds.filter(x => x.id !== g.id); setGuilds(u); saveGuilds(u); }} style={{ width: 24, height: 24, border: "none", borderRadius: 6, cursor: "pointer", background: "rgba(237,66,69,0.6)", color: "#fff", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>) : <div style={{ textAlign: "center", padding: "8px 0", color: "var(--text-muted)", fontSize: 12 }}>No fake guilds added</div>}
        </div>
    </Section>;
}

function DmSection({ dms, setDms }: { dms: FakeDmChannel[]; setDms: (d: FakeDmChannel[]) => void }) {
    const [selId, setSelId] = useState("");
    const [msgText, setMsgText] = useState("");
    const allFriendIds = [...new Set([...injectedRequestIds, ...injectedFriendIds])];

    const toggleDm = (userId: string) => {
        const exists = dms.find(d => d.userId === userId);
        const updated = exists ? dms.filter(d => d.userId !== userId) : [...dms, { userId, messages: [] }];
        setDms(updated); saveDms(updated);
    };

    const addMsg = () => {
        if (!selId || !msgText.trim()) return;
        const updated = dms.map(d => d.userId === selId ? { ...d, messages: [...d.messages, { author: UserStore.getUser(selId)?.username ?? "User", content: msgText.trim(), time: new Date().toLocaleTimeString() }] } : d);
        setDms(updated); saveDms(updated); setMsgText("");
    };

    const removeMsg = (userId: string, idx: number) => {
        const updated = dms.map(d => d.userId === userId ? { ...d, messages: d.messages.filter((_, i) => i !== idx) } : d);
        setDms(updated); saveDms(updated);
    };

    return <Section title="FAKE DMs" subtitle="Simulated conversations (preview only)" accent={YELLOW}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "var(--header-secondary)", marginBottom: 8 }}>
            Enable DM for a friend
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
            {allFriendIds.length === 0 && <div style={{ color: "var(--text-muted)", fontSize: 12 }}>Add a friend or request first</div>}
            {allFriendIds.slice(0, 20).map(id => {
                const enabled = dms.some(d => d.userId === id);
                return <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
                    <UserAvatar userId={id} size={24} />
                    <div style={{ flex: 1, fontSize: 12 }}><UserName userId={id} /></div>
                    <button onClick={() => toggleDm(id)} style={{
                        padding: "3px 10px", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 10, fontWeight: 700,
                        background: enabled ? YELLOW : "rgba(255,255,255,0.08)", color: enabled ? "#000" : "#fff",
                    }}>{enabled ? "ON" : "OFF"}</button>
                </div>;
            })}
        </div>
        {selId && <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "var(--header-secondary)", marginBottom: 4 }}>
            Messages for <UserName userId={selId} />
        </div>}
        {dms.filter(d => d.userId === selId).map(dm => <div key={dm.userId} style={{ marginBottom: 6 }}>
            {dm.messages.map((m, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)", marginBottom: 2 }}>
                <div><span style={{ fontWeight: 700, fontSize: 11 }}>{m.author}</span><span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>{m.content}</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{m.time}</span>
                    <button onClick={() => removeMsg(dm.userId, i)} style={{ width: 16, height: 16, border: "none", borderRadius: 4, cursor: "pointer", background: "rgba(237,66,69,0.5)", color: "#fff", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                </div>
            </div>)}
        </div>)}
        <div style={{ display: "flex", gap: 6 }}>
            <select style={{ ...baseInput, fontSize: 11, padding: "6px 8px", width: "auto" }} value={selId} onChange={e => setSelId(e.target.value)}>
                <option value="">Select user</option>
                {allFriendIds.filter(id => dms.some(d => d.userId === id)).map(id => <option key={id} value={id}>{UserStore.getUser(id)?.username ?? id}</option>)}
            </select>
            <input style={{ ...baseInput, flex: 1, fontSize: 11, padding: "6px 8px" }} value={msgText} onChange={e => setMsgText(e.currentTarget.value)} onKeyDown={e => e.key === "Enter" && addMsg()} placeholder="Fake message..." />
            <button className="ffr-btn" onClick={addMsg} style={{ padding: "6px 10px", border: "none", borderRadius: 6, cursor: "pointer", background: YELLOW, color: "#000", fontWeight: 700, fontSize: 11, opacity: !selId || !msgText.trim() ? 0.5 : 1 }} disabled={!selId || !msgText.trim()}>Send</button>
        </div>
    </Section>;
}

function PresetsSection({ onClose }: { onClose: () => void }) {
    const [presets, setPresets] = useState<Preset[]>(loadPresets());
    const [presetName, setPresetName] = useState("");

    const saveCurrent = () => {
        const name = presetName.trim() || `Preset ${presets.length + 1}`;
        const p: Preset = {
            name, reqIds: [...injectedRequestIds], friendIds: [...injectedFriendIds],
            guilds: loadGuilds(), details: loadDetails(), dms: loadDms(),
        };
        const updated = [...presets.filter(x => x.name !== name), p];
        setPresets(updated); savePresets(updated); setPresetName("");
        showFakeToast("Saved preset: " + name);
    };

    const loadPreset = (p: Preset) => {
        for (const id of [...injectedRequestIds, ...injectedFriendIds]) {
            const r = RelationshipStore.getMutableRelationships();
            r.delete(id);
        }
        injectedRequestIds = []; injectedFriendIds = [];
        RelationshipStore.emitChange();

        for (const id of p.reqIds) {
            const r = RelationshipStore.getMutableRelationships();
            r.set(id, 3);
            injectedRequestIds.push(id);
        }
        for (const id of p.friendIds) {
            const r = RelationshipStore.getMutableRelationships();
            r.set(id, 1);
            injectedFriendIds.push(id);
        }
        RelationshipStore.emitChange();
        persistIds();
        saveDetails(p.details);
        saveGuilds(p.guilds);
        saveDms(p.dms);
        dispatchPresenceUpdates();
        showFakeToast("Loaded preset: " + p.name);
        onClose();
    };

    const deletePreset = (name: string) => {
        const updated = presets.filter(x => x.name !== name);
        setPresets(updated); savePresets(updated);
    };

    const generateRandom = () => {
        const details: Record<string, FakeDetail> = {};
        const friendIds: string[] = [];
        for (let i = 0; i < 5; i++) {
            const id = fakeUserId();
            const status = STATUSES[Math.floor(Math.random() * 3)];
            friendIds.push(id);
            details[id] = {
                status,
                activity: Math.random() > 0.4 ? { type: 0, name: FAKE_GUILD_NAMES[Math.floor(Math.random() * FAKE_GUILD_NAMES.length)] } : undefined,
                badges: (1 << 9) | (Math.random() > 0.5 ? (1 << 2) : 0) | (Math.random() > 0.7 ? (1 << 16) : 0),
            };
        }
        const guilds = FAKE_GUILD_NAMES.slice(0, 3).map(n => ({ id: genId(), name: n }));
        const dms: FakeDmChannel[] = friendIds.slice(0, 2).map(id => ({
            userId: id,
            messages: [
                { author: FAKE_USERNAMES[Math.floor(Math.random() * FAKE_USERNAMES.length)], content: "hey what's up?", time: "10:00 AM" },
                { author: FAKE_USERNAMES[Math.floor(Math.random() * FAKE_USERNAMES.length)], content: "not much, you?", time: "10:01 AM" },
            ],
        }));
        for (const id of friendIds) {
            const r = RelationshipStore.getMutableRelationships();
            r.set(id, 1);
            injectedFriendIds.push(id);
        }
        RelationshipStore.emitChange();
        persistIds();
        saveDetails(details);
        saveGuilds(guilds);
        saveDms(dms);
        dispatchPresenceUpdates();
        showFakeToast("Generated 5 random friends!");
        onClose();
    };

    const applyTemplate = (type: string) => {
        const details: Record<string, FakeDetail> = {};
        const friendIds: string[] = [];
        let guilds: FakeGuild[] = [];
        let dms: FakeDmChannel[] = [];

        if (type === "popular") {
            const id = fakeUserId();
            friendIds.push(id);
            details[id] = { status: "online", activity: { type: 0, name: "Valorant" }, badges: (1 << 9) | (1 << 2) | (1 << 16) | (1 << 19) };
            guilds = [{ id: genId(), name: "The Hideout" }, { id: genId(), name: "Midnight Club" }];
            dms = [{ userId: id, messages: [{ author: "Raven", content: "yo wanna play?", time: "2:30 PM" }, { author: "You", content: "sure give me 5", time: "2:31 PM" }] }];
        } else if (type === "streamer") {
            const id = fakeUserId();
            friendIds.push(id);
            details[id] = { status: "online", activity: { type: 1, name: "Twitch", state: "Just Chatting" }, badges: (1 << 9) | (1 << 16) };
            guilds = [{ id: genId(), name: "Stream Team" }, { id: genId(), name: "Emote Only" }];
            dms = [{ userId: id, messages: [{ author: "Kai", content: "live in 10!", time: "4:00 PM" }] }];
        } else if (type === "gamer") {
            const ids = [fakeUserId(), fakeUserId()];
            ids.forEach((id, i) => {
                friendIds.push(id);
                details[id] = { status: i === 0 ? "idle" : "dnd", activity: { type: 0, name: i === 0 ? "Apex Legends" : "League of Legends" }, badges: (1 << 9) };
            });
            guilds = [{ id: genId(), name: "Gaming Den" }, { id: genId(), name: "LFG" }, { id: genId(), name: "The Basement" }];
            dms = ids.slice(0, 1).map(id => ({ userId: id, messages: [{ author: "Ace", content: "ranked?", time: "11:00 PM" }] }));
        }

        for (const id of friendIds) {
            const r = RelationshipStore.getMutableRelationships();
            r.set(id, 1);
            injectedFriendIds.push(id);
        }
        RelationshipStore.emitChange();
        persistIds();
        saveDetails(details);
        saveGuilds(guilds);
        saveDms(dms);
        dispatchPresenceUpdates();
        showFakeToast(`Loaded "${type}" template!`);
        onClose();
    };

    return <Section title="PRESETS & TEMPLATES" accent={PURPLE}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "var(--header-secondary)", marginBottom: 8 }}>Save Current</div>
        <div style={{ display: "flex", gap: 6 }}>
            <input style={{ ...baseInput, flex: 1, fontSize: 12 }} value={presetName} onChange={e => setPresetName(e.currentTarget.value)} onKeyDown={e => e.key === "Enter" && saveCurrent()} placeholder="Preset name..." />
            <button className="ffr-btn" onClick={saveCurrent} style={{ padding: "8px 16px", border: "none", borderRadius: 8, cursor: "pointer", background: C.purpleGrad, color: "#fff", fontWeight: 700, fontSize: 14 }}>Save</button>
        </div>

        {presets.length > 0 && <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "var(--header-secondary)", marginBottom: 6 }}>Saved Presets</div>
            {presets.map(p => <div key={p.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: 8, background: "rgba(255,255,255,0.03)", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{p.name} <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 400 }}>({p.friendIds.length + p.reqIds.length} users)</span></span>
                <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => loadPreset(p)} className="ffr-btn" style={{ padding: "3px 10px", border: "none", borderRadius: 6, cursor: "pointer", background: C.tealGrad, color: "#fff", fontWeight: 700, fontSize: 10 }}>Load</button>
                    <button onClick={() => deletePreset(p.name)} style={{ padding: "3px 10px", border: "none", borderRadius: 6, cursor: "pointer", background: "rgba(237,66,69,0.6)", color: "#fff", fontWeight: 700, fontSize: 10 }}>Del</button>
                </div>
            </div>)}
        </div>}

        <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "var(--header-secondary)", marginBottom: 6 }}>Quick Templates</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <button onClick={() => applyTemplate("popular")} className="ffr-template-btn" style={{ padding: "6px 12px", border: "none", borderRadius: 8, cursor: "pointer", background: C.pinkGrad, color: "#fff", fontWeight: 700, fontSize: 11 }}>Popular User</button>
                <button onClick={() => applyTemplate("streamer")} className="ffr-template-btn" style={{ padding: "6px 12px", border: "none", borderRadius: 8, cursor: "pointer", background: C.purpleGrad, color: "#fff", fontWeight: 700, fontSize: 11 }}>Streamer</button>
                <button onClick={() => applyTemplate("gamer")} className="ffr-template-btn" style={{ padding: "6px 12px", border: "none", borderRadius: 8, cursor: "pointer", background: C.tealGrad, color: "#fff", fontWeight: 700, fontSize: 11 }}>Gamer Group</button>
                <button onClick={generateRandom} style={{ padding: "6px 12px", border: "none", borderRadius: 8, cursor: "pointer", background: C.yellowGrad, color: "#000", fontWeight: 700, fontSize: 11 }}>🎲 Random 5</button>
            </div>
        </div>
    </Section>;
}

function FriendFreakyModal(props: any) {
    const [reqIds, setReqIds] = useState([...injectedRequestIds]);
    const [friendIds, setFriendIds] = useState([...injectedFriendIds]);
    const [guilds, setGuilds] = useState(loadGuilds());
    const [details, setDetails] = useState(loadDetails());
    const [dms, setDms] = useState(loadDms());
    const [tab, setTab] = useState<"requests" | "friends" | "guilds" | "dms" | "presets">("requests");
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => { if (containerRef.current) containerRef.current.style.animation = "ffr-fadeIn .35s cubic-bezier(.22,1,.36,1)"; }, []);

    const tabs = [
        { key: "requests", label: "Requests", count: reqIds.length, color: PINK },
        { key: "friends", label: "Friends", count: friendIds.length, color: TEAL },
        { key: "guilds", label: "Servers", count: guilds.length, color: PURPLE },
        { key: "dms", label: "DMs", count: dms.length, color: YELLOW },
        { key: "presets", label: "Presets", count: 0, color: PURPLE },
    ] as const;

    return <Modal {...props} size={Modal.Size?.SMALL ?? "sm"}>
        <div ref={containerRef} style={{ padding: "0 20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ textAlign: "center", marginBottom: 4, paddingTop: 20 }}>
                <div className="ffr-logo">FREAKY👅</div>
                <div style={{ fontSize: 11, color: PINK, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase" }}>by Atlas / x870</div>
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                {tabs.map(t => <button key={t.key} className="ffr-tab" onClick={() => setTab(t.key)} style={{
                    padding: "6px 14px", border: "none", borderRadius: 8, cursor: "pointer",
                    background: tab === t.key ? `color-mix(in srgb, ${t.color} 25%, transparent)` : "rgba(255,255,255,0.04)",
                    color: tab === t.key ? t.color : "var(--text-muted)", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", gap: 6,
                }}>
                    {t.label}
                    {t.count > 0 && <span style={{ background: t.color, color: "#fff", borderRadius: 6, padding: "0 6px", fontSize: 10, fontWeight: 800, lineHeight: "16px" }}>{t.count > 99 ? "99+" : t.count}</span>}
                </button>)}
            </div>
            {tab === "requests" && <RequestSection ids={reqIds} setIds={setReqIds} />}
            {tab === "friends" && <FriendsSection ids={friendIds} setIds={setFriendIds} details={details} setDetails={nd => { saveDetails(nd); setDetails(nd); }} />}
            {tab === "guilds" && <GuildsSection guilds={guilds} setGuilds={setGuilds} />}
            {tab === "dms" && <DmSection dms={dms} setDms={setDms} />}
            {tab === "presets" && <PresetsSection onClose={() => { setReqIds([...injectedRequestIds]); setFriendIds([...injectedFriendIds]); setGuilds(loadGuilds()); setDetails(loadDetails()); setDms(loadDms()); }} />}
        </div>
    </Modal>;
}

const Button: ChatBarButtonFactory = () => {
    const [badgeKey, setBadgeKey] = useState(0);
    return <ChatBarButton tooltip="FriendFreaky" onClick={() => { openModal((p: any) => <FriendFreakyModal {...p} />); setTimeout(() => setBadgeKey(n => n + 1), 500); }}>
        <Icon key={badgeKey} />
    </ChatBarButton>;
};

export default definePlugin({
    name: "FriendFreaky",
    description: "Fake friend requests, friends list, mutual servers, DMs, presets, status, badges",
    authors: [{ name: "Atlas", id: 1389444830882562131n }],
    settings,
    dependencies: ["CommandsAPI"],

    chatBarButton: { render: Button },

    patches: [{
        find: "getMutualGuilds",
        replacement: {
            match: /(getMutualGuilds\(\i\){return )(.+?)(?=})/,
            replace: "$1$self.mutualGuildsHook($2)",
        },
    }],

    mutualGuildsHook(original: any) {
        if (!Array.isArray(original)) return original;
        const guilds = loadGuilds();
        if (!guilds.length) return original;
        return [...original, ...guilds.map(g => ({ id: g.id, nick: null, guild: { id: g.id, name: g.name, icon: null } }))];
    },

    commands: [{
        name: "friendfreaky",
        description: "Manage all fake data",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [{
            name: "action",
            description: "Action",
            type: OptionType.STRING as any,
            required: true,
            choices: [
                { name: "add", value: "add", label: "Add fake friend request" },
                { name: "remove", value: "remove", label: "Remove fake request" },
                { name: "addfriend", value: "addfriend", label: "Add fake friend" },
                { name: "removefriend", value: "removefriend", label: "Remove fake friend" },
                { name: "addguild", value: "addguild", label: "Add fake guild" },
                { name: "removeguild", value: "removeguild", label: "Remove fake guild" },
                { name: "list", value: "list", label: "List all fake data" },
                { name: "random", value: "random", label: "Generate random friends" },
                { name: "template", value: "template", label: "Apply a template" },
            ],
        }, {
            name: "value",
            description: "Value",
            type: OptionType.STRING as any,
            required: false,
        }],
        execute: async ([action, value]: string[], _) => {
            if (action === "add") {
                if (!value) return { content: "Usage: /friendfreaky add <userId>" };
                return { content: (await addFakeRequest(value)) ? "Added" : "Failed" };
            }
            if (action === "addfriend") {
                if (!value) return { content: "Usage: /friendfreaky addfriend <userId>" };
                return { content: (await addFakeFriend(value)) ? "Added" : "Failed" };
            }
            if (action === "remove") {
                if (!value) return { content: "Usage: /friendfreaky remove <userId>" };
                removeFakeRequest(value);
                return { content: "Removed" };
            }
            if (action === "removefriend") {
                if (!value) return { content: "Usage: /friendfreaky removefriend <userId>" };
                removeFakeFriend(value);
                return { content: "Removed" };
            }
            if (action === "addguild") {
                if (!value) return { content: "Usage: /friendfreaky addguild <name>" };
                const g = loadGuilds();
                g.push({ id: genId(), name: value });
                saveGuilds(g);
                return { content: `Added guild "${value}"` };
            }
            if (action === "removeguild") {
                if (!value) return { content: "Usage: /friendfreaky removeguild <id>" };
                saveGuilds(loadGuilds().filter(x => x.id !== value));
                return { content: "Removed" };
            }
            if (action === "list") {
                const parts: string[] = [];
                if (injectedRequestIds.length) parts.push(`Requests: ${injectedRequestIds.length}`);
                if (injectedFriendIds.length) parts.push(`Friends: ${injectedFriendIds.length}`);
                const g = loadGuilds();
                if (g.length) parts.push(`Guilds: ${g.length}`);
                return { content: parts.length ? parts.join(" | ") : "Nothing added" };
            }
            if (action === "random") {
                const count = Math.min(parseInt(value) || 5, 20);
                const details: Record<string, FakeDetail> = {};
                const friendIds: string[] = [];
                for (let i = 0; i < count; i++) {
                    const id = fakeUserId();
                    friendIds.push(id);
                    details[id] = {
                        status: STATUSES[Math.floor(Math.random() * 3)],
                        activity: Math.random() > 0.4 ? { type: 0, name: FAKE_GUILD_NAMES[Math.floor(Math.random() * FAKE_GUILD_NAMES.length)] } : undefined,
                        badges: Math.random() > 0.5 ? (1 << 9) | (1 << 2) : (1 << 9),
                    };
                }
                for (const id of friendIds) { RelationshipStore.getMutableRelationships().set(id, 1); injectedFriendIds.push(id); }
                RelationshipStore.emitChange();
                persistIds();
                saveDetails(details);
                dispatchPresenceUpdates();
                return { content: `Generated ${count} random friends` };
            }
            if (action === "template") {
                const templates: Record<string, { details: Record<string, FakeDetail>; friendIds: string[]; guilds: FakeGuild[] }> = {
                    popular: {
                        friendIds: [fakeUserId()],
                        details: { [fakeUserId()]: { status: "online", activity: { type: 0, name: "Valorant" }, badges: (1 << 9) | (1 << 2) | (1 << 16) } },
                        guilds: [{ id: genId(), name: "The Hideout" }],
                    },
                };
                const t = templates.popular;
                for (const id of t.friendIds) { RelationshipStore.getMutableRelationships().set(id, 1); injectedFriendIds.push(id); }
                RelationshipStore.emitChange();
                persistIds();
                saveDetails(t.details);
                saveGuilds(t.guilds);
                dispatchPresenceUpdates();
                return { content: "Applied template" };
            }
            return { content: "Actions: add, addfriend, remove, removefriend, addguild, removeguild, list, random, template" };
        },
    }],

    start() {
        patchPendingCount();
        patchPresenceStore();

        const styleId = "ffr-styles";
        if (!document.getElementById(styleId)) {
            const s = document.createElement("style");
            s.id = styleId;
            s.textContent = `
                @keyframes ffr-pulse { 0%,100% { filter:drop-shadow(0 0 2px var(--brand-experiment));transform:scale(1) } 50% { filter:drop-shadow(0 0 8px var(--brand-experiment));transform:scale(1.08) } }
                @keyframes ffr-float { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-2px) } }
                @keyframes ffr-fadeIn { from { opacity:0;transform:translateY(8px) scale(0.97) } to { opacity:1;transform:translateY(0) scale(1) } }
                @keyframes ffr-spin { to { transform:rotate(360deg) } }
                @keyframes ffr-logoShine { 0%,100% { background-position:0% center } 50% { background-position:100% center } }
                @keyframes ffr-logoBounce { 0%,100% { transform:translateY(0) scale(1) } 50% { transform:translateY(-3px) scale(1.03) } }
                .ffr-container { position:relative;display:flex;align-items:center;justify-content:center;animation:ffr-pulse 2s ease-in-out infinite,ffr-float 3s ease-in-out infinite }
                .ffr-container:hover { animation:ffr-float 1.5s ease-in-out infinite;filter:drop-shadow(0 0 12px var(--brand-experiment)) brightness(1.2) }
                .ffr-container svg { transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1) }
                .ffr-container:hover svg { transform:rotate(-8deg) scale(1.15) }
                .ffr-btn { transition:transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .2s,opacity .2s !important }
                .ffr-btn:hover:not(:disabled) { transform:translateY(-1px) scale(1.04) }
                .ffr-btn:active:not(:disabled) { transform:translateY(0) scale(0.97) }
                .ffr-btn:disabled { cursor:not-allowed }
                .ffr-mini-btn { transition:transform .15s,background .15s !important }
                .ffr-mini-btn:hover { transform:scale(1.15) }
                .ffr-tab { transition:all .2s ease !important }
                .ffr-tab:hover { filter:brightness(1.2) }
                .ffr-template-btn { transition:transform .2s,box-shadow .2s !important }
                .ffr-template-btn:hover { transform:translateY(-1px) scale(1.03) }
                .ffr-badge { position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;border-radius:8px;background:#ff6b9d !important;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 4px;box-shadow:0 0 8px color-mix(in srgb,#ff6b9d 60%,transparent) !important;animation:ffr-pulse 1.5s ease-in-out infinite !important;pointer-events:none }
                .ffr-spinner { display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:ffr-spin 0.6s linear infinite;vertical-align:middle }
                .ffr-logo { font-size:26px;font-weight:900;letter-spacing:1px;background:linear-gradient(135deg,#ff6b9d,#c44569,#a855f7,#06b6d4);background-size:300% auto;background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:ffr-logoShine 3s ease-in-out infinite,ffr-logoBounce 1.5s ease-in-out infinite;filter:drop-shadow(0 0 12px rgba(255,107,157,0.4));margin-bottom:4px }
            `;
            document.head.appendChild(s);
        }

        const details = loadDetails();
        for (const id of loadIds("fakeUserIds")) {
            if (!injectedRequestIds.includes(id) && UserStore.getUser(id)) {
                const r = RelationshipStore.getMutableRelationships();
                if (RelationshipStore.getRelationshipType(id) === 0) { r.set(id, 3); }
                injectedRequestIds.push(id);
            }
        }
        for (const id of loadIds("fakeFriendIds")) {
            if (!injectedFriendIds.includes(id) && UserStore.getUser(id)) {
                const r = RelationshipStore.getMutableRelationships();
                if (RelationshipStore.getRelationshipType(id) === 0) { r.set(id, 1); }
                injectedFriendIds.push(id);
                const user = UserStore.getUser(id) as any;
                if (user && details[id]?.badges != null) {
                    user.publicFlags = details[id].badges;
                    user.flags = details[id].badges;
                }
            }
        }
        if (injectedRequestIds.length || injectedFriendIds.length) {
            RelationshipStore.emitChange();
            dispatchPresenceUpdates();
        }
    },

    stop() {
        unpatchAll();
        const style = document.getElementById("ffr-styles");
        if (style) style.remove();
        const relationships = RelationshipStore.getMutableRelationships();
        for (const id of injectedRequestIds) relationships.delete(id);
        for (const id of injectedFriendIds) relationships.delete(id);
        RelationshipStore.emitChange();
        injectedRequestIds = [];
        injectedFriendIds = [];
    },
});
