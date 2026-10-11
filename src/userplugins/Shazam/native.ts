/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcMainInvokeEvent } from "electron";

// Runs in the main process, where Discord's CSP doesn't apply
export async function recognizeSong(_: IpcMainInvokeEvent, apiToken: string, base64Audio: string) {
    try {
        const form = new FormData();
        form.append("api_token", apiToken);
        form.append("return", "spotify,apple_music");
        form.append("file", new Blob([Buffer.from(base64Audio, "base64")]), "audio.webm");

        const res = await fetch("https://api.audd.io/", { method: "POST", body: form });
        const data = await res.json();

        return { status: res.status, data };
    } catch (e) {
        return { status: -1, data: String(e) };
    }
}
