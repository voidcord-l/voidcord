/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findOption, RequiredMessageOption } from "@api/Commands";
import { t } from "@utils/esharqI18n";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "Starify",
    description: "Adds /starify to wrap your message in sparkles ∩╜í∩╛ƒΓÿå.",
    authors: [{ name: "Sharp", id: 0n }],
    dependencies: ["CommandsAPI"],
    commands: [
        {
            name: "starify",
            description: t("╪▓╪«╪▒┘ü ╪▒╪│╪º┘ä╪¬┘â ╪¿╪º┘ä┘å╪¼┘ê┘à", "Decorate your message with sparkles"),
            options: [RequiredMessageOption],
            execute: opts => {
                const text = findOption(opts, "message", "");
                return { content: `Γ£ª∩╛ƒ∩╜íΓïå ${text} Γïå∩╜í∩╛ƒΓ£ª` };
            }
        }
    ]
});