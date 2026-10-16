/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import definePlugin from "@utils/types";
import { Constants, RestAPI, SnowflakeUtils } from "@webpack/common";

const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

function parseDuration(input: string): number | null {
    const match = input.trim().match(/^(\d+(?:\.\d+)?)\s*([smhdwM])$/);
    if (!match) return null;

    const value = parseFloat(match[1]);
    const unit = match[2];

    switch (unit) {
        case "s": return value * 1000;
        case "m": return value * 60 * 1000;
        case "h": return value * 60 * 60 * 1000;
        case "d": return value * 24 * 60 * 60 * 1000;
        case "w": return value * 7 * 24 * 60 * 60 * 1000;
        case "M": return value * 30 * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w`;
    const months = Math.floor(days / 30);
    return `${months}M`;
}

export default definePlugin({
    name: "TempMessage",
    description: "Send a message that automatically deletes thyself after a set duration",
    authors: [{ name: "Ryu", id: 1020416187219316766n }],

    stop() {
        for (const timer of pendingTimers) {
            clearTimeout(timer);
        }
        pendingTimers.clear();
    },

    commands: [
        {
            name: "temp",
            description: "Send a message that deletes thyself after a duration (e.g. 30s, 5m, 2h, 1d, 4w)",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "message",
                    description: "The message to send",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                },
                {
                    name: "duration",
                    description: "How long until deleted — e.g. 30s, 5m, 2h, 3d, 4w, 1M",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                }
            ],
            async execute(args, ctx) {
                const content = findOption<string>(args, "message", "");
                const durationStr = findOption<string>(args, "duration", "");

                const ms = parseDuration(durationStr);
                if (ms === null) {
                    sendBotMessage(ctx.channel.id, {
                        content: "😓 Invalid duration. Use a number + unit: `s` seconds, `m` minutes, `h` hours, `d` days, `w` weeks, `M` months. Example: `5m`, `2h`, `1d`"
                    });
                    return;
                }

                if (ms < 1000) {
                    sendBotMessage(ctx.channel.id, { content: "😓 Duration must be at least 1 second." });
                    return;
                }

                try {
                    const res = await RestAPI.post({
                        url: Constants.Endpoints.MESSAGES(ctx.channel.id),
                        body: {
                            content,
                            nonce: SnowflakeUtils.fromTimestamp(Date.now()),
                            tts: false,
                            flags: 0
                        }
                    });

                    const messageId = res?.body?.id;
                    if (!messageId) {
                        sendBotMessage(ctx.channel.id, { content: "😓 Message sent but couldn't retrieve its ID to schedule deletion." });
                        return;
                    }

                    sendBotMessage(ctx.channel.id, {
                        content: `⏳ Message will be deleted in **${formatDuration(ms)}**.`
                    });

                    const timer = setTimeout(async () => {
                        pendingTimers.delete(timer);
                        try {
                            await RestAPI.del({
                                url: `${Constants.Endpoints.MESSAGES(ctx.channel.id)}/${messageId}`
                            });
                        } catch (error) {
                            console.error("TempMessage: Failed to delete message", error);
                        }
                    }, ms);

                    pendingTimers.add(timer);
                } catch (error) {
                    console.error("TempMessage: Failed to send message", error);
                    sendBotMessage(ctx.channel.id, { content: "😓 Failed to send the message." });
                }
            }
        }
    ]
});
