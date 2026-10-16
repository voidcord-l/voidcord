/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "@utils/esharqI18n";
import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { getCurrentChannel } from "@utils/discord";
import definePlugin from "@utils/types";
import { DraftType, UploadHandler, UserStore } from "@webpack/common";

import { createTextScreenshot } from "./utils";

export default definePlugin({
    name: "TextScreenshot",
    description: "Send text as a screenshot of a Discord message with your profile",
    tags: ["Commands", "Fun"],
    authors: [{ name: "x2b", id: 996137713432530976n }],
    dependencies: ["CommandsAPI"],

    commands: [
        {
            name: "txtss",
            description: t("╪ú╪▒╪│┘ä ┘å╪╡╪º┘ï ┘â╪╡┘ê╪▒╪⌐ ╪▒╪│╪º┘ä╪⌐ ╪»┘è╪│┘â┘ê╪▒╪»", "Send text as a fake Discord message screenshot"),
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "text",
                    description: t("╪º┘ä┘å╪╡ ╪º┘ä┘à╪▒╪º╪» ╪¬╪╡┘ê┘è╪▒┘ç", "The text to screenshot"),
                    type: ApplicationCommandOptionType.STRING,
                    required: true,
                }
            ],
            execute: async (opts, ctx) => {
                const text = findOption(opts, "text", "");
                if (!text) {
                    sendBotMessage(ctx.channel.id, { content: t("┘è╪▒╪¼┘ë ╪Ñ╪»╪«╪º┘ä ┘å╪╡.", "Please provide some text.") });
                    return;
                }

                try {
                    const user = UserStore.getCurrentUser();
                    const blob = await createTextScreenshot(text, user);
                    const file = new File([blob], "text-screenshot.png", { type: "image/png" });
                    const channel = getCurrentChannel();
                    if (!channel) return sendBotMessage(ctx.channel.id, { content: t("┘ä┘à ┘è┘Å╪╣╪½╪▒ ╪╣┘ä┘ë ┘é┘å╪º╪⌐.", "No channel found.") });
                    setTimeout(() => UploadHandler.promptToUpload([file], channel, DraftType.ChannelMessage), 10);
                } catch (e) {
                    sendBotMessage(ctx.channel.id, { content: `Failed to create screenshot: ${e}` });
                }
            },
        },
        {
            name: "texttoscreen",
            description: t("╪ú╪▒╪│┘ä ┘å╪╡╪º┘ï ┘â╪╡┘ê╪▒╪⌐ ╪▒╪│╪º┘ä╪⌐ ╪»┘è╪│┘â┘ê╪▒╪»", "Send text as a fake Discord message screenshot"),
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "text",
                    description: t("╪º┘ä┘å╪╡ ╪º┘ä┘à╪▒╪º╪» ╪¬╪╡┘ê┘è╪▒┘ç", "The text to screenshot"),
                    type: ApplicationCommandOptionType.STRING,
                    required: true,
                }
            ],
            execute: async (opts, ctx) => {
                const text = findOption(opts, "text", "");
                if (!text) {
                    sendBotMessage(ctx.channel.id, { content: t("┘è╪▒╪¼┘ë ╪Ñ╪»╪«╪º┘ä ┘å╪╡.", "Please provide some text.") });
                    return;
                }

                try {
                    const user = UserStore.getCurrentUser();
                    const blob = await createTextScreenshot(text, user);
                    const file = new File([blob], "text-screenshot.png", { type: "image/png" });
                    const channel = getCurrentChannel();
                    if (!channel) return sendBotMessage(ctx.channel.id, { content: t("┘ä┘à ┘è┘Å╪╣╪½╪▒ ╪╣┘ä┘ë ┘é┘å╪º╪⌐.", "No channel found.") });
                    setTimeout(() => UploadHandler.promptToUpload([file], channel, DraftType.ChannelMessage), 10);
                } catch (e) {
                    sendBotMessage(ctx.channel.id, { content: `Failed to create screenshot: ${e}` });
                }
            },
        },
    ],
});