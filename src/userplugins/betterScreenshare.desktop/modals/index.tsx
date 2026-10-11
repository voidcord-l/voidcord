/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { EsharqScreenshareAudioModal } from "../EsharqScreenshareAudioModal";
import { EsharqScreenshareModal } from "../EsharqScreenshareModal";
import { screenshareAudioStore, screenshareStore } from "../stores";
import { openModalLazy } from "@utils/modal";

import Plugin from "..";

// ┘è┘Å╪╖╪¿┘æ┘é ╪Ñ╪╣╪»╪º╪»╪º╪¬ ╪º┘ä┘ü┘è╪»┘è┘ê + ╪º┘ä╪╡┘ê╪¬ ╪╣┘ä┘ë ╪º┘ä╪¿╪½┘æ ╪º┘ä╪¼╪º╪▒┘è (╪Ñ╪╣╪º╪»╪⌐ ╪»┘ü╪╣ ╪«┘è╪º╪▒╪º╪¬ ╪º┘ä┘å┘é┘ä + ┘à╪╡╪»╪▒ ╪│╪╖╪¡ ╪º┘ä┘à┘â╪¬╪¿).
const onScreenshareModalDone = () => {
    const { screenshareAudioPatcher, screensharePatcher } = Plugin;

    if (screensharePatcher) {
        screensharePatcher.forceUpdateTransportationOptions();
        screensharePatcher.forceUpdateDesktopSourceOptions();
    }
    if (screenshareAudioPatcher)
        screenshareAudioPatcher.forceUpdateTransportationOptions();
};

// ┘è┘Å╪╖╪¿┘æ┘é ╪Ñ╪╣╪»╪º╪»╪º╪¬ ╪¬╪▒┘à┘è╪▓ ╪º┘ä╪╡┘ê╪¬ ╪╣┘ä┘ë ╪º┘ä╪¿╪½┘æ ╪º┘ä╪¼╪º╪▒┘è (╪Ñ╪╣╪º╪»╪⌐ ╪»┘ü╪╣ ╪«┘è╪º╪▒╪º╪¬ ┘å┘é┘ä ╪º┘ä╪╡┘ê╪¬ ┘ü┘é╪╖).
const onScreenshareAudioModalDone = () => {
    const { screenshareAudioPatcher } = Plugin;
    if (screenshareAudioPatcher)
        screenshareAudioPatcher.forceUpdateTransportationOptions();
};

export const openScreenshareAudioModal =
    () => openModalLazy(async () => {
        return props =>
            <EsharqScreenshareAudioModal
                rootProps={props}
                screenshareAudioStore={screenshareAudioStore}
                onDone={onScreenshareAudioModalDone} />;
    });

export const openScreenshareModal =
    () => openModalLazy(async () => {
        return props =>
            <EsharqScreenshareModal
                rootProps={props}
                screenshareStore={screenshareStore}
                onDone={onScreenshareModalDone}
                onOpenAudio={openScreenshareAudioModal} />;
    });