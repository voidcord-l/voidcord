/*
 * Vencord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType } from "@api/Commands";
import { sendMessage } from "@utils/discord";
import definePlugin from "@utils/types";

// map pasted from https://onlinetools.com/unicode/spoof-unicode-text
const spoofMap: Record<string, string> = {
    a: "а", c: "с", e: "е", i: "і", j: "ј", o: "о", p: "р", s: "ѕ", x: "х", y: "у",
    A: "А", B: "В", C: "С", E: "Е", H: "Н", I: "І", K: "Κ", M: "М", N: "Ν",
    O: "О", P: "Р", S: "Ѕ", T: "Т", X: "Х", Y: "Υ", Z: "Ζ",
    "!": "ǃ", ".": "․", ";": ";", ",": "‚", "-": "‐"
};

function spoofUnicode(text: string): string {
    return [...text].map(char => spoofMap[char] || char).join("");
}

export default definePlugin({
    name: "SpoofMessage",
    description: "Bypass content filtering in servers with message spoofing (replaces latin characters with Unicode homoglyphs)",
    authors: [{ name: "skidaim", id: 1043358658504962138n }],

    commands: [
        {
            inputType: ApplicationCommandInputType.BUILT_IN,
            name: "spoof",
            description: "Replaces latin characters with indistinguishable homoglyphs.",
            options: [
                {
                    name: "message",
                    description: "Your message",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                }
            ],
            execute: async (opts, ctx) => {
                const input = opts.find(opt => opt.name === "message")?.value ?? "";

                const spoofed = spoofUnicode(input);

                sendMessage(ctx.channel.id, {
                    content: spoofed
                });
            }
        }
    ]
});
