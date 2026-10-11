/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";
import { EquicordDevs } from "@utils/constants";
import { t } from "@utils/esharqI18n";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";

// Discord's own authentication-token module (standard, specific finder: it owns
// both getToken and hideToken). We ONLY read via getToken() ΓÇö no localStorage,
// no webpack scanning, no fetch interception. If the module can't be found the
// command degrades to a friendly "couldn't retrieve" with no side effects.
const TokenModule = findByPropsLazy("getToken", "hideToken");

export default definePlugin({
    name: "MyToken",
    description: "Adds a /mytoken command that privately shows your own account token (only you can see it ΓÇö it is never sent anywhere).",
    authors: [EquicordDevs.LOSTSTR],
    tags: ["Privacy", "Utility"],
    dependencies: ["CommandsAPI"],
    commands: [
        {
            name: "mytoken",
            description: t("┘è╪╣╪▒╪╢ ╪¬┘ê┘â┘å ╪¡╪│╪º╪¿┘â ╪ú┘å╪¬ ┘ü┘é╪╖ (┘ä╪º ╪¬╪┤╪º╪▒┘â┘ç ┘à╪╣ ╪ú╪¡╪»)", "Shows your own account token (never share it with anyone)"),
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: (_, ctx) => {
                const token = TokenModule?.getToken?.();

                if (typeof token !== "string" || !token) {
                    sendBotMessage(ctx.channel.id, {
                        content: t("╪¬╪╣╪░┘æ╪▒ ╪º┘ä╪¡╪╡┘ê┘ä ╪╣┘ä┘ë ╪º┘ä╪¬┘ê┘â┘å.", "Couldn't retrieve the token.")
                    });
                    return;
                }

                // sendBotMessage is LOCAL-ONLY (a client-side Clyde message) ΓÇö the
                // token is shown only in your own client and is never transmitted.
                sendBotMessage(ctx.channel.id, {
                    content: t(
                        `ΓÜá∩╕Å **┘ä╪º ╪¬╪┤╪º╪▒┘â ┘ç╪░╪º ╪º┘ä╪¬┘ê┘â┘å ┘à╪╣ ╪ú╪¡╪» ΓÇö ┘à┘å ┘è┘à┘ä┘â┘ç ┘è┘à┘ä┘â ╪¡╪│╪º╪¿┘â ╪¿╪º┘ä┘â╪º┘à┘ä.**\n\`\`\`\n${token}\n\`\`\``,
                        `ΓÜá∩╕Å **Never share this token with anyone ΓÇö whoever has it fully controls your account.**\n\`\`\`\n${token}\n\`\`\``
                    )
                });
            }
        }
    ]
});