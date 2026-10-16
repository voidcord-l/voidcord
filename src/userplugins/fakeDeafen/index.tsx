/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { addSettingsPanelButton, DeafenIcon, removeSettingsPanelButton } from "../philsPluginLibrary";
import { EquicordDevs } from "@utils/constants";
import { t } from "@utils/esharqI18n";
import definePlugin, { OptionType } from "@utils/types";
import type { Channel, VoiceState } from "@vencord/discord-types";
import { findByCodeLazy, findByProps, findStore } from "@webpack";
import { ChannelStore, MediaEngineStore, PermissionsBits, PermissionStore, SelectedChannelStore, UserStore, VoiceActions } from "@webpack/common";

export let fakeD = false;

// ╪¿╪½┘æ/┘å╪┤╪º╪╖ ┘ê┘ç┘à┘è (┘à┘å┘é┘ê┘ä ┘à┘å ╪ó┘ä┘è╪⌐ ┘à┘Å╪¬╪¡┘é┘Ä┘æ┘é╪⌐): ╪¿╪»╪í ┬½╪¿╪½ ┘à╪¿╪º╪┤╪▒┬╗ ╪¿┘ä╪º ┘à╪╡╪»╪▒ ╪¡┘é┘è┘é┘è╪î ┘ê╪¿╪»╪í ┘å╪┤╪º╪╖
// Watch Together╪î ┘à╪╣ ╪Ñ╪«┘ü╪º╪í ┘å╪º┘ü╪░╪⌐ ╪º┘ä┘à╪╣╪º┘è┘å╪⌐ ╪º┘ä┘à╪¡┘ä┘è╪⌐ ╪╣╪¿╪▒ ╪º┘ä╪▒┘é╪╣ ╪ú╪»┘å╪º┘ç. ╪º╪«╪¬┘è╪º╪▒┘è┘æ ┘ê┘à╪╖┘ü╪ú
// ╪º┘ü╪¬╪▒╪º╪╢┘è╪º┘ï ΓÇö ┘ä╪º ┘è┘à╪│┘æ ┘à╪│╪º╪▒ ╪º┘ä┘â╪¬┘à/╪º┘ä╪Ñ╪╡┘à╪º┘à ╪Ñ╪╖┘ä╪º┘é╪º┘ï.
const startStreamAction = findByCodeLazy('type:"STREAM_START"');
const stopStreamAction = findByCodeLazy('type:"STREAM_STOP"');
const STREAM = 1n << 9n;
const WATCH_TOGETHER_APPLICATION_ID = "880218394199220334";
let fakeStreamActive = false;

function getSelectedVoiceChannel(): Channel | null {
    const selected = SelectedChannelStore.getVoiceChannelId();
    if (!selected) return null;
    return ChannelStore.getChannel(selected);
}

function startFakeStream() {
    const channel = getSelectedVoiceChannel();
    if (!channel) return;
    startStreamAction(channel.guild_id, channel.id, {
        pid: null,
        sourceId: null,
        sourceName: null,
        audioSourceId: null,
        sound: false,
        previewDisabled: true
    });
}

function stopFakeStream() {
    const ConnectionStore = findStore("StreamRTCConnectionStore");
    for (const streamKey of ConnectionStore?.getAllActiveStreamKeys?.() ?? []) {
        stopStreamAction(streamKey, { streamKey, appContext: "app" });
        break;
    }
}

function hasFakeStream(): boolean {
    const ConnectionStore = findStore("StreamRTCConnectionStore");
    return (ConnectionStore?.getAllActiveStreamKeys?.().length ?? 0) > 0;
}

function getEmbeddedActivityLocation(channelId: string) {
    return { channelId, guildId: ChannelStore.getChannel(channelId)?.guild_id ?? null };
}

async function startFakeActivity(channelId: string) {
    const activityApi = findByProps("su", "_H");
    if (!activityApi?.su) return;
    await activityApi.su({
        channelId,
        applicationId: WATCH_TOGETHER_APPLICATION_ID,
        isStart: true,
        locationObject: getEmbeddedActivityLocation(channelId)
    });
}

function hasFakeActivity(channelId: string): boolean {
    const store = findStore("EmbeddedActivitiesStore");
    return store?.getSelfEmbeddedActivityForChannel?.(channelId)?.applicationId === WATCH_TOGETHER_APPLICATION_ID;
}

function leaveFakeActivity(channelId?: string) {
    const activityApi = findByProps("su", "_H");
    const frameApi = findByProps("launchFrame", "refreshProxyTicket", "stopFrame");
    const store = findStore("EmbeddedActivitiesStore");
    const activity = store?.getCurrentEmbeddedActivity?.()
        ?? (channelId ? store?.getSelfEmbeddedActivityForChannel?.(channelId) : null);
    const location = store?.getConnectedActivityLocation?.()
        ?? activity?.location
        ?? (channelId ? getEmbeddedActivityLocation(channelId) : null);

    if (!location || !activity?.applicationId) return;

    activityApi?._H?.({ location, applicationId: activity.applicationId, showFeedback: false });
    frameApi?.stopFrame?.({ applicationId: activity.applicationId });
}

function canStream(channel: Channel) {
    return PermissionStore.can(STREAM, channel);
}

function canUseActivity(channel: Channel) {
    return PermissionStore.can(PermissionsBits.USE_EMBEDDED_ACTIVITIES, channel);
}

// ┘è┘Å╪╖╪¿┘æ┘é ╪¡╪º┘ä╪⌐ ╪º┘ä╪¿╪½┘æ/╪º┘ä┘å╪┤╪º╪╖ ╪º┘ä┘ê┘ç┘à┘è╪⌐ ┘ê┘ü┘é `fakeD` ┘ê╪º┘ä╪Ñ╪╣╪»╪º╪»╪º╪¬. ┘è┘Å╪│╪¬╪»╪╣┘ë ┘à┘å ╪º┘ä╪¬╪¿╪»┘è┘ä ┘ê┘à┘å
// VOICE_STATE_UPDATES ┘ä┘è╪╕┘ä┘æ ╪½╪º╪¿╪¬╪º┘ï ╪╣┘å╪» ╪¬╪║┘è┘æ╪▒ ╪¡╪º┘ä╪⌐ ╪º┘ä╪╡┘ê╪¬.
function syncStreamAndActivity() {
    const channel = getSelectedVoiceChannel();

    if (!fakeD || !channel) {
        if (fakeStreamActive) { fakeStreamActive = false; stopFakeStream(); }
        return;
    }

    if (settings.store.fakeStream && canStream(channel)) {
        fakeStreamActive = true;
        if (!hasFakeStream()) startFakeStream();
    }

    if (settings.store.fakeGame && canUseActivity(channel) && !hasFakeActivity(channel.id)) {
        void startFakeActivity(channel.id);
    }
}

function mute() {
    // ╪º┘â╪¬┘à ┘ü┘é╪╖ ╪Ñ┘å ┘ä┘à ╪¬┘â┘å ┘à┘â╪¬┘ê┘à╪º┘ï ΓÇö ┘à╪╖╪º╪¿┘é ┘ä╪│┘ä┘ê┘â ╪▓╪▒ ┬½Mute┬╗ ╪º┘ä╪ú╪╡┘ä┘è╪î ┘ä┘â┘å ╪╣╪¿╪▒ ╪»╪º┘ä╪⌐
    // ╪»┘è╪│┘â┘ê╪▒╪» ┘à╪¿╪º╪┤╪▒╪⌐┘ï ╪¿╪»┘ä ╪º┘ä┘å┘é╪▒ ╪╣┘ä┘ë DOM ╪¿╪º┘ä┘å╪╡ ┘ü┘è╪╣┘à┘ä ╪ú┘è╪º┘ï ┘â╪º┘å╪¬ ┘ä╪║╪⌐ ╪º┘ä┘ê╪º╪¼┘ç╪⌐.
    if (!MediaEngineStore.isSelfMute()) VoiceActions.toggleSelfMute();
}

function deafen() {
    // ╪ú╪╡┘à┘É╪¬ ┘ü┘é╪╖ ╪Ñ┘å ┘ä┘à ╪¬┘â┘å ┘à┘Å╪╡┘à┘Ä╪¬╪º┘ï (┘à╪│╪¬┘é┘ä┘æ ╪╣┘å ╪º┘ä┘ä╪║╪⌐)
    if (!MediaEngineStore.isSelfDeaf()) VoiceActions.toggleSelfDeaf();
}

const settings = definePluginSettings({
    hideIcon: {
        type: OptionType.BOOLEAN,
        description: "",
        default: false,
        onChange: (value: boolean) => {
            if (value) {
                removeSettingsPanelButton("faked");
            } else {
                addSettingsPanelButton({
                    name: "faked",
                    icon: DeafenIcon,
                    tooltipText: t("╪º┘ä┘ê╪╢╪╣ ╪º┘ä┘ê┘ç┘à┘è ┘ä┘ä╪│┘à╪º╪╣┘ç ┘ê╪º┘ä┘à╪º┘è┘â Fake Deafen", "Fake Deafen"),
                    onClick: toggleFakeDeafen
                });
            }
        }
    },
    keybind: {
        type: OptionType.SELECT,
        description: "",
        options: [
            { label: "F1", value: "f1", default: false },
            { label: "F2", value: "f2", default: false },
            { label: "F3", value: "f3", default: false },
            { label: "F4", value: "f4", default: false },
            { label: "F5", value: "f5", default: false },
            { label: "F6", value: "f6", default: false },
            { label: "F7", value: "f7", default: false },
            { label: "F8", value: "f8", default: false },
            { label: "F9", value: "f9", default: true },
            { label: "F10", value: "f10", default: false },
            { label: "F11", value: "f11", default: false },
            { label: "F12", value: "f12", default: false },
            { label: "Ctrl+D", value: "ctrl+d", default: false },
            { label: "Ctrl+Shift+D", value: "ctrl+shift+d", default: false },
            { label: "Alt+D", value: "alt+d", default: false },
            { label: "Alt+F", value: "alt+f", default: false },
            { label: "Ctrl+Alt+D", value: "ctrl+alt+d", default: false },
            { label: "Shift+F9", value: "shift+f9", default: false },
            { label: "Shift+F10", value: "shift+f10", default: false },
            { label: "Shift+F11", value: "shift+f11", default: false },
            { label: "Shift+F12", value: "shift+f12", default: false }
        ]
    },
    muteUponFakeDeafen: {
        type: OptionType.BOOLEAN,
        description: "",
        default: false
    },
    mute: {
        type: OptionType.BOOLEAN,
        description: "",
        default: true
    },
    deafen: {
        type: OptionType.BOOLEAN,
        description: "",
        default: true
    },
    cam: {
        type: OptionType.BOOLEAN,
        description: "",
        default: false
    },
    fakeStream: {
        type: OptionType.BOOLEAN,
        description: "",
        default: false,
        onChange: () => { if (fakeD) syncStreamAndActivity(); }
    },
    fakeGame: {
        type: OptionType.BOOLEAN,
        description: "",
        default: false,
        onChange: () => { if (fakeD) syncStreamAndActivity(); }
    },
    useCustomKeybind: {
        type: OptionType.BOOLEAN,
        description: "",
        default: false,
        onChange: () => {
            setupKeybindListener();
        }
    },
    customKeybind: {
        type: OptionType.STRING,
        description: "",
        default: "",
        disabled: () => !settings.store.useCustomKeybind,
        onChange: () => {
            setupKeybindListener();
        }
    }
});

function toggleFakeDeafen() {
    fakeD = !fakeD;

    // ╪¬╪¿╪»┘è┘ä ╪º┘ä╪Ñ╪╡┘à╪º╪¬ ┘à╪▒┘æ╪¬┘è┘å (╪¬╪┤╪║┘è┘ä ╪½┘à ╪Ñ┘è┘é╪º┘ü) ╪╣╪¿╪▒ ╪»╪º┘ä╪⌐ ╪»┘è╪│┘â┘ê╪▒╪» ┘à╪¿╪º╪┤╪▒╪⌐┘ï ╪¿╪»┘ä ╪º┘ä┘å┘é╪▒ ╪╣┘ä┘ë
    // DOM ╪¿╪º┘ä┘å╪╡ ΓÇö ┘è╪╣┘à┘ä ╪ú┘è╪º┘ï ┘â╪º┘å╪¬ ┘ä╪║╪⌐ ╪º┘ä┘ê╪º╪¼┘ç╪⌐. ┘â┘ä ╪¬╪¿╪»┘è┘ä ┘è┘Å╪╖┘ä┘é voiceStateUpdate ╪º┘ä╪░┘è
    // ╪¬╪╣╪¬╪▒╪╢┘ç ╪º┘ä╪▒┘é╪╣╪⌐ ┘ü┘è┘Å╪¿┘é┘è ╪º┘ä╪ó╪«╪▒┘è┘å ┘è╪▒┘ê┘å┘â ┘à┘Å╪╡┘à┘Ä╪¬╪º┘ï ╪¿┘è┘å┘à╪º ╪¬╪│┘à╪╣ ╪ú┘å╪¬.
    VoiceActions.toggleSelfDeaf();
    setTimeout(() => VoiceActions.toggleSelfDeaf(), 250);

    if (fakeD && settings.store.muteUponFakeDeafen) {
        setTimeout(mute, 300);
    }

    // ╪¿╪½┘æ/┘å╪┤╪º╪╖ ┘ê┘ç┘à┘è (╪º╪«╪¬┘è╪º╪▒┘è): ┘è╪¿╪»╪ú ╪╣┘å╪» ╪º┘ä╪¬┘ü╪╣┘è┘ä╪î ┘ê┘è┘Å┘ê┘é┘Ä┘ü/┘è┘Å╪║╪º╪»┘Ä╪▒ ╪╣┘å╪» ╪º┘ä╪Ñ╪╖┘ü╪º╪í.
    if (fakeD) {
        syncStreamAndActivity();
    } else {
        const channel = getSelectedVoiceChannel();
        fakeStreamActive = false;
        stopFakeStream();
        if (settings.store.fakeGame) leaveFakeActivity(channel?.id);
    }
}

let keydownListener: ((e: KeyboardEvent) => void) | null = null;

function parseKeybind(keybind: string): { ctrl: boolean; shift: boolean; alt: boolean; key: string } {
    const parts = keybind.toLowerCase().split("+");
    return {
        ctrl: parts.includes("ctrl") || parts.includes("control"),
        shift: parts.includes("shift"),
        alt: parts.includes("alt"),
        key: parts[parts.length - 1]
    };
}

function setupKeybindListener() {
    if (keydownListener) {
        document.removeEventListener("keydown", keydownListener);
    }

    keydownListener = (e: KeyboardEvent) => {

        const keybindValue = settings.store.useCustomKeybind && settings.store.customKeybind
            ? settings.store.customKeybind
            : settings.store.keybind || "f9";

        const keybind = parseKeybind(keybindValue);

        const ctrlMatch = keybind.ctrl === (e.ctrlKey || e.metaKey);
        const shiftMatch = keybind.shift === e.shiftKey;
        const altMatch = keybind.alt === e.altKey;
        const keyMatch = e.key.toLowerCase() === keybind.key.toLowerCase();

        if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
            e.preventDefault();
            toggleFakeDeafen();
        }
    };

    document.addEventListener("keydown", keydownListener);
}

export default definePlugin({
    name: "FakeDeafen",
    description: "Appear as deafened to others while still being able to hear.",
    dependencies: ["PhilsPluginLibrary"],
    authors: [EquicordDevs.LOSTSTR],

    patches: [
        {
            find: "}voiceStateUpdate(",
            replacement: {
                match: /self_mute:([^,]+),self_deaf:([^,]+),self_video:([^,]+)/,
                replace: "self_mute:$self.toggle($1, 'mute'),self_deaf:$self.toggle($2, 'deaf'),self_video:$self.toggle($3, 'video')"
            }
        },
        // ╪Ñ╪«┘ü╪º╪í ┘ü╪¬╪¡ ┘å╪┤╪º╪╖ Watch Together ┘à╪¡┘ä┘è╪º┘ï ╪╣┘å╪» ╪¬┘ü╪╣┘è┘ä fakeGame (╪¬╪╕┘ç╪▒ ┘ä┘ä╪ó╪«╪▒┘è┘å ┘ü┘é╪╖).
        {
            find: "OPEN_EMBEDDED_ACTIVITY,{location:",
            replacement: {
                match: /\i\._\.dispatch\(\i\.\i\.OPEN_EMBEDDED_ACTIVITY,\{location:\i,applicationId:\i,/,
                replace: "$self.shouldOpenEmbeddedActivity()&&$&"
            }
        },
        {
            find: "handleOpenActivityPopout",
            replacement: {
                match: /\i\.open\(\i\.\i\.ACTIVITY_POPOUT,.{0,80}?defaultHeight:480\}\)/,
                replace: "$self.shouldOpenEmbeddedActivity()&&$&"
            }
        },
        // ╪Ñ╪«┘ü╪º╪í ┘å╪º┘ü╪░╪⌐ ┘à╪╣╪º┘è┘å╪⌐ ╪º┘ä╪¿╪½┘æ ╪º┘ä┘à╪¡┘ä┘è╪⌐ ╪╣┘å╪» ╪¬┘ü╪╣┘è┘ä fakeStream.
        {
            find: "CAMERA_PREVIEW]:",
            replacement: {
                match: /d\.set\(\i,\i\),(\i)===(\i\.\i)\.VIDEO.{0,100}?\2\.HAVEN&&null==\i&&\(\i=\i\)/,
                replace: "(($1!==$2.ACTIVITY||$self.shouldOpenEmbeddedActivity())&&($1!==$2.VIDEO||$self.shouldOpenStreamPip()))&&($&)",
                noWarn: true
            }
        }
    ],

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            if (!fakeD) return;
            const myId = UserStore.getCurrentUser()?.id;
            const selected = SelectedChannelStore.getVoiceChannelId();
            if (!selected || !voiceStates.some(s => s.userId === myId && s.channelId === selected)) return;
            syncStreamAndActivity();
        }
    },

    settings,
    toggle: (au: any, what: string) => {
        if (fakeD === false)
            return au;
        else
            switch (what) {
                case "mute": return settings.store.mute;
                case "deaf": return settings.store.deafen;
                case "video": return settings.store.cam;
            }
    },
    shouldOpenEmbeddedActivity: () => !(fakeD && settings.store.fakeGame),
    shouldOpenStreamPip: () => !(fakeD && fakeStreamActive),

    start() {

        if (!settings.store.hideIcon) {
            addSettingsPanelButton({
                name: "faked",
                icon: DeafenIcon,
                tooltipText: t("╪º┘ä┘ê╪╢╪╣ ╪º┘ä┘ê┘ç┘à┘è ┘ä┘ä╪│┘à╪º╪╣┘ç ┘ê╪º┘ä┘à╪º┘è┘â Fake Deafen", "Fake Deafen"),
                onClick: toggleFakeDeafen
            });
        }


        setupKeybindListener();
    },

    stop() {
        removeSettingsPanelButton("faked");

        if (keydownListener) {
            document.removeEventListener("keydown", keydownListener);
            keydownListener = null;
        }

        // ╪Ñ┘è┘é╪º┘ü ╪ú┘è ╪¿╪½┘æ/┘å╪┤╪º╪╖ ┘ê┘ç┘à┘è ╪¿┘é┘è ┘à┘ü╪╣┘æ┘ä╪º┘ï ╪╣┘å╪» ╪¬╪╣╪╖┘è┘ä ╪º┘ä╪Ñ╪╢╪º┘ü╪⌐.
        if (fakeStreamActive) { fakeStreamActive = false; stopFakeStream(); }
        leaveFakeActivity(getSelectedVoiceChannel()?.id);
    }
});