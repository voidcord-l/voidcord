/*
 * MicPro ΓÇö Esharq microphone control panel
 * Copyright (c) 2026 LOSTSTR
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * ┘ä┘ê╪¡╪⌐ ╪¬╪¡┘â┘æ┘à ┘ê╪º╪¡╪»╪⌐ ┘ä┘ä┘à┘è┘â╪▒┘ê┘ü┘ê┘å╪î ╪¬╪╡┘à┘è┘à ╪¿╪╖╪º┘é╪º╪¬ ╪¿╪¬╪¿┘ê┘è╪¿┘è┘å:
 *  Γæá ╪º┘ä┘à╪╣╪º┘ä╪¼╪⌐ (╪╣┘ä┘ë ┘à╪¡╪▒┘æ┘â ╪»┘è╪│┘â┘ê╪▒╪» ╪º┘ä╪ú╪╡┘ä┘è MediaEngine): ┘â╪│╪¿╪î ╪Ñ┘ä╪║╪º╪í ╪╢┘ê╪╢╪º╪í None/Standard/Krisp╪î
 *     ╪Ñ┘ä╪║╪º╪í ╪╡╪»┘ë╪î AGC╪î ╪¡╪│╪º╪│┘è╪⌐ + ┘à┘é┘è╪º╪│ ┘à╪│╪¬┘ê┘ë ╪¡┘è┘æ + ╪º╪«╪¬╪¿╪º╪▒ loopback ╪¡┘é┘è┘é┘è.
 *  Γæí ╪º┘ä┘å┘é┘ä ╪╣╪º┘ä┘è ╪º┘ä╪¼┘ê╪»╪⌐ (╪¿╪│┘è╪╖/┘à╪¬┘é╪»┘æ┘à): ┘å┘Å╪╣┘è╪» ╪º╪│╪¬╪«╪»╪º┘à ┘â┘ê╪» BetterMicrophone ╪º┘ä┘à┘Å╪½╪¿┘Ä╪¬ ┘â┘à╪º ┘ç┘ê.
 * ┘ä╪º ┘à╪ñ╪½┘æ╪▒╪º╪¬ ┘ê┘ç┘à┘è╪⌐: ╪»┘è╪│┘â┘ê╪▒╪» ┘è┘ä╪¬┘é╪╖ ╪º┘ä┘à┘è┘â╪▒┘ê┘ü┘ê┘å ┘ü┘è ╪º┘ä┘à╪¡╪▒┘æ┘â ╪º┘ä╪ú╪╡┘ä┘è╪î ┘ü┘å╪¬╪¡┘â┘æ┘à ╪¿┘à╪╣╪º┘ä╪¼╪¬┘ç ┘ä╪º ╪¿╪¬┘è╪º╪▒ ┘ê┘ç┘à┘è.
 */

import "./style.css";

import ErrorBoundary from "@components/ErrorBoundary";
import { PluginInfo as MicEngineInfo } from "../_micProEngine/constants";
import { MicrophonePatcher } from "../_micProEngine/patchers";
import { initMicrophoneStore, microphoneStore } from "../_micProEngine/stores";
import { addSettingsPanelButton, Emitter, MicrophoneSettingsIcon, removeSettingsPanelButton } from "../philsPluginLibrary";
import { EquicordDevs } from "@utils/constants";
import { isArabicMode, t } from "@utils/esharqI18n";
import { ModalContent, ModalHeader, ModalRoot, openModal, type RenderModalProps } from "@utils/esharqModals";
import { ModalSize } from "@utils/modal";
import definePlugin, { PluginNative } from "@utils/types";
import { FluxDispatcher, MediaEngineStore, React, Select, useEffect, useRef, useState, VoiceActions } from "@webpack/common";

import { settings } from "./settings";

const Native = IS_DISCORD_DESKTOP
    ? (VencordNative.pluginHelpers.MicPro as PluginNative<typeof import("./native")>)
    : null;

let micPatcher: MicrophonePatcher | undefined;
// ╪¼╪º┘ç╪▓┘è╪⌐ ┘à╪¡╪▒┘æ┘â ╪º┘ä┘å┘é┘ä ╪º┘ä╪ú╪╡┘ä┘è (patcher.node): null=┘ä┘à ┘è┘Å╪¡╪│┘à╪î true=╪╖┘Å╪¿┘æ┘é╪î false=┘ü╪┤┘ä ΓçÆ ╪º┘ä╪│╪¬┘è╪▒┘è┘ê ┘ä┘å ┘è┘Å╪¡╪¬╪▒┘Ä┘à.
let nativeReady: boolean | null = null;
// ╪Ñ┘ä╪║╪º╪í ╪º╪┤╪¬╪▒╪º┘â ╪¡╪º╪▒╪│ ╪º┘ä╪│╪¬┘è╪▒┘è┘ê ╪╣┘ä┘ë ╪º┘ä╪º╪¬╪╡╪º┘ä╪º╪¬ ╪º┘ä╪¼╪»┘è╪»╪⌐ (╪º┘ä╪¿┘å╪» 1) ΓÇö ┘è┘Å┘ü╪╡┘Ä┘ä ╪╣┘å╪» ╪º┘ä╪Ñ┘è┘é╪º┘ü.
let stereoGuardOff: (() => void) | undefined;

type NoiseMode = "none" | "standard" | "krisp";

const DEFAULT_AGC = {
    enabled: true, useAGC2: true, enableAnalog: false, enableDigital: true,
    headroom_db: 5, max_gain_db: 50, initial_gain_db: 15,
    max_gain_change_db_per_second: 6, max_output_noise_level_dbfs: -50, fixed_gain_db: 0
};

// ΓöÇΓöÇ Γæá ╪╖╪¿┘é╪⌐ ╪º┘ä┘à╪╣╪º┘ä╪¼╪⌐ (MediaEngine ╪º┘ä╪ú╪╡┘ä┘è) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function mediaEngine() {
    try { return MediaEngineStore.getMediaEngine(); } catch { return null; }
}
function inCall(): boolean {
    try { return (mediaEngine()?.connections?.size ?? 0) > 0; } catch { return false; }
}
function forEachConnection(fn: (c: any) => void) {
    try { mediaEngine()?.connections?.forEach(fn); } catch { /* ╪ó┘à┘å */ }
}

function readState() {
    const S = MediaEngineStore as any;
    const suppression = !!S?.getNoiseSuppression?.();
    const cancellation = !!S?.getNoiseCancellation?.();
    return {
        inputVolume: Number(S?.getInputVolume?.() ?? 100),
        noiseMode: (cancellation ? "krisp" : suppression ? "standard" : "none") as NoiseMode,
        echo: !!S?.getEchoCancellation?.(),
        agc: !!S?.getAutomaticGainControl?.(),
        krispSupported: !!S?.isNoiseCancellationSupported?.(),
        inputMode: String(S?.getInputMode?.() ?? "VOICE_ACTIVITY"),
        vadThreshold: Number(S?.getModeOptions?.()?.threshold ?? -60),
        deviceId: String(S?.getInputDeviceId?.() ?? "default"),
        inCall: inCall()
    };
}

const apply = {
    inputVolume(v: number) { try { FluxDispatcher.dispatch({ type: "AUDIO_SET_INPUT_VOLUME", volume: v }); } catch { /* ╪ó┘à┘å */ } },
    echo(on: boolean) { forEachConnection(c => c.setEchoCancellation(on)); },
    agc(on: boolean) { forEachConnection(c => c.setAutomaticGainControl({ ...DEFAULT_AGC, enabled: on })); },
    noise(mode: NoiseMode) {
        forEachConnection(c => {
            if (mode === "krisp") { c.setNoiseSuppression(false); c.setNoiseCancellation(true); }
            else if (mode === "standard") { c.setNoiseCancellation(false); c.setNoiseSuppression(true); }
            else { c.setNoiseCancellation(false); c.setNoiseSuppression(false); }
        });
    },
    sensitivity(mode: string, thresholdDb: number) {
        const cur = (MediaEngineStore as any)?.getModeOptions?.() ?? {};
        forEachConnection(c => c.setInputMode(mode, {
            vadThreshold: thresholdDb, vadAutoThreshold: false,
            vadUseKrisp: cur.vadUseKrisp, vadKrispActivationThreshold: cur.vadKrispActivationThreshold
        }));
    }
};

// ┘è┘Å╪╖┘ü╪ª ╪╣┘ä┘ë ╪º╪¬╪╡╪º┘ä ┘ê╪º╪¡╪» ┘â┘ä ┘à╪º ┘è┘Å╪¡┘ê┘æ┘ä ╪º┘ä╪╡┘ê╪¬ ╪Ñ┘ä┘ë ╪ú╪¡╪º╪»┘è ┘ü┘è┘â╪│╪▒ ╪º┘ä╪│╪¬┘è╪▒┘è┘ê: ╪Ñ┘ä╪║╪º╪í ╪╢┘ê╪╢╪º╪í/╪╡╪»┘ë/AGC.
function disableMonoBreakers(c: any) {
    try {
        c.setNoiseCancellation(false);
        c.setNoiseSuppression(false);
        c.setEchoCancellation(false);
        c.setAutomaticGainControl({ ...DEFAULT_AGC, enabled: false });
    } catch { /* ╪ó┘à┘å */ }
}

// ╪¡╪º┘ä╪⌐ ╪º┘ä┘à╪╣╪º┘ä╪¼╪⌐ ╪º┘ä┘à╪¡┘ü┘ê╪╕╪⌐ ┘é╪¿┘ä ╪¬┘ü╪╣┘è┘ä ╪º┘ä╪│╪¬┘è╪▒┘è┘ê ΓÇö ┘ä╪º╪│╪¬╪╣╪º╪»╪¬┘ç╪º ╪╣┘å╪» ╪Ñ╪╖┘ü╪º╪ª┘ç (╪º┘ä╪¿┘å╪» 2).
let savedProcessing: { noiseMode: NoiseMode; echo: boolean; agc: boolean; } | null = null;

// ╪¬┘ü╪╣┘è┘ä/╪Ñ┘è┘é╪º┘ü ╪º┘ä╪│╪¬┘è╪▒┘è┘ê. ╪╣┘å╪» ╪º┘ä╪¬┘ü╪╣┘è┘ä ┘å┘Å┘ê┘é┘ü ╪¬┘ä┘é╪º╪ª┘è╪º┘ï ┘à╪º ┘è┘Å╪¡┘ê┘æ┘ä ╪º┘ä╪╡┘ê╪¬ ┘ä╪ú╪¡╪º╪»┘è (╪Ñ┘ä╪║╪º╪í ╪╢┘ê╪╢╪º╪í/╪╡╪»┘ë/AGC)
// ┘ê╪Ñ┘ä╪º ┘ä┘å ┘è╪╣┘à┘ä ╪º┘ä╪│╪¬┘è╪▒┘è┘ê ┘ü╪╣┘ä┘è╪º┘ï ΓÇö ┘ê┘å┘Å╪╣┘ä┘à ╪º┘ä┘à╪│╪¬╪«╪»┘à ╪╣╪¿╪▒ ╪¬┘å╪¿┘è┘ç ┘ü┘è ╪º┘ä┘ä┘ê╪¡╪⌐. ╪¡╪º╪▒╪│ ╪º┘ä╪º╪¬╪╡╪º┘ä╪º╪¬ (╪º┘ä╪¿┘å╪» 1)
// ┘è┘Å╪╣┘è╪» ╪¬╪╖╪¿┘è┘é ┘ç╪░╪º ╪º┘ä╪Ñ╪╖┘ü╪º╪í ╪╣┘ä┘ë ╪ú┘è ┘à┘â╪º┘ä┘à╪⌐ ╪¬┘Å┘ü╪¬┘Ä╪¡ ┘ä╪º╪¡┘é╪º┘ï ┘à╪º ╪»╪º┘à ╪º┘ä╪│╪¬┘è╪▒┘è┘ê ┘à┘ü╪╣┘æ┘ä╪º┘ï.
function toggleStereo(st: any, on: boolean, flush: () => void) {
    if (on) {
        // ╪º╪¡┘ü╪╕ ╪¡╪º┘ä╪⌐ ╪º┘ä┘à╪╣╪º┘ä╪¼╪⌐ ╪º┘ä╪¡╪º┘ä┘è╪⌐ ┘à╪▒┘æ╪⌐ ┘ê╪º╪¡╪»╪⌐ ┘â┘è ┘å┘Å╪╣┘è╪»┘ç╪º ╪╣┘å╪» ╪º┘ä╪Ñ╪╖┘ü╪º╪í (╪º┘ä╪¿┘å╪» 2).
        if (savedProcessing == null) {
            const s = readState();
            savedProcessing = { noiseMode: s.noiseMode, echo: s.echo, agc: s.agc };
        }
        st.setChannels(2);
        st.setChannelsEnabled(true);
        apply.noise("none");
        apply.echo(false);
        apply.agc(false);
    } else {
        st.setChannelsEnabled(false);
        // ╪º┘ä╪¿┘å╪» 2: ╪ú╪╣┘É╪» ╪¬╪¡╪│┘è┘å╪º╪¬ ╪º┘ä╪╡┘ê╪¬ ╪º┘ä╪¬┘è ╪ú╪╖┘ü╪ú┘å╪º┘ç╪º ┘é╪│╪▒╪º┘ï (┘ê╪Ñ┘ä╪º ┘è╪¿┘é┘ë ╪º┘ä┘à╪º┘è┘â ┬½╪╣╪º╪▒┘è╪º┘ï┬╗).
        if (savedProcessing != null) {
            apply.noise(savedProcessing.noiseMode);
            apply.echo(savedProcessing.echo);
            apply.agc(savedProcessing.agc);
            savedProcessing = null;
        }
    }
    flush();
}

// ΓöÇΓöÇ ╪º╪«╪¬╪¿╪º╪▒ loopback ╪¡┘é┘è┘é┘è ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
let loopbackOn = false;
let deafenedByUs = false;

async function setLoopback(on: boolean, autoDeafen: boolean) {
    try {
        await VoiceActions.setLoopback("mic_test", on);
        loopbackOn = on;
        if (on && autoDeafen && !(MediaEngineStore as any)?.isSelfDeaf?.()) {
            await VoiceActions.toggleSelfDeaf(); deafenedByUs = true;
        } else if (!on && deafenedByUs && (MediaEngineStore as any)?.isSelfDeaf?.()) {
            await VoiceActions.toggleSelfDeaf(); deafenedByUs = false;
        }
    } catch { /* ╪ó┘à┘å */ }
}

// ΓöÇΓöÇ ┘à╪│╪¬┘ê┘ë ╪º┘ä╪Ñ╪»╪«╪º┘ä ╪º┘ä╪¡┘è┘æ (VU) ΓÇö ┘è┘Å╪╖╪º╪¿┘é ╪¼┘ç╪º╪▓ ╪»┘è╪│┘â┘ê╪▒╪» ╪º┘ä┘à╪«╪¬╪º╪▒ ┘à╪¬┘ë ╪ú┘à┘â┘å + resume() ┘ä╪¬┘ü╪º╪»┘è ╪º┘ä╪¬╪╣┘ä┘è┘é ΓöÇΓöÇ
// ╪º┘ä╪¿┘å╪» 5: ┘å┘Å┘à╪▒┘æ╪▒ deviceId ╪º┘ä┘à┘Å╪«╪¬╪º╪▒ ┘ü┘è ╪»┘è╪│┘â┘ê╪▒╪» ┘â┘Ç {ideal} ┘ä╪º {exact} ΓÇö ┘ü┘è┘Å╪╖╪º╪¿┘Ä┘é ╪º┘ä╪¼┘ç╪º╪▓ ╪º┘ä╪╡╪¡┘è╪¡ ╪Ñ┘å
// ┘â╪º┘å ┘à┘Å╪╣╪▒┘æ┘ü┘ç ┘à╪¬┘ê╪º┘ü┘é╪º┘ï ┘à╪╣ Web MediaDevices╪î ┘ê╪Ñ┘ä╪º ┘è╪│┘é╪╖ ╪¬┘ä┘é╪º╪ª┘è╪º┘ï ┘ä┘ä╪º┘ü╪¬╪▒╪º╪╢┘è ╪¿┘ä╪º OverconstrainedError
// (╪¿╪«┘ä╪º┘ü exact ╪º┘ä╪░┘è ┘â╪º┘å ┘è┘Å┘ü╪▒┘É╪║ ╪º┘ä┘à┘é┘è╪º╪│). ╪ú┘è ┘ü╪┤┘ä ΓçÆ ╪º┘ä╪¼┘ç╪º╪▓ ╪º┘ä╪º┘ü╪¬╪▒╪º╪╢┘è╪î ┘ü┘è╪╣┘à┘ä ╪º┘ä┘à╪¬╪▒ ╪¿╪½╪¿╪º╪¬ ╪»╪º╪ª┘à╪º┘ï.
async function openLevelStream(): Promise<MediaStream> {
    let id = "";
    try { id = String((MediaEngineStore as any)?.getInputDeviceId?.() ?? ""); } catch { /* ╪ó┘à┘å */ }
    if (id && id !== "default") {
        try { return await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { ideal: id } } }); }
        catch { /* ┘è╪│┘é╪╖ ┘ä┘ä╪º┘ü╪¬╪▒╪º╪╢┘è ╪ú╪»┘å╪º┘ç */ }
    }
    return navigator.mediaDevices.getUserMedia({ audio: true });
}

function useLiveLevel(): number {
    const [level, setLevel] = useState(0);
    const ref = useRef<{ ctx?: AudioContext; stream?: MediaStream; raf?: number; }>({});

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const stream = await openLevelStream();
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
                const ctx = new AudioContext();
                // ┘â╪▒┘ê┘à┘è┘ê┘à ┘è╪¿╪»╪ú ╪º┘ä╪│┘è╪º┘é ┬½┘à╪╣┘ä┘æ┘é╪º┘ï┬╗ ╪ú╪¡┘è╪º┘å╪º┘ï ┘ü┘ä╪º ┘è╪╡┘ä ╪º┘ä╪╡┘ê╪¬ ΓçÆ ╪º┘ä┘à┘é┘è╪º╪│ ┘ü╪º╪▒╪║. resume() ┘è╪¡┘ä┘æ┘ç╪º.
                if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* ╪¬╪¼╪º┘ç┘ä */ } }
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); ctx.close().catch(() => { }); return; }
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 512;
                ctx.createMediaStreamSource(stream).connect(analyser);
                const buf = new Uint8Array(analyser.fftSize);
                ref.current = { ctx, stream };
                const tick = () => {
                    analyser.getByteTimeDomainData(buf);
                    let sum = 0;
                    for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; sum += d * d; }
                    setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3.2));
                    ref.current.raf = requestAnimationFrame(tick);
                };
                tick();
            } catch { /* ╪º┘ä┘à┘è┘â╪▒┘ê┘ü┘ê┘å ┘à╪▒┘ü┘ê╪╢ ΓÇö ┘è╪¿┘é┘ë ╪╡┘ü╪▒╪º┘ï ╪¿┘ä╪º ╪╢╪▒╪▒ */ }
        })();
        return () => {
            cancelled = true;
            const r = ref.current;
            if (r.raf) cancelAnimationFrame(r.raf);
            r.stream?.getTracks().forEach(t => t.stop());
            r.ctx?.close().catch(() => { });
            ref.current = {};
        };
    }, []);

    return level;
}

// ╪¬╪¡┘â┘æ┘à ┬½┘à╪│╪¬┘ê┘ë ╪º┘ä╪Ñ╪»╪«╪º┘ä┬╗: ┘à╪ñ╪┤┘æ╪▒ ╪¡┘è┘æ ┘à┘ä┘ê┘æ┘å ╪«┘ä┘ü┘ç (╪º┘ä┘à╪¬╪▒) + ┘à┘é╪¿╪╢ ╪ú╪¿┘è╪╢ ┘é╪º╪¿┘ä ┘ä┘ä╪│╪¡╪¿ ┘è┘à┘è┘å/┘è╪│╪º╪▒ ┘è╪╢╪¿╪╖ ╪º┘ä┘â╪│╪¿.
function InputLevel({ gain, onGain }: { gain: number; onGain: (v: number) => void; }) {
    const level = useLiveLevel();
    return (
        <div className="micpro-il">
            <span className="micpro-il-live" style={{ width: `${Math.round(level * 100)}%` }} />
            <input type="range" min={0} max={100} value={gain} aria-label="input level"
                onChange={e => onGain(Number(e.currentTarget.value))} />
        </div>
    );
}

// ΓöÇΓöÇ ┘ä╪¿┘å╪º╪¬ ╪º┘ä┘ê╪º╪¼┘ç╪⌐ (╪¿╪╖╪º┘é╪º╪¬) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function Tile({ span, tap, onClick, children }: { span?: boolean; tap?: boolean; onClick?: () => void; children: React.ReactNode; }) {
    return (
        <div className={"micpro-tile" + (span ? " micpro-span" : "") + (tap ? " micpro-tap" : "")} onClick={onClick}>
            {children}
        </div>
    );
}
function Cap({ label, value, children }: { label: string; value?: string; children?: React.ReactNode; }) {
    return (
        <div className="micpro-cap">
            <span className="micpro-label">{label}</span>
            {value != null && <span className="micpro-val">{value}</span>}
            {children}
        </div>
    );
}
function Switch({ on, accent, disabled, onChange }: { on: boolean; accent?: boolean; disabled?: boolean; onChange: (v: boolean) => void; }) {
    return (
        <button type="button" role="switch" aria-checked={on} disabled={disabled}
            className={"micpro-sw" + (accent ? " micpro-sw-acc" : "") + (on ? " micpro-sw-on" : "")}
            onClick={e => { e.stopPropagation(); onChange(!on); }}>
            <i />
        </button>
    );
}
// ╪¿╪╖╪º┘é╪⌐ ╪¬╪¿╪»┘è┘ä ┘é╪º╪¿┘ä╪⌐ ┘ä┘ä┘å┘é╪▒ (╪º┘ä┘à┘ü╪¬╪º╪¡ + ┘ê╪╡┘ü).
function SwitchTile({ label, note, on, span, disabled, onChange }: { label: string; note: string; on: boolean; span?: boolean; disabled?: boolean; onChange: (v: boolean) => void; }) {
    return (
        <Tile span={span} tap onClick={() => !disabled && onChange(!on)}>
            <Cap label={label}><Switch on={on} accent disabled={disabled} onChange={onChange} /></Cap>
            <span className="micpro-note">{note}</span>
        </Tile>
    );
}
// ┘à┘å╪▓┘ä┘é ╪¿╪┤╪▒┘è╪╖ ╪¬╪╣╪¿╪ª╪⌐ ┘à╪▒╪ª┘è┘æ ╪«┘ä┘ü ╪º┘ä┘à╪ñ╪┤┘æ╪▒.
function RangeBar({ value, min, max, step, disabled, onInput }:
{ value: number; min: number; max: number; step?: number; disabled?: boolean; onInput: (v: number) => void; }) {
    const pct = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;
    return (
        <div className={"micpro-range" + (disabled ? " micpro-range-off" : "")}>
            <span className="micpro-range-fill" style={{ width: `${pct}%` }} />
            <input type="range" min={min} max={max} step={step ?? 1} value={value} disabled={disabled}
                onChange={e => onInput(Number(e.currentTarget.value))} />
        </div>
    );
}
function SliderTile({ label, value, min, max, step, span, disabled, onInput }:
{ label: string; value: number; min: number; max: number; step?: number; span?: boolean; disabled?: boolean; onInput: (v: number) => void; }) {
    return (
        <Tile span={span}>
            <Cap label={label} value={disabled ? undefined : `${value}${max === 100 ? "%" : ""}`} />
            <RangeBar value={value} min={min} max={max} step={step} disabled={disabled} onInput={onInput} />
        </Tile>
    );
}
function NumberTile({ label, hint, unit, def, enabled, value, onToggle, onValue }:
{ label: string; hint: string; unit?: string; def: number; enabled: boolean; value?: number; onToggle: (v: boolean) => void; onValue: (v: number) => void; }) {
    return (
        <Tile>
            <Cap label={label}>
                <Switch on={enabled} accent onChange={v => { onToggle(v); if (v && value == null) onValue(def); }} />
            </Cap>
            <div className="micpro-numwrap">
                <input className="micpro-num" type="number" disabled={!enabled} value={value ?? ""} placeholder={String(def)}
                    onChange={e => { const n = parseInt(e.currentTarget.value, 10); if (Number.isFinite(n)) onValue(n); }} />
                {unit && <span className="micpro-unit">{unit}</span>}
            </div>
            <span className="micpro-note">{hint}</span>
        </Tile>
    );
}

// ╪┤╪▒┘è╪╖ ┘à┘ä┘ü╪º╪¬ ╪º┘ä╪Ñ╪╣╪»╪º╪»╪º╪¬ (profiles): ╪º╪«╪¬┘è╪º╪▒/╪¡┘ü╪╕/╪¼╪»┘è╪»/┘å╪│╪«/╪¡╪░┘ü. ╪º┘ä┘à╪¡╪▒┘æ┘â ┘è╪¡┘ü╪╕┘ç╪º ╪¿╪┤┘â┘ä ╪»╪º╪ª┘à ╪╣╪¿╪▒
// DataStore (createPluginStore) ΓÇö ┘ü┘â┘ä┘æ ┘à┘ä┘ü ┘à╪¡┘ü┘ê╪╕ ┘è╪¿┘é┘ë ╪¿╪╣╪» ╪Ñ╪╣╪º╪»╪⌐ ╪¬╪┤╪║┘è┘ä ╪»┘è╪│┘â┘ê╪▒╪». ╪º┘ä┘à┘å╪╖┘é ┘è╪╖╪º╪¿┘é
// ╪Ñ╪»╪º╪▒╪⌐ ╪º┘ä┘à┘ä┘ü╪º╪¬ ╪º┘ä┘à┘Å╪½╪¿┘Ä╪¬╪⌐ ┘ü┘è ╪º┘ä┘à╪¡╪▒┘æ┘â (saveProfile/duplicate/delete/setCurrentProfile).
function ProfileBar({ st, flush }: { st: any; flush: () => void; }) {
    const [saving, setSaving] = useState(false);
    const [nameInput, setNameInput] = useState("");

    const name: string = st.currentProfile?.name ?? "";
    const call = <T,>(fn: () => T, dflt: T): T => { try { return fn(); } catch { return dflt; } };
    const profiles: { name: string; }[] = call(() => st.getProfiles(true), []);
    const isDefault = call(() => st.isCurrentProfileADefaultProfile(), false);

    const save = () => {
        if (!saving) { setNameInput(name); setSaving(true); return; }
        const nm = nameInput.trim();
        if (!nm || call(() => st.getDefaultProfiles().some((v: any) => v.name === nm), false)) return;
        st.saveProfile({ ...st.getCurrentProfile(), name: nm });
        st.setCurrentProfile(st.getProfile(nm) || { name: "" });
        setSaving(false);
        flush();
    };
    const newProfile = () => st.setCurrentProfile({ name: "" });
    const copy = () => { st.setCurrentProfile({ ...st.getCurrentProfile(), name: "" }); setNameInput(""); setSaving(true); };
    const del = () => {
        st.deleteProfile(st.currentProfile);
        st.setCurrentProfile(call(() => st.getDefaultProfiles()[0], { name: "" }) ?? { name: "" });
        flush();
    };
    const pick = (v: string) => { st.setCurrentProfile(st.getProfile(v) || { name: "" }); flush(); };

    return (
        <Tile span>
            <Cap label={t("┘à┘ä┘ü ╪º┘ä╪Ñ╪╣╪»╪º╪»╪º╪¬", "Profile")} value={name || t("╪║┘è╪▒ ┘à╪¡┘ü┘ê╪╕", "unsaved")} />
            <div className="micpro-profrow">
                {saving ? (
                    <input className="micpro-num micpro-profname" type="text" placeholder={t("╪º╪│┘à ╪º┘ä┘à┘ä┘üΓÇª", "Profile nameΓÇª")}
                        value={nameInput} onChange={e => setNameInput(e.currentTarget.value)}
                        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setSaving(false); }} />
                ) : (
                    <div className="micpro-profsel">
                        <Select
                            isSelected={v => v === name}
                            options={[
                                ...(name === "" ? [{ label: t("(╪║┘è╪▒ ┘à╪¡┘ü┘ê╪╕)", "(unsaved)"), value: "" }] : []),
                                ...profiles.map(pr => ({ label: pr.name, value: pr.name }))
                            ]}
                            select={pick}
                            serialize={String}
                            closeOnSelect
                        />
                    </div>
                )}
                <button type="button" className="micpro-pbtn micpro-pbtn-save" title={t("╪¡┘ü╪╕", "Save")} onClick={save}>{saving ? "Γ£ô" : "≡ƒÆ╛"}</button>
                <button type="button" className="micpro-pbtn" title={t("╪¼╪»┘è╪»", "New")} disabled={saving} onClick={newProfile}>∩╝ï</button>
                <button type="button" className="micpro-pbtn" title={t("┘å╪│╪«", "Copy")} disabled={saving} onClick={copy}>Γºë</button>
                <button type="button" className="micpro-pbtn micpro-pbtn-del" title={t("╪¡╪░┘ü", "Delete")} disabled={saving || isDefault || !name} onClick={del}>≡ƒùæ</button>
            </div>
        </Tile>
    );
}

// ΓöÇΓöÇ Γæí ╪╖╪¿┘é╪⌐ ╪º┘ä┘å┘é┘ä: ╪¿╪│┘è╪╖/┘à╪¬┘é╪»┘æ┘à ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
const SIMPLE_BITRATES: [number, string][] = [
    [96, t("╪╣╪º╪»┘è", "Normal")], [160, t("┘à╪¬┘ê╪│╪╖-╪╣╪º┘ä┘ì", "Medium-High")],
    [320, t("╪╣╪º┘ä┘ì", "High")], [512, t("╪╣╪º┘ä┘ì ╪¼╪»╪º┘ï", "Very High")]
];

function TransmissionPane() {
    if (!IS_DISCORD_DESKTOP || micPatcher == null || microphoneStore == null) {
        return <p className="micpro-empty">{t("╪º┘ä┘å┘é┘ä ╪╣╪º┘ä┘è ╪º┘ä╪¼┘ê╪»╪⌐ ┘à╪¬╪º╪¡ ╪╣┘ä┘ë ╪¬╪╖╪¿┘è┘é ╪│╪╖╪¡ ╪º┘ä┘à┘â╪¬╪¿ ┘ü┘é╪╖.", "High-quality transmission is desktop-only.")}</p>;
    }
    return <ErrorBoundary noop><TransmissionControls /></ErrorBoundary>;
}

function TransmissionControls() {
    const st = microphoneStore.use();
    const { currentProfile: p } = st;
    const simple = st.simpleMode ?? true;
    const flush = () => { try { micPatcher?.forceUpdateTransportationOptions(); } catch { /* ╪ó┘à┘å */ } };
    const stereoOn = p.channelsEnabled === true && (p.channels ?? 1) >= 2;

    return (
        <>
            <ProfileBar st={st} flush={flush} />

            <SwitchTile
                label={t("╪º┘ä┘ê╪╢╪╣ ╪º┘ä┘à╪¿╪│┘æ╪╖", "Simple mode")}
                note={simple ? t("┘à┘ü╪╣┘æ┘ä ΓÇö ╪«┘è╪º╪▒╪º╪¬ ╪│┘ç┘ä╪⌐. ╪ú╪╖┘ü╪ª┘ç ┘ä╪╣╪▒╪╢ ╪º┘ä╪Ñ╪╣╪»╪º╪»╪º╪¬ ╪º┘ä┘à╪¬┘é╪»┘æ┘à╪⌐.", "On ΓÇö easy options. Turn off for advanced settings.") : t("┘à╪¬┘é╪»┘æ┘à ΓÇö ╪¬╪¡┘â┘æ┘à ┘â╪º┘à┘ä ╪¿┘à╪╣╪º┘à┘ä╪º╪¬ ╪º┘ä┘å┘é┘ä.", "Advanced ΓÇö full control over transport parameters.")}
                on={simple}
                onChange={v => st.setSimpleMode(v)}
            />

            {simple ? (
                <>
                    <SwitchTile span label={t("╪│╪¬┘è╪▒┘è┘ê", "Stereo")} note={t("┘é┘å╪º╪¬╪º┘å ╪¿╪»┘ä ┘ê╪º╪¡╪»╪⌐", "2 channels")} on={stereoOn}
                        onChange={v => { toggleStereo(st, v, flush); }} />

                    {stereoOn && (
                        <div className="micpro-warn">
                            ΓÜá∩╕Å {t("┘ä╪╢┘à╪º┘å ╪╣┘à┘ä ╪º┘ä╪│╪¬┘è╪▒┘è┘ê ╪ú┘ê┘é┘ü┘å╪º ╪¬┘ä┘é╪º╪ª┘è╪º┘ï: ╪Ñ┘ä╪║╪º╪í ╪º┘ä╪╢┘ê╪╢╪º╪í╪î ╪Ñ┘ä╪║╪º╪í ╪º┘ä╪╡╪»┘ë╪î ┘êAGC ΓÇö ┘ä╪ú┘å┘ç╪º ╪¬┘Å╪¡┘ê┘æ┘ä ╪╡┘ê╪¬┘â ╪Ñ┘ä┘ë ╪ú╪¡╪º╪»┘è ┘ê╪¬┘Å┘ü╪│╪» ╪º┘ä╪│╪¬┘è╪▒┘è┘ê.", "To keep stereo working we automatically turned off noise suppression, echo cancellation and AGC ΓÇö they downmix your mic to mono and break stereo.")}
                        </div>
                    )}

                    <Tile span>
                        <Cap label={t("╪¼┘ê╪»╪⌐ ╪º┘ä╪╡┘ê╪¬", "Audio quality")} value={SIMPLE_BITRATES.find(([v]) => v === (p.voiceBitrate ?? 96))?.[1]} />
                        <div className="micpro-seg">
                            {SIMPLE_BITRATES.map(([v]) => (
                                <button key={v} type="button"
                                    className={"micpro-seg-btn" + ((p.voiceBitrate ?? 96) === v ? " micpro-seg-on" : "")}
                                    onClick={() => { st.setVoiceBitrate(v); st.setVoiceBitrateEnabled(true); flush(); }}>{v}</button>
                            ))}
                        </div>
                    </Tile>
                </>
            ) : (
                <>
                    <SliderTile span label={t("┘à╪╣╪»┘æ┘ä ╪º┘ä╪¿╪¬", "Bitrate")} value={p.voiceBitrate ?? 96} min={8} max={512} step={8}
                        onInput={v => { st.setVoiceBitrate(v); st.setVoiceBitrateEnabled(true); flush(); }} />
                    <div className="micpro-grid2">
                        <NumberTile label={t("╪º┘ä┘é┘å┘ê╪º╪¬", "Channels")} hint={t("1 = ╪ú╪¡╪º╪»┘è ┬╖ 2 = ╪│╪¬┘è╪▒┘è┘ê", "1 = mono ┬╖ 2 = stereo")} def={2}
                            enabled={p.channelsEnabled ?? false} value={p.channels}
                            onToggle={v => { st.setChannelsEnabled(v); flush(); }} onValue={v => { st.setChannels(v); flush(); }} />
                        <NumberTile label={t("┘à╪╣╪»┘æ┘ä ╪º┘ä╪¿┘è╪º┘å╪º╪¬", "Sample rate")} hint={t("╪│╪▒╪╣╪⌐ ╪º┘ä╪¬╪▒┘à┘è╪▓ ΓÇö ╪º┘ä╪ú╪╣┘ä┘ë ╪ú┘ê╪╢╪¡", "Encode rate ΓÇö higher is clearer")} unit="Hz" def={48000}
                            enabled={p.rateEnabled ?? false} value={p.rate}
                            onToggle={v => { st.setRateEnabled(v); flush(); }} onValue={v => { st.setRate(v); flush(); }} />
                        <NumberTile label={t("╪¬╪▒╪»╪» ╪º┘ä╪╣┘è┘å╪º╪¬", "Frequency")} hint={t("╪╣┘è┘æ┘å╪º╪¬/╪½╪º┘å┘è╪⌐ ΓÇö ╪º┘ä╪º┘ü╪¬╪▒╪º╪╢┘è 48000", "Samples/sec ΓÇö default 48000")} unit="Hz" def={48000}
                            enabled={p.freqEnabled ?? false} value={p.freq}
                            onToggle={v => { st.setFreqEnabled(v); flush(); }} onValue={v => { st.setFreq(v); flush(); }} />
                        <NumberTile label={t("╪¡╪¼┘à ╪º┘ä╪¡╪▓┘à╪⌐", "Packet size")} hint={t("╪╣┘è┘æ┘å╪º╪¬ ┘ä┘â┘ä ╪¡╪▓┘à╪⌐ ΓÇö ╪º┘ä╪º┘ü╪¬╪▒╪º╪╢┘è 960", "Samples per packet ΓÇö default 960")} def={960}
                            enabled={p.pacsizeEnabled ?? false} value={p.pacsize}
                            onToggle={v => { st.setPacsizeEnabled(v); flush(); }} onValue={v => { st.setPacsize(v); flush(); }} />
                    </div>
                </>
            )}

            {/* ╪¬╪╖╪¿┘è┘é ╪º┘ä╪Ñ╪╣╪»╪º╪»╪º╪¬/╪º┘ä┘à┘ä┘ü ╪º┘ä╪¡╪º┘ä┘è ╪╣┘ä┘ë ┘à┘â╪º┘ä┘à╪¬┘â ╪º┘ä╪¼╪º╪▒┘è╪⌐ (╪Ñ╪╣╪º╪»╪⌐ ╪»┘ü╪╣ ╪«┘è╪º╪▒╪º╪¬ ╪º┘ä┘å┘é┘ä ╪¡┘è┘æ╪º┘ï) ΓÇö
                ┘à┘ü┘è╪» ╪¿╪╣╪» ╪¬╪¿╪»┘è┘ä ┘à┘ä┘ü ╪º┘ä╪Ñ╪╣╪»╪º╪»╪º╪¬. ╪º┘ä╪¬╪║┘è┘è╪▒╪º╪¬ ╪º┘ä┘ü╪▒╪»┘è╪⌐ ╪¬┘Å╪╖╪¿┘Ä┘æ┘é ╪¡┘è┘æ╪º┘ï ╪ú╪╡┘ä╪º┘ï╪î ┘ê┘ç╪░╪º ┘è╪╢┘à┘å ╪»┘ü╪╣ ╪º┘ä┘â┘ä. */}
            <button type="button" className="micpro-apply" onClick={flush}>
                {t("Γ£ô ╪¬╪╖╪¿┘è┘é ╪╣┘ä┘ë ╪º┘ä┘à┘â╪º┘ä┘à╪⌐", "Γ£ô Apply to call")}
            </button>

            {nativeReady === false ? (
                <div className="micpro-warn">ΓÜá∩╕Å {t("┘à╪¡╪▒┘æ┘â ╪º┘ä╪│╪¬┘è╪▒┘è┘ê ┘ä┘à ┘è┘Å╪¡┘à┘Ä┘æ┘ä╪î ┘ü┘ä┘å ┘è┘Å╪¿┘Ä╪½┘æ ╪º┘ä╪╡┘ê╪¬ ╪│╪¬┘è╪▒┘è┘ê ┘ü╪╣┘ä┘è╪º┘ï. ╪ú╪╣╪» ╪¬╪┤╪║┘è┘ä ╪»┘è╪│┘â┘ê╪▒╪»╪¢ ┘ê╪Ñ┘å ╪º╪│╪¬┘à╪▒┘æ ╪º┘ä╪ú┘à╪▒ ┘ü╪¬╪¡┘é┘æ┘é ┘à┘å ╪º╪¬╪╡╪º┘ä┘â ╪¿╪º┘ä╪Ñ┘å╪¬╪▒┘å╪¬.", "The stereo engine didn't load, so audio won't actually transmit in stereo. Restart Discord; if it persists, check your internet connection.")}</div>
            ) : (
                <div className="micpro-hint">
                    <span className="micpro-dot" />
                    {nativeReady
                        ? t("┘à╪¡╪▒┘æ┘â ╪º┘ä╪│╪¬┘è╪▒┘è┘ê ╪¼╪º┘ç╪▓ ΓÇö ┘è┘Å╪╖╪¿┘Ä┘æ┘é ╪╣┘ä┘ë ┘à┘â╪º┘ä┘à╪¬┘â ╪º┘ä╪¡╪º┘ä┘è╪⌐.", "Stereo engine ready ΓÇö applies to your current call.")
                        : t("┘è┘Å╪╖╪¿┘Ä┘æ┘é ╪╣┘ä┘ë ┘à┘â╪º┘ä┘à╪¬┘â ╪º┘ä╪¡╪º┘ä┘è╪⌐ ╪╣╪¿╪▒ ┘à╪¡╪▒┘æ┘â ╪»┘è╪│┘â┘ê╪▒╪» ╪º┘ä╪ú╪╡┘ä┘è.", "Applies to your current call via Discord's native engine.")}
                </div>
            )}
        </>
    );
}

// ΓöÇΓöÇ ╪¬╪¿┘ê┘è╪¿ ╪º┘ä┘à╪╣╪º┘ä╪¼╪⌐ ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function ProcessingPane() {
    const [s, setS] = useState(readState);
    const [testing, setTesting] = useState(loopbackOn);

    // ╪º┘ä╪¿┘å╪» 3: ╪▓╪º┘à┘É┘å ╪º┘ä╪¡╪º┘ä╪⌐ ╪¡┘è┘æ╪º┘ï ╪¿╪»┘ä ┘é╪▒╪º╪í╪¬┘ç╪º ┘à╪▒┘æ╪⌐ ┘ê╪º╪¡╪»╪⌐ ╪╣┘å╪» ╪º┘ä┘ü╪¬╪¡ ΓÇö ┘å╪│╪¬┘à╪╣ ┘ä╪¬╪║┘è┘æ╪▒╪º╪¬ ┘à╪¡╪▒┘æ┘â ╪º┘ä╪╡┘ê╪¬
    // (╪¿╪»╪í/╪Ñ┘å┘ç╪º╪í ┘à┘â╪º┘ä┘à╪⌐╪î ╪¬╪¿╪»┘è┘ä ╪¼┘ç╪º╪▓ΓÇª) ┘ê┘å┘Å╪¡╪»┘æ╪½ ┘â┘ä ╪½╪º┘å┘è╪⌐ ┘â╪┤╪¿┘â╪⌐ ╪ú┘à╪º┘å ┘ä┘â╪┤┘ü ╪º┘ä╪»╪«┘ê┘ä/╪º┘ä╪«╪▒┘ê╪¼ ┘à┘å ╪º┘ä┘à┘â╪º┘ä┘à╪⌐.
    // ╪º┘ä┘é╪▒╪º╪í╪⌐ ╪¬╪╣┘â╪│ ╪º┘ä┘é┘è┘Ä┘à ╪º┘ä┘à┘Å╪╖╪¿┘Ä┘æ┘é╪⌐ ┘ü╪╣┘ä╪º┘ï ┘ü┘ä╪º ╪¬┘Å╪╡╪º╪»┘à ╪¬╪¡╪»┘è╪½╪º╪¬ ╪º┘ä┘à╪│╪¬╪«╪»┘à ╪º┘ä╪¬┘ü╪º╪ñ┘ä┘è╪⌐.
    useEffect(() => {
        const resync = () => setS(readState());
        const id = setInterval(resync, 1000);
        let subbed = false;
        try { (MediaEngineStore as any).addChangeListener?.(resync); subbed = true; } catch { /* ╪ó┘à┘å */ }
        return () => {
            clearInterval(id);
            if (subbed) { try { (MediaEngineStore as any).removeChangeListener?.(resync); } catch { /* ╪ó┘à┘å */ } }
        };
    }, []);

    const isVAD = s.inputMode === "VOICE_ACTIVITY";
    const sensitivityPct = Math.round(Math.max(0, Math.min(100, s.vadThreshold + 100)));
    const off = !s.inCall;

    return (
        <>
            <Tile span>
                <Cap label={t("┘à╪│╪¬┘ê┘ë ╪º┘ä╪Ñ╪»╪«╪º┘ä", "Input level")} value={`${Math.round(s.inputVolume)}%`} />
                <InputLevel gain={Math.round(s.inputVolume)}
                    onGain={v => { apply.inputVolume(v); setS(p => ({ ...p, inputVolume: v })); }} />
            </Tile>

            <SliderTile span label={t("╪¡╪│╪º╪│┘è╪⌐ ╪º┘ä╪╡┘ê╪¬", "Sensitivity")} value={sensitivityPct} min={0} max={100} disabled={off || !isVAD}
                onInput={v => { const db = v - 100; apply.sensitivity(s.inputMode, db); setS(p => ({ ...p, vadThreshold: db })); }} />

            <div className="micpro-note">{t("╪º╪│╪¡╪¿ ┘à╪│╪¬┘ê┘ë ╪º┘ä╪Ñ╪»╪«╪º┘ä ┘è┘à┘è┘å╪º┘ï/┘è╪│╪º╪▒╪º┘ï ┘ä╪╢╪¿╪╖ ┘â╪│╪¿ ╪º┘ä┘à┘è┘â╪▒┘ê┘ü┘ê┘å╪¢ ┘ê╪º┘ä╪┤╪▒┘è╪╖ ╪º┘ä┘à┘ä┘ê┘æ┘å ┘è┘ê╪╢┘æ╪¡ ╪╡┘ê╪¬┘â ╪º┘ä╪¡┘è┘æ.", "Drag the input level to set your mic gain; the colored bar shows your live voice.")}</div>

            <Tile span>
                <Cap label={t("╪Ñ┘ä╪║╪º╪í ╪º┘ä╪╢┘ê╪╢╪º╪í", "Noise reduction")} />
                <div className="micpro-seg">
                    {([["none", t("╪¿┘ä╪º", "None")], ["standard", t("┘é┘è╪º╪│┘è", "Standard")], ["krisp", "Krisp"]] as [NoiseMode, string][]).map(([mode, lbl]) => (
                        <button key={mode} type="button" disabled={off || (mode === "krisp" && !s.krispSupported)}
                            className={"micpro-seg-btn" + (s.noiseMode === mode ? " micpro-seg-on" : "")}
                            onClick={() => { apply.noise(mode); setS(p => ({ ...p, noiseMode: mode })); }}>{lbl}</button>
                    ))}
                </div>
            </Tile>

            <div className="micpro-grid2">
                <SwitchTile label={t("╪Ñ┘ä╪║╪º╪í ╪º┘ä╪╡╪»┘ë", "Echo cancel")} note={t("┘è╪▓┘è┘ä ╪╡╪»┘ë ╪º┘ä╪│┘à┘æ╪º╪╣╪º╪¬", "Removes speaker echo")} on={s.echo} disabled={off}
                    onChange={v => { apply.echo(v); setS(p => ({ ...p, echo: v })); }} />
                <SwitchTile label={t("AGC ╪¬┘ä┘é╪º╪ª┘è", "Auto AGC")} note={t("┘à┘ê╪º╪▓┘å╪⌐ ╪¬┘ä┘é╪º╪ª┘è╪⌐ ┘ä┘ä┘â╪│╪¿", "Auto gain balancing")} on={s.agc} disabled={off}
                    onChange={v => { apply.agc(v); setS(p => ({ ...p, agc: v })); }} />
            </div>

            <button type="button" className={"micpro-test" + (testing ? " micpro-test-live" : "")}
                onClick={async () => { const next = !testing; setTesting(next); await setLoopback(next, settings.store.autoDeafenOnTest); }}>
                {testing ? t("ΓÅ╣  ╪Ñ┘è┘é╪º┘ü ╪º┘ä╪º╪«╪¬╪¿╪º╪▒", "ΓÅ╣  Stop test") : t("≡ƒÄº  ╪º╪«╪¬╪¿╪º╪▒ ╪º┘ä┘à┘è┘â╪▒┘ê┘ü┘ê┘å (╪│┘à╪º╪╣ ┘å┘ü╪│┘â)", "≡ƒÄº  Test microphone (hear yourself)")}
            </button>

            {off && <div className="micpro-hint">{t("╪¿╪╣╪╢ ╪╣┘å╪º╪╡╪▒ ╪º┘ä┘à╪╣╪º┘ä╪¼╪⌐ ╪¬┘Å╪╖╪¿┘Ä┘æ┘é ╪ú╪½┘å╪º╪í ╪º┘ä┘à┘â╪º┘ä┘à╪⌐ ┘ü┘é╪╖.", "Some processing controls apply only during a call.")}</div>}
        </>
    );
}

function MicIconGlyph() {
    return (
        <span className="micpro-glyph">
            <svg viewBox="0 0 24 24" fill="#fff" aria-hidden>
                <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" />
                <path d="M18 12a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.91V20H8.5a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2H13v-2.09A6 6 0 0 0 18 12Z" />
            </svg>
        </span>
    );
}

function MicProModal({ rootProps }: { rootProps: RenderModalProps; }) {
    const [tab, setTab] = useState<"proc" | "trans">("proc");
    useEffect(() => () => { if (loopbackOn) void setLoopback(false, settings.store.autoDeafenOnTest); }, []);

    // ╪º╪¬╪¼╪º┘ç ╪º┘ä┘ä┘ê╪¡╪⌐ ╪¡╪│╪¿ ╪º┘ä┘ä╪║╪⌐ ΓÇö ┘è┘à┘å╪╣ ╪¬╪┤┘ê┘æ┘ç ╪º┘ä╪╣╪▒╪¿┘è╪⌐ ╪º┘ä┘à╪«╪¬┘ä╪╖╪⌐ (bidi) ┘ü┘è ┘å╪╡┘ê╪╡┘å╪º.
    const dir = isArabicMode() ? "rtl" : "ltr";

    return (
        <ModalRoot {...rootProps} size={ModalSize.SMALL} className="micpro-root">
            <ModalHeader separator={false}>
                <div className="micpro-head" dir={dir}>
                    <MicIconGlyph />
                    <div>
                        <div className="micpro-title">MicPro</div>
                        <div className="micpro-subtitle">{t("┘ä┘ê╪¡╪⌐ ╪¬╪¡┘â┘æ┘à ╪º┘ä┘à┘è┘â╪▒┘ê┘ü┘ê┘å", "Microphone control panel")}</div>
                    </div>
                </div>
            </ModalHeader>
            <ModalContent>
                <div className="micpro-tabs" dir={dir}>
                    <button type="button" className={"micpro-tab" + (tab === "proc" ? " micpro-tab-on" : "")} onClick={() => setTab("proc")}>{t("╪º┘ä┘à╪╣╪º┘ä╪¼╪⌐", "Processing")}</button>
                    <button type="button" className={"micpro-tab" + (tab === "trans" ? " micpro-tab-on" : "")} onClick={() => setTab("trans")}>{t("╪º┘ä┘å┘é┘ä ╪╣╪º┘ä┘è ╪º┘ä╪¼┘ê╪»╪⌐", "Transmission")}</button>
                </div>
                <div className="micpro-body" dir={dir}>
                    {tab === "proc" ? <ProcessingPane /> : <TransmissionPane />}
                </div>
            </ModalContent>
        </ModalRoot>
    );
}

function openPanel() {
    openModal(props => (
        <ErrorBoundary>
            <MicProModal rootProps={props} />
        </ErrorBoundary>
    ));
}

export default definePlugin({
    name: "MicPro",
    description: "One microphone control panel next to the mute button: live level meter, gain, noise reduction (None/Standard/Krisp), echo cancellation, AGC and voice sensitivity ΓÇö all on Discord's native engine so they affect what others hear ΓÇö plus a real loopback test and high-quality stereo transmission with Simple/Advanced modes.",
    authors: [EquicordDevs.LOSTSTR, { name: "philhk", id: 305288513941667851n }],
    tags: ["Voice", "Utility"],
    dependencies: ["PhilsPluginLibrary"],
    settings,
    // ╪╢╪▒┘ê╪▒┘è ┘ä┘ä╪│╪¬┘è╪▒┘è┘ê: ┘è╪╢┘à┘å ╪¡╪╢┘ê╪▒ ┘à╪│╪¬┘à╪╣ ╪º┘ä╪º╪¬╪╡╪º┘ä + ╪¬╪▒┘é┘è╪╣ discord_voice ┘à┘å ╪¿╪»╪º┘è╪⌐ ╪º┘ä╪¼┘ä╪│╪⌐ ┘é╪¿┘ä ╪ú┘è
    // ┘à┘â╪º┘ä┘à╪⌐ (┘å┘ü╪│ ┘à╪º ┘ü╪╣┘ä┘ç BetterMicrophone ╪º┘ä╪ú╪╡┘ä┘è). ╪¿╪»┘ê┘å┘ç ┘é╪» ┘ä╪º ┘è┘Å╪╖╪¿┘Ä┘æ┘é ╪º┘ä╪│╪¬┘è╪▒┘è┘ê ┘à╪╖┘ä┘é╪º┘ï.
    requiresRestart: true,

    start() {
        addSettingsPanelButton({
            name: "MicPro",
            icon: MicrophoneSettingsIcon,
            get tooltipText() { return t("┘ä┘ê╪¡╪⌐ ╪º┘ä┘à┘è┘â╪▒┘ê┘ü┘ê┘å ┬╖ MicPro", "Microphone panel ┬╖ MicPro"); },
            onClick: openPanel
        });

        if (!IS_DISCORD_DESKTOP) return;
        try {
            initMicrophoneStore();
            micPatcher = new MicrophonePatcher().patch();

            // ╪º┘ä╪¿┘å╪» 1: ╪º╪¡╪▒╪│ ┘â┘ä ╪º╪¬╪╡╪º┘ä ╪╡┘ê╪¬┘è ╪¼╪»┘è╪» ΓÇö ╪Ñ┘å ┘â╪º┘å ╪º┘ä╪│╪¬┘è╪▒┘è┘ê ┘à┘ü╪╣┘æ┘ä╪º┘ï ┘ü┘è ╪º┘ä┘à┘ä┘ü╪î ╪ú╪╖┘ü╪ª ┘à┘Å┘ü╪│┘É╪»╪º╪¬┘ç
            // (╪╢┘ê╪╢╪º╪í/╪╡╪»┘ë/AGC) ╪╣┘ä┘ë ╪░┘ä┘â ╪º┘ä╪º╪¬╪╡╪º┘ä ┘ü┘ê╪▒╪º┘ï╪¢ ┘ê╪Ñ┘ä╪º ┘è╪¿╪»╪ú ╪¿╪º┘ü╪¬╪▒╪º╪╢╪º╪¬ ╪»┘è╪│┘â┘ê╪▒╪» ┘ü┘è┘Å╪¡┘ê┘Ä┘æ┘ä ╪╡┘ê╪¬┘â ┘ä╪ú╪¡╪º╪»┘è
            // ╪¿╪╡┘à╪¬ ╪▒╪║┘à ╪¬┘ü╪╣┘è┘ä ╪º┘ä╪│╪¬┘è╪▒┘è┘ê ┘é╪¿┘ä ╪º┘ä┘à┘â╪º┘ä┘à╪⌐. ┘è┘Å╪╖╪¿┘Ä┘æ┘é ┘à╪▒┘æ╪⌐ ╪╣┘å╪» ╪¿╪»╪í ┘â┘ä ┘à┘â╪º┘ä┘à╪⌐╪î ╪¿┘ä╪º ╪ú┘è ┘â┘ä┘ü╪⌐ ╪»┘ê╪▒┘è╪⌐.
            const me = mediaEngine() as any;
            if (me?.emitter) {
                stereoGuardOff = Emitter.addListener(me.emitter, "on", "connection", (connection: any) => {
                    try {
                        if (connection?.context !== "default") return;
                        const p = microphoneStore?.get?.().currentProfile;
                        if (p?.channelsEnabled === true && (p.channels ?? 1) >= 2) disableMonoBreakers(connection);
                    } catch { /* ╪ó┘à┘å */ }
                }, "MicPro");
            }

            const nativeModules = globalThis.DiscordNative?.nativeModules;
            if (!nativeModules?.requireModule) throw new Error("DiscordNative.nativeModules is unavailable");
            nativeModules.requireModule("discord_voice");
            Native?.applyPatches().then(result => {
                if (result.error) { nativeReady = false; console.error("[MicPro] stereo engine failed:", result.error); return; }
                nativeReady = result.ok > 0;
                console.log(`[MicPro] ${result.module_base} | patches: ok:${result.ok} failed:${result.failed} skipped:${result.skipped}`);
            }).catch(e => { nativeReady = false; console.error("[MicPro]", e); });
        } catch (e) {
            console.error("[MicPro] stereo engine init failed", e);
        }
    },

    stop() {
        removeSettingsPanelButton("MicPro");
        if (loopbackOn) void setLoopback(false, settings.store.autoDeafenOnTest);
        try { stereoGuardOff?.(); } catch { /* ╪ó┘à┘å */ }
        stereoGuardOff = undefined;
        try {
            micPatcher?.unpatch();
            Emitter.removeAllListeners(MicEngineInfo.PLUGIN_NAME);
        } catch (e) { console.error("[MicPro] stop cleanup failed", e); }
        micPatcher = undefined;
    }
});