/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findOption, RequiredMessageOption } from "@api/Commands";
import { t } from "@utils/esharqI18n";
import definePlugin from "@utils/types";

const caps: Record<string, string> = {
    a: "ß┤Ç", b: "╩Ö", c: "ß┤ä", d: "ß┤à", e: "ß┤ç", f: "Ω£░", g: "╔ó", h: "╩£", i: "╔¬",
    j: "ß┤è", k: "ß┤ï", l: "╩ƒ", m: "ß┤ì", n: "╔┤", o: "ß┤Å", p: "ß┤ÿ", q: " q", r: "╩Ç",
    s: "Ω£▒", t: "ß┤¢", u: "ß┤£", v: "ß┤á", w: "ß┤í", x: "x", y: "╩Å", z: "ß┤ó"
};

export default definePlugin({
    name: "SmallCaps",
    description: "/smallcaps writes your message in Ω£▒ß┤ìß┤Ç╩ƒ╩ƒ ß┤äß┤Çß┤ÿΩ£▒.",
    authors: [{ name: "Sharp", id: 0n }],
    dependencies: ["CommandsAPI"],
    commands: [
        {
            name: "smallcaps",
            description: t("╪¡┘ê┘æ┘ä ╪Ñ┘ä┘ë ╪ú╪¡╪▒┘ü ╪╡╪║┘è╪▒╪⌐", "Convert to small caps"),
            options: [RequiredMessageOption],
            execute: opts => ({
                content: findOption(opts, "message", "").toLowerCase().replace(/[a-z]/g, c => caps[c] ?? c)
            })
        }
    ]
});