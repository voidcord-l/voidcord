/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isPluginEnabled } from "@api/PluginManager";
import { definePluginSettings } from "@api/Settings";
import { t } from "@utils/esharqI18n";
import { Logger } from "@utils/Logger";
import { isObject } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import { findAll } from "@webpack";
import { FluxDispatcher } from "@webpack/common";

const log = new Logger("FastDiscord");

/* -------------------------------------------------------------------------- */
/*                              Spring / animations                           */
/* -------------------------------------------------------------------------- */

interface SpringModule {
    Globals: {
        assign(options: { skipAnimation: boolean; }): void;
    };
    Springs: object;
}

let springs: SpringModule[] = [];
let started = false;

const isSpringGlobals = (v: unknown): v is SpringModule["Globals"] =>
    isObject(v) && "assign" in v && typeof (v as any).assign === "function";

const isSpringModule = (v: unknown): v is SpringModule => {
    if (!isObject(v)) return false;
    const m = v as Partial<SpringModule>;
    return isSpringGlobals(m.Globals) && isObject(m.Springs);
};

function loadSprings() {
    springs = findAll(isSpringModule);
}

function applySpringSkip(skip: boolean) {
    for (const s of springs) {
        try { s.Globals.assign({ skipAnimation: skip }); } catch (err) { log.warn("spring skip failed", err); }
    }
}

/* -------------------------------------------------------------------------- */
/*                                  CSS layer                                 */
/* -------------------------------------------------------------------------- */

const CSS_ID = "fastdiscord-css";

function buildCss(): string {
    const s = settings.store;
    let css = "";

    if (s.noGifAvatars) {
        css += `
[class*="listItem"] [class*="avatar"] img[src*=".gif"],
[class*="message"] [class*="avatar"] img[src*=".gif"],
[class*="memberInner"] [class*="avatar"] img[src*=".gif"] {
    content: url("");
}
[class*="listItem"] [class*="avatar"] img,
[class*="message"] [class*="avatar"] img,
[class*="memberInner"] [class*="avatar"] img {
    image-rendering: pixelated;
}
`;
    }

    if (s.noAnimatedEmoji) {
        css += `
[class*="emoji"][class*="animated"],
img[class*="emoji"][src*="gif"] {
    animation: none !important;
}
`;
    }

    if (s.noStickers) {
        css += `
[class*="sticker"][class*="lottie"],
[class*="stickerAsset"][class*="animated"] {
    visibility: hidden !important;
}
`;
    }

    if (s.noActivities) {
        css += `
[class*="activity"],
[class*="activityText"],
[class*="Game"] {
    display: none !important;
}
`;
    }

    if (s.noSoundboardPreview) {
        css += `
[class*="soundboardEmoji"]:hover [class*="soundWave"],
[class*="soundboardEmoji"] [class*="soundWave"] {
    animation: none !important;
    opacity: 0 !important;
}
`;
    }

    if (s.reduceBlurEffects) {
        css += `
[class*="backdropFilter"],
[style*="backdrop-filter"] {
    backdrop-filter: none !important;
}
[class*="acrylic"] {
    background-color: var(--background-secondary) !important;
}
`;
    }

    if (s.disableHoverTransitions) {
        css += `
* {
    transition-duration: 0.001s !important;
}
`;
    }

    return css.trim();
}

function injectCss() {
    const css = buildCss();
    let el = document.getElementById(CSS_ID) as HTMLStyleElement | null;
    if (!css) { el?.remove(); return; }
    if (!el) { el = document.createElement("style"); el.id = CSS_ID; document.head?.appendChild(el); }
    el.textContent = css;
}

function removeCss() {
    document.getElementById(CSS_ID)?.remove();
}

/* -------------------------------------------------------------------------- */
/*                          Cache cleaner (low-end mode)                      */
/*                                                                            */
/* IMPORTANT: We do NOT touch MessageStore._channelMessages directly because  */
/* MessageLoggerEnhanced monkey-patches MessageStore.getMessage and maintains  */
/* its own cache (combinedMessageCache). Deleting raw store entries bypasses   */
/* this patch ΓåÆ stale references ΓåÆ crash on DM load.                          */
/*                                                                            */
/* Instead, we only force the native GC, which is sufficient to free memory   */
/* without corrupting the internal state of the stores.                       */
/* -------------------------------------------------------------------------- */

let cacheCleanerInterval: ReturnType<typeof setInterval> | null = null;

function forceGC() {
    try {
        if (typeof (window as any).gc === "function") {
            (window as any).gc();
            setTimeout(() => {
                try { if (typeof (window as any).gc === "function") (window as any).gc(); } catch (err) { log.debug("Ignored error", err); }
            }, 100);
        }
    } catch (err) { log.debug("Ignored error", err); }
}

function cacheCleanIntervalMs(): number {
    return settings.store.lowEndMode ? 90 * 1000 : 5 * 60 * 1000;
}

function startCacheCleaner() {
    stopCacheCleaner();
    cacheCleanerInterval = setInterval(() => {
        if (!settings.store.limitMsgCache) return;
        // Only use the native GC ΓÇö no direct manipulation of MessageStore
        forceGC();
    }, cacheCleanIntervalMs());
}

function stopCacheCleaner() {
    if (cacheCleanerInterval !== null) {
        clearInterval(cacheCleanerInterval);
        cacheCleanerInterval = null;
    }
}

/* -------------------------------------------------------------------------- */
/*                       Background RAF throttle (FPS)                        */
/* -------------------------------------------------------------------------- */

let origRAF: typeof requestAnimationFrame | null = null;
let origCancelRAF: typeof cancelAnimationFrame | null = null;
let bgFpsActive = false;
const rafMap = new Map<number, ReturnType<typeof setTimeout>>();
let rafSeq = 0;

function bgFrameIntervalMs(): number {
    return settings.store.lowEndMode ? 200 : 100;
}

function onVisibilityChange() {
    if (document.hidden) {
        installRafThrottle();
        forceGC();
    } else if (document.hasFocus()) {
        uninstallRafThrottle();
    }
}

function onWindowBlur() {
    installRafThrottle();
    forceGC();
}

function onWindowFocus() {
    if (!document.hidden) uninstallRafThrottle();
}

function applyBgFpsPatch(enable: boolean) {
    if (enable && !bgFpsActive) {
        bgFpsActive = true;
        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("blur", onWindowBlur);
        window.addEventListener("focus", onWindowFocus);
        if (document.hidden || !document.hasFocus()) installRafThrottle();
    } else if (!enable && bgFpsActive) {
        bgFpsActive = false;
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("blur", onWindowBlur);
        window.removeEventListener("focus", onWindowFocus);
        uninstallRafThrottle();
    }
}

function installRafThrottle() {
    if (origRAF || !bgFpsActive) return;
    origRAF = window.requestAnimationFrame;
    origCancelRAF = window.cancelAnimationFrame;
    let lastT = 0;

    (window as any).requestAnimationFrame = function (cb: FrameRequestCallback) {
        const id = ++rafSeq;
        const now = performance.now();
        const delay = Math.max(0, bgFrameIntervalMs() - (now - lastT));
        const tId = setTimeout(() => {
            rafMap.delete(id);
            lastT = performance.now();
            cb(performance.now());
        }, delay);
        rafMap.set(id, tId);
        return id;
    };

    window.cancelAnimationFrame = function (id: number) {
        const tId = rafMap.get(id);
        if (tId !== undefined) {
            clearTimeout(tId);
            rafMap.delete(id);
        } else if (origCancelRAF) {
            origCancelRAF(id);
        }
    };
}

function uninstallRafThrottle() {
    if (!origRAF) return;
    window.requestAnimationFrame = origRAF;
    if (origCancelRAF) window.cancelAnimationFrame = origCancelRAF;
    origRAF = null;
    origCancelRAF = null;
    for (const tId of rafMap.values()) clearTimeout(tId);
    rafMap.clear();
}

/* -------------------------------------------------------------------------- */
/*                  Network: debounce presence updates                         */
/* -------------------------------------------------------------------------- */

const PRESENCE_DISPATCH_TYPES = new Set([
    "LOCAL_ACTIVITY_UPDATE",
    "RUNNING_GAMES_CHANGE",
]);

let origFluxDispatch: ((event: any) => unknown) | null = null;
const pendingPresenceDispatch = new Map<string, { event: any; timer: ReturnType<typeof setTimeout>; }>();

function presenceDebounceMs(): number {
    return 8000;
}

function flushPresenceDispatch(type: string) {
    const pending = pendingPresenceDispatch.get(type);
    if (!pending) return;
    pendingPresenceDispatch.delete(type);
    try {
        origFluxDispatch?.call(FluxDispatcher, pending.event);
    } catch (err) {
        log.warn("flush presence dispatch failed", err);
    }
}

function patchedDispatch(event: any) {
    if (!settings.store.throttlePresence || !event || !PRESENCE_DISPATCH_TYPES.has(event.type)) {
        return origFluxDispatch?.call(FluxDispatcher, event);
    }

    const existing = pendingPresenceDispatch.get(event.type);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => flushPresenceDispatch(event.type), presenceDebounceMs());
    pendingPresenceDispatch.set(event.type, { event, timer });
}

function applyPresenceThrottle(enable: boolean) {
    if (enable && !origFluxDispatch) {
        origFluxDispatch = FluxDispatcher.dispatch.bind(FluxDispatcher);
        (FluxDispatcher as any).dispatch = patchedDispatch;
    } else if (!enable && origFluxDispatch) {
        for (const type of Array.from(pendingPresenceDispatch.keys())) {
            const pending = pendingPresenceDispatch.get(type)!;
            clearTimeout(pending.timer);
            try { origFluxDispatch.call(FluxDispatcher, pending.event); } catch (err) { log.debug("Ignored error", err); }
        }
        pendingPresenceDispatch.clear();
        (FluxDispatcher as any).dispatch = origFluxDispatch;
        origFluxDispatch = null;
    }
}

/* -------------------------------------------------------------------------- */
/*                                  Settings                                  */
/* -------------------------------------------------------------------------- */

const settings = definePluginSettings({
    disableSpringAnimations: {
        type: OptionType.BOOLEAN,
        description: t("╪¬╪╣╪╖┘è┘ä ╪¡╪▒┘â╪º╪¬ ╪º┘ä╪▓┘å╪¿╪▒┘â ┘ü┘è ╪º┘ä┘ê╪º╪¼┘ç╪⌐ (╪º┘ä╪ú╪▓╪▒╪º╪▒╪î ╪º┘ä┘å┘ê╪º┘ü╪░╪î ╪º┘ä╪º┘å╪¬┘é╪º┘ä╪º╪¬)", "Disable spring animations in the UI (buttons, modals, transitions)"),
        default: true,
        disabled: () => isPluginEnabled("DisableAnimations"),
        onChange(val: boolean) {
            if (!started) return;
            if (val && springs.length === 0) loadSprings();
            applySpringSkip(val);
        }
    },
    noGifAvatars: {
        type: OptionType.BOOLEAN,
        description: t("┘à┘å╪╣ ╪╡┘ê╪▒ GIF ╪º┘ä┘à╪¬╪¡╪▒┘â╪⌐ ┘ü┘è ╪º┘ä┘é┘ê╪º╪ª┘à ┘ê╪º┘ä╪▒╪│╪º╪ª┘ä (╪╣╪¿╪▒ CSS)", "Block animated GIF avatars in lists and messages (via CSS)"),
        default: true,
        onChange() { if (started) injectCss(); }
    },
    noAnimatedEmoji: {
        type: OptionType.BOOLEAN,
        description: t("╪¬╪╣╪╖┘è┘ä ╪¡╪▒┘â╪º╪¬ ╪Ñ┘è┘à┘ê╪¼┘è ╪»┘è╪│┘â┘ê╪▒╪»", "Disable Discord emoji animations"),
        default: false,
        onChange() { if (started) injectCss(); }
    },
    noStickers: {
        type: OptionType.BOOLEAN,
        description: t("┘à┘å╪╣ ╪¬╪┤╪║┘è┘ä ┘à┘ä╪╡┘é╪º╪¬ Lottie ╪º┘ä┘à╪¬╪¡╪▒┘â╪⌐ ╪¬┘ä┘é╪º╪ª┘è╪º┘ï", "Prevent Lottie animated stickers from autoplaying"),
        default: false,
        restartNeeded: true
    },
    noActivities: {
        type: OptionType.BOOLEAN,
        description: t("╪Ñ╪«┘ü╪º╪í ┘é╪│┘à ╪º┘ä╪ú┘å╪┤╪╖╪⌐ (╪º┘ä╪ú┘ä╪╣╪º╪¿╪î Spotify╪î ╪Ñ┘ä╪«) ┘ü┘è ┘ä┘ê╪¡╪⌐ ╪º┘ä╪ú╪╣╪╢╪º╪í", "Hide the Activities section (games, Spotify, etc.) in the members panel"),
        default: false,
        onChange() { if (started) injectCss(); }
    },
    noVideoAutoplay: {
        type: OptionType.BOOLEAN,
        description: t("┘à┘å╪╣ ╪º┘ä╪¬╪┤╪║┘è┘ä ╪º┘ä╪¬┘ä┘é╪º╪ª┘è ┘ä┘ä┘ü┘è╪»┘è┘ê┘ç╪º╪¬ ╪º┘ä┘à╪╢┘à┘æ┘å╪⌐ ┘ü┘è ╪º┘ä╪▒╪│╪º╪ª┘ä", "Block autoplay of embedded videos in messages"),
        default: false,
        restartNeeded: true
    },
    noSoundboardPreview: {
        type: OptionType.BOOLEAN,
        description: t("╪¬╪╣╪╖┘è┘ä ┘à╪╣╪º┘è┘å╪⌐ ╪╡┘ê╪¬ ┘ä┘ê╪¡╪⌐ ╪º┘ä╪ú╪╡┘ê╪º╪¬ ╪╣┘å╪» ╪º┘ä╪¬┘à╪▒┘è╪▒", "Disable soundboard audio preview on hover"),
        default: true,
        restartNeeded: true
    },
    reduceBlurEffects: {
        type: OptionType.BOOLEAN,
        description: t("╪¬╪╣╪╖┘è┘ä ╪¬╪ú╪½┘è╪▒╪º╪¬ ╪º┘ä╪╢╪¿╪º╪¿┘è╪⌐ ╪º┘ä┘à┘â┘ä┘ü╪⌐ (backdrop-filter) ┘ä╪ú╪»╪º╪í ╪ú┘ü╪╢┘ä", "Disable expensive blur effects (backdrop-filter) for better performance"),
        default: true,
        onChange() { if (started) injectCss(); }
    },
    disableHoverTransitions: {
        type: OptionType.BOOLEAN,
        description: t("╪¼╪╣┘ä ┘â┘ä ╪º┘å╪¬┘é╪º┘ä╪º╪¬ CSS ╪╣┘å╪» ╪º┘ä╪¬┘à╪▒┘è╪▒ ┘ü┘ê╪▒┘è╪⌐", "Make all CSS hover transitions instant"),
        default: false,
        onChange() { if (started) injectCss(); }
    },
    limitMsgCache: {
        type: OptionType.BOOLEAN,
        description: t("╪º╪│╪¬╪»╪╣╪º╪í ╪»┘ê╪▒┘è ┘ä╪¼╪º┘à╪╣ ╪º┘ä┘é┘à╪º┘à╪⌐ ┘ä╪¬╪¡╪▒┘è╪▒ ╪░╪º┘â╪▒╪⌐ ╪º┘ä╪▒╪│╪º╪ª┘ä", "Periodically call the native GC to free message memory"),
        default: true,
        onChange(v: boolean) { if (!started) return; if (!v) stopCacheCleaner(); else startCacheCleaner(); }
    },
    reduceFpsBackground: {
        type: OptionType.BOOLEAN,
        description: t("╪¬┘é┘è┘è╪» ╪▒╪│┘à ╪º┘ä╪¬╪╖╪¿┘è┘é ┘ä╪¿╪╢╪╣╪⌐ ╪Ñ╪╖╪º╪▒╪º╪¬ ╪╣┘å╪»┘à╪º ╪¬┘â┘ê┘å ╪º┘ä┘å╪º┘ü╪░╪⌐ ┘ü┘è ╪º┘ä╪«┘ä┘ü┘è╪⌐", "Limit app rendering to a few FPS when the window is in the background"),
        default: true,
        onChange(v: boolean) { if (started) applyBgFpsPatch(v); }
    },
    throttlePresence: {
        type: OptionType.BOOLEAN,
        description: t("╪¬┘é┘ä┘è┘ä ╪¬┘â╪▒╪º╪▒ ╪Ñ╪▒╪│╪º┘ä ╪¬╪¡╪»┘è╪½╪º╪¬ ╪º┘ä╪¡╪╢┘ê╪▒/╪º┘ä┘å╪┤╪º╪╖ (╪º┘ä┘ä╪╣╪¿╪⌐╪î Spotify) ┘ä┘ä╪«╪º╪»┘à╪î ┘à┘à╪º ┘è┘ê┘ü┘æ╪▒ ╪╖┘ä╪¿╪º╪¬ ╪º┘ä╪┤╪¿┘â╪⌐. ╪│╪¬┘â┘ê┘å ╪¡╪º┘ä╪¬┘â ╪ú┘é┘ä ╪¬╪¡╪»┘è╪½╪º┘ï ┘ä┘ä╪ó╪«╪▒┘è┘å.", "Reduce how often presence/activity updates (game, Spotify) are sent to the server, saving network requests. Your status will be less up-to-date for others."),
        default: false,
        onChange(v: boolean) { if (started) applyPresenceThrottle(v); }
    },
    lowEndMode: {
        type: OptionType.BOOLEAN,
        description: t("┘ê╪╢╪╣ ╪º┘ä╪ú╪¼┘ç╪▓╪⌐ ╪º┘ä╪╢╪╣┘è┘ü╪⌐: ╪¼┘à╪╣ ┘é┘à╪º┘à╪⌐ ╪ú┘â╪½╪▒ ╪¬┘â╪▒╪º╪▒╪º┘ï ┘ê╪Ñ╪╖╪º╪▒╪º╪¬ ╪«┘ä┘ü┘è╪⌐ ╪ú┘é┘ä", "Low-end PC mode: more frequent GC and lower background FPS"),
        default: false,
        onChange(_v: boolean) {
            if (!started) return;
            if (settings.store.limitMsgCache) startCacheCleaner();
            if (bgFpsActive) { applyBgFpsPatch(false); applyBgFpsPatch(true); }
        }
    },
});

/* -------------------------------------------------------------------------- */
/*                                   Plugin                                   */
/* -------------------------------------------------------------------------- */

export default definePlugin({
    name: "FastDiscord",
    description: "Maximizes app smoothness and responsiveness: animations, media, memory cache, background FPS, and network (presence) are all optimized. Disabled by default; everything returns to normal once disabled.",
    authors: [{ name: ">Snayz", id: 1361345963175968779n }],
    tags: ["Utility", "Appearance"],
    searchTerms: ["performance", "optimization", "lag", "fps", "ram", "memory", "low-end", "fluide", "rapide", "latence"],
    settings,

    patches: [
        // The typing-dots patch lived here as a byte-identical copy of the core
        // NoTypingAnimation plugin, guarded by a predicate that already admitted the
        // duplication. On current Discord it produced invalid JS ("Invalid left-hand
        // side in assignment") and the module failed to evaluate, so it was removed ΓÇö
        // enable NoTypingAnimation for that feature instead.

        // Disable video autoplay ΓÇö strict regex to avoid touching other modules
        {
            find: "autoplay:!0",
            predicate: () => settings.store.noVideoAutoplay,
            replacement: {
                match: /autoplay:!0/g,
                replace: "autoplay:!1"
            }
        },
        // Disable soundboard preview on hover
        {
            find: "soundboard_sound_hover",
            predicate: () => settings.store.noSoundboardPreview,
            replacement: {
                match: /onMouseEnter:\s*\(\)\s*=>\s*\{[^}]*play[^}]*\}/,
                replace: "onMouseEnter:()=>{}"
            }
        },
        // Disable animated Lottie stickers
        {
            find: /StickerType\.STANDARD/,
            predicate: () => settings.store.noStickers,
            replacement: {
                match: /shouldAnimate:!0/g,
                replace: "shouldAnimate:!1"
            }
        },
    ],

    start() {
        started = true;

        if (settings.store.disableSpringAnimations && !isPluginEnabled("DisableAnimations")) {
            loadSprings();
            applySpringSkip(true);
        }

        injectCss();

        if (settings.store.limitMsgCache) startCacheCleaner();
        if (settings.store.reduceFpsBackground) applyBgFpsPatch(true);
        if (settings.store.throttlePresence) applyPresenceThrottle(true);

        log.info("FastDiscord enabled: applying optimizations.");
    },

    stop() {
        started = false;

        if (springs.length !== 0 && !isPluginEnabled("DisableAnimations")) {
            applySpringSkip(false);
        }
        springs = [];

        removeCss();
        stopCacheCleaner();
        applyBgFpsPatch(false);
        applyPresenceThrottle(false);

        log.info("FastDiscord disabled: everything restored to normal.");
    }
});