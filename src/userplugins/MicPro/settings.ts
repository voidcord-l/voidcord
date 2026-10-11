/*
 * MicPro ΓÇö Esharq microphone control panel
 * Copyright (c) 2026 LOSTSTR
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * ╪º┘ä╪ú┘ê╪╡╪º┘ü ┘ç┘å╪º ╪¿╪º┘ä╪Ñ┘å╪¼┘ä┘è╪▓┘è╪⌐╪¢ ╪º┘ä╪╣╪▒╪¿┘è╪⌐ ╪¬╪ú╪¬┘è ┘à┘å overlay (src/i18n/plugins/MicPro.ts).
 * ┘â┘ä ╪º┘ä╪Ñ╪╣╪»╪º╪»╪º╪¬ ┘à╪¼╪▒┘æ╪» ╪¬┘ü╪╢┘è┘ä╪º╪¬ ╪╣╪▒╪╢ ┘ä┘ä┘ê╪¡╪⌐ ΓÇö ╪º┘ä╪¬╪¡┘â┘æ┘à ╪º┘ä┘ü╪╣┘ä┘è ┘è┘Å╪╖╪¿┘Ä┘æ┘é ╪¡┘è┘æ╪º┘ï ╪╣┘ä┘ë ┘à╪¡╪▒┘æ┘â ╪»┘è╪│┘â┘ê╪▒╪»
 * ╪º┘ä╪╡┘ê╪¬┘è ╪º┘ä╪ú╪╡┘ä┘è (MediaEngine)╪î ┘ä╪º ╪╣┘ä┘ë ╪ú┘è ╪¬┘è╪º╪▒ ┘ê┘ç┘à┘è.
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    autoDeafenOnTest: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Self-deafen while the loopback mic test is active (so you don't hear the channel doubled)"
    }
});