/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findOption, RequiredMessageOption } from "@api/Commands";
import { t } from "@utils/esharqI18n";
import definePlugin from "@utils/types";

/** Convert ASCII to fullwidth characters: "aesthetic" -> "∩╜ü∩╜à∩╜ô∩╜ö∩╜ê∩╜à∩╜ö∩╜ë∩╜â" */
function toFullwidth(text: string): string {
    return text.replace(/[ -~]/g, c =>
        c === " " ? "πÇÇ" : String.fromCharCode(c.charCodeAt(0) + 0xFEE0)
    );
}

export default definePlugin({
    name: "VaporwaveText",
    description: "Adds /vaporwave to turn your message into ∩╜ü∩╜à∩╜ô∩╜ö∩╜ê∩╜à∩╜ö∩╜ë∩╜â fullwidth text.",
    authors: [{ name: "Sharp", id: 0n }],
    dependencies: ["CommandsAPI"],
    commands: [
        {
            name: "vaporwave",
            description: t("╪¡┘ê┘æ┘ä ╪º┘ä┘å╪╡ ╪Ñ┘ä┘ë ╪ú╪¡╪▒┘ü ╪╣╪▒┘è╪╢╪⌐ ∩╜ü∩╜à∩╜ô∩╜ö∩╜ê∩╜à∩╜ö∩╜ë∩╜â", "Convert text to fullwidth ∩╜ü∩╜à∩╜ô∩╜ö∩╜ê∩╜à∩╜ö∩╜ë∩╜â characters"),
            options: [RequiredMessageOption],
            execute: opts => ({
                content: toFullwidth(findOption(opts, "message", ""))
            })
        }
    ]
});