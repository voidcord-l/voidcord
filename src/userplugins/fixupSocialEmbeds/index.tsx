/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MessageObject } from "@api/MessageEvents";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Paragraph } from "@components/Paragraph";
import definePlugin, { OptionType } from "@utils/types";
import { TextInput, useState } from "@webpack/common";

interface HostReplacement {
    inputHost: string;
    outputHost: string;
}

const DEFAULT_REPLACEMENTS: HostReplacement[] = [
    { inputHost: "x.com", outputHost: "fixupx.com" },
    { inputHost: "instagram.com", outputHost: "hhinstagram.com" },
    { inputHost: "reddit.com", outputHost: "rxddit.com" },
    { inputHost: "bsky.app", outputHost: "fxbsky.app" },
    { inputHost: "twitter.com", outputHost: "fxtwitter.com" }
];

const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"'>)|\]\s])/gi;

function normalizeHost(value: string): string {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return "";

    try {
        return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname;
    } catch {
        return trimmed.replace(/^\.+|\.+$/g, "");
    }
}

function replaceUrlHost(value: string, replacements: HostReplacement[]): string {
    let url: URL;

    try {
        url = new URL(value);
    } catch {
        return value;
    }

    const currentHost = url.hostname.toLowerCase();
    const replacement = replacements.find(rule =>
        normalizeHost(rule.inputHost) === currentHost
        && normalizeHost(rule.outputHost)
    );

    if (!replacement) return value;

    url.hostname = normalizeHost(replacement.outputHost);
    return url.toString();
}

export function replaceSocialHosts(content: string, replacements: HostReplacement[]): string {
    if (!/https?:\/\//i.test(content)) return content;
    return content.replace(URL_REGEX, url => replaceUrlHost(url, replacements));
}

function HostReplacementSettings() {
    const [hostReplacements, setHostReplacements] = useState<HostReplacement[]>(
        () => settings.store.hostReplacements
    );

    const update = (next: HostReplacement[]) => {
        setHostReplacements(next);
        settings.store.hostReplacements = next;
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <Paragraph>
                Replace URL hosts immediately before messages are sent or edited. Enter hostnames only;
                paths, query parameters, and fragments are preserved.
            </Paragraph>

            {hostReplacements.map((rule, index) => (
                <div
                    key={index}
                    style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto",
                        gap: "8px",
                        alignItems: "center"
                    }}
                >
                    <TextInput
                        value={rule.inputHost}
                        placeholder="x.com"
                        aria-label={`Input host ${index + 1}`}
                        spellCheck={false}
                        onChange={value => update(hostReplacements.map((currentRule, ruleIndex) =>
                            ruleIndex === index ? { ...currentRule, inputHost: value } : currentRule
                        ))}
                    />
                    <TextInput
                        value={rule.outputHost}
                        placeholder="fixupx.com"
                        aria-label={`Output host ${index + 1}`}
                        spellCheck={false}
                        onChange={value => update(hostReplacements.map((currentRule, ruleIndex) =>
                            ruleIndex === index ? { ...currentRule, outputHost: value } : currentRule
                        ))}
                    />
                    <Button
                        variant="dangerPrimary"
                        size="small"
                        onClick={() => update(hostReplacements.filter((_, ruleIndex) => ruleIndex !== index))}
                    >
                        Remove
                    </Button>
                </div>
            ))}

            {!hostReplacements.length && (
                <Paragraph>No host replacements configured.</Paragraph>
            )}

            <Button
                size="small"
                onClick={() => update([
                    ...hostReplacements,
                    { inputHost: "", outputHost: "" }
                ])}
            >
                Add replacement
            </Button>
        </div>
    );
}

const settings = definePluginSettings({
    hostReplacements: {
        type: OptionType.COMPONENT,
        description: "Configure URL host replacements.",
        default: DEFAULT_REPLACEMENTS,
        component: HostReplacementSettings
    }
});

function fixMessage(message: MessageObject): void {
    message.content = replaceSocialHosts(message.content, settings.store.hostReplacements);
}

export default definePlugin({
    name: "FixupSocialEmbeds",
    description: "Replaces social media URL hosts with embed-friendly alternatives before sending.",
    authors: [{ name: "patchstep", id: 0n }],
    tags: ["Chat", "Utility"],
    dependencies: ["MessageEventsAPI"],
    settings,

    onBeforeMessageSend(_channelId, message) {
        fixMessage(message);
    },

    onBeforeMessageEdit(_channelId, _messageId, message) {
        fixMessage(message);
    }
});
