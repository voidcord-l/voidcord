/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "@utils/esharqI18n";
import definePlugin from "@utils/types";

const VIBES = [
    "Γ£ª the vibes are immaculate Γ£ª",
    "≡ƒî┤ endless summer, endless mall ≡ƒî┤",
    "≡ƒô╝ rewinding to a time that never was ≡ƒô╝",
    "≡ƒ¢ì∩╕Å welcome to the mall, population: you ≡ƒ¢ì∩╕Å",
    "≡ƒîà chasing a sunset that never sets ≡ƒîà",
    "≡ƒÆ╛ saving your aesthetic... done ≡ƒÆ╛",
    "≡ƒ¬⌐ disco ball energy detected ≡ƒ¬⌐",
    "≡ƒîè floating on a sea of neon ≡ƒîè",
    "ΓÿÄ∩╕Å this call is being routed through 1987 ΓÿÄ∩╕Å",
    "≡ƒì╣ sipping something pink by the fountain ≡ƒì╣",
];

export default definePlugin({
    name: "VibeCheck",
    description: "Adds /vibe to drop a random vaporwave mood into chat.",
    authors: [{ name: "Sharp", id: 0n }],
    dependencies: ["CommandsAPI"],
    commands: [
        {
            name: "vibe",
            description: t("╪ú╪▒╪│┘ä ┘à╪▓╪º╪¼ vaporwave ╪╣╪┤┘ê╪º╪ª┘è╪º┘ï", "Send a random vaporwave vibe"),
            options: [],
            execute: () => ({
                content: VIBES[Math.floor(Math.random() * VIBES.length)]
            })
        }
    ]
});