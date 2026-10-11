/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isPluginEnabled } from "@api/PluginManager";
import { definePluginSettings } from "@api/Settings";
import { t } from "@utils/esharqI18n";
import definePlugin, { OptionType } from "@utils/types";
import { moment, useEffect, useReducer } from "@webpack/common";
import { Logger } from "@utils/Logger";

const logger = new Logger("RealtimeTimestamps");

// ΓöÇΓöÇΓöÇ Settings ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

const settings = definePluginSettings({
    format: {
        type: OptionType.SELECT,
        description: t("╪╡┘è╪║╪⌐ ╪º┘ä╪½┘ê╪º┘å┘è ╪º┘ä┘à╪╣╪▒┘ê╪╢╪⌐ ╪╣┘ä┘ë ┘â┘ä ╪╖╪º╪¿╪╣ ╪▓┘à┘å┘è ┘ä┘ä╪▒╪│╪º┘ä╪⌐", "Seconds format displayed on every message timestamp"),
        default: "HH:mm:ss",
        options: [
            { label: "15:34:21  (24h)", value: "HH:mm:ss", default: true },
            { label: "3:34:21 PM  (12h)", value: "h:mm:ss A" },
        ],
    },
    showInTooltip: {
        type: OptionType.BOOLEAN,
        description: t("╪Ñ╪╕┘ç╪º╪▒ ╪º┘ä╪½┘ê╪º┘å┘è ┘ü┘è ╪¬┘ä┘à┘è╪¡ ╪º┘ä╪¬┘à╪▒┘è╪▒", "Show seconds in the hover tooltip"),
        default: true,
    },
    showInCompact: {
        type: OptionType.BOOLEAN,
        description: t("╪Ñ╪╕┘ç╪º╪▒ ╪º┘ä╪½┘ê╪º┘å┘è ┘ü┘è ╪º┘ä┘ê╪╢╪╣ ╪º┘ä┘à┘Å╪»┘à╪¼", "Show seconds in compact mode"),
        default: true,
    },
});

// ΓöÇΓöÇΓöÇ Global tick ΓöÇ one shared setInterval for all timestamp components ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// This avoids creating one setInterval per rendered message (50+ messages = 50+
// intervals ΓåÆ 50+ React re-renders per second ΓåÆ Discord freeze).

const tickListeners = new Set<() => void>();
let globalTickInterval: ReturnType<typeof setInterval> | null = null;

function startGlobalTick() {
    if (globalTickInterval !== null) return;
    globalTickInterval = setInterval(() => {
        for (const fn of tickListeners) {
            try { fn(); } catch (err) { logger.debug("Ignored error", err); }
        }
    }, 1000);
}

function stopGlobalTick() {
    if (tickListeners.size > 0) return;
    if (globalTickInterval !== null) {
        clearInterval(globalTickInterval);
        globalTickInterval = null;
    }
}

// ΓöÇΓöÇΓöÇ React Hook (only valid inside a React component) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function useSecondTick() {
    const [, tick] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
        tickListeners.add(tick);
        startGlobalTick();
        return () => {
            tickListeners.delete(tick);
            stopGlobalTick();
        };
    }, []);
}

// ΓöÇΓöÇΓöÇ Timestamp render functions ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// REAL FIX (confirmed against the stock CustomTimestamps plugin, which patches
// these exact same Vencord match sites and works fine): the previous "BUGFIX"
// diagnosis was wrong. There is no Hook-rule violation ΓÇö these patch sites sit
// directly inside the host component's render body, so calling a Hook here is
// perfectly valid (CustomTimestamps' renderTimestamp does the same thing).
//
// The actual crash was caused by returning a *React element* (Fragment) where
// Discord's own MessageTimestamp component expects a plain *string*. That same
// variable is reused later in the same component for things like AM/PM format
// detection via .match(...) and the edited-message a11y label ΓÇö calling
// .match() on a React element throws "e.match is not a function" on every
// message render. Returning a plain string (like CustomTimestamps does) keeps
// those other internal usages intact while still updating live every second
// via useSecondTick().

function renderCozyText(date: Date) {
    useSecondTick();
    const fmt = settings.store.format ?? "HH:mm:ss";
    return moment(date).format(fmt);
}

function renderCompactText(date: Date) {
    useSecondTick();
    const fmt = settings.store.format ?? "HH:mm:ss";
    return settings.store.showInCompact
        ? moment(date).format(fmt)
        : moment(date).format("LT");
}

function renderTooltipText(date: Date) {
    useSecondTick();
    const fmt = settings.store.format ?? "HH:mm:ss";
    return settings.store.showInTooltip
        ? moment(date).format(`dddd, MMMM D, YYYY [at] ${fmt}`)
        : moment(date).format("LLLL");
}

// ΓöÇΓöÇΓöÇ Plugin ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export default definePlugin({
    name: "RealtimeTimestamps",
    description: "Replaces Discord timestamps (e.g. 15:31) with live seconds (e.g. 15:34:21), updated every second. Turn off CustomTimestamps to use this, since both rewrite the same timestamps.",
    tags: ["Appearance", "Chat", "Utility"],
    authors: [{ name: t("┘à╪ñ┘ä┘ü ╪║┘è╪▒ ┘à╪╣╪▒┘ê┘ü", "Unknown"), id: 0n }],
    settings,

    // Called directly by patches ΓÇö must return a plain string, not a React
    // element, since these substitute for values Discord later treats as text
    // (and in some cases re-parses with .match()).
    renderCozy(date: Date) {
        return renderCozyText(date);
    },
    renderCompact(date: Date) {
        return renderCompactText(date);
    },
    renderTooltip(date: Date) {
        return renderTooltipText(date);
    },

    stop() {
        tickListeners.clear();
        if (globalTickInterval !== null) {
            clearInterval(globalTickInterval);
            globalTickInterval = null;
        }
    },

    // CustomTimestamps rewrites the exact same three expressions in the same module,
    // so whichever plugin patches first wins and the other silently does nothing.
    // Defer to it rather than register patches that cannot apply ΓÇö the anchors below
    // are correct and match fine when this plugin runs on its own.
    patches: [
        // ΓöÇΓöÇΓöÇ Main Timestamp component (cozy + compact messages + hover tooltip) ΓöÇ
        {
            find: "#{intl::MESSAGE_EDITED_TIMESTAMP_A11Y_LABEL}",
            predicate: () => !isPluginEnabled("CustomTimestamps"),
            replacement: [
                {
                    // Compact mode: the useMemo that formats with "LT"
                    match: /(\i\.useMemo\(.{0,50}"LT".{0,30}\]\))/,
                    replace: "$self.renderCompact(arguments[0].timestamp)",
                },
                {
                    // Cozy mode: the useMemo that calls the calendar/relative formatter
                    match: /(\i\.useMemo\(.{0,10}\i\.\i\)\(.{0,10}\]\))/,
                    replace: "$self.renderCozy(arguments[0].timestamp)",
                },
                {
                    // Tooltip shown when hovering a message timestamp
                    match: /(__unsupportedReactNodeAsText:).{0,25}"LLLL"\)/,
                    replace: "$1$self.renderTooltip(arguments[0].timestamp)",
                },
            ],
        },

        // ΓöÇΓöÇΓöÇ Timestamp markdown <t:unix:t> ΓÇö hover tooltip ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
        {
            find: /.full,.{0,15}children:/,
            predicate: () => !isPluginEnabled("CustomTimestamps"),
            replacement: {
                match: /(__unsupportedReactNodeAsText:)\i\.full/,
                replace: "$1$self.renderTooltip(new Date(arguments[0].node.timestamp*1000))",
            },
        },
    ],
});