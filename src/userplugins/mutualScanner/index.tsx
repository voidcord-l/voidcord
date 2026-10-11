/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MagnifyingGlassIcon } from "@components/Icons";
import SettingsPlugin from "@plugins/_core/settings";
import { removeFromArray } from "@utils/misc";
import definePlugin from "@utils/types";

import {
    mountRuntimeActivity,
    unmountRuntimeActivity,
} from "../_runtimeCompat/runtimeActivity";
import { t } from "../autoTranslate";
import MutualScannerTab from "./MutualScannerTab";
import { resetMutualScannerRuntime } from "./runtime";

const MUTUAL_SCANNER_SETTINGS_KEY = "mutual_scanner";

function unregisterMutualScannerSettingsTab() {
    while (SettingsPlugin.customEntries.some(entry => entry.key === MUTUAL_SCANNER_SETTINGS_KEY)) {
        removeFromArray(SettingsPlugin.customEntries, entry => entry.key === MUTUAL_SCANNER_SETTINGS_KEY);
    }
}

function registerMutualScannerSettingsTab() {
    unregisterMutualScannerSettingsTab();

    SettingsPlugin.customEntries.push({
        key: MUTUAL_SCANNER_SETTINGS_KEY,
        title: t("Mutual Scanner"),
        Component: MutualScannerTab,
        Icon: MagnifyingGlassIcon,
    });
}

export default definePlugin({
    name: "MutualScanner",
    enabledByDefault: false,
    description: "Scans selected servers for members that share at least one mutual friend with your account and saves the results locally.",
    authors: [{ name: "clrxxo", id: 0n }],
    dependencies: ["Settings"],
    tags: ["Friends", "Utility"],
    requiresRestart: false,

    start() {
        mountRuntimeActivity();
        registerMutualScannerSettingsTab();
    },

    stop() {
        resetMutualScannerRuntime();
        unmountRuntimeActivity();
        unregisterMutualScannerSettingsTab();
    },
});
