/*
 * ProfileVisibility ΓÇö ╪Ñ╪┤╪▒╪º┘é / Esharq
 * Copyright (c) 2026 LOSTSTR
 *
 * ╪▓╪▒┘æ ┘ü┘è ╪º┘ä╪┤╪▒┘è╪╖ ╪º┘ä╪╣┘ä┘ê┘è ┘è╪¿╪»┘æ┘ä ╪«╪╡┘ê╪╡┘è╪⌐ ╪╕┘ç┘ê╪▒ ┘à┘ä┘ü┘â ╪º┘ä╪┤╪«╪╡┘è ┘ü┘è ╪»┘è╪│┘â┘ê╪▒╪» ╪¿┘è┘å ┬½╪«╪º╪╡┬╗
 * (╪º┘ä╪ú╪╡╪»┘é╪º╪í ┘ü┘é╪╖) ┘ê┬½╪╕╪º┘ç╪▒ ┘ä┘â┘ä ╪º┘ä╪«┘ê╪º╪»┘à┬╗. ╪º┘ä╪Ñ╪╣╪»╪º╪» ┘è┘Å╪¡┘ü┘Ä╪╕ ┘ü┘è ╪¡╪│╪º╪¿ ╪»┘è╪│┘â┘ê╪▒╪» ┘å┘ü╪│┘ç
 * ┘ü┘è╪¿┘é┘ë ╪½╪º╪¿╪¬╪º┘ï ╪╣╪¿╪▒ ╪Ñ╪╣╪º╪»╪⌐ ╪º┘ä╪¬╪┤╪║┘è┘ä.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { HeaderBarButton } from "@api/HeaderBar";
import { useSettings } from "@api/Settings";
import { getUserSetting } from "@api/UserSettings";
import { EquicordDevs } from "@utils/constants";
import { t } from "@utils/esharqI18n";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { wreq } from "@webpack";
import { Toasts } from "@webpack/common";

// ┘é┘è┘à ProfileVisibilityType (┘à╪¡┘é┘Ä┘æ┘é╪⌐ ┘à┘å ╪¬┘ê╪½┘è┘é ╪¿╪▒┘ê╪¬┘ê ╪Ñ╪╣╪»╪º╪»╪º╪¬ ╪º┘ä┘à╪│╪¬╪«╪»┘à):
//   0 UNSET (= 3) ┬╖ 1 FRIENDS_ONLY ┬╖ 2 FRIENDS_AND_SMALL_GUILDS ┬╖ 3 FRIENDS_AND_ALL_GUILDS
const PRIVATE = 1; // ╪º┘ä╪ú╪╡╪»┘é╪º╪í ┘ü┘é╪╖ ΓÇö ╪ú┘é╪╡┘ë ╪«╪╡┘ê╪╡┘è╪⌐ (┘è┘Å╪«┘ü┘è ╪º┘ä┘à┘ä┘ü ╪╣┘å ┘â┘ä ╪º┘ä╪«┘ê╪º╪»┘à)
const OPEN = 3;    // ╪º┘ä╪ú╪╡╪»┘é╪º╪í + ┘â┘ä ╪º┘ä╪«┘ê╪º╪»┘à (╪º┘ä╪º┘ü╪¬╪▒╪º╪╢┘è)

const logger = new Logger("ProfileVisibility");

interface SettingAccessor {
    getSetting(): number;
    updateSetting(value: number): Promise<void>;
    useSetting(): number;
}

// ┘å╪¡┘ä┘æ ┘à┘Å╪¡╪»┘É┘æ╪» ╪º┘ä╪Ñ╪╣╪»╪º╪» ("privacy","profileVisibility") = ┘å┘ü╪│ ┘à╪º ┘è┘ü╪╣┘ä┘ç ╪│┘â╪▒╪¿╪¬ ╪º┘ä┘â┘ê┘å╪│┘ê┘ä.
// ╪º┘ä┘à╪│╪º╪▒ ╪º┘ä╪│╪▒┘è╪╣: ┘ê╪º╪¼┘ç╪⌐ UserSettingsAPI (┘ê╪¡╪»╪⌐ ╪º┘ä╪Ñ╪╣╪»╪º╪»╪º╪¬ ╪º┘ä┘à┘ê╪¡┘æ╪»╪⌐). ┘ü╪Ñ┘å ┘ä┘à ╪¬╪¼╪»┘ç ┘ç┘å╪º┘â
// (┘é╪» ╪¬┘â┘ê┘å ┘à╪¼┘à┘ê╪╣╪⌐ privacy ┘ü┘è ┘ê╪¡╪»╪⌐ ╪ú╪«╪▒┘ë) ┘å┘à╪│╪¡ ┘ê╪¡╪»╪º╪¬ ╪º┘ä┘Çwebpack ┘è╪»┘ê┘è╪º┘ï ╪¬┘à╪º┘à╪º┘ï ┘â╪º┘ä╪│┘â╪▒╪¿╪¬ ΓÇö
// ┘è┘Å╪¡┘ä┘æ ┘à╪▒┘æ╪⌐ ┘ê╪º╪¡╪»╪⌐ ┘ê┘è┘Å╪«╪▓┘Ä┘æ┘å. ┘ç┘â╪░╪º ┘è╪╣┘à┘ä ╪¿╪╡╪▒┘ü ╪º┘ä┘å╪╕╪▒ ╪╣┘å ┘â┘è┘ü┘è╪⌐ ╪¬╪¼┘à┘è╪╣ ╪»┘è╪│┘â┘ê╪▒╪» ┘ä┘ä┘ê╪¡╪»╪º╪¬.
let resolved: SettingAccessor | undefined;
let tried = false;

function scanWebpack(): SettingAccessor | undefined {
    const modules = (wreq as any)?.m;
    if (modules == null) return undefined;
    for (const id in modules) {
        let src: string;
        try { src = modules[id].toString(); } catch { continue; }
        if (!src.includes("profileVisibility")) continue;

        const v = src.match(/(?:^|[;,])\s*(?:let|const|var)?\s*([A-Za-z_$][\w$]*)\s*=\s*[A-Za-z_$][\w$]*\(\s*["']privacy["']\s*,\s*["']profileVisibility["']/)?.[1];
        const e = v && src.match(new RegExp(`([A-Za-z_$][\\w$]*)\\s*:\\s*\\(\\)\\s*=>\\s*${v}\\b`))?.[1];
        if (!e) continue;

        try {
            const exp = (wreq as any)(id)?.[e];
            if (exp?.updateSetting) return exp as SettingAccessor;
        } catch { /* ┘ê╪º╪╡┘ä ╪º┘ä┘à╪│╪¡ */ }
    }
    return undefined;
}

function setting(): SettingAccessor | undefined {
    if (tried) return resolved;
    tried = true;
    try {
        const api = getUserSetting<number>("privacy", "profileVisibility");
        if (api?.updateSetting) resolved = api as unknown as SettingAccessor;
    } catch (e) {
        logger.warn("UserSettingsAPI lookup failed, falling back to webpack scan", e);
    }
    resolved ??= scanWebpack();
    if (resolved == null) logger.error("profileVisibility setting not found.");
    return resolved;
}

interface IconProps { width?: number; height?: number; color?: string; }

// ┘é┘ü┘ä ┘à┘Å╪║┘ä┘Ä┘é = ╪«╪º╪╡ (╪ú╪«╪╢╪▒ ┬½┘à╪¡┘à┘è┘æ┬╗ ┘ä┘è╪╕┘ç╪▒ ╪¿┘ê╪╢┘ê╪¡ ╪ú┘å ╪º┘ä┘ê╪╢╪╣ ╪º┘ä╪«╪º╪╡ ┘à┘Å┘ü╪╣┘Ä┘æ┘ä)
function LockClosedIcon({ width = 18, height = 18 }: IconProps) {
    return (
        <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="var(--text-positive, #3ba55c)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
    );
}

// ┘é┘ü┘ä ┘à┘ü╪¬┘ê╪¡ = ╪╕╪º┘ç╪▒
function LockOpenIcon({ width = 18, height = 18, color = "currentColor" }: IconProps) {
    return (
        <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V6.5a4 4 0 0 1 7.6-1.7" />
        </svg>
    );
}

async function toggle(s: SettingAccessor, currentlyPrivate: boolean) {
    const next = currentlyPrivate ? OPEN : PRIVATE;
    try {
        await s.updateSetting(next);
        Toasts.show({
            type: Toasts.Type.SUCCESS,
            message: next === PRIVATE
                ? t("┘à┘ä┘ü┘â ╪º┘ä╪ó┘å ╪«╪º╪╡ ΓÇö ╪¬┘ü╪º╪╡┘è┘ä┘â ┘ä┘ä╪ú╪╡╪»┘é╪º╪í ┘ü┘é╪╖", "Profile is now private ΓÇö your details are Friends-Only")
                : t("┘à┘ä┘ü┘â ╪º┘ä╪ó┘å ╪╕╪º┘ç╪▒ ┘ä╪«┘ê╪º╪»┘à┘â ┘ê╪ú╪╡╪»┘é╪º╪ª┘â", "Your profile is now visible to your servers and friends"),
            id: Toasts.genId()
        });
    } catch (e) {
        logger.error("Failed to update profileVisibility", e);
        Toasts.show({
            type: Toasts.Type.FAILURE,
            message: t("╪¬╪╣╪░┘æ╪▒ ╪¬╪║┘è┘è╪▒ ╪╕┘ç┘ê╪▒ ╪º┘ä┘à┘ä┘ü", "Couldn't change profile visibility"),
            id: Toasts.genId()
        });
    }
}

function ProfileVisibilityButton() {
    // ╪Ñ╪╣╪º╪»╪⌐ ╪º┘ä╪▒╪│┘à ╪╣┘å╪» ╪¬╪¿╪»┘è┘ä ┘ä╪║╪⌐ ╪º┘ä┘ê╪º╪¼┘ç╪⌐ ╪¡╪¬┘ë ┘è╪¬╪¡╪»┘æ╪½ ╪º┘ä╪¬┘ä┘à┘è╪¡ ┘ü┘ê╪▒╪º┘ï.
    useSettings(["plugins.Settings.arabicMode"]);

    const s = setting();
    if (s == null) return null;

    const isPrivate = s.useSetting() === PRIVATE;

    return (
        <HeaderBarButton
            icon={isPrivate ? LockClosedIcon : LockOpenIcon}
            tooltip={isPrivate
                ? t("┘à┘ä┘ü┘â ╪«╪º╪╡ ΓÇö ╪º┘ä╪¬┘ü╪º╪╡┘è┘ä ┘ä┘ä╪ú╪╡╪»┘é╪º╪í ┘ü┘é╪╖ ┬╖ ╪º╪╢╪║╪╖ ┘ä┘ä╪Ñ╪╕┘ç╪º╪▒", "Profile private ΓÇö details Friends-Only ┬╖ click to show")
                : t("┘à┘ä┘ü┘â ╪╕╪º┘ç╪▒ ┘ä╪«┘ê╪º╪»┘à┘â ┬╖ ╪º╪╢╪║╪╖ ┘ä╪¼╪╣┘ä┘ç ╪«╪º╪╡╪º┘ï", "Profile visible to your servers ┬╖ click to make private")}
            aria-label={t("╪╕┘ç┘ê╪▒ ╪º┘ä┘à┘ä┘ü ╪º┘ä╪┤╪«╪╡┘è", "Profile visibility")}
            selected={isPrivate}
            onClick={() => toggle(s, isPrivate)}
        />
    );
}

export default definePlugin({
    name: "ProfileVisibility",
    description: "Toggle your Discord profile visibility (private ΓÇö Friends Only ΓÇö vs visible to all servers) with a button in the top bar.",
    authors: [EquicordDevs.LOSTSTR],
    tags: ["Privacy", "Shortcuts"],
    dependencies: ["UserSettingsAPI", "HeaderBarAPI"],

    headerBarButton: {
        icon: LockClosedIcon,
        render: ProfileVisibilityButton,
    },
});