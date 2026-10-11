/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

import Boo from "./components/Boo";
import { BooProps } from "./types";

export const settings = definePluginSettings({
    ghostStyle: {
        type: OptionType.SELECT,
        description: "When to show the orange ghost icon",
        options: [
            { label: "Auto (orange for unanswered questions, white otherwise)", value: "auto" },
            { label: "Always orange", value: "alwaysOrange" },
            { label: "Always white", value: "alwaysWhite" },
        ],
        default: "auto",
    },
    ghostSize: {
        type: OptionType.SELECT,
        description: "Size of the ghost icon",
        options: [
            { label: "Small", value: "1em" },
            { label: "Medium", value: "1.5em" },
            { label: "Large", value: "2em" },
        ],
        default: "1.5em",
    },
});

export default definePlugin({
    name: "Boo",
    description: "A cute ghost will appear if you don't answer their DMs",
    authors: [{ name: "Vei", id: 239414094799699968n }, Devs.sadan],
    settings,
    patches: [
        {
            find: "interactiveSelected]",
            replacement: {
                match: /interactiveSelected.{0,50}children:\[/,
                replace: "$&$self.renderBoo(arguments[0]),"
            }
        }
    ],

    renderBoo: (props: BooProps) => {
        return (
            <ErrorBoundary noop>
                <Boo {...props} />
            </ErrorBoundary>
        );
    }
});
