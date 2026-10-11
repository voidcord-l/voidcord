import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { showNotification } from "@api/Notifications";
import { definePluginSettings, useSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Switch } from "@components/Switch";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { LazyComponent } from "@utils/lazyReact";
import { filters, find, findByPropsLazy, findStoreLazy } from "@webpack";
import { Avatar, ChannelStore, Menu, PermissionsBits, PermissionStore, React, SelectedChannelStore, TextInput, Toasts, Tooltip, UserStore } from "@webpack/common";
import type { Channel, User } from "@vencord/discord-types";

const HeaderBarIcon = LazyComponent(() => {
    const filter = filters.byCode(".HEADER_BAR_BADGE");
    return find(m => m.Icon && filter(m.Icon)).Icon;
});

const activityLabels: Record<number, string> = { 0: "Playing", 1: "Streaming", 2: "Listening to", 3: "Watching", 5: "Competing" };

interface FollowUserData {
    id: string;
    enabled: boolean;
    trackVoice: boolean;
    trackActivity: boolean;
    nickname: string;
}

function parseData(): FollowUserData[] {
    try {
        const r = settings.store.followedUsers;
        if (!r) return [];
        const p = JSON.parse(r);
        return Array.isArray(p) ? p : [];
    } catch { return []; }
}

function saveData(d: FollowUserData[]) { settings.store.followedUsers = JSON.stringify(d); }

function enabledIds(): string[] { return parseData().filter(u => u.enabled).map(u => u.id); }

function isFollowed(id: string): boolean { return parseData().some(u => u.id === id); }

function toggleFollow(uid: string) {
    const d = parseData();
    const i = d.findIndex(u => u.id === uid);
    if (i >= 0) { d.splice(i, 1); }
    else { d.push({ id: uid, enabled: true, trackVoice: true, trackActivity: true, nickname: "" }); }
    saveData(d);
    if (i < 0 && settings.store.executeOnFollow) followVoice(uid);
}

function setEnabled(uid: string, v: boolean) { const d = parseData(); const u = d.find(x => x.id === uid); if (u) u.enabled = v; saveData(d); }

const ChannelActions = findByPropsLazy("disconnect", "selectVoiceChannel");
const VoiceStateStore = findStoreLazy("VoiceStateStore");
const CONNECT = 1n << 20n;

function userVC(uid: string): string | null {
    if (!uid) return null;
    try {
        for (const [cid, users] of Object.entries(VoiceStateStore.getAllVoiceStates()) as any[])
            if (users?.[uid]) return users[uid].channelId ?? null;
    } catch { }
    return null;
}

function canJoin(cid: string): boolean {
    try {
        const ch = ChannelStore.getChannel(cid);
        return !!ch && (ch.type === 1 || PermissionStore.can(CONNECT, ch));
    } catch { return false; }
}

function isVCFull(cid: string): boolean {
    try {
        const ch = ChannelStore.getChannel(cid);
        if (!ch || ch.userLimit === 0) return false;
        const vs = VoiceStateStore.getVoiceStatesForChannel(cid);
        return (vs ? Object.keys(vs).length : 0) >= ch.userLimit;
    } catch { return false; }
}

function followVoice(uid: string) {
    const cid = userVC(uid);
    if (!cid) {
        try {
            const u = UserStore.getUser(uid);
            Toasts.show({ message: `${u?.username || uid} not in VC`, id: Toasts.genId(), type: Toasts.Type.FAILURE });
        } catch {
            Toasts.show({ message: "User not in VC", id: Toasts.genId(), type: Toasts.Type.FAILURE });
        }
        return;
    }
    joinVC(cid, uid);
}

function joinVC(cid: string, uid?: string) {
    const my = SelectedChannelStore.getVoiceChannelId();
    if (cid === my) return;
    if (!canJoin(cid)) { Toasts.show({ message: "Cannot connect", id: Toasts.genId(), type: Toasts.Type.FAILURE }); return; }
    if (isVCFull(cid) && !PermissionStore.can(PermissionsBits.MOVE_MEMBERS, ChannelStore.getChannel(cid))) { Toasts.show({ message: "Channel full", id: Toasts.genId(), type: Toasts.Type.FAILURE }); return; }
    ChannelActions.selectVoiceChannel(cid);
    if (uid) { const u = UserStore.getUser(uid); Toasts.show({ message: `Joined ${u?.username || uid}`, id: Toasts.genId(), type: Toasts.Type.SUCCESS }); }
}

function leaveVC(uid?: string) {
    const my = SelectedChannelStore.getVoiceChannelId();
    if (!my || !settings.store.followLeave) return;
    ChannelActions.disconnect();
    if (uid) { const u = UserStore.getUser(uid); Toasts.show({ message: `Left (${u?.username || uid})`, id: Toasts.genId(), type: Toasts.Type.SUCCESS }); }
}

const presenceCache = new Map<string, { status: string; activities: Set<string>; }>();

export const settings = definePluginSettings({
    followedUsers: { type: OptionType.STRING, default: "[]", restartNeeded: false },
    customIcon: { type: OptionType.STRING, default: "https://i.pinimg.com/736x/3d/f5/d1/3df5d1c1c3dd1aee0f4671cd159a966b.jpg", restartNeeded: false },
    trackVoice: { type: OptionType.BOOLEAN, default: true, description: "Auto-follow users in voice", restartNeeded: false },
    trackGame: { type: OptionType.BOOLEAN, default: true, description: "Track when they play games", restartNeeded: false },
    trackListening: { type: OptionType.BOOLEAN, default: true, description: "Track when they listen to music", restartNeeded: false },
    trackStreaming: { type: OptionType.BOOLEAN, default: true, description: "Track when they stream", restartNeeded: false },
    trackWatching: { type: OptionType.BOOLEAN, default: true, description: "Track when they watch something", restartNeeded: false },
    notifyActivity: { type: OptionType.BOOLEAN, default: true, description: "Notify on activity changes", restartNeeded: false },
    notifyStatus: { type: OptionType.BOOLEAN, default: false, description: "Notify on status changes", restartNeeded: false },
    notifyVoice: { type: OptionType.BOOLEAN, default: true, description: "Notify on voice channel changes", restartNeeded: false },
    followLeave: { type: OptionType.BOOLEAN, default: false, description: "Leave VC when they leave", restartNeeded: false },
    executeOnFollow: { type: OptionType.BOOLEAN, default: true, description: "Auto-join voice on follow", restartNeeded: false },
    autoMoveBack: { type: OptionType.BOOLEAN, default: false, description: "Move back if you get moved", restartNeeded: false },
    autoRejoin: { type: OptionType.BOOLEAN, default: false, description: "Rejoin if disconnected", restartNeeded: false },
    onlyManualTrigger: { type: OptionType.BOOLEAN, default: false, description: "Only join via toolbar click", restartNeeded: false },
    channelFullRetry: { type: OptionType.BOOLEAN, default: true, description: "Auto-join when channel has space", restartNeeded: false },
    showIndicator: { type: OptionType.BOOLEAN, default: true, description: "Show toolbar icon", restartNeeded: false },
});

const UserCtx: NavContextMenuPatchCallback = (children, { user }: { channel: Channel; guildId?: string; user: User; }) => {
    if (!user || user.id === UserStore.getCurrentUser().id) return;
    const f = isFollowed(user.id);
    children.splice(-1, 0, (
        <Menu.MenuGroup>
            <Menu.MenuItem id="fg-toggle" label={f ? "Unfollow FollowGod" : "Follow FollowGod"} action={() => toggleFollow(user.id)} icon={f ? UnfollowSvg : FollowSvg} />
        </Menu.MenuGroup>
    ));
};

function FollowSvg() {
    return <svg width="24" height="24" viewBox="0 -960 960 960" fill="currentColor"><path d="M720-120H280v-520h440v520Zm-400-40h360v-440H320v440Zm160-280q42 0 71-29t29-71q0-42-29-71t-71-29q-42 0-71 29t-29 71q0 42 29 71t71 29ZM160-640v-120h680v120h-40v-80H200v80h-40Z" /></svg>;
}

function UnfollowSvg() {
    return <svg width="24" height="24" viewBox="0 -960 960 960" fill="currentColor"><path d="M280-120v-520h440v520H280Zm40-40h360v-440H320v440Zm160-280q42 0 71-29t29-71q0-42-29-71t-71-29q-42 0-71 29t-29 71q0 42 29 71t71 29ZM160-640v-120h680v120H160Z" /></svg>;
}

function CustomIcon(_props: any) {
    const url = settings.store.customIcon;
    if (!url || url === "https://i.pinimg.com/736x/3d/f5/d1/3df5d1c1c3dd1aee0f4671cd159a966b.jpg") {
        return <svg width="24" height="24" viewBox="0 -960 960 960" fill="currentColor"><path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z" /></svg>;
    }
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <image href={url} x="0" y="0" width="24" height="24" preserveAspectRatio="xMidYMid slice" style={{ borderRadius: "4px" }} />
        </svg>
    );
}

function notifyAct(uid: string, label: string, name: string, started: boolean) {
    if (!settings.store.notifyActivity) return;
    const u = UserStore.getUser(uid);
    if (!u) return;
    showNotification({ title: `FollowGod — ${u.username}`, body: `${started ? "▶ Started" : "⏹ Stopped"} ${label}: ${name}`, noPersist: true });
}

function notifyStat(uid: string, status: string) {
    if (!settings.store.notifyStatus) return;
    const u = UserStore.getUser(uid);
    if (!u) return;
    showNotification({ title: `FollowGod — ${u.username}`, body: `Status: ${status}`, noPersist: true });
}

function ManagerModal({ rootProps }: { rootProps: any; }) {
    const [items, setItems] = React.useState<FollowUserData[]>(() => parseData());
    const [q, setQ] = React.useState("");

    const filtered = q ? items.filter(i => {
        const u = UserStore.getUser(i.id);
        const n = u?.username || u?.globalName || i.nickname || i.id;
        return n.toLowerCase().includes(q.toLowerCase()) || i.id.includes(q);
    }) : items;

    function upd(id: string, ch: Partial<FollowUserData>) {
        const n = items.map(i => i.id === id ? { ...i, ...ch } : i);
        setItems(n); saveData(n);
    }

    function del(id: string) {
        const n = items.filter(i => i.id !== id);
        setItems(n); saveData(n);
    }

    return (
        <ModalRoot {...rootProps} size={ModalSize.SMALL}>
            <ModalHeader separator={false}>
                <TextInput value={q} onChange={setQ} placeholder="Search users..." style={{ flex: 1 }} />
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent>
                <div style={{ padding: "16px", maxHeight: "400px", overflowY: "auto" }}>
                    {filtered.length === 0 && (
                        <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "32px", whiteSpace: "pre-line" }}>
                            {items.length === 0 ? "No followed users yet.\nRight-click any user → Follow FollowGod" : "No matches"}
                        </div>
                    )}
                    {filtered.map(i => {
                        const u = UserStore.getUser(i.id);
                        const name = u?.globalName || u?.username || i.nickname || "Unknown";
                        const sub = u ? `@${u.username}` : i.id;
                        const avatarUrl = u?.getAvatarURL?.(void 0, 32) || "";
                        return (
                            <div key={i.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", borderRadius: "8px", background: "var(--background-secondary)", marginBottom: "6px", opacity: i.enabled ? 1 : 0.5 }}>
                                <Avatar src={avatarUrl} size="SIZE_32" />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--header-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{sub}</div>
                                </div>
                                <Switch checked={i.enabled} onChange={v => upd(i.id, { enabled: v })} />
                                <Tooltip text="Remove">
                                    {(tooltipProps: any) => <span {...tooltipProps} onClick={() => del(i.id)} style={{ cursor: "pointer", color: "var(--status-danger)", fontSize: "18px", padding: "4px" }}>✕</span>}
                                </Tooltip>
                            </div>
                        );
                    })}
                    {filtered.length > 0 && (
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "center", marginTop: "8px" }}>
                            {filtered.length} user{filtered.length !== 1 ? "s" : ""} · Toggle to enable/disable without unfollowing
                        </div>
                    )}
                </div>
            </ModalContent>
        </ModalRoot>
    );
}

export default definePlugin({
    name: "FollowUserPro",
    description: "Follow any user without being friends. Tracks voice, games, music, streams with a management panel.",
    authors: [{ name: "x870", id: 1389444830882562131n }],
    settings,
    contextMenus: { "user-context": UserCtx },

    flux: {
        PRESENCE_UPDATES({ updates }: any) {
            const ids = enabledIds();
            if (!ids.length) return;
            for (const up of updates || []) {
                const uid = up?.user?.id;
                if (!uid || !ids.includes(uid)) continue;
                const acts = up?.activities || [];
                const st = up?.status || "offline";
                const prev = presenceCache.get(uid);
                const cur = new Set(acts.map((a: any) => `${a.type}:${a.name}`));

                if (prev) {
                    for (const a of acts) {
                        const key = `${a.type}:${a.name}`;
                        if (!prev.activities.has(key)) {
                            const label = activityLabels[a.type];
                            if (label && settings.store[`track${["Game", "Streaming", "Listening", "Watching"][a.type] || ""}` as keyof typeof settings.store] !== false) {
                                notifyAct(uid, label, a.name, true);
                            }
                        }
                    }
                    for (const k of prev.activities) {
                        if (!cur.has(k)) {
                            const [ts, ...np] = k.split(":");
                            const t = parseInt(ts);
                            const n = np.join(":");
                            const label = activityLabels[t];
                            if (label && settings.store[`track${["Game", "Streaming", "Listening", "Watching"][t] || ""}` as keyof typeof settings.store] !== false) {
                                notifyAct(uid, label, n, false);
                            }
                        }
                    }
                    if (prev.status !== st) notifyStat(uid, st);
                }
                presenceCache.set(uid, { status: st, activities: cur });
            }
        },

        VOICE_STATE_UPDATES({ voiceStates }: any) {
            const ids = enabledIds();
            if (!ids.length || settings.store.onlyManualTrigger) return;
            for (const vs of voiceStates || []) {
                const { userId, channelId, oldChannelId } = vs;
                if (channelId === oldChannelId) continue;
                const me = userId === UserStore.getCurrentUser().id;

                if (settings.store.autoMoveBack && me && channelId && oldChannelId) { ids.forEach(followVoice); continue; }
                if (settings.store.autoRejoin && me && !channelId && oldChannelId) { ids.forEach(followVoice); continue; }

                if (settings.store.channelFullRetry && !me && !channelId && oldChannelId) {
                    try {
                        const ch = ChannelStore.getChannel(oldChannelId);
                        if (ch && ch.userLimit !== 0) {
                            const vs2 = VoiceStateStore.getVoiceStatesForChannel(oldChannelId);
                            const n = vs2 ? Object.keys(vs2).length : 0;
                            const me2 = UserStore.getCurrentUser().id;
                            const myVS = VoiceStateStore.getVoiceStateForUser(me2);
                            if (n === ch.userLimit - 1 && !PermissionStore.can(PermissionsBits.MOVE_MEMBERS, ch) && myVS?.channelId !== oldChannelId) {
                                for (const fid of ids) {
                                    const fidVS = VoiceStateStore.getVoiceStateForUser(fid);
                                    if (fidVS?.channelId === oldChannelId) { joinVC(oldChannelId, fid); break; }
                                }
                            }
                        }
                    } catch { }
                    continue;
                }

                if (!ids.includes(userId)) continue;

                if (settings.store.notifyVoice) {
                    const u = UserStore.getUser(userId);
                    if (u) {
                        if (channelId && channelId !== oldChannelId) showNotification({ title: `FollowGod — ${u.username}`, body: "Joined voice", noPersist: true });
                        else if (!channelId && oldChannelId) showNotification({ title: `FollowGod — ${u.username}`, body: "Left voice", noPersist: true });
                    }
                }

                if (settings.store.trackVoice && channelId) joinVC(channelId, userId);
                else if (!channelId && oldChannelId && settings.store.followLeave) leaveVC(userId);
            }
        },
    },

    FollowIndicator() {
        const { plugins: { FollowGod: { followedUsers } } } = useSettings(["plugins.FollowGod.followedUsers"]);
        if (!followedUsers || !settings.store.showIndicator) return null;
        let ids: string[] = [];
        try { const d = JSON.parse(followedUsers); if (Array.isArray(d)) ids = d.filter((x: any) => x.enabled).map((x: any) => x.id); } catch { }
        if (!ids.length) return null;
        const first = UserStore.getUser(ids[0]);
        const more = ids.length > 1;
        const label = first ? `Following ${first.username}${more ? ` +${ids.length - 1}` : ""}` : `${ids.length} followed`;
        return (
            <HeaderBarIcon
                tooltip={`${label} (click = join, right-click = manage)`}
                icon={CustomIcon}
                onClick={() => ids.forEach(followVoice)}
                onContextMenu={() => openModal((p: any) => <ManagerModal rootProps={p} />)}
            />
        );
    },

    patches: [{
        find: "toolbar:function",
        replacement: { match: /(function \i\(\i\){)(.{1,200}toolbar.{1,100}mobileToolbar)/, replace: "$1$self.addIconToToolBar(arguments[0]);$2" }
    }],

    addIconToToolBar(e: { toolbar: any; }) {
        const el = <ErrorBoundary noop={true} key="fg-indicator"><this.FollowIndicator /></ErrorBoundary>;
        if (Array.isArray(e.toolbar)) e.toolbar.push(el);
        else e.toolbar = [el, e.toolbar];
    },

    start() { presenceCache.clear(); },
    stop() { presenceCache.clear(); },
});
