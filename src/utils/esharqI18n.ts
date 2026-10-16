/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function isArabicMode(): boolean {
    try {
        return typeof navigator !== "undefined" && /^ar\b/i.test(navigator.language ?? "");
    } catch {
        return false;
    }
}

export function t(arabic: string, english: string): string {
    return isArabicMode() ? arabic : english;
}
