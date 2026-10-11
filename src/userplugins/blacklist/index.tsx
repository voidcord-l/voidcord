/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, sendBotMessage } from "@api/Commands";
import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, UserStore } from "@webpack/common";

const settings = definePluginSettings({
    isEnabled: {
        type: OptionType.BOOLEAN,
        description: "Toggle the Blacklist warning system.",
        default: false,
    },
    warningText: {
        type: OptionType.STRING,
        description: "Warning text appended to your messages when enabled.",
        default: "⚠ *This user is suspected to be part of a criminal organization. Be aware and contact the authorities or the Federal Bureau of Investigation immediately to ensure other users' safety*",
    },
    warnOnOwnMessages: {
        type: OptionType.BOOLEAN,
        description: "Append the warning footer to your own messages.",
        default: true,
    },
    warnOnBlacklistedUsers: {
        type: OptionType.BOOLEAN,
        description: "Show a warning badge on messages from blacklisted users.",
        default: false,
    },
    warnOnKeywordMatch: {
        type: OptionType.BOOLEAN,
        description: "Show a warning badge on messages containing blacklisted keywords.",
        default: false,
    },
    blacklistedUsers: {
        type: OptionType.STRING,
        description: "Comma-separated list of user IDs to blacklist.",
        default: "",
    },
    keywordList: {
        type: OptionType.STRING,
        description: "Comma-separated list of keywords that trigger warnings.",
        default: "",
    },
    warningStyle: {
        type: OptionType.SELECT,
        description: "How to display warnings on flagged messages.",
        options: [
            { label: "Warning Badge Below Message", value: "badge", default: true },
        ],
        default: "badge",
    },
    accentColor: {
        type: OptionType.STRING,
        description: "Accent color for the Blacklist icon and warnings.",
        default: "#ed4245",
    },
    warningPresets: {
        type: OptionType.STRING,
        description: "JSON array of warning presets to randomly cycle through. Leave empty to use single warning text.",
        default: "",
    },
    perServerWarnings: {
        type: OptionType.STRING,
        description: "JSON object mapping server IDs to warning texts. Overrides the default warning for specific servers.",
        default: "",
    },
});

function WarningIcon({ size = 20 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6zm-1 5v4h2v-4h-2zm0 6v2h2v-2h-2z" />
        </svg>
    );
}

function getWarningText(guildId?: string): string {
    const presetsRaw = settings.store.warningPresets?.trim();
    const perServerRaw = settings.store.perServerWarnings?.trim();

    if (perServerRaw && guildId) {
        try {
            const perServer = JSON.parse(perServerRaw);
            if (perServer[guildId]) return perServer[guildId];
        } catch { }
    }

    if (presetsRaw) {
        try {
            const presets = JSON.parse(presetsRaw);
            if (Array.isArray(presets) && presets.length > 0) {
                return presets[Math.floor(Math.random() * presets.length)];
            }
        } catch { }
    }

    return settings.store.warningText || "⚠ Warning";
}

function getBlacklistedUserIds(): string[] {
    const raw = settings.store.blacklistedUsers?.trim();
    if (!raw) return [];
    return raw.split(",").map(id => id.trim()).filter(Boolean);
}

function getKeywordList(): string[] {
    const raw = settings.store.keywordList?.trim();
    if (!raw) return [];
    return raw.split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
}

function isUserBlacklisted(userId: string): boolean {
    return getBlacklistedUserIds().includes(userId);
}

function messageMatchesKeywords(content: string): boolean {
    const keywords = getKeywordList();
    if (keywords.length === 0) return false;
    const lower = (content || "").toLowerCase();
    return keywords.some(k => lower.includes(k));
}

function getAccentColor(): string {
    return settings.store.accentColor || "#ed4245";
}

function getWarningStyle(): string {
    return settings.store.warningStyle || "badge";
}

const WarningButton: ChatBarButtonFactory = ({ isAnyChat }) => {
    const { isEnabled } = settings.use(["isEnabled"]);

    if (!isAnyChat) return null;

    return (
        <ChatBarButton
            tooltip={isEnabled ? "Disable Blacklist Warnings" : "Enable Blacklist Warnings"}
            onClick={() => settings.store.isEnabled = !settings.store.isEnabled}
        >
            <div style={{ color: isEnabled ? getAccentColor() : "currentColor", display: "flex", alignItems: "center" }}>
                <WarningIcon />
            </div>
        </ChatBarButton>
    );
};

const messageContextMenuPatch: NavContextMenuPatchCallback = (children, { message }) => {
    if (!message) return;

    const isOwn = message.author?.id === UserStore.getCurrentUser().id;
    const targetId = message.author?.id;
    if (!targetId) return;

    const group = findGroupChildrenByChildId("blacklist-actions", children) ?? children;

    const actions = [];

    if (targetId !== UserStore.getCurrentUser().id) {
        if (isUserBlacklisted(targetId)) {
            actions.push(
                <Menu.MenuItem
                    id="blacklist-unblacklist-user"
                    label={<span style={{ color: getAccentColor() }}>Unblacklist User</span>}
                    action={() => {
                        const current = getBlacklistedUserIds().filter(id => id !== targetId);
                        settings.store.blacklistedUsers = current.join(",");
                    }}
                    icon={WarningIcon}
                />
            );
        } else {
            actions.push(
                <Menu.MenuItem
                    id="blacklist-blacklist-user"
                    label={<span style={{ color: getAccentColor() }}>Blacklist User</span>}
                    action={() => {
                        const current = getBlacklistedUserIds();
                        if (!current.includes(targetId)) {
                            current.push(targetId);
                            settings.store.blacklistedUsers = current.join(",");
                        }
                    }}
                    icon={WarningIcon}
                />
            );
        }
    }

    if (message.content) {
        const content = message.content.toLowerCase();
        const keywordList = getKeywordList();
        const matchedKeyword = keywordList.find(k => content.includes(k));

        if (matchedKeyword) {
            actions.push(
                <Menu.MenuItem
                    id="blacklist-remove-keyword"
                    label={<span style={{ color: getAccentColor() }}>Remove Keyword from Blacklist</span>}
                    action={() => {
                        const remaining = keywordList.filter(k => k !== matchedKeyword);
                        settings.store.keywordList = remaining.join(",");
                    }}
                    icon={WarningIcon}
                />
            );
        } else {
            const firstWord = (message.content.split(" ")[0] || "").toLowerCase();
            if (firstWord && firstWord.length > 2) {
                actions.push(
                    <Menu.MenuItem
                        id="blacklist-add-keyword"
                        label={<span style={{ color: getAccentColor() }}>Blacklist First Word</span>}
                        action={() => {
                            const current = getKeywordList();
                            if (!current.includes(firstWord)) {
                                current.push(firstWord);
                                settings.store.keywordList = current.join(",");
                            }
                        }}
                        icon={WarningIcon}
                    />
                );
            }
        }
    }

    if (isOwn) {
        actions.push(
            <Menu.MenuItem
                id="blacklist-toggle"
                label={<span style={{ color: getAccentColor() }}>{settings.store.isEnabled ? "Disable" : "Enable"} Blacklist</span>}
                action={() => settings.store.isEnabled = !settings.store.isEnabled}
                icon={WarningIcon}
            />
        );
    }

    if (actions.length > 0) {
        group.push(
            <Menu.MenuItem
                id="blacklist-actions"
                label={<span style={{ color: getAccentColor() }}>Blacklist</span>}
                icon={WarningIcon}
            >
                {actions}
            </Menu.MenuItem>
        );
    }
};

export default definePlugin({
    name: "Blacklist",
    description: "Advanced message warning and blacklist system. Append warning footers to messages, blacklist users and keywords, with randomized presets and per-server configuration.",
    authors: [{ name: "GIGABYTE", id: 1389444830882562131n }],
    settings,

    chatBarButton: {
        icon: WarningIcon,
        render: WarningButton,
    },

    dependencies: ["ChatInputButtonAPI", "MessageEventsAPI", "MessageAccessoriesAPI"],

    onBeforeMessageSend(_, msg) {
        if (!settings.store.isEnabled) return;
        if (!settings.store.warnOnOwnMessages) return;

        const guildId = _.guildId;
        const warning = getWarningText(guildId);

        if (msg.content && !msg.content.includes(warning)) {
            msg.content = `${msg.content}\n-# ${warning}`;
        }
    },

    renderMessageAccessory({ message }) {
        if (!message) return null;
        if (message.author?.id === UserStore.getCurrentUser().id) return null;
        if (!settings.store.isEnabled) return null;

        const shouldWarnUser = settings.store.warnOnBlacklistedUsers && isUserBlacklisted(message.author?.id);
        const shouldWarnKeyword = settings.store.warnOnKeywordMatch && messageMatchesKeywords(message.content || "");

        if (!shouldWarnUser && !shouldWarnKeyword) return null;

        const reason = shouldWarnUser
            ? "Blacklisted user"
            : "Message contains blacklisted content";

        return (
            <div style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 8px",
                margin: "2px 0",
                borderRadius: "4px",
                backgroundColor: `${getAccentColor()}18`,
                color: getAccentColor(),
                fontSize: "12px",
                fontWeight: 500,
            }}>
                <WarningIcon size={14} />
                <span>⚠ {reason}</span>
            </div>
        );
    },

    contextMenus: {
        "message": messageContextMenuPatch,
    },

    commands: [
        {
            name: "blacklist",
            description: "Manage Blacklist settings",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "toggle",
                    description: "Toggle Blacklist on/off",
                    type: ApplicationCommandOptionType.SUB_COMMAND,
                    options: [],
                },
                {
                    name: "status",
                    description: "Show current Blacklist configuration",
                    type: ApplicationCommandOptionType.SUB_COMMAND,
                    options: [],
                },
                {
                    name: "adduser",
                    description: "Add a user to the blacklist",
                    type: ApplicationCommandOptionType.SUB_COMMAND,
                    options: [{
                        name: "userid",
                        description: "The Discord user ID to blacklist",
                        type: ApplicationCommandOptionType.STRING,
                        required: true,
                    }],
                },
                {
                    name: "removeuser",
                    description: "Remove a user from the blacklist",
                    type: ApplicationCommandOptionType.SUB_COMMAND,
                    options: [{
                        name: "userid",
                        description: "The Discord user ID to remove",
                        type: ApplicationCommandOptionType.STRING,
                        required: true,
                    }],
                },
                {
                    name: "addkeyword",
                    description: "Add a keyword to the blacklist",
                    type: ApplicationCommandOptionType.SUB_COMMAND,
                    options: [{
                        name: "keyword",
                        description: "The keyword to blacklist",
                        type: ApplicationCommandOptionType.STRING,
                        required: true,
                    }],
                },
                {
                    name: "removekeyword",
                    description: "Remove a keyword from the blacklist",
                    type: ApplicationCommandOptionType.SUB_COMMAND,
                    options: [{
                        name: "keyword",
                        description: "The keyword to remove",
                        type: ApplicationCommandOptionType.STRING,
                        required: true,
                    }],
                },
                {
                    name: "setwarning",
                    description: "Set the warning text",
                    type: ApplicationCommandOptionType.SUB_COMMAND,
                    options: [{
                        name: "text",
                        description: "The warning text to use",
                        type: ApplicationCommandOptionType.STRING,
                        required: true,
                    }],
                },
            ],
            execute: async (args, ctx) => {
                const sub = args[0];
                if (!sub) return;

                switch (sub.name) {
                    case "toggle": {
                        settings.store.isEnabled = !settings.store.isEnabled;
                        sendBotMessage(ctx.channel.id, {
                            content: `Blacklist ${settings.store.isEnabled ? "enabled" : "disabled"}.`
                        });
                        break;
                    }
                    case "status": {
                        const users = getBlacklistedUserIds();
                        const keywords = getKeywordList();
                        const statusMsg = [
                            `**Blacklist Status**`,
                            `Enabled: ${settings.store.isEnabled ? "Yes" : "No"}`,
                            `Warn on own messages: ${settings.store.warnOnOwnMessages ? "Yes" : "No"}`,
                            `Warn on blacklisted users: ${settings.store.warnOnBlacklistedUsers ? "Yes" : "No"}`,
                            `Warn on keyword match: ${settings.store.warnOnKeywordMatch ? "Yes" : "No"}`,
                            `Warning style: ${getWarningStyle()}`,
                            `Blacklisted users (${users.length}): ${users.length > 0 ? users.join(", ") : "None"}`,
                            `Blacklisted keywords (${keywords.length}): ${keywords.length > 0 ? keywords.join(", ") : "None"}`,
                        ].join("\n");
                        sendBotMessage(ctx.channel.id, { content: statusMsg });
                        break;
                    }
                    case "adduser": {
                        const uid = String(sub.options?.find((o: any) => o.name === "userid")?.value || "");
                        if (!uid) {
                            sendBotMessage(ctx.channel.id, { content: "Please provide a user ID." });
                            return;
                        }
                        const current = getBlacklistedUserIds();
                        if (current.includes(uid)) {
                            sendBotMessage(ctx.channel.id, { content: "User is already blacklisted." });
                            return;
                        }
                        current.push(uid);
                        settings.store.blacklistedUsers = current.join(",");
                        sendBotMessage(ctx.channel.id, { content: `User \`${uid}\` added to blacklist.` });
                        break;
                    }
                    case "removeuser": {
                        const uid = String(sub.options?.find((o: any) => o.name === "userid")?.value || "");
                        const current = getBlacklistedUserIds().filter(id => id !== uid);
                        settings.store.blacklistedUsers = current.join(",");
                        sendBotMessage(ctx.channel.id, { content: `User \`${uid}\` removed from blacklist.` });
                        break;
                    }
                    case "addkeyword": {
                        const kw = String(sub.options?.find((o: any) => o.name === "keyword")?.value || "").toLowerCase();
                        if (!kw) {
                            sendBotMessage(ctx.channel.id, { content: "Please provide a keyword." });
                            return;
                        }
                        const current = getKeywordList();
                        if (current.includes(kw)) {
                            sendBotMessage(ctx.channel.id, { content: "Keyword is already blacklisted." });
                            return;
                        }
                        current.push(kw);
                        settings.store.keywordList = current.join(",");
                        sendBotMessage(ctx.channel.id, { content: `Keyword \`${kw}\` added to blacklist.` });
                        break;
                    }
                    case "removekeyword": {
                        const kw = String(sub.options?.find((o: any) => o.name === "keyword")?.value || "").toLowerCase();
                        const current = getKeywordList().filter(k => k !== kw);
                        settings.store.keywordList = current.join(",");
                        sendBotMessage(ctx.channel.id, { content: `Keyword \`${kw}\` removed from blacklist.` });
                        break;
                    }
                    case "setwarning": {
                        const text = String(sub.options?.find((o: any) => o.name === "text")?.value || "");
                        if (!text) {
                            sendBotMessage(ctx.channel.id, { content: "Please provide warning text." });
                            return;
                        }
                        settings.store.warningText = text;
                        settings.store.warningPresets = "";
                        sendBotMessage(ctx.channel.id, { content: "Warning text updated." });
                        break;
                    }
                }
            },
        },
    ],
});
