/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

// Ø§Ù„Ø£ÙˆØµØ§Ù Ù‡Ù†Ø§ Ø¨Ø§Ù„Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠØ©Ø› Ø§Ù„Ø¹Ø±Ø¨ÙŠØ© ØªØ£ØªÙŠ Ù…Ù† overlay (src/i18n/plugins/PerformanceBoost.ts).
// definePluginSettings ÙŠØ­ÙØ¸ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ (Ù„Ø§ localStorage).
export const settings = definePluginSettings({
    // Ù…Ù„Ø§Ø­Ø¸Ø©: Ù„Ø§ ØªÙØ³Ù…ÙÙ‘ Ù‡Ø°Ø§ "enabled" â€” Settings.plugins[name].enabled Ù…Ø­Ø¬ÙˆØ² Ù„Ø¹Ù„ÙŽÙ… ØªÙØ¹ÙŠÙ„ Ø§Ù„Ø¥Ø¶Ø§ÙØ© Ù†ÙØ³Ù‡Ø§ ÙÙŠ Vencord
    gameMode: {
        type: OptionType.BOOLEAN, default: false,
        description: "Enable performance / game mode"
    },
    // Ø§ÙØªØ±Ø§Ø¶ÙŠØ§Ù‹ Ù…ÙØ·ÙØ£: Ø­Ø±ÙŠØ© ÙƒØ§Ù…Ù„Ø© Ù„Ù„Ù…Ø³ØªØ®Ø¯Ù… â€” Ù„Ø§ ØªÙØ¹ÙŠÙ„ ØªÙ„Ù‚Ø§Ø¦ÙŠ Ø¥Ù„Ø§ Ø¥Ù† Ø·Ù„Ø¨Ù‡ ØµØ±Ø§Ø­Ø©Ù‹.
    autoDetectGames: {
        type: OptionType.BOOLEAN, default: false,
        description: "Automatically enable when a game is detected"
    },
    reduceHardwareAcceleration: {
        type: OptionType.BOOLEAN, default: true,
        description: "Disable hardware acceleration (requires a AtlasXGOD restart)"
    },
    // Ø¬Ø¯ÙŠØ¯: Ø¹Ù†Ø¯ ØªÙØ¹ÙŠÙ„ Ø®ÙØ¶ ØªØ³Ø±ÙŠØ¹ Ø§Ù„Ø¹ØªØ§Ø¯ØŒ Ø§Ø¹Ø±Ø¶ ØªÙ†Ø¨ÙŠÙ‡Ø§Ù‹ Ø¨Ø²Ø±Ù‘ Ø¥Ø¹Ø§Ø¯Ø© ØªØ´ØºÙŠÙ„ (Ù„ÙŠÙØ·Ø¨ÙŽÙ‘Ù‚ Ø§Ù„ØªØºÙŠÙŠØ± Ø§Ù„ÙŠØ¯ÙˆÙŠ)
    autoRestartOnHardwareChange: {
        type: OptionType.BOOLEAN, default: true,
        description: "Offer to restart AtlasXGOD so a hardware-acceleration change takes effect"
    },
    disableAnimations: {
        type: OptionType.BOOLEAN, default: true,
        description: "Disable animations and transitions"
    },
    disableGifAutoplay: {
        type: OptionType.BOOLEAN, default: true,
        description: "Stop GIFs from autoplaying"
    },
    compactMode: {
        type: OptionType.BOOLEAN, default: true,
        description: "Use compact message mode"
    },
    hideActivities: {
        type: OptionType.BOOLEAN, default: true,
        description: "Hide friends' activities (Active Now)"
    },
    changeProcessPriority: {
        type: OptionType.BOOLEAN, default: true,
        description: "Lower all AtlasXGOD processes' priority to Below Normal (Windows)"
    },
    cleanCacheOnStart: {
        type: OptionType.BOOLEAN, default: false,
        description: "Clean AtlasXGOD's cache when game mode starts"
    }
});
