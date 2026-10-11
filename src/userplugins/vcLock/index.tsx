/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { get as dsGet, set as dsSet } from "@api/DataStore";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { EquicordDevs } from "@utils/constants";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import type { Channel } from "@vencord/discord-types";
import { ChannelStore, Forms, GuildMemberStore, IconUtils, Menu, PermissionsBits, PermissionStore, RestAPI, TextInput, Toasts, UserStore, useEffect, useRef, useState, VoiceStateStore } from "@webpack/common";

const LOCKED_KEY = "VCLock_LockedChannels";
const ALLOW_KEY = "VCLock_AllowList";
const LOG_KEY = "VCLock_JoinLog";

interface JoinLogEntry {
    id: string;
    channelId: string;
    channelName: string;
    guildId: string;
    userId: string;
    username: string;
    avatar: string | null;
    timestamp: number;
    action: "kicked" | "logged";
}

interface RateEvent {
    timestamp: number;
    type: "ok" | "limited";
}

// Channels currently locked by this plugin. Locking never edits the channel's own permissions —
// it purely watches VOICE_STATE_UPDATES and disconnects anyone who isn't exempt the moment they join.
const lockedChannels = new Set<string>();
const occupants = new Map<string, Set<string>>();
let allowList: Record<string, string[]> = {};
let joinLog: JoinLogEntry[] = [];

// Rolling window (last 60s) of disconnect attempts, used to draw the live rate-limit graph.
const rateEvents: RateEvent[] = [];
let rateLimitedUntil = 0;

const settings = definePluginSettings({
    logSize: {
        type: OptionType.SLIDER,
        description: "Max number of join-log entries to keep.",
        markers: [50, 100, 250, 500, 1000],
        default: 250,
        stickToMarkers: true
    }
});

function toast(message: string, ok = true) {
    Toasts.show({ id: Toasts.genId(), message, type: ok ? Toasts.Type.SUCCESS : Toasts.Type.FAILURE });
}

function getRetryAfterMs(value: any): number | null {
    const retryAfter =
        value?.body?.retry_after ??
        value?.retry_after ??
        value?.response?.body?.retry_after ??
        value?.headers?.["Retry-After"] ??
        value?.headers?.["retry-after"];

    const parsed = Number(retryAfter);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.ceil(parsed > 1000 ? parsed : parsed * 1000);
}

function recordRateEvent(type: RateEvent["type"]) {
    rateEvents.push({ timestamp: Date.now(), type });
    const cutoff = Date.now() - 60_000;
    while (rateEvents.length && rateEvents[0].timestamp < cutoff) rateEvents.shift();
}

function LockIcon({ width = 16, height = 16 }: { width?: number; height?: number; }) {
    return (
        <svg width={width} height={height} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm0 2a3 3 0 0 1 3 3v3H9V7a3 3 0 0 1 3-3Z" />
        </svg>
    );
}

function UnlockIcon({ width = 16, height = 16 }: { width?: number; height?: number; }) {
    return (
        <svg width={width} height={height} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H9V7a3 3 0 0 1 5.83-1 1 1 0 0 0 1.94-.5A5 5 0 0 0 12 2Z" />
        </svg>
    );
}

function GearIcon({ width = 16, height = 16 }: { width?: number; height?: number; }) {
    return (
        <svg width={width} height={height} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9.4 4a7.4 7.4 0 0 0-.12-1.31l2.1-1.65a.75.75 0 0 0 .18-.95l-2-3.46a.75.75 0 0 0-.9-.33l-2.48 1a7.5 7.5 0 0 0-1.13-.66l-.38-2.65a.75.75 0 0 0-.74-.64h-4a.75.75 0 0 0-.74.64l-.38 2.65c-.4.18-.78.4-1.13.66l-2.48-1a.75.75 0 0 0-.9.33l-2 3.46a.75.75 0 0 0 .18.95l2.1 1.65a7.4 7.4 0 0 0 0 2.62l-2.1 1.65a.75.75 0 0 0-.18.95l2 3.46c.19.32.58.45.9.33l2.48-1c.35.26.73.48 1.13.66l.38 2.65c.06.37.38.64.74.64h4c.36 0 .68-.27.74-.64l.38-2.65c.4-.18.78-.4 1.13-.66l2.48 1c.32.12.71-.01.9-.33l2-3.46a.75.75 0 0 0-.18-.95l-2.1-1.65c.08-.43.12-.87.12-1.31Z" />
        </svg>
    );
}

function toggleLock(channel: Channel) {
    if (lockedChannels.has(channel.id)) {
        lockedChannels.delete(channel.id);
        occupants.delete(channel.id);
        toast(`Unlocked #${channel.name}.`, true);
    } else {
        lockedChannels.add(channel.id);
        const states = VoiceStateStore.getVoiceStatesForChannel(channel.id) ?? {};
        occupants.set(channel.id, new Set(Object.keys(states)));
        toast(`Locked #${channel.name} — anyone who joins without permission will be disconnected and logged.`, true);
    }
    dsSet(LOCKED_KEY, Array.from(lockedChannels));
}

async function handleJoin(channelId: string, userId: string, guildId: string, myId?: string) {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return;

    const user = UserStore.getUser(userId);
    const username = (user as any)?.globalName || user?.username || userId;
    const exempt = userId === myId || (allowList[channelId]?.includes(userId) ?? false);

    let action: JoinLogEntry["action"] = "logged";

    if (!exempt) {
        if (Date.now() < rateLimitedUntil) {
            toast(`${username} joined #${channel.name}, but Discord is rate-limiting disconnects for ${Math.ceil((rateLimitedUntil - Date.now()) / 1000)}s.`, false);
        } else if (PermissionStore.can(PermissionsBits.MOVE_MEMBERS, channel)) {
            try {
                // Disconnect the user directly (Modify Guild Member, channel_id: null). This never
                // touches the channel's permission overwrites — it only acts on the person who joined.
                await RestAPI.patch({ url: `/guilds/${guildId}/members/${userId}`, body: { channel_id: null } });
                action = "kicked";
                recordRateEvent("ok");
                toast(`${username} tried to join #${channel.name} — disconnected.`, false);
            } catch (err: any) {
                const retryAfterMs = getRetryAfterMs(err);
                if (err?.status === 429 && retryAfterMs) {
                    rateLimitedUntil = Date.now() + retryAfterMs;
                    recordRateEvent("limited");
                    toast(`Rate limited by Discord — pausing disconnects for ${Math.ceil(retryAfterMs / 1000)}s.`, false);
                } else {
                    toast(`${username} joined #${channel.name} but couldn't be disconnected.`, false);
                }
            }
        } else {
            toast(`${username} joined the locked channel #${channel.name}, but you lack Move Members to disconnect them.`, false);
        }
    }

    joinLog.unshift({
        id: `${Date.now()}-${userId}`,
        channelId,
        channelName: channel.name,
        guildId,
        userId,
        username,
        avatar: user?.avatar ?? null,
        timestamp: Date.now(),
        action
    });
    joinLog = joinLog.slice(0, settings.store.logSize);
    dsSet(LOG_KEY, joinLog);
}

function RateLimitGraph() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [, bump] = useState(0);

    useEffect(() => {
        let raf = 0;
        let lastDraw = 0;

        const draw = (t: number) => {
            raf = requestAnimationFrame(draw);
            if (t - lastDraw < 80) return; // ~12fps is plenty smooth for a sweeping bar graph
            lastDraw = t;

            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d");
            if (!canvas || !ctx) return;

            const { width, height } = canvas;
            const now = Date.now();
            const windowMs = 60_000;
            const limited = now < rateLimitedUntil;

            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = limited ? "rgba(237,66,69,0.14)" : "rgba(59,165,92,0.06)";
            ctx.fillRect(0, 0, width, height);

            ctx.strokeStyle = "rgba(255,255,255,0.08)";
            for (let i = 1; i < 4; i++) {
                const y = (height / 4) * i;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }

            for (const ev of rateEvents) {
                const age = now - ev.timestamp;
                if (age > windowMs) continue;
                const x = width - (age / windowMs) * width;
                const barHeight = ev.type === "ok" ? height * 0.35 : height * 0.85;
                ctx.fillStyle = ev.type === "ok" ? "#3ba55c" : "#ed4245";
                ctx.fillRect(x - 1.5, height - barHeight, 3, barHeight);
            }

            // Sweeping "now" line at the right edge — gives the graph a live, moving feel.
            ctx.strokeStyle = limited ? "#ed4245" : "rgba(255,255,255,0.4)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(width - 1, 0);
            ctx.lineTo(width - 1, height);
            ctx.stroke();

            bump(n => (n + 1) % 1_000_000);
        };

        raf = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(raf);
    }, []);

    const limited = Date.now() < rateLimitedUntil;
    const secondsLeft = Math.max(0, Math.ceil((rateLimitedUntil - Date.now()) / 1000));

    return (
        <div className="vcl-graph-wrap">
            <canvas ref={canvasRef} width={460} height={70} className="vcl-graph-canvas" />
            <div className={`vcl-graph-status ${limited ? "vcl-graph-status--limited" : "vcl-graph-status--ok"}`}>
                {limited ? `429 rate limited — resumes in ${secondsLeft}s` : "No rate limiting — disconnects healthy"}
            </div>
        </div>
    );
}

function AllowListSection({ channelId, guildId }: { channelId: string; guildId: string; }) {
    const [, bump] = useState(0);
    const [query, setQuery] = useState("");

    const allowed = allowList[channelId] ?? [];
    const members = GuildMemberStore.getMembers(guildId) ?? [];

    function toggleAllow(userId: string) {
        const list = allowList[channelId] ?? [];
        const has = list.includes(userId);
        allowList = { ...allowList, [channelId]: has ? list.filter(id => id !== userId) : [...list, userId] };
        dsSet(ALLOW_KEY, allowList);
        bump(n => n + 1);
    }

    const results = query.trim()
        ? members.filter(m => {
            const user = UserStore.getUser(m.userId);
            const name = user?.globalName || user?.username || m.nick || m.userId;
            return name.toLowerCase().includes(query.toLowerCase()) || m.userId.includes(query);
        }).slice(0, 25)
        : members.filter(m => allowed.includes(m.userId));

    return (
        <div className="vcl-section">
            <Forms.FormTitle tag="h5" className="vcl-label">WHO CAN JOIN</Forms.FormTitle>
            <TextInput placeholder="Search members to allow-list..." value={query} onChange={setQuery} />
            <div className="vcl-member-list">
                {results.length === 0 && (
                    <div className="vcl-empty">{query ? "No matches." : "No one allow-listed yet — search above to add someone."}</div>
                )}
                {results.map(m => {
                    const user = UserStore.getUser(m.userId);
                    const name = user?.globalName || user?.username || m.nick || m.userId;
                    const isAllowed = allowed.includes(m.userId);
                    const avatarUrl = user?.avatar
                        ? IconUtils.getUserAvatarURL(user as any, false, 32)
                        : IconUtils.getDefaultAvatarURL(m.userId);
                    return (
                        <div className="vcl-row" key={m.userId}>
                            <img src={avatarUrl} className="vcl-avatar" alt="" />
                            <div className="vcl-info">
                                <span className="vcl-username">{name}</span>
                            </div>
                            <button className={`vcl-allow-btn ${isAllowed ? "vcl-allow-btn--active" : ""}`} onClick={() => toggleAllow(m.userId)}>
                                {isAllowed ? "Allowed" : "Allow"}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function AttemptsSection({ channelId }: { channelId: string; }) {
    const [, bump] = useState(0);
    const entries = joinLog.filter(e => e.channelId === channelId).slice(0, 50);

    function toggleAllow(entry: JoinLogEntry) {
        const list = allowList[entry.channelId] ?? [];
        const has = list.includes(entry.userId);
        allowList = { ...allowList, [entry.channelId]: has ? list.filter(id => id !== entry.userId) : [...list, entry.userId] };
        dsSet(ALLOW_KEY, allowList);
        bump(n => n + 1);
    }

    return (
        <div className="vcl-section">
            <Forms.FormTitle tag="h5" className="vcl-label">RECENT ATTEMPTS</Forms.FormTitle>
            <div className="vcl-member-list">
                {entries.length === 0 && <div className="vcl-empty">No join attempts logged yet.</div>}
                {entries.map(e => {
                    const allowed = allowList[e.channelId]?.includes(e.userId) ?? false;
                    const avatarUrl = e.avatar
                        ? IconUtils.getUserAvatarURL({ id: e.userId, avatar: e.avatar } as any, false, 32)
                        : IconUtils.getDefaultAvatarURL(e.userId);
                    return (
                        <div className="vcl-row" key={e.id}>
                            <img src={avatarUrl} className="vcl-avatar" alt="" />
                            <div className="vcl-info">
                                <span className="vcl-username">{e.username}</span>
                                <span className="vcl-meta">{new Date(e.timestamp).toLocaleString()}</span>
                            </div>
                            <span className={`vcl-badge vcl-badge--${e.action}`}>{e.action === "kicked" ? "Disconnected" : "Joined"}</span>
                            <button className="vcl-allow-btn" onClick={() => toggleAllow(e)}>
                                {allowed ? "Remove" : "Allow"}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function VCLockPanel({ rootProps, channelId }: { rootProps: any; channelId: string; }) {
    const [, bump] = useState(0);
    const channel = ChannelStore.getChannel(channelId);
    const locked = lockedChannels.has(channelId);

    if (!channel) return null;

    return (
        <ModalRoot {...rootProps} size="medium">
            <ModalHeader separator={false}>
                <Forms.FormTitle tag="h4" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <GearIcon /> Voice Lock — #{channel.name}
                </Forms.FormTitle>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent className="vcl-content">
                <div className="vcl-lock-row">
                    <div className={`vcl-lock-badge ${locked ? "vcl-lock-badge--locked" : ""}`}>
                        {locked ? <LockIcon /> : <UnlockIcon />}
                        {locked ? "Locked" : "Unlocked"}
                    </div>
                    <button className="vcl-toggle-btn" onClick={() => { toggleLock(channel); bump(n => n + 1); }}>
                        {locked ? "Unlock this channel" : "Lock this channel"}
                    </button>
                </div>

                <RateLimitGraph />
                <AllowListSection channelId={channelId} guildId={(channel as any).guild_id} />
                <AttemptsSection channelId={channelId} />
            </ModalContent>
        </ModalRoot>
    );
}

function openConfigPanel(channelId: string) {
    openModal(props => <VCLockPanel rootProps={props} channelId={channelId} />);
}

const ChannelContextPatch: NavContextMenuPatchCallback = (children, { channel }: { channel?: Channel; }) => {
    if (!channel || channel.type !== 2) return; // 2 = guild voice channel
    if (!PermissionStore.can(PermissionsBits.MOVE_MEMBERS, channel)) return;

    const locked = lockedChannels.has(channel.id);

    children.push(
        <Menu.MenuGroup key="vclock-group">
            <Menu.MenuItem
                key="vclock-toggle"
                id="vclock-toggle"
                label={locked ? "Unlock Voice Channel" : "Lock Voice Channel"}
                icon={locked ? UnlockIcon : LockIcon}
                action={() => toggleLock(channel)}
            />
            <Menu.MenuItem
                key="vclock-configure"
                id="vclock-configure"
                label="Configure Voice Lock..."
                icon={GearIcon}
                action={() => openConfigPanel(channel.id)}
            />
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "VCLock",
    description: "A configuration panel for voice channels: lock them, choose exactly who's allowed to join, watch join attempts, and see a live graph of Discord's disconnect rate limit. Never touches channel permissions — it disconnects unauthorized joiners directly.",
    authors: [EquicordDevs.nobody],
    tags: ["voice", "lock", "moderation"],
    settings,

    contextMenus: {
        "channel-context": ChannelContextPatch
    },

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: Array<{ userId: string; channelId?: string | null; guildId?: string; }>; }) {
            if (lockedChannels.size === 0) return;
            const myId = UserStore.getCurrentUser()?.id;

            for (const vs of voiceStates) {
                for (const channelId of lockedChannels) {
                    const set = occupants.get(channelId) ?? new Set<string>();
                    const wasIn = set.has(vs.userId);
                    const nowIn = vs.channelId === channelId;

                    if (nowIn && !wasIn) {
                        set.add(vs.userId);
                        void handleJoin(channelId, vs.userId, vs.guildId!, myId);
                    } else if (!nowIn && wasIn) {
                        set.delete(vs.userId);
                    }
                    occupants.set(channelId, set);
                }
            }
        }
    },

    async start() {
        const saved = (await dsGet<string[]>(LOCKED_KEY)) ?? [];
        lockedChannels.clear();
        for (const id of saved) lockedChannels.add(id);

        allowList = (await dsGet<Record<string, string[]>>(ALLOW_KEY)) ?? {};
        joinLog = (await dsGet<JoinLogEntry[]>(LOG_KEY)) ?? [];

        for (const channelId of lockedChannels) {
            const states = VoiceStateStore.getVoiceStatesForChannel(channelId) ?? {};
            occupants.set(channelId, new Set(Object.keys(states)));
        }
    },

    stop() {
        lockedChannels.clear();
        occupants.clear();
        rateEvents.length = 0;
        rateLimitedUntil = 0;
    }
});
