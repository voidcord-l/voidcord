/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findOption, RequiredMessageOption } from "@api/Commands";
import { t } from "@utils/esharqI18n";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "ClapText",
    description: "Adds /clap to ≡ƒæÅ put ≡ƒæÅ claps ≡ƒæÅ between ≡ƒæÅ your ≡ƒæÅ words.",
    authors: [{ name: "Sharp", id: 0n }],
    dependencies: ["CommandsAPI"],
    commands: [
        {
            name: "clap",
            description: t("╪╢╪╣ ≡ƒæÅ ╪¬╪╡┘ü┘è┘é╪º┘ï ≡ƒæÅ ╪¿┘è┘å ≡ƒæÅ ╪º┘ä┘â┘ä┘à╪º╪¬", "Put ≡ƒæÅ claps ≡ƒæÅ between ≡ƒæÅ words"),
            options: [RequiredMessageOption],
            execute: opts => ({
                content: findOption(opts, "message", "")
                    .split(/\s+/)
                    .filter(Boolean)
                    .join(" ≡ƒæÅ ")
            })
        }
    ]
});