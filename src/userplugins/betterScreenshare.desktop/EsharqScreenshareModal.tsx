/*
 * BetterScreenshare ΓÇö Esharq redesigned panel
 * Copyright (c) 2026 LOSTSTR
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * ┘ä┘ê╪¡╪⌐ ╪¬╪¡┘â┘æ┘à ┘à╪┤╪º╪▒┘â╪⌐ ╪º┘ä╪┤╪º╪┤╪⌐ ╪¿╪ú╪│┘ä┘ê╪¿ ╪¿╪╖╪º┘é╪º╪¬/╪¬╪¿┘ê┘è╪¿┘è┘å ┘ê┘ç┘ê┘è╪⌐ ╪¿┘å┘ü╪│╪¼┘è╪⌐ (╪│┘è┘å┘à╪º) ΓÇö ╪¬┘ä┘ü┘æ ┘à╪¬╪¼╪▒
 * BetterScreenshare (┘å┘ü╪│ ╪ó┘ä┘è┘æ╪¬┘ç) ╪¿┘ê╪º╪¼┘ç╪⌐ ╪╣╪▒╪¿┘è╪⌐ RTL ╪¼┘à┘è┘ä╪⌐ ╪¿╪»┘ä ┘å╪º┘ü╪░╪⌐ ╪º┘ä┘à┘â╪¬╪¿╪⌐ ╪º┘ä╪º┘ü╪¬╪▒╪º╪╢┘è╪⌐.
 */

import "./style.css";

import ErrorBoundary from "@components/ErrorBoundary";
import { isArabicMode, t } from "@utils/esharqI18n";
import { ModalContent, ModalHeader, ModalRoot, type RenderModalProps } from "@utils/esharqModals";
import { ModalSize } from "@utils/modal";
import { React, Select, useState } from "@webpack/common";

// ╪ú┘â┘ê╪º╪» ╪º┘ä┘ü┘è╪»┘è┘ê ╪º┘ä╪¬┘è ┘è╪»╪╣┘à┘ç╪º ╪¿╪½┘æ ╪»┘è╪│┘â┘ê╪▒╪»╪¢ "" = ╪¬┘ä┘é╪º╪ª┘è (╪º╪¬╪▒┘â ╪»┘è╪│┘â┘ê╪▒╪» ┘è┘é╪▒┘æ╪▒ = ╪¬╪╣╪╖┘è┘ä ╪º┘ä╪¬╪¼╪º┘ê┘Å╪▓).
const CODECS: [string, string][] = [
    [t("╪¬┘ä┘é╪º╪ª┘è", "Auto"), ""], ["H264", "H264"], ["VP8", "VP8"], ["VP9", "VP9"], ["AV1", "AV1"]
];

const RESOLUTIONS: [string, number, number][] = [
    ["480p", 720, 480], ["720p", 1280, 720], ["1080p", 1920, 1080],
    ["1440p", 2560, 1440], ["2160p", 3840, 2160]
];
const QUALITIES: [string, number][] = [
    [t("┘à┘å╪«┘ü╪╢", "Low"), 2500], [t("┘à╪¬┘ê╪│╪╖", "Medium"), 5000],
    [t("┘à╪¬┘ê╪│╪╖-╪╣╪º┘ä┘ì", "Medium-High"), 7500], [t("╪╣╪º┘ä┘ì", "High"), 10000]
];
const FPS: number[] = [15, 30, 60];

// ΓöÇΓöÇ ┘ä╪¿┘å╪º╪¬ ╪º┘ä┘ê╪º╪¼┘ç╪⌐ ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
export function Tile({ span, children }: { span?: boolean; children: React.ReactNode; }) {
    return <div className={"bss-tile" + (span ? " bss-span" : "")}>{children}</div>;
}
export function Cap({ label, value, children }: { label: string; value?: string; children?: React.ReactNode; }) {
    return (
        <div className="bss-cap">
            <span className="bss-label">{label}</span>
            {value != null && <span className="bss-val">{value}</span>}
            {children}
        </div>
    );
}
export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void; }) {
    return (
        <button type="button" role="switch" aria-checked={on}
            className={"bss-sw" + (on ? " bss-sw-on" : "")}
            onClick={e => { e.stopPropagation(); onChange(!on); }}><i /></button>
    );
}
export function Seg<T>({ options, current, fmt, onPick }: { options: [string, T][]; current: T; fmt?: (v: T) => boolean; onPick: (v: T) => void; }) {
    return (
        <div className="bss-seg">
            {options.map(([label, v], i) => (
                <button key={i} type="button"
                    className={"bss-seg-btn" + ((fmt ? fmt(v) : v === current) ? " bss-seg-on" : "")}
                    onClick={() => onPick(v)}>{label}</button>
            ))}
        </div>
    );
}
export function RangeBar({ value, min, max, step, onInput }: { value: number; min: number; max: number; step?: number; onInput: (v: number) => void; }) {
    const pct = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;
    return (
        <div className="bss-range">
            <span className="bss-range-fill" style={{ width: `${pct}%` }} />
            <input type="range" min={min} max={max} step={step ?? 1} value={value}
                onChange={e => onInput(Number(e.currentTarget.value))} />
        </div>
    );
}
export function NumTile({ label, unit, value, def, onValue, enabled, onToggle }: { label: string; unit?: string; value?: number; def: number; onValue: (v: number) => void; enabled?: boolean; onToggle?: (v: boolean) => void; }) {
    return (
        <Tile>
            <Cap label={label}>{onToggle && <Switch on={enabled ?? false} onChange={onToggle} />}</Cap>
            <div className="bss-numwrap">
                <input className="bss-num" type="number" value={value ?? ""} placeholder={String(def)}
                    onChange={e => { const n = parseInt(e.currentTarget.value, 10); if (Number.isFinite(n)) onValue(n); }} />
                {unit && <span className="bss-unit">{unit}</span>}
            </div>
        </Tile>
    );
}

// ΓöÇΓöÇ ╪┤╪▒┘è╪╖ ┘à┘ä┘ü╪º╪¬ ╪º┘ä╪Ñ╪╣╪»╪º╪»╪º╪¬ ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
export function ProfileBar({ st, apply }: { st: any; apply: () => void; }) {
    const [saving, setSaving] = useState(false);
    const [nameInput, setNameInput] = useState("");
    const name: string = st.currentProfile?.name ?? "";
    const call = <T,>(fn: () => T, d: T): T => { try { return fn(); } catch { return d; } };
    const profiles: { name: string; }[] = call(() => st.getProfiles(true), []);
    const isDefault = call(() => st.isCurrentProfileADefaultProfile(), false);

    const save = () => {
        if (!saving) { setNameInput(name); setSaving(true); return; }
        const nm = nameInput.trim();
        if (!nm || call(() => st.getDefaultProfiles().some((v: any) => v.name === nm), false)) return;
        st.saveProfile({ ...st.getCurrentProfile(), name: nm });
        st.setCurrentProfile(st.getProfile(nm) || { name: "" });
        setSaving(false); apply();
    };
    return (
        <Tile span>
            <Cap label={t("┘à┘ä┘ü ╪º┘ä╪Ñ╪╣╪»╪º╪»╪º╪¬", "Profile")} value={name || t("╪║┘è╪▒ ┘à╪¡┘ü┘ê╪╕", "unsaved")} />
            <div className="bss-profrow">
                {saving ? (
                    <input className="bss-num bss-profname" type="text" placeholder={t("╪º╪│┘à ╪º┘ä┘à┘ä┘üΓÇª", "Profile nameΓÇª")}
                        value={nameInput} onChange={e => setNameInput(e.currentTarget.value)}
                        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setSaving(false); }} />
                ) : (
                    <div className="bss-select">
                        <Select
                            isSelected={v => v === name}
                            options={[
                                ...(name === "" ? [{ label: t("(╪║┘è╪▒ ┘à╪¡┘ü┘ê╪╕)", "(unsaved)"), value: "" }] : []),
                                ...profiles.map(p => ({ label: p.name, value: p.name }))
                            ]}
                            select={v => { st.setCurrentProfile(st.getProfile(v) || { name: "" }); apply(); }}
                            serialize={String}
                            closeOnSelect
                        />
                    </div>
                )}
                <button type="button" className="bss-pbtn bss-pbtn-save" title={t("╪¡┘ü╪╕", "Save")} onClick={save}>{saving ? "Γ£ô" : "≡ƒÆ╛"}</button>
                <button type="button" className="bss-pbtn" title={t("╪¼╪»┘è╪»", "New")} disabled={saving} onClick={() => st.setCurrentProfile({ name: "" })}>∩╝ï</button>
                <button type="button" className="bss-pbtn" title={t("┘å╪│╪«", "Copy")} disabled={saving} onClick={() => { st.setCurrentProfile({ ...st.getCurrentProfile(), name: "" }); setNameInput(""); setSaving(true); }}>Γºë</button>
                <button type="button" className="bss-pbtn bss-pbtn-del" title={t("╪¡╪░┘ü", "Delete")} disabled={saving || isDefault || !name} onClick={() => { st.deleteProfile(st.currentProfile); st.setCurrentProfile(call(() => st.getDefaultProfiles()[0], { name: "" }) ?? { name: "" }); apply(); }}>≡ƒùæ</button>
            </div>
        </Tile>
    );
}

function Body({ st, apply, onOpenAudio }: { st: any; apply: () => void; onOpenAudio?: () => void; }) {
    const p = st.currentProfile;
    const simple = st.simpleMode ?? true;
    const setRes = (w: number, h: number) => { st.setWidth(w); st.setHeight(h); st.setResolutionEnabled(true); apply(); };
    const setBitrate = (v: number) => { st.setVideoBitrate(v); st.setVideoBitrateEnabled(true); apply(); };
    const setFps = (v: number) => { st.setFramerate(v); st.setFramerateEnabled(true); apply(); };

    return (
        <>
            <div className="bss-tile bss-tap bss-span" onClick={() => st.setSimpleMode(!simple)}>
                <Cap label={t("╪º┘ä┘ê╪╢╪╣ ╪º┘ä┘à╪¿╪│┘æ╪╖", "Simple mode")}><Switch on={simple} onChange={v => st.setSimpleMode(v)} /></Cap>
                <span className="bss-note">{simple ? t("╪«┘è╪º╪▒╪º╪¬ ╪│┘ç┘ä╪⌐ ΓÇö ╪ú╪╖┘ü╪ª┘ç ┘ä┘ä╪¬╪¡┘â┘æ┘à ╪º┘ä┘â╪º┘à┘ä.", "Easy options ΓÇö turn off for full control.") : t("┘à╪¬┘é╪»┘æ┘à ΓÇö ╪¬╪¡┘â┘æ┘à ┘â╪º┘à┘ä ╪¿┘â┘ä ╪º┘ä┘à╪╣╪º┘à┘ä╪º╪¬.", "Advanced ΓÇö full control over every parameter.")}</span>
            </div>

            {simple ? (
                <>
                    <Tile span>
                        <Cap label={t("╪º┘ä╪»┘é╪⌐", "Resolution")} value={RESOLUTIONS.find(([, w, h]) => w === p.width && h === p.height)?.[0]} />
                        <Seg options={RESOLUTIONS.map(([l, w, h]) => [l, [w, h]] as [string, [number, number]])}
                            current={[p.width, p.height]} fmt={([w, h]) => w === p.width && h === p.height}
                            onPick={([w, h]) => setRes(w, h)} />
                    </Tile>
                    <Tile span>
                        <Cap label={t("╪º┘ä╪¼┘ê╪»╪⌐", "Quality")} value={QUALITIES.find(([, v]) => v === p.videoBitrate)?.[0]} />
                        <Seg options={QUALITIES} current={p.videoBitrate} onPick={setBitrate} />
                    </Tile>
                    <Tile span>
                        <Cap label={t("┘à╪╣╪»┘æ┘ä ╪º┘ä╪Ñ╪╖╪º╪▒╪º╪¬", "Framerate")} value={`${p.framerate ?? 60} FPS`} />
                        <Seg options={FPS.map(f => [`${f}`, f] as [string, number])} current={p.framerate} onPick={setFps} />
                    </Tile>
                </>
            ) : (
                <>
                    <Tile span>
                        <Cap label={t("╪º┘ä╪»┘é╪⌐", "Resolution")} value={`${p.width ?? 1920}├ù${p.height ?? 1080}`}>
                            <Switch on={p.resolutionEnabled ?? false} onChange={v => { st.setResolutionEnabled(v); apply(); }} />
                        </Cap>
                        <div className="bss-grid2">
                            <div className="bss-numwrap">
                                <input className="bss-num" type="number" value={p.width ?? ""} placeholder="1920"
                                    onChange={e => { const n = parseInt(e.currentTarget.value, 10); if (Number.isFinite(n)) { st.setWidth(n); st.setResolutionEnabled(true); apply(); } }} />
                                <span className="bss-unit">{t("╪º┘ä╪╣╪▒╪╢", "W")}</span>
                            </div>
                            <div className="bss-numwrap">
                                <input className="bss-num" type="number" value={p.height ?? ""} placeholder="1080"
                                    onChange={e => { const n = parseInt(e.currentTarget.value, 10); if (Number.isFinite(n)) { st.setHeight(n); st.setResolutionEnabled(true); apply(); } }} />
                                <span className="bss-unit">{t("╪º┘ä╪º╪▒╪¬┘ü╪º╪╣", "H")}</span>
                            </div>
                        </div>
                    </Tile>
                    <div className="bss-grid2">
                        <NumTile label={t("┘à╪╣╪»┘æ┘ä ╪º┘ä╪Ñ╪╖╪º╪▒╪º╪¬", "Framerate")} unit="FPS" value={p.framerate} def={60} onValue={setFps}
                            enabled={p.framerateEnabled} onToggle={v => { st.setFramerateEnabled(v); apply(); }} />
                        <NumTile label={t("┘ü╪º╪╡┘ä ╪º┘ä╪Ñ╪╖╪º╪▒ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è", "Keyframe interval")} unit="ms" value={p.keyframeInterval} def={0}
                            onValue={v => { st.setKeyframeInterval(v); st.setKeyframeIntervalEnabled(true); apply(); }}
                            enabled={p.keyframeIntervalEnabled} onToggle={v => { st.setKeyframeIntervalEnabled(v); apply(); }} />
                    </div>
                    <Tile span>
                        <Cap label={t("┘à╪╣╪»┘æ┘ä ╪º┘ä╪¿╪¬", "Bitrate")} value={`${p.videoBitrate ?? 5000} kb/s`}>
                            <Switch on={p.videoBitrateEnabled ?? false} onChange={v => { st.setVideoBitrateEnabled(v); apply(); }} />
                        </Cap>
                        <RangeBar value={p.videoBitrate ?? 5000} min={500} max={20000} step={100} onInput={setBitrate} />
                    </Tile>
                    <Tile span>
                        <Cap label={t("┘â┘ê╪»┘è┘â ╪º┘ä┘ü┘è╪»┘è┘ê", "Video codec")} value={p.videoCodecEnabled && p.videoCodec ? p.videoCodec : t("╪¬┘ä┘é╪º╪ª┘è", "Auto")} />
                        <Seg
                            options={CODECS}
                            current={p.videoCodecEnabled ? (p.videoCodec ?? "") : ""}
                            onPick={v => {
                                if (v === "") st.setVideoCodecEnabled(false);
                                else { st.setVideoCodec(v); st.setVideoCodecEnabled(true); }
                                apply();
                            }}
                        />
                        <span className="bss-note">{t("H264 ╪º┘ä╪ú┘ê╪│╪╣ ╪¬┘ê╪º┘ü┘é╪º┘ï. ┬½╪¬┘ä┘é╪º╪ª┘è┬╗ ┘è╪¬╪▒┘â ╪»┘è╪│┘â┘ê╪▒╪» ┘è╪«╪¬╪º╪▒.", "H264 is the most compatible. \"Auto\" lets Discord choose.")}</span>
                    </Tile>
                    <div className="bss-tile bss-tap bss-span" onClick={() => onOpenAudio?.()}>
                        <Cap label={t("╪Ñ╪╣╪»╪º╪»╪º╪¬ ╪º┘ä╪╡┘ê╪¬", "Audio settings")}>
                            <span className="bss-open">{t("┘ü╪¬╪¡", "Open")} Γåù</span>
                        </Cap>
                        <span className="bss-note">{t("╪¬╪▒┘à┘è╪▓ ╪╡┘ê╪¬ ╪º┘ä┘à╪┤╪º╪▒┘â╪⌐: ╪º┘ä┘é┘å┘ê╪º╪¬╪î ╪¬╪▒╪»┘æ╪» ┘ê┘à╪╣╪»┘æ┘ä ╪º┘ä╪╣┘è┘æ┘å╪⌐╪î ╪¡╪¼┘à ╪º┘ä╪¡╪▓┘à╪⌐╪î ┘ê┘à╪╣╪»┘æ┘ä ╪º┘ä╪¿┘É╪¬.", "Shared-audio encoding: channels, sample frequency/rate, packet size and bitrate.")}</span>
                    </div>
                </>
            )}

            <div className="bss-tile bss-tap bss-span" onClick={() => { st.setHdrEnabled(!p.hdrEnabled); apply(); }}>
                <Cap label={t("HDR (┘à╪»┘ë ╪»┘è┘å╪º┘à┘è┘â┘è ╪╣╪º┘ä┘ì)", "HDR (high dynamic range)")}><Switch on={p.hdrEnabled ?? false} onChange={v => { st.setHdrEnabled(v); apply(); }} /></Cap>
                <span className="bss-note">{t("╪ú┘ä┘ê╪º┘å ╪ú┘ê╪╢╪¡ ╪Ñ┘å ╪»╪╣┘à┘ç╪º ╪¼┘ç╪º╪▓┘â ┘ê╪º┘ä┘à╪┤╪º┘ç╪».", "Richer colors when your device and the viewer support it.")}</span>
            </div>

            <ProfileBar st={st} apply={apply} />

            <button type="button" className="bss-apply" onClick={apply}>{t("Γ£ô ╪¬╪╖╪¿┘è┘é ╪╣┘ä┘ë ╪º┘ä╪¿╪½┘æ", "Γ£ô Apply to stream")}</button>

            <div className="bss-hint">
                <span className="bss-dot" />
                {t("┘ä╪ú┘ü╪╢┘ä ╪¼┘ê╪»╪⌐: ╪º╪¿╪»╪ú ╪º┘ä╪¿╪½┘æ ╪½┘à ╪º┘ü╪¬╪¡ ┘ç╪░┘ç ╪º┘ä┘ä┘ê╪¡╪⌐ ┘ê╪╖╪¿┘æ┘é. Krisp/╪Ñ┘ä╪║╪º╪í ╪º┘ä╪╡╪»┘ë ┘é╪» ┘è╪«┘ü╪╢ ╪¼┘ê╪»╪⌐ ╪╡┘ê╪¬ ╪º┘ä┘à╪┤╪º╪▒┘â╪⌐.", "For best quality: go live, then open this panel and Apply. Krisp/echo-cancel can lower shared-audio quality.")}
            </div>
        </>
    );
}

export function EsharqScreenshareModal({ rootProps, screenshareStore, onDone, onOpenAudio }: { rootProps: RenderModalProps; screenshareStore: any; onDone: () => void; onOpenAudio?: () => void; }) {
    const st = screenshareStore.use();
    const apply = () => { try { onDone(); } catch { /* ╪ó┘à┘å */ } };
    const dir = isArabicMode() ? "rtl" : "ltr";

    return (
        <ModalRoot {...rootProps} size={ModalSize.SMALL} className="bss-root">
            <ModalHeader separator={false}>
                <div className="bss-head" dir={dir}>
                    <span className="bss-glyph">
                        <svg viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-6v2h2a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h2v-2H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" /></svg>
                    </span>
                    <div>
                        <div className="bss-title">BetterScreenshare</div>
                        <div className="bss-subtitle">{t("┘ä┘ê╪¡╪⌐ ╪¬╪¡┘â┘æ┘à ┘à╪┤╪º╪▒┘â╪⌐ ╪º┘ä╪┤╪º╪┤╪⌐", "Screen-share control panel")}</div>
                    </div>
                </div>
            </ModalHeader>
            <ModalContent>
                <div className="bss-body" dir={dir}>
                    <ErrorBoundary noop><Body st={st} apply={apply} onOpenAudio={onOpenAudio} /></ErrorBoundary>
                </div>
            </ModalContent>
        </ModalRoot>
    );
}