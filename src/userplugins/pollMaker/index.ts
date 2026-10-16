/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { t } from "@utils/esharqI18n";
import definePlugin from "@utils/types";

const NUMBERS = ["1∩╕ÅΓâú", "2∩╕ÅΓâú", "3∩╕ÅΓâú", "4∩╕ÅΓâú", "5∩╕ÅΓâú", "6∩╕ÅΓâú", "7∩╕ÅΓâú", "8∩╕ÅΓâú", "9∩╕ÅΓâú", "≡ƒöƒ"];

export default definePlugin({
    name: "PollMaker",
    description: "/poll formats a quick poll. Use: question | option | option ...",
    authors: [{ name: "Dann", id: 0n }],
    dependencies: ["CommandsAPI"],
    commands: [
        {
            name: "poll",
            description: t("╪ú┘å╪┤╪ª ╪º╪│╪¬╪╖┘ä╪º╪╣╪º┘ï: ╪º┘ä╪│╪ñ╪º┘ä | ╪«┘è╪º╪▒ | ╪«┘è╪º╪▒", "Make a poll: question | option one | option two"),
            options: [
                {
                    name: "text",
                    description: t("╪º┘ä╪│╪ñ╪º┘ä | ╪«┘è╪º╪▒ | ╪«┘è╪º╪▒ ...", "question | option | option ..."),
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                }
            ],
            execute: (opts, ctx) => {
                const parts = findOption(opts, "text", "").split("|").map(s => s.trim()).filter(Boolean);
                const question = parts.shift();
                const choices = parts.slice(0, NUMBERS.length);

                if (!question || choices.length < 2) {
                    sendBotMessage(ctx.channel.id, { content: t("╪ú╪¡╪¬╪º╪¼ ╪│╪ñ╪º┘ä╪º┘ï ┘ê╪«┘è╪º╪▒┘è┘å ╪╣┘ä┘ë ╪º┘ä╪ú┘é┘ä╪î ╪º┘ü╪╡┘ä ╪¿┘è┘å┘ç╪º ╪¿┘Ç `|`.", "Need a question and at least two options, split with `|`.") });
                    return;
                }

                const body = choices.map((c, i) => `${NUMBERS[i]} ${c}`).join("\n");
                return { content: `≡ƒôè **${question}**\n${body}` };
            }
        }
    ]
});