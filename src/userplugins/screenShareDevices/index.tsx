/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { settings as instantScreenshareSettings } from "@equicordplugins/instantScreenshare/utils";
import { EquicordDevs } from "@utils/constants";
import definePlugin, { StartAt } from "@utils/types";
import { findByPropsLazy } from "@webpack";

interface VideoDevice {
    id: string;
    name: string;
}

const deviceManager = findByPropsLazy("getOutputVolume") as {
    getVideoDevices: () => Record<string, VideoDevice>;
};

const hiddenDeviceNames = new Set([
    "meta quest 3s",
    "meta quest 2",
    "meta quest pro",
]);

let originalGetVideoDevices: (() => Record<string, VideoDevice>) | null = null;
let observer: MutationObserver | null = null;
let previousIncludeVideoDevices: boolean | null = null;
let previousStreamMedia: string | null = null;

function getVisibleVideoDevices(): Record<string, VideoDevice> {
    const devices = originalGetVideoDevices?.() ?? deviceManager.getVideoDevices();

    return Object.fromEntries(
        Object.entries(devices).filter(([, device]) => !hiddenDeviceNames.has(device.name.toLowerCase()))
    );
}

function getPreferredDeviceId(): string | null {
    const preferredDevice = Object.values(getVisibleVideoDevices())[0];
    return preferredDevice?.id ?? null;
}

function syncPreferredDevice(): void {
    if (previousIncludeVideoDevices === null) previousIncludeVideoDevices = instantScreenshareSettings.store.includeVideoDevices;
    if (previousStreamMedia === null) previousStreamMedia = instantScreenshareSettings.store.streamMedia;

    instantScreenshareSettings.store.includeVideoDevices = true;

    const preferredDeviceId = getPreferredDeviceId();
    if (!preferredDeviceId) return;

    const currentStreamMedia = instantScreenshareSettings.store.streamMedia;
    if (typeof currentStreamMedia === "string") {
        const visibleDevices = getVisibleVideoDevices();
        if (Object.values(visibleDevices).some(device => device.id === currentStreamMedia)) return;
    }

    instantScreenshareSettings.store.streamMedia = preferredDeviceId;
}

function normalizeText(value: string | null | undefined): string {
    return value?.trim().toLowerCase() ?? "";
}

function selectDevicesTab(): boolean {
    const buttons = Array.from(document.querySelectorAll<HTMLDivElement>('div[role="button"][tabindex="0"]'));
    const devicesTab = buttons.find(button => {
        const text = normalizeText(button.textContent);
        if (text !== "appareils" && text !== "devices") return false;

        const parent = button.parentElement;
        if (!parent) return false;

        const siblings = Array.from(parent.querySelectorAll<HTMLDivElement>('div[role="button"][tabindex="0"]'));
        if (siblings.length < 3) return false;

        return siblings.some(sibling => {
            const siblingText = normalizeText(sibling.textContent);
            return siblingText === "applications" || siblingText === "apps" || siblingText === "écran entier" || siblingText === "entire screen" || siblingText === "screen";
        });
    });

    if (!devicesTab || devicesTab.className.includes("pillItemSelected")) return false;

    devicesTab.click();
    return true;
}

function startObserver(): void {
    if (observer) return;

    const run = () => selectDevicesTab();

    observer = new MutationObserver(run);
    observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true });
    run();
}

export default definePlugin({
    name: "ScreenShareDevices",
    description: "Selects devices category by default and hides Meta Quest 1 and 3 headsets sources from the list.",
    tags: ["Media", "Voice"],
    authors: [EquicordDevs.mart],
    startAt: StartAt.WebpackReady,
    searchTerms: ["screenshare", "quest", "devices"],

    start() {
        if (!originalGetVideoDevices) {
            originalGetVideoDevices = deviceManager.getVideoDevices.bind(deviceManager);
            deviceManager.getVideoDevices = () => getVisibleVideoDevices();
        }

        syncPreferredDevice();
        startObserver();
    },

    stop() {
        if (!originalGetVideoDevices) return;

        observer?.disconnect();
        observer = null;
        if (previousIncludeVideoDevices !== null) {
            instantScreenshareSettings.store.includeVideoDevices = previousIncludeVideoDevices;
            previousIncludeVideoDevices = null;
        }
        if (previousStreamMedia !== null) {
            instantScreenshareSettings.store.streamMedia = previousStreamMedia;
            previousStreamMedia = null;
        }
        deviceManager.getVideoDevices = originalGetVideoDevices;
        originalGetVideoDevices = null;
    },
});
