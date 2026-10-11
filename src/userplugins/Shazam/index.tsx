/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { IconProps, OptionType, PluginNative } from "@utils/types";
import { SelectedChannelStore, useState } from "@webpack/common";

const Native = VencordNative.pluginHelpers.Shazam as PluginNative<typeof import("./native")>;

const logger = new Logger("Shazam");

const settings = definePluginSettings({
    apiToken: {
        type: OptionType.STRING,
        description: "Your AudD.io api token (get a free one at https://dashboard.audd.io)",
        default: ""
    },
    duration: {
        type: OptionType.SLIDER,
        description: "How many seconds of audio to record before identifying",
        markers: [5, 8, 10, 12, 15],
        default: 8,
        stickToMarkers: true
    }
});

// Voice connections we've seen. Populated by the setRemoteDescription hook below,
// so connections created while the plugin is disabled are missed (rejoin the VC to fix)
const voiceConnections = new Set<RTCPeerConnection>();
let originalSetRemoteDescription: typeof RTCPeerConnection.prototype.setRemoteDescription | null = null;

function getLiveAudioTracks() {
    const tracks: MediaStreamTrack[] = [];

    for (const pc of voiceConnections) {
        if (pc.connectionState === "closed" || pc.connectionState === "failed") {
            voiceConnections.delete(pc);
            continue;
        }

        for (const receiver of pc.getReceivers()) {
            if (receiver.track?.kind === "audio" && receiver.track.readyState === "live")
                tracks.push(receiver.track);
        }
    }

    return tracks;
}

async function recordVoiceAudio(tracks: MediaStreamTrack[], seconds: number) {
    const ctx = new AudioContext();

    try {
        // mix all incoming voice tracks into a single stream
        const destination = ctx.createMediaStreamDestination();
        for (const track of tracks) {
            ctx.createMediaStreamSource(new MediaStream([track])).connect(destination);
        }

        const recorder = new MediaRecorder(destination.stream, { mimeType: "audio/webm;codecs=opus" });
        const chunks: Blob[] = [];
        recorder.ondataavailable = e => chunks.push(e.data);

        const stopped = new Promise<void>(resolve => recorder.onstop = () => resolve());
        recorder.start();
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
        recorder.stop();
        await stopped;

        return new Blob(chunks, { type: "audio/webm" });
    } finally {
        ctx.close();
    }
}

function blobToBase64(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

async function identifySong() {
    const { apiToken, duration } = settings.store;

    if (!apiToken) {
        showNotification({
            title: "Shazam",
            body: "Set your AudD api token in the plugin settings first (free at dashboard.audd.io)"
        });
        return;
    }

    if (!SelectedChannelStore.getVoiceChannelId()) {
        showNotification({ title: "Shazam", body: "Join a voice channel first!" });
        return;
    }

    if (!Native) {
        showNotification({
            title: "Shazam",
            body: "The recognition request needs Vesktop or the desktop app, it cannot be made from the browser."
        });
        return;
    }

    const tracks = getLiveAudioTracks();
    if (!tracks.length) {
        showNotification({
            title: "Shazam",
            body: "No incoming voice audio found. Voice capture only works on Vesktop/browser voice. If you just enabled the plugin, rejoin the voice channel."
        });
        return;
    }

    showNotification({ title: "Shazam", body: `Listening for ${duration} seconds...` });

    const audio = await recordVoiceAudio(tracks, duration);
    const base64 = await blobToBase64(audio);

    const { status, data } = await Native.recognizeSong(apiToken, base64);
    if (status !== 200 || typeof data === "string")
        throw new Error(`AudD request failed (${status}): ${data}`);

    if (data.status === "error")
        throw new Error(`AudD error ${data.error?.error_code}: ${data.error?.error_message}`);

    const result = data.result;
    if (!result) {
        showNotification({
            title: "Shazam",
            body: "Couldn't identify the song. Try again with a longer duration or when the music is clearer."
        });
        return;
    }

    showNotification({
        title: `${result.artist} — ${result.title}`,
        body: `${result.album ?? ""}${result.release_date ? ` (${result.release_date})` : ""} • Click to open`,
        permanent: true,
        onClick: () => result.song_link && VencordNative.native.openExternal(result.song_link)
    });
}

function ShazamIcon({ height = 20, width = 20, className, ...rest }: IconProps & Record<string, any>) {
    return (
        <svg viewBox="0 0 24 24" height={height} width={width} className={className} fill="currentColor" {...rest}>
            <path d="M12 3v10.55A3.96 3.96 0 0 0 10 13c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        </svg>
    );
}

const ShazamChatBarButton: ChatBarButtonFactory = ({ isAnyChat }) => {
    const [busy, setBusy] = useState(false);

    if (!isAnyChat) return null;

    return (
        <ChatBarButton
            tooltip={busy ? "Listening..." : "Identify the song playing in your voice channel"}
            onClick={async () => {
                if (busy) return;
                setBusy(true);
                try {
                    await identifySong();
                } catch (e) {
                    logger.error("Failed to identify song", e);
                    showNotification({ title: "Shazam", body: `Something went wrong: ${e}` });
                } finally {
                    setBusy(false);
                }
            }}
        >
            <ShazamIcon style={{ color: busy ? "var(--status-danger)" : "currentColor" }} />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "Shazam",
    description: "Identify songs playing in your voice channel via AudD, right from the chat bar",
    authors: [{ name: "kadrxy", id: 518089207793844225n }],
    settings,   

    chatBarButton: {
        icon: ShazamIcon,
        render: ShazamChatBarButton
    },

    start() {
        // Hook new voice connections so we can grab their incoming audio tracks later.
        // Prototype patching also catches code that saved a reference to RTCPeerConnection
        originalSetRemoteDescription = RTCPeerConnection.prototype.setRemoteDescription;
        RTCPeerConnection.prototype.setRemoteDescription = function (this: RTCPeerConnection, ...args: any[]) {
            voiceConnections.add(this);
            return originalSetRemoteDescription!.apply(this, args as any);
        };
    },

    stop() {
        if (originalSetRemoteDescription) {
            RTCPeerConnection.prototype.setRemoteDescription = originalSetRemoteDescription;
            originalSetRemoteDescription = null;
        }
        voiceConnections.clear();
    }
});
