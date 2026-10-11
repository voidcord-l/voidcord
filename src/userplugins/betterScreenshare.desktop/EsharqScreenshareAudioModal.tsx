/*
 * BetterScreenshare ΓÇö Esharq redesigned audio panel
 * Copyright (c) 2026 LOSTSTR
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * ┘å╪º┘ü╪░╪⌐ ╪Ñ╪╣╪»╪º╪»╪º╪¬ ╪¬╪▒┘à┘è╪▓ ╪╡┘ê╪¬ ╪º┘ä┘à╪┤╪º╪▒┘â╪⌐ (╪º┘ä┘é┘å┘ê╪º╪¬╪î ╪¬╪▒╪»┘æ╪»/┘à╪╣╪»┘æ┘ä ╪º┘ä╪╣┘è┘æ┘å╪⌐╪î ╪¡╪¼┘à ╪º┘ä╪¡╪▓┘à╪⌐╪î ┘à╪╣╪»┘æ┘ä
 * ╪º┘ä╪¿┘É╪¬) ╪¿┘å┘ü╪│ ┘ç┘ê┘è╪⌐ ╪Ñ╪┤╪▒╪º┘é ╪º┘ä╪¿┘å┘ü╪│╪¼┘è╪⌐ ΓÇö ╪¬┘ä┘ü┘æ ┘à╪¬╪¼╪▒ ╪╡┘ê╪¬ BetterScreenshare (┘å┘ü╪│ ╪ó┘ä┘è┘æ╪¬┘ç).
 */

import "./style.css";

import ErrorBoundary from "@components/ErrorBoundary";
import { isArabicMode, t } from "@utils/esharqI18n";
import { ModalContent, ModalHeader, ModalRoot, type RenderModalProps } from "@utils/esharqModals";
import { ModalSize } from "@utils/modal";
import { React } from "@webpack/common";

import { Cap, NumTile, ProfileBar, RangeBar, Seg, Switch, Tile } from "./EsharqScreenshareModal";

const CHANNELS: [string, number][] = [[t("╪ú╪¡╪º╪»┘è", "Mono"), 1], [t("╪│╪¬┘è╪▒┘è┘ê", "Stereo"), 2]];
const BITRATES: [string, number][] = [["96", 96], ["128", 128], ["256", 256], ["320", 320]];

function AudioBody({ st, apply }: { st: any; apply: () => void; }) {
    const p = st.currentProfile;
    const simple = st.simpleMode ?? true;
    const setChannels = (v: number) => { st.setChannels(v); st.setChannelsEnabled(true); apply(); };
    const setBitrate = (v: number) => { st.setVoiceBitrate(v); st.setVoiceBitrateEnabled(true); apply(); };

    return (
        <>
            <div className="bss-tile bss-tap bss-span" onClick={() => st.setSimpleMode(!simple)}>
                <Cap label={t("╪º┘ä┘ê╪╢╪╣ ╪º┘ä┘à╪¿╪│┘æ╪╖", "Simple mode")}><Switch on={simple} onChange={v => st.setSimpleMode(v)} /></Cap>
                <span className="bss-note">{simple ? t("╪º┘ä┘é┘å┘ê╪º╪¬ ┘ê╪º┘ä╪¼┘ê╪»╪⌐ ┘ü┘é╪╖ ΓÇö ╪ú╪╖┘ü╪ª┘ç ┘ä┘ä╪¬╪¡┘â┘æ┘à ╪º┘ä┘â╪º┘à┘ä.", "Channels and quality only ΓÇö turn off for full control.") : t("┘à╪¬┘é╪»┘æ┘à ΓÇö ┘â┘ä ┘à╪╣╪º┘à┘ä╪º╪¬ ╪¬╪▒┘à┘è╪▓ ╪º┘ä╪╡┘ê╪¬.", "Advanced ΓÇö every audio-encoding parameter.")}</span>
            </div>

            {simple ? (
                <>
                    <Tile span>
                        <Cap label={t("╪º┘ä┘é┘å┘ê╪º╪¬", "Channels")} value={p.channels === 1 ? t("╪ú╪¡╪º╪»┘è", "Mono") : t("╪│╪¬┘è╪▒┘è┘ê", "Stereo")} />
                        <Seg options={CHANNELS} current={p.channels ?? 2} onPick={setChannels} />
                    </Tile>
                    <Tile span>
                        <Cap label={t("┘à╪╣╪»┘æ┘ä ╪¿┘É╪¬ ╪º┘ä╪╡┘ê╪¬", "Audio bitrate")} value={`${p.voiceBitrate ?? 320} kb/s`} />
                        <Seg options={BITRATES} current={p.voiceBitrate} onPick={setBitrate} />
                    </Tile>
                </>
            ) : (
                <>
                    <div className="bss-grid2">
                        <NumTile label={t("╪¬╪▒╪»┘æ╪» ╪º┘ä╪╣┘è┘æ┘å╪⌐", "Sample frequency")} unit="Hz" value={p.freq} def={48000}
                            onValue={v => { st.setFreq(v); st.setFreqEnabled(true); apply(); }}
                            enabled={p.freqEnabled} onToggle={v => { st.setFreqEnabled(v); apply(); }} />
                        <NumTile label={t("┘à╪╣╪»┘æ┘ä ╪º┘ä╪╣┘è┘æ┘å╪⌐", "Sample rate")} unit="Hz" value={p.rate} def={48000}
                            onValue={v => { st.setRate(v); st.setRateEnabled(true); apply(); }}
                            enabled={p.rateEnabled} onToggle={v => { st.setRateEnabled(v); apply(); }} />
                        <NumTile label={t("╪¡╪¼┘à ╪º┘ä╪¡╪▓┘à╪⌐", "Packet size")} value={p.pacsize} def={960}
                            onValue={v => { st.setPacsize(v); st.setPacsizeEnabled(true); apply(); }}
                            enabled={p.pacsizeEnabled} onToggle={v => { st.setPacsizeEnabled(v); apply(); }} />
                        <NumTile label={t("╪º┘ä┘é┘å┘ê╪º╪¬", "Channels")} value={p.channels} def={2}
                            onValue={v => { st.setChannels(v); st.setChannelsEnabled(true); apply(); }}
                            enabled={p.channelsEnabled} onToggle={v => { st.setChannelsEnabled(v); apply(); }} />
                    </div>
                    <Tile span>
                        <Cap label={t("┘à╪╣╪»┘æ┘ä ╪¿┘É╪¬ ╪º┘ä╪╡┘ê╪¬", "Audio bitrate")} value={`${p.voiceBitrate ?? 320} kb/s`}>
                            <Switch on={p.voiceBitrateEnabled ?? false} onChange={v => { st.setVoiceBitrateEnabled(v); apply(); }} />
                        </Cap>
                        <RangeBar value={p.voiceBitrate ?? 320} min={8} max={512} step={8} onInput={setBitrate} />
                    </Tile>
                </>
            )}

            <ProfileBar st={st} apply={apply} />

            <button type="button" className="bss-apply" onClick={apply}>{t("Γ£ô ╪¬╪╖╪¿┘è┘é ╪╣┘ä┘ë ╪º┘ä╪¿╪½┘æ", "Γ£ô Apply to stream")}</button>

            <div className="bss-hint">
                <span className="bss-dot" />
                {t("┘ä┘ä╪¡╪╡┘ê┘ä ╪╣┘ä┘ë ╪╡┘ê╪¬ ╪│╪¬┘è╪▒┘è┘ê: ┘ü╪╣┘æ┘ä ╪º┘ä┘é┘å┘ê╪º╪¬ = ╪│╪¬┘è╪▒┘è┘ê ┘ê╪º╪▒┘ü╪╣ ┘à╪╣╪»┘æ┘ä ╪º┘ä╪¿┘É╪¬╪î ╪½┘à ╪╖╪¿┘æ┘é ╪ú╪½┘å╪º╪í ╪º┘ä╪¿╪½┘æ.", "For stereo audio: set channels = Stereo and raise the bitrate, then Apply while live.")}
            </div>
        </>
    );
}

export function EsharqScreenshareAudioModal({ rootProps, screenshareAudioStore, onDone }: { rootProps: RenderModalProps; screenshareAudioStore: any; onDone: () => void; }) {
    const st = screenshareAudioStore.use();
    const apply = () => { try { onDone(); } catch { /* ╪ó┘à┘å */ } };
    const dir = isArabicMode() ? "rtl" : "ltr";

    return (
        <ModalRoot {...rootProps} size={ModalSize.SMALL} className="bss-root">
            <ModalHeader separator={false}>
                <div className="bss-head" dir={dir}>
                    <span className="bss-glyph">
                        <svg viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M4 9v6h4l5 5V4L8 9H4Zm11.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Zm-2.5-9v2.06a7 7 0 0 1 0 13.88V21a9 9 0 0 0 0-18Z" /></svg>
                    </span>
                    <div>
                        <div className="bss-title">BetterScreenshare</div>
                        <div className="bss-subtitle">{t("╪Ñ╪╣╪»╪º╪»╪º╪¬ ╪╡┘ê╪¬ ╪º┘ä┘à╪┤╪º╪▒┘â╪⌐", "Shared-audio settings")}</div>
                    </div>
                </div>
            </ModalHeader>
            <ModalContent>
                <div className="bss-body" dir={dir}>
                    <ErrorBoundary noop><AudioBody st={st} apply={apply} /></ErrorBoundary>
                </div>
            </ModalContent>
        </ModalRoot>
    );
}