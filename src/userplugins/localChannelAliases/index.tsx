/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Taako
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import * as DataStore from "@api/DataStore";
import { HeadingSecondary } from "@components/Heading";
import definePlugin from "@utils/types";
import type { Channel, RenderModalProps } from "@vencord/discord-types";
import { ChannelStore, Menu, Modal, openModal, TextInput, useState } from "@webpack/common";

const DATASTORE_KEY = "LocalChannelAliases.aliases";
const BASE_NAME_ACCESSOR = Symbol("LocalChannelAliases.baseNameAccessor");

type ChannelAliases = Record<string, string>;
type AliasedChannel = Channel & {
    [BASE_NAME_ACCESSOR]?: () => string;
};

let aliases: ChannelAliases = {};
let active = false;
let editingChannelId: string | null = null;

function emitChannelChange(): void {
    (ChannelStore as any).emitChange?.();
}

function getBaseName(channel: Channel): string {
    return (channel as AliasedChannel)[BASE_NAME_ACCESSOR]?.() ?? channel.name;
}

function formatChannelName(channel: Channel, name: string): string {
    return channel.isPrivate() ? name : `#${name}`;
}

async function saveAlias(channelId: string, alias: string): Promise<void> {
    const trimmed = alias.trim();

    if (trimmed) {
        aliases[channelId] = trimmed;
    } else {
        delete aliases[channelId];
    }

    await DataStore.set(DATASTORE_KEY, aliases);
    emitChannelChange();
}

function AliasModal({ channel, modalProps }: {
    channel: Channel;
    modalProps: RenderModalProps;
}) {
    const currentAlias = aliases[channel.id] ?? "";
    const [value, setValue] = useState(currentAlias);
    const originalName = getBaseName(channel);

    const save = async () => {
        await saveAlias(channel.id, value);
        modalProps.onClose();
    };

    const actions: any[] = [
        {
            text: "Cancel",
            variant: "secondary",
            onClick: modalProps.onClose,
        },
        {
            text: "Save",
            variant: "primary",
            disabled: !value.trim() || value.trim().length > 100,
            onClick: save,
        },
    ];

    if (currentAlias) {
        actions.unshift({
            text: "Remove Alias",
            variant: "dangerPrimary",
            onClick: async () => {
                await saveAlias(channel.id, "");
                modalProps.onClose();
            },
        });
    }

    return (
        <Modal
            {...modalProps}
            size="sm"
            title="Local Channel Alias"
            subtitle={`Only you will see this name. Original: ${formatChannelName(channel, originalName)}`}
            actions={actions}
        >
            <HeadingSecondary>Display name</HeadingSecondary>
            <TextInput
                autoFocus
                maxLength={100}
                placeholder={originalName}
                value={value}
                onChange={setValue}
                onKeyDown={event => {
                    if (event.key === "Enter" && value.trim() && value.trim().length <= 100) {
                        void save();
                    }
                }}
            />
        </Modal>
    );
}

function openAliasModal(channel: Channel): void {
    openModal(modalProps => <AliasModal channel={channel} modalProps={modalProps} />);
}

const patchChannelContextMenu: NavContextMenuPatchCallback = (children, { channel }) => {
    if (!channel?.id) return;

    children.splice(-1, 0,
        <Menu.MenuItem
            id="vc-local-channel-alias"
            label={aliases[channel.id] ? "Edit Local Channel Alias" : "Set Local Channel Alias"}
            action={() => openAliasModal(channel)}
        />
    );
};

export default definePlugin({
    name: "LocalChannelAliases",
    description: "Lets you privately rename channels without changing their server names.",
    tags: ["Appearance", "Customisation", "Servers"],
    authors: [{ name: "Taako", id: 103720027483545600n }],

    patches: [
        {
            find: "loadAllGuildAndPrivateChannelsFromDisk(){",
            replacement: {
                match: /(?<=getChannel\(\i\)\{if\(null!=\i\)return )(.+?)(?=\})/,
                replace: "$self.applyAlias($1)",
            },
        },
    ],

    contextMenus: {
        "channel-context": patchChannelContextMenu,
    },

    flux: {
        CHANNEL_SETTINGS_INIT({ channelId }: { channelId: string; }) {
            editingChannelId = channelId;
            emitChannelChange();
        },
        CHANNEL_SETTINGS_CLOSE() {
            editingChannelId = null;
            emitChannelChange();
        },
    },

    async start() {
        active = true;
        aliases = await DataStore.get<ChannelAliases>(DATASTORE_KEY) ?? {};
        emitChannelChange();
    },

    stop() {
        active = false;
        editingChannelId = null;
        emitChannelChange();
    },

    applyAlias(channel?: Channel) {
        if (!channel) return channel;

        const aliasedChannel = channel as AliasedChannel;
        if (aliasedChannel[BASE_NAME_ACCESSOR]) return channel;

        const descriptor = Object.getOwnPropertyDescriptor(channel, "name");
        let baseName = channel.name;

        const readBaseName = () => descriptor?.get
            ? descriptor.get.call(channel)
            : baseName;

        Object.defineProperty(channel, BASE_NAME_ACCESSOR, {
            configurable: true,
            value: readBaseName,
        });

        Object.defineProperty(channel, "name", {
            configurable: true,
            enumerable: true,
            get() {
                const originalName = readBaseName();

                if (!active || editingChannelId === channel.id) return originalName;
                return aliases[channel.id] || originalName;
            },
            set(value: string) {
                if (descriptor?.set) {
                    descriptor.set.call(channel, value);
                } else {
                    baseName = value;
                }
            },
        });

        return channel;
    },
});
