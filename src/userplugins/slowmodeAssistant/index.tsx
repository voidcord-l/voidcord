/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Taako
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { IconComponent, OptionType } from "@utils/types";
import type { Channel, Message } from "@vencord/discord-types";
import {
    ChannelStore,
    MessageStore,
    PermissionsBits,
    PermissionStore,
    useEffect,
    UserStore,
    useState,
} from "@webpack/common";

const cooldownEnds = new Map<string, number>();

const settings = definePluginSettings({
    showWhenReady: {
        type: OptionType.BOOLEAN,
        description: "Keep the slowmode indicator visible when you are ready to send",
        default: false,
    },
    showTenths: {
        type: OptionType.BOOLEAN,
        description: "Show tenths of a second during the final ten seconds",
        default: true,
    },
});

const ClockIcon: IconComponent = ({ height = 18, width = 18, className }) => (
    <svg
        className={className}
        width={width}
        height={height}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
    >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

function hasSlowmodeBypass(channel: Channel): boolean {
    return PermissionStore.can(PermissionsBits.BYPASS_SLOWMODE, channel)
        || PermissionStore.can(PermissionsBits.MANAGE_MESSAGES, channel)
        || PermissionStore.can(PermissionsBits.MANAGE_CHANNELS, channel);
}

function messageTimestamp(message: Message): number {
    const { timestamp } = message;

    if (timestamp instanceof Date) return timestamp.getTime();

    const numericTimestamp = Number(timestamp);
    if (Number.isFinite(numericTimestamp)) return numericTimestamp;

    const parsedTimestamp = Date.parse(String(timestamp));
    return Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now();
}

function getLastOwnMessage(channelId: string): Message | undefined {
    const currentUserId = UserStore.getCurrentUser()?.id;
    if (!currentUserId) return undefined;

    const messages = MessageStore.getMessages(channelId)?._array ?? [];

    for (let index = messages.length - 1; index >= 0; index--) {
        if (messages[index].author?.id === currentUserId) return messages[index];
    }

    return undefined;
}

function getCooldownEnd(channel: Channel): number {
    const slowmodeSeconds = channel.rateLimitPerUser ?? 0;
    if (slowmodeSeconds <= 0 || hasSlowmodeBypass(channel)) return 0;

    const trackedEnd = cooldownEnds.get(channel.id) ?? 0;
    const lastOwnMessage = getLastOwnMessage(channel.id);
    const messageEnd = lastOwnMessage
        ? messageTimestamp(lastOwnMessage) + slowmodeSeconds * 1000
        : 0;

    return Math.max(trackedEnd, messageEnd);
}

function formatRemaining(remainingMs: number, showTenths: boolean): string {
    if (showTenths && remainingMs <= 10_000) {
        return `${Math.max(0, remainingMs / 1000).toFixed(1)}s`;
    }

    const totalSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return minutes > 0
        ? `${minutes}:${seconds.toString().padStart(2, "0")}`
        : `${seconds}s`;
}

const SlowmodeButton: ChatBarButtonFactory = ({ channel, isAnyChat }) => {
    const { showWhenReady, showTenths } = settings.use(["showWhenReady", "showTenths"]);
    const [now, setNow] = useState(Date.now());
    const shouldTrack = isAnyChat
        && Boolean(channel.rateLimitPerUser)
        && !hasSlowmodeBypass(channel);

    useEffect(() => {
        if (!shouldTrack) return;

        setNow(Date.now());
        const interval = window.setInterval(() => setNow(Date.now()), 100);
        return () => window.clearInterval(interval);
    }, [channel.id, shouldTrack]);

    if (!shouldTrack) return null;

    const remainingMs = Math.max(0, getCooldownEnd(channel) - now);
    if (remainingMs <= 0 && !showWhenReady) return null;

    const display = remainingMs > 0
        ? formatRemaining(remainingMs, showTenths)
        : "Ready";

    return (
        <ChatBarButton
            tooltip={remainingMs > 0
                ? `Slowmode: ready in ${display}`
                : `Slowmode: ready to send (${channel.rateLimitPerUser}s delay)`}
            onClick={() => { }}
        >
            <div style={{
                alignItems: "center",
                color: remainingMs > 0 ? "var(--text-feedback-warning)" : "var(--text-positive)",
                display: "flex",
                fontSize: "12px",
                fontWeight: 600,
                gap: "4px",
                minWidth: "38px",
            }}>
                <ClockIcon />
                <span>{display}</span>
            </div>
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "SlowmodeAssistant",
    description: "Shows an exact slowmode countdown beside the message composer.",
    tags: ["Chat", "Utility"],
    dependencies: ["ChatInputButtonAPI"],
    authors: [{ name: "Taako", id: 103720027483545600n }],
    settings,

    chatBarButton: {
        icon: ClockIcon,
        render: SlowmodeButton,
    },

    flux: {
        MESSAGE_CREATE({ message }: { message: Message; }) {
            const currentUserId = UserStore.getCurrentUser()?.id;
            if (!message?.channel_id || message.author?.id !== currentUserId) return;

            const storedChannel = ChannelStore.getChannel(message.channel_id);
            if (!storedChannel?.rateLimitPerUser || hasSlowmodeBypass(storedChannel)) return;

            cooldownEnds.set(
                message.channel_id,
                messageTimestamp(message) + storedChannel.rateLimitPerUser * 1000
            );
        },
    },

    stop() {
        cooldownEnds.clear();
    },
});
