import { playAudio } from "@api/AudioPlayer";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings, useSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Switch } from "@components/Switch";
import { LazyComponent } from "@utils/lazyReact";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { filters, find, findStoreLazy } from "@webpack";
import { Avatar, ChannelStore, Constants, GuildStore, IconUtils, MediaEngineStore, Menu, React, RestAPI, TextInput, Toasts, Tooltip, UserStore } from "@webpack/common";

const HeaderBarIcon = LazyComponent(() => {
    const filter = filters.byCode(".HEADER_BAR_BADGE");
    return find((m: any) => m.Icon && filter(m.Icon)).Icon;
});

let SoundboardStore: any = null;
try { SoundboardStore = findStoreLazy("SoundboardStore"); } catch { }

interface SoundConfig {
    soundId: string;
    guildId: string;
    name: string;
}

function js(key: string): SoundConfig | null {
    try {
        const v = (settings.store as any)[key];
        if (!v) return null;
        return JSON.parse(v);
    } catch { return null; }
}

function jsSave(key: string, s: SoundConfig | null) {
    (settings.store as any)[key] = s ? JSON.stringify(s) : "";
}

function perGuildLoad(): Record<string, SoundConfig> {
    try { const r = settings.store.perGuild; if (!r) return {}; return JSON.parse(r); } catch { return {}; }
}

function perGuildSave(d: Record<string, SoundConfig>) { settings.store.perGuild = JSON.stringify(d); }

function disabledServersLoad(): string[] {
    try { const r = settings.store.disabledServers; if (!r) return []; const p = JSON.parse(r); return Array.isArray(p) ? p : []; } catch { return []; }
}

function disabledServersSave(d: string[]) { settings.store.disabledServers = JSON.stringify(d); }

async function sendViaAPI(channelId: string, sound: SoundConfig, vol: number): Promise<boolean> {
    if (!sound?.soundId || !sound?.guildId) return false;
    try {
        await RestAPI.post({
            url: Constants.Endpoints.SEND_SOUNDBOARD_SOUND(channelId),
            body: { sound_id: sound.soundId, source_guild_id: sound.guildId, volume: Math.max(0, Math.min(1, vol / 100)) }
        });
        return true;
    } catch { return false; }
}

function playLocal(url: string, vol: number) {
    try { playAudio(url, { volume: vol }); } catch { }
}

function getSoundsFromStore() {
    try {
        if (!SoundboardStore) return [];
        const map = SoundboardStore.getSounds?.();
        if (!map || typeof map.entries !== "function") return [];
        const arr: { guildId: string; guildName: string; sounds: any[] }[] = [];
        for (const [gid, sounds] of map.entries()) {
            if (!gid || !sounds) continue;
            const g = GuildStore.getGuild(gid);
            arr.push({ guildId: gid, guildName: g?.name || "Unknown", sounds: Array.isArray(sounds) ? sounds : [] });
        }
        return arr;
    } catch { return []; }
}

export const settings = definePluginSettings({
    enabled: { type: OptionType.BOOLEAN, default: true, description: "Master toggle", restartNeeded: false },
    joinEnabled: { type: OptionType.BOOLEAN, default: true, description: "Play sound on voice join", restartNeeded: false },
    leaveEnabled: { type: OptionType.BOOLEAN, default: false, description: "Play sound on voice leave", restartNeeded: false },
    joinSound: { type: OptionType.STRING, default: "", description: "Join sound (JSON)", restartNeeded: false },
    leaveSound: { type: OptionType.STRING, default: "", description: "Leave sound (JSON)", restartNeeded: false },
    perGuild: { type: OptionType.STRING, default: "{}", description: "Per-guild overrides", restartNeeded: false },
    disabledServers: { type: OptionType.STRING, default: "[]", description: "Disabled servers list", restartNeeded: false },
    volume: { type: OptionType.NUMBER, default: 80, description: "Volume 0-100", restartNeeded: false },
    playForOthers: { type: OptionType.BOOLEAN, default: true, description: "Send via API so everyone hears", restartNeeded: false },
    randomJoin: { type: OptionType.BOOLEAN, default: false, description: "Random sound on join", restartNeeded: false },
    randomGuildId: { type: OptionType.STRING, default: "", description: "Guild for random sounds", restartNeeded: false },
    nitroBypass: { type: OptionType.BOOLEAN, default: true, description: "Unlock all soundboard sounds", restartNeeded: false },
    showIndicator: { type: OptionType.BOOLEAN, default: true, description: "Show toolbar icon", restartNeeded: false },
});

function SettingsPanel() {
    const [pg, setPg] = React.useState<Record<string, SoundConfig>>(() => perGuildLoad());
    const [disabled, setDisabled] = React.useState<string[]>(() => disabledServersLoad());
    const guilds = React.useMemo(() => { try { return Object.values(GuildStore.getGuilds()); } catch { return []; } }, []);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "8px 0" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "13px" }}>Join sound:</span>
                <SoundPickerSmall settingsKey="joinSound" />
                <Switch checked={settings.store.joinEnabled} onChange={v => settings.store.joinEnabled = v} />
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "13px" }}>Leave sound:</span>
                <SoundPickerSmall settingsKey="leaveSound" />
                <Switch checked={settings.store.leaveEnabled} onChange={v => settings.store.leaveEnabled = v} />
            </div>
            <div style={{ borderTop: "1px solid var(--background-modifier-accent)", margin: "4px 0" }} />
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "13px" }}>Volume:</span>
                <input type="range" min={0} max={100} value={settings.store.volume} onChange={e => settings.store.volume = parseInt(e.target.value)} style={{ flex: 1, maxWidth: "200px" }} />
                <span style={{ fontSize: "13px", color: "var(--text-muted)", minWidth: "32px" }}>{settings.store.volume}%</span>
            </div>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}><Switch checked={settings.store.playForOthers} onChange={v => settings.store.playForOthers = v} /> Everyone hears</label>
                <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}><Switch checked={settings.store.randomJoin} onChange={v => settings.store.randomJoin = v} /> Random join</label>
                <label style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}><Switch checked={settings.store.nitroBypass} onChange={v => settings.store.nitroBypass = v} /> Nitro bypass</label>
            </div>
            <div style={{ borderTop: "1px solid var(--background-modifier-accent)", margin: "4px 0" }} />
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--header-primary)" }}>Server Filter</div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>Disable auto-play per server.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "200px", overflowY: "auto" }}>
                {guilds.map(g => {
                    const isDisabled = disabled.includes(g.id);
                    return (
                        <div key={g.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 8px", borderRadius: "4px", background: "var(--background-secondary)" }}>
                            {g?.icon ? <Avatar src={IconUtils.getGuildIconURL({ id: g.id, icon: g.icon, size: 32 })} size="SIZE_16" /> : <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: "var(--background-tertiary)" }} />}
                            <span style={{ fontSize: "13px", flex: 1, color: isDisabled ? "var(--text-muted)" : "var(--header-primary)" }}>{g.name}</span>
                            <span style={{ fontSize: "11px", color: isDisabled ? "var(--status-danger)" : "var(--text-positive)", marginRight: "4px" }}>{isDisabled ? "Off" : "On"}</span>
                            <Switch checked={!isDisabled} onChange={v => { try { const n = v ? disabled.filter(id => id !== g.id) : [...disabled, g.id]; setDisabled(n); disabledServersSave(n); } catch { } }} />
                        </div>
                    );
                })}
            </div>
            <div style={{ borderTop: "1px solid var(--background-modifier-accent)", margin: "4px 0" }} />
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--header-primary)" }}>Per-Guild Sound Overrides</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {Object.entries(pg).length === 0 && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Right-click a soundboard sound → Set per-guild.</div>}
                {Object.entries(pg).map(([gid, snd]) => {
                    const g = GuildStore.getGuild(gid);
                    return (
                        <div key={gid} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", borderRadius: "6px", background: "var(--background-secondary)" }}>
                            {g?.icon ? <Avatar src={IconUtils.getGuildIconURL({ id: g.id, icon: g.icon, size: 32 })} size="SIZE_16" /> : <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: "var(--background-tertiary)" }} />}
                            <span style={{ fontSize: "13px", flex: 1 }}>{g?.name || "Unknown"}: <span style={{ color: "var(--text-muted)" }}>{snd.name}</span></span>
                            <Tooltip text="Remove">{(tp: any) => <span {...tp} onClick={() => { try { const n = { ...pg }; delete n[gid]; setPg(n); perGuildSave(n); } catch { } }} style={{ cursor: "pointer", color: "var(--status-danger)", fontSize: "14px" }}>✕</span>}</Tooltip>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function SoundPickerSmall({ settingsKey }: { settingsKey: "joinSound" | "leaveSound"; }) {
    const current = js(settingsKey);
    settings.use([settingsKey]);
    const label = current ? `${current.name} (${GuildStore.getGuild(current.guildId)?.name || "Unknown"})` : "None";
    return (
        <div onClick={() => openModal((p: any) => <SoundSelectorModal rootProps={p} current={current} onSelect={s => jsSave(settingsKey, s)} />)} style={{ padding: "4px 10px", borderRadius: "4px", background: "var(--background-secondary)", cursor: "pointer", border: "1px solid var(--background-modifier-accent)", fontSize: "13px", minWidth: "120px" }}>
            {label}
        </div>
    );
}

function SoundSelectorModal({ rootProps, onSelect, current }: { rootProps: any; onSelect: (s: SoundConfig) => void; current: SoundConfig | null; }) {
    const [q, setQ] = React.useState("");
    const allGuilds = React.useMemo(() => getSoundsFromStore(), []);
    const flat = React.useMemo(() => {
        const arr: { sound: any; guildId: string; guildName: string; }[] = [];
        try { for (const g of allGuilds) for (const s of g.sounds) arr.push({ sound: s, guildId: g.guildId, guildName: g.guildName }); } catch { }
        return arr;
    }, [allGuilds]);
    const filtered = q ? flat.filter(s => s.sound.name?.toLowerCase().includes(q.toLowerCase())) : flat;

    return (
        <ModalRoot {...rootProps} size={ModalSize.MEDIUM}>
            <ModalHeader separator={false}>
                <TextInput value={q} onChange={setQ} placeholder="Search sounds..." style={{ flex: 1 }} />
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent>
                <div style={{ padding: "12px 16px", maxHeight: "400px", overflowY: "auto" }}>
                    {filtered.length === 0 ? (
                        <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "32px", whiteSpace: "pre-line" }}>No sounds found.\nSounds appear from servers that have the soundboard feature. The Nitro bypass unlock makes them all available to you.</div>
                    ) : filtered.map(s => {
                        const sel = current?.soundId === s.sound.soundId && current?.guildId === s.guildId;
                        return (
                            <div key={`${s.guildId}:${s.sound.soundId}`} onClick={() => { onSelect({ soundId: s.sound.soundId, guildId: s.guildId, name: s.sound.name }); rootProps.onClose(); }} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", borderRadius: "8px", background: sel ? "var(--background-accent)" : "var(--background-secondary)", marginBottom: "4px", cursor: "pointer" }}>
                                <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "var(--background-tertiary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>{s.sound.emojiName || "🔊"}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--header-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.sound.name}</div>
                                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{s.guildName}</div>
                                </div>
                                <Tooltip text="Preview">{(tp: any) => <span {...tp} onClick={e => { e.stopPropagation(); playLocal(`https://${window.GLOBAL_ENV.CDN_HOST}/soundboard-sounds/${s.sound.soundId}`, settings.store.volume); }} style={{ cursor: "pointer", color: "var(--interactive-normal)", fontSize: "14px", padding: "4px" }}>▶</span>}</Tooltip>
                            </div>
                        );
                    })}
                </div>
            </ModalContent>
        </ModalRoot>
    );
}

const SoundCtx: NavContextMenuPatchCallback = (children, { sound }: { sound: { soundId: string; guildId: string; name: string; }; }) => {
    if (!sound?.soundId) return;
    try {
        const items = [
            <Menu.MenuItem id="sbg-join" label="Set as Join Sound" action={() => { jsSave("joinSound", { soundId: sound.soundId, guildId: sound.guildId, name: sound.name }); Toasts.show({ message: "Set as join sound!", id: Toasts.genId(), type: Toasts.Type.SUCCESS }); }} />,
            <Menu.MenuItem id="sbg-leave" label="Set as Leave Sound" action={() => { jsSave("leaveSound", { soundId: sound.soundId, guildId: sound.guildId, name: sound.name }); Toasts.show({ message: "Set as leave sound!", id: Toasts.genId(), type: Toasts.Type.SUCCESS }); }} />,
            <Menu.MenuItem id="sbg-preview" label="Preview" action={() => playLocal(`https://${window.GLOBAL_ENV.CDN_HOST}/soundboard-sounds/${sound.soundId}`, settings.store.volume)} />,
        ];
        children.splice ? children.splice(1, 0, <Menu.MenuGroup>{items}</Menu.MenuGroup>) : children.unshift(<Menu.MenuGroup>{items}</Menu.MenuGroup>);
    } catch { }
};

function SbgIcon() {
    return <svg width="24" height="24" viewBox="0 -960 960 960" fill="currentColor"><path d="M280-320q-100 0-170-70T40-560q0-100 70-170t170-70h400q100 0 170 70t70 170q0 100-70 170t-170 70H280Zm0-80h400q66 0 113-47t47-113q0-66-47-113t-113-47H280q-66 0-113 47t-47 113q0 66 47 113t113 47Zm0-80q33 0 56.5-23.5T360-560q0-33-23.5-56.5T280-640q-33 0-56.5 23.5T200-560q0 33 23.5 56.5T280-480Zm200 0q33 0 56.5-23.5T560-560q0-33-23.5-56.5T480-640q-33 0-56.5 23.5T400-560q0 33 23.5 56.5T480-480Zm0 160Z" /></svg>;
}

export default definePlugin({
    name: "SoundboardGod",
    description: "Auto-play soundboard sounds on voice join/leave. Everyone hears. No Nitro needed. Works in any server.",
    authors: [{ name: "x870", id: 1389444830882562131n }],
    settings,
    dependencies: ["AudioPlayerAPI"],
    contextMenus: { "sound-button-context": SoundCtx },
    settingsAboutComponent: SettingsPanel,

    patches: [
        {
            find: 'type:"GUILD_SOUNDBOARD_SOUND_CREATE"',
            predicate: () => settings.store.nitroBypass,
            replacement: {
                match: /(?<=type:"(?:SOUNDBOARD_SOUNDS_RECEIVED|GUILD_SOUNDBOARD_SOUND_CREATE|GUILD_SOUNDBOARD_SOUND_UPDATE|GUILD_SOUNDBOARD_SOUNDS_UPDATE)".+?available:)\i\.available/g,
                replace: "true"
            }
        },
        {
            find: "toolbar:function",
            predicate: () => settings.store.showIndicator,
            replacement: { match: /(function \i\(\i\){)(.{1,200}toolbar.{1,100}mobileToolbar)/, replace: "$1$self.addIconToToolBar(arguments[0]);$2" }
        }
    ],

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: any) {
            try {
                if (!settings.store.enabled) return;
                for (const vs of voiceStates || []) {
                    const me = vs.userId === UserStore.getCurrentUser().id;
                    if (!me || vs.channelId === vs.oldChannelId) continue;

                    if (vs.channelId && !vs.oldChannelId) {
                        if (!settings.store.joinEnabled) continue;
                        const ch = ChannelStore.getChannel(vs.channelId);
                        const guildId = ch?.guild_id;
                        if (guildId && disabledServersLoad().includes(guildId)) continue;

                        let sound = js("joinSound");
                        const pg = perGuildLoad();
                        if (guildId && pg[guildId]) sound = pg[guildId];

                        if (settings.store.randomJoin) {
                            try {
                                const gSounds = SoundboardStore?.getSoundsForGuild?.(settings.store.randomGuildId || guildId || "");
                                if (gSounds?.length) {
                                    const pick = gSounds[Math.floor(Math.random() * gSounds.length)];
                                    sound = { soundId: pick.soundId, guildId: pick.guildId, name: pick.name };
                                }
                            } catch { }
                        }

                        if (!sound?.soundId) continue;

                        if (settings.store.playForOthers && sound.guildId) sendViaAPI(vs.channelId, sound, settings.store.volume);
                        else if (sound.guildId) playLocal(`https://${window.GLOBAL_ENV.CDN_HOST}/soundboard-sounds/${sound.soundId}`, settings.store.volume);
                    } else if (!vs.channelId && vs.oldChannelId && settings.store.leaveEnabled) {
                        const sound = js("leaveSound");
                        if (!sound?.soundId) continue;
                        if (settings.store.playForOthers && sound.guildId && !MediaEngineStore.isDeaf()) sendViaAPI(vs.oldChannelId, sound, settings.store.volume);
                        else if (sound.guildId) playLocal(`https://${window.GLOBAL_ENV.CDN_HOST}/soundboard-sounds/${sound.soundId}`, settings.store.volume);
                    }
                }
            } catch { }
        },
    },

    FollowIndicator() {
        const s = useSettings(["enabled", "showIndicator"]);
        if (!s.enabled || !s.showIndicator) return null;
        return (
            <HeaderBarIcon
                tooltip="SoundboardGod"
                icon={SbgIcon}
                onClick={() => openModal((p: any) => (
                    <ModalRoot {...p} size={ModalSize.MEDIUM}>
                        <ModalHeader separator={false}>
                            <span style={{ fontWeight: 700, fontSize: "18px" }}>SoundboardGod</span>
                            <ModalCloseButton onClick={p.onClose} />
                        </ModalHeader>
                        <ModalContent><SettingsPanel /></ModalContent>
                    </ModalRoot>
                ))}
            />
        );
    },

    addIconToToolBar(e: { toolbar: any; }) {
        try {
            const el = <ErrorBoundary noop={true} key="sbg-indicator"><this.FollowIndicator /></ErrorBoundary>;
            if (Array.isArray(e.toolbar)) e.toolbar.push(el);
            else e.toolbar = [el, e.toolbar];
        } catch { }
    },

    start() { },
    stop() { },
});
