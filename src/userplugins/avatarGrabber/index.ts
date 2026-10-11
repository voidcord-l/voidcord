/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { t } from "@utils/esharqI18n";
import definePlugin from "@utils/types";
import { IconUtils, UserStore } from "@webpack/common";

export default definePlugin({
    name: "AvatarGrabber",
    description: "/avatar grabs the full-resolution avatar of any user (or yourself).",
    authors: [{ name: "Sharp", id: 0n }],
    dependencies: ["CommandsAPI"],
    commands: [
        {
            name: "avatar",
            description: t("╪º╪¡╪╡┘ä ╪╣┘ä┘ë ╪ú┘ü╪º╪¬╪º╪▒ ╪º┘ä┘à╪│╪¬╪«╪»┘à ╪¿╪º┘ä╪¡╪¼┘à ╪º┘ä┘â╪º┘à┘ä", "Get a user's full-size avatar"),
            options: [
                { name: "user", description: t("╪ú┘ü╪º╪¬╪º╪▒ ┘à┘Ä┘å (╪º┘ü╪¬╪▒╪º╪╢┘è╪º┘ï ╪ú┘å╪¬)", "Whose avatar (defaults to you)"), type: ApplicationCommandOptionType.USER }
            ],
            execute: (opts, ctx) => {
                const userId = findOption<string>(opts, "user") ?? UserStore.getCurrentUser()?.id;
                const user = userId ? UserStore.getUser(userId) : null;
                if (!user) {
                    sendBotMessage(ctx.channel.id, { content: t("╪¬╪╣╪░┘æ╪▒ ╪Ñ┘è╪¼╪º╪» ┘ç╪░╪º ╪º┘ä┘à╪│╪¬╪«╪»┘à.", "Couldn't find that user.") });
                    return;
                }
                const url = IconUtils.getUserAvatarURL(user, true, 1024);
                return { content: url };
            }
        }
    ]
});