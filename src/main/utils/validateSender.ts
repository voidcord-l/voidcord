/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, type IpcMainInvokeEvent } from "electron";
import { normalize } from "path";

let cachedAppPath: string | null = null;

function getCachedAppPath() {
    cachedAppPath ??= normalize(app.getAppPath());
    return cachedAppPath;
}

/** Checks that an IPC call comes from the Discord app itself (local file or Discord origin). */
export function validateSender(event: IpcMainInvokeEvent): boolean {
    const url = event?.senderFrame?.url;
    if (!url) return false;

    if (url.startsWith("file://")) {
        return normalize(url.replace("file://", "")).startsWith(getCachedAppPath());
    }

    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") return false;
        const host = parsed.hostname.toLowerCase();
        return host === "discord.com" || host.endsWith(".discord.com") || host === "discordapp.com" || host.endsWith(".discordapp.com");
    } catch {
        return false;
    }
}
