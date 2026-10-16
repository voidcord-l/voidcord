/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { findByPropsLazy } from "@webpack";
import { MessageStore, React, useEffect, UserStore, useStateFromStores, useState } from "@webpack/common";
import { Message } from "discord-types/general";

import { settings } from "../index";
import { BooProps } from "../types";
import IconGhost from "./IconGhost";
import IconGhostOrange from "./IconGhost-Orange";

const ChannelWrapperStyles = findByPropsLazy("muted", "wrapper");

export default function Boo({ channel }: BooProps) {
    const { id } = channel;

    const currentUserId = useStateFromStores([UserStore], () => UserStore.getCurrentUser()?.id);
    const lastMessage: Message = useStateFromStores([MessageStore], () => MessageStore.getMessages(id)?.last());

    const [state, setState] = useState({
        isCurrentUser: null as boolean | null,
        containsQuestionMark: false,
        isDataProcessed: false,
    });

    useEffect(() => {
        if (!lastMessage || !currentUserId) return;

        const lastIsCurrentUser = lastMessage.author.id === currentUserId;
        const containsQuestionMark = !lastIsCurrentUser && lastMessage.content.includes("?");

        setState({
            isCurrentUser: lastIsCurrentUser,
            containsQuestionMark: containsQuestionMark,
            isDataProcessed: true,
        });
    }, [lastMessage, currentUserId]);

    if (!state.isDataProcessed || !currentUserId || !lastMessage) return null;

    const ghostStyle = settings.store.ghostStyle;
    const ghostSize = settings.store.ghostSize;
    const showOrange = ghostStyle === "alwaysOrange" || (ghostStyle === "auto" && state.containsQuestionMark);

    return (
        !state.isCurrentUser && (
            <div className={ChannelWrapperStyles.wrapper}>
                {showOrange ? <IconGhostOrange /> : <IconGhost />}
            </div>
        )
    );
}
