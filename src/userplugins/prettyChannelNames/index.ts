/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Taako
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

const settings = definePluginSettings({
    replaceHyphens: {
        type: OptionType.BOOLEAN,
        description: "Replace hyphens with spaces",
        default: true,
        onChange: queueRefresh,
    },
    capitalizeWords: {
        type: OptionType.BOOLEAN,
        description: "Capitalize the first letter of each word",
        default: true,
        onChange: queueRefresh,
    },
    useAllCaps: {
        type: OptionType.BOOLEAN,
        description: "Display the entire channel name in uppercase",
        default: false,
        onChange: queueRefresh,
    },
    acronyms: {
        type: OptionType.STRING,
        description: "Words to keep uppercase, separated by commas or spaces",
        placeholder: "API, FAQ, RP",
        default: "",
        onChange: queueRefresh,
    },
});

const CHANNEL_ROOT_SELECTOR = [
    'a[href^="/channels/"][aria-label*="text channel" i]',
    '[role="treeitem"][aria-label*="text channel" i]',
    '[data-list-item-id^="channels___"][aria-label*="text channel" i]',
    '[aria-label="Channel header" i]',
    'section[aria-label="Channel header" i]',
].join(",");

let observer: MutationObserver | undefined;
let queued = false;
let refreshQueued = false;
let animationFrame: number | undefined;

const originalTextNodes = new WeakMap<Text, string>();
const formattedTextNodes = new WeakMap<Text, string>();
const touchedTextNodes = new Set<Text>();

let cachedAcronymSetting = "";
let cachedAcronyms = new Set<string>();

function getAcronyms(): Set<string> {
    const configured = settings.store.acronyms;

    if (configured === cachedAcronymSetting) return cachedAcronyms;

    cachedAcronymSetting = configured;
    cachedAcronyms = new Set(
        configured
            .toLowerCase()
            .split(/[\s,]+/)
            .filter(Boolean)
    );

    return cachedAcronyms;
}

function formatWord(word: string): string {
    const cleaned = word.trim();

    if (!cleaned) return "";

    const lower = cleaned.toLowerCase();

    if (settings.store.useAllCaps) return lower.toUpperCase();

    if (getAcronyms().has(lower)) return lower.toUpperCase();

    if (!settings.store.capitalizeWords) return lower;

    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function prettyChannelName(input: string): string {
    const leadingSpace = input.match(/^\s*/)?.[0] ?? "";
    const trailingSpace = input.match(/\s*$/)?.[0] ?? "";
    const trimmed = input.trim();

    if (!trimmed) return input;

    const hasHash = trimmed.startsWith("#");
    const rawName = trimmed.replace(/^#\s*/, "");

    /*
        Supports:
        general-chat          -> General Chat
        clock-in              -> Clock In
        clock-CORRECTION      -> Clock Correction
        『🎥』video-clips      -> 『🎥』Video Clips
        【🚓】police-chat      -> 【🚓】Police Chat
        『📁』faq-request      -> 『📁』FAQ Request (when FAQ is configured)

        It keeps emoji/symbol prefixes and formats the actual channel name.
    */
    const match = rawName.match(/^([^A-Za-z0-9]*)([A-Za-z0-9][A-Za-z0-9\s-]*)$/);

    if (!match) return input;

    const prefix = match[1];
    const channelNamePart = match[2];

    let formatted = channelNamePart.replace(/[A-Za-z0-9]+/g, formatWord);

    if (settings.store.replaceHyphens) {
        formatted = formatted.replace(/[-\s]+/g, " ");
    }

    return `${leadingSpace}${hasHash ? "# " : ""}${prefix}${formatted}${trailingSpace}`;
}

function shouldSkipTextNode(node: Text): boolean {
    const parent = node.parentElement;

    if (!parent) return true;

    return Boolean(
        parent.closest("textarea, input, [contenteditable='true']")
    );
}

function prettifyElement(element: Element): void {
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                if (!(node instanceof Text)) return NodeFilter.FILTER_REJECT;
                if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
                if (shouldSkipTextNode(node)) return NodeFilter.FILTER_REJECT;

                return NodeFilter.FILTER_ACCEPT;
            },
        }
    );

    const textNodes: Text[] = [];

    while (walker.nextNode()) {
        textNodes.push(walker.currentNode as Text);
    }

    for (const node of textNodes) {
        const current = node.nodeValue ?? "";

        if (originalTextNodes.has(node) && formattedTextNodes.get(node) !== current) {
            originalTextNodes.set(node, current);
        }

        const next = prettyChannelName(current);

        if (next === current) continue;

        if (!originalTextNodes.has(node)) {
            originalTextNodes.set(node, current);
        }

        touchedTextNodes.add(node);
        formattedTextNodes.set(node, next);
        node.nodeValue = next;
    }
}

function run(): void {
    document
        .querySelectorAll(CHANNEL_ROOT_SELECTOR)
        .forEach(prettifyElement);
}

function restoreOriginalNames(): void {
    for (const node of touchedTextNodes) {
        const original = originalTextNodes.get(node);

        if (original !== undefined && node.isConnected) {
            node.nodeValue = original;
        }

        formattedTextNodes.delete(node);
    }

    touchedTextNodes.clear();
}

function queueRun(): void {
    if (queued || !observer) return;

    queued = true;

    animationFrame = requestAnimationFrame(() => {
        queued = false;
        animationFrame = undefined;

        if (!observer) return;

        if (refreshQueued) {
            refreshQueued = false;
            restoreOriginalNames();
        }

        run();
    });
}

function queueRefresh(): void {
    if (!observer) return;

    refreshQueued = true;
    queueRun();
}

export default definePlugin({
    name: "PrettyChannelNames",
    description: "Displays text channel names with spaces and capital letters instead of Discord's lowercase-dash format.",
    authors: [{ name: "Taako", id: 103720027483545600n }],
    settings,

    start() {
        run();

        observer = new MutationObserver(() => queueRun());

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    },

    stop() {
        observer?.disconnect();
        observer = undefined;

        if (animationFrame !== undefined) {
            cancelAnimationFrame(animationFrame);
            animationFrame = undefined;
        }

        queued = false;
        refreshQueued = false;
        restoreOriginalNames();
    },
});
