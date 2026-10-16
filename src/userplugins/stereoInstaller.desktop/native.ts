/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { VENCORD_USER_AGENT } from "@shared/vencordUserAgent";
import { spawn } from "child_process";
import { app, dialog, type IpcMainInvokeEvent } from "electron";
import method2Index from "file://StereoMethods/Discord-Voice/index.js?base64&trim=false";
import { appendFileSync, constants, type Dirent, existsSync, mkdirSync, readdirSync } from "fs";
import { access, chmod, cp, mkdir, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import { arch, homedir, platform as osPlatform, release } from "os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "path";

const APP_NAME = "StereoInstaller";
const DATA_DIR_NAME = "DiscordStereoHubSimple";
const MAX_DOWNLOAD_BYTES = 160 * 1024 * 1024;
const MAX_VISIBLE_LOG_LINES = 500;
const PATCHED_WINDOWS_GITHUB_CONTENTS_API = "https://api.github.com/repos/ProdHallow/Discord-Stereo-Windows-MacOS-Linux/contents/Updates%2FNodes%2FPatched%20Nodes%20%28for%20Installer%29%2FWindows";
const PATCHED_LINUX_GITHUB_CONTENTS_API = "https://api.github.com/repos/ProdHallow/Discord-Stereo-Windows-MacOS-Linux/contents/Updates%2FNodes%2FPatched%20Nodes%20%28for%20Installer%29%2FLinux";

export interface InstallInfo {
    platformKey: string;
    platformLabel: string;
    readableOs: string;
    discordRoot: string;
    voiceDir: string;
    appDir?: string;
    clientLabel: string;
    buildLabel: string;
    lastPatchLabel: string;
    lastPatchLabels: LastPatchLabels;
    installStatus: StereoInstallStatus;
    installedMethod: PatchMethod | null;
    repatchWarning: string;
}

export interface ActionInfo extends InstallInfo {
    logPath: string;
}

export type StereoMethod2Quality = "128" | "384" | "512";
export type StereoInstallStatus = "installed" | "notInstalled" | "needsReinstall";
export type PatchMethod = "discordAudioCollective" | "voicePlayground" | "customModule";
type SingleFileName = "discord_voice.node" | "index.js";

export interface LastPatchLabels {
    discordAudioCollective: string;
    voicePlayground: string;
    customModule: string;
}

const PATCH_METHOD_LABELS: Record<PatchMethod, string> = {
    discordAudioCollective: "Discord Audio Collective Method",
    voicePlayground: "Voice Playground Method",
    customModule: "Custom Module Method"
};
const PATCH_METHODS: PatchMethod[] = ["discordAudioCollective", "voicePlayground", "customModule"];

export type NativeResult<T> = {
    success: true;
    data: T;
    logs: string[];
} | {
    success: false;
    error: string;
    logs: string[];
};

interface Target {
    discordRoot: string;
    voiceDir: string;
    appDir?: string;
    exeName?: string;
}

interface GithubContentFile {
    type: "file";
    name: string;
    download_url: string;
}

interface RelaunchConfig {
    platformKey: string;
    discordRoot: string;
    appDir?: string;
    exeName?: string;
}

interface WorkerConfig {
    actionName: "Patch" | "Revert";
    parentPid: number;
    sourceDir: string;
    targetDir: string;
    copyMode: "directory" | "singleFile";
    fileName?: SingleFileName;
    metaPath?: string;
    statePath: string;
    activeMethod?: PatchMethod;
    patchClientLabel: string;
    patchBuildLabel: string;
    logPath: string;
    logPaths: string[];
    taskName?: string;
    relaunch: RelaunchConfig;
}

interface ProcessResult {
    code: number;
    output: string;
}

interface InstallationState {
    status: StereoInstallStatus;
    method: PatchMethod | null;
}

interface PatchMeta {
    method: PatchMethod;
    buildLabel: string;
    time: number;
}

const allowedDiscordRoots = new Set<string>();

class ActionLog {
    public readonly lines: string[] = [];

    public info(message: string): void {
        this.write(message);
    }

    public ok(message: string): void {
        this.write(`OK: ${message}`);
    }

    public warn(message: string): void {
        this.write(`WARN: ${message}`);
    }

    public fail(message: string): void {
        this.write(`FAIL: ${message}`);
    }

    private write(message: string): void {
        const line = `[${new Date().toLocaleString()}] ${message}`;
        this.lines.push(line);
        appendLogLine(line);
    }
}

export async function autoDetect(_: IpcMainInvokeEvent): Promise<NativeResult<InstallInfo>> {
    const log = new ActionLog();

    try {
        const target = await resolveTarget();
        if (!target) throw new Error("Could not find discord_voice.node. Open Discord once, join a voice channel once, then try again.");

        rememberAllowedRoot(target.discordRoot);
        log.ok(`Auto-detected voice module: ${target.voiceDir}`);

        return ok(await installInfoFromTarget(target), log.lines);
    } catch (error) {
        log.fail(errorMessage(error));
        return fail(errorMessage(error), log.lines);
    }
}

export async function chooseDiscordRoot(_: IpcMainInvokeEvent): Promise<NativeResult<InstallInfo | null>> {
    const log = new ActionLog();

    try {
        const result = await dialog.showOpenDialog({
            title: "Select your Discord install folder",
            properties: ["openDirectory"]
        });

        if (result.canceled || !result.filePaths[0]) return ok(null, log.lines);

        const selectedRoot = normalizeInputPath(result.filePaths[0]);
        rememberAllowedRoot(selectedRoot);
        log.info(`Selected Discord root: ${selectedRoot}`);

        const target = await resolveTarget(selectedRoot);
        if (!target) throw new Error("Could not find discord_voice.node in that Discord install folder.");

        rememberAllowedRoot(target.discordRoot);
        log.ok(`Found voice module: ${target.voiceDir}`);

        return ok(await installInfoFromTarget(target), log.lines);
    } catch (error) {
        log.fail(errorMessage(error));
        return fail(errorMessage(error), log.lines);
    }
}

export async function chooseCustomModuleFolder(_: IpcMainInvokeEvent): Promise<NativeResult<string | null>> {
    const log = new ActionLog();

    try {
        const result = await dialog.showOpenDialog({
            title: "Select your custom module folder",
            properties: ["openDirectory"]
        });

        if (result.canceled || !result.filePaths[0]) return ok(null, log.lines);

        const selectedFolder = normalizeInputPath(result.filePaths[0]);
        log.info(`Selected custom module folder: ${selectedFolder}`);

        return ok(selectedFolder, log.lines);
    } catch (error) {
        log.fail(errorMessage(error));
        return fail(errorMessage(error), log.lines);
    }
}

export async function readLogs(_: IpcMainInvokeEvent): Promise<NativeResult<string[]>> {
    for (const pathValue of logPaths()) {
        if (!await isFile(pathValue)) continue;

        try {
            return ok((await readFile(pathValue, "utf8")).split(/\r?\n/).filter(Boolean).slice(-MAX_VISIBLE_LOG_LINES), []);
        } catch { }
    }

    return ok([], []);
}

export async function clearLogs(_: IpcMainInvokeEvent): Promise<NativeResult<true>> {
    try {
        for (const pathValue of logPaths()) {
            await mkdir(dirname(pathValue), { recursive: true });
            await writeFile(pathValue, "", "utf8");
        }

        return ok(true, []);
    } catch (error) {
        return fail(`Could not clear StereoInstaller logs. ${errorMessage(error)}`, []);
    }
}

export async function patch(_: IpcMainInvokeEvent, rootPath: string): Promise<NativeResult<ActionInfo>> {
    const log = new ActionLog();

    try {
        const target = await targetFromRendererRoot(rootPath);
        log.info("=== Patch ===");
        log.info(`Discord root: ${target.discordRoot}`);
        log.info(`Voice dir: ${target.voiceDir}`);

        await ensurePermanentUnpatchedBackup(target, log);
        const patchedVoiceDir = await downloadPatchedPayload(log);
        await scheduleWorker("Patch", patchedVoiceDir, target, "discordAudioCollective", log);
        log.ok("Patch scheduled. Discord will close, install Discord Audio Collective Method, then reopen.");

        return ok({ ...await installInfoFromTarget(target), logPath: logPath() }, log.lines);
    } catch (error) {
        log.fail(errorMessage(error));
        return fail(errorMessage(error), log.lines);
    }
}

export async function patchMethod2(_: IpcMainInvokeEvent, rootPath: string, quality: StereoMethod2Quality): Promise<NativeResult<ActionInfo>> {
    const log = new ActionLog();

    try {
        const target = await targetFromRendererRoot(rootPath);
        const methodTarget = await method2Target(target);
        assertVoicePlaygroundSupported();

        log.info("=== Patch Voice Playground Method ===");
        log.info(`Discord root: ${methodTarget.discordRoot}`);
        log.info(`Voice dir: ${methodTarget.voiceDir}`);
        log.info(`Stereo quality: ${quality}`);

        if (!await looksLikeDiscordVoiceDir(methodTarget.voiceDir)) {
            throw new Error(`Voice Playground Method target folder was not found or is incomplete: ${methodTarget.voiceDir}`);
        }

        await ensurePermanentUnpatchedBackup(methodTarget, log);
        const patchedVoiceDir = await prepareMethod2Payload(quality, log);
        await scheduleWorker("Patch", patchedVoiceDir, methodTarget, "voicePlayground", log, "singleFile");
        log.ok("Patch scheduled. Discord will close, install Voice Playground Method, then reopen.");

        return ok({ ...await installInfoFromTarget(methodTarget), logPath: logPath() }, log.lines);
    } catch (error) {
        log.fail(errorMessage(error));
        return fail(errorMessage(error), log.lines);
    }
}

export async function patchMethod2Index(_: IpcMainInvokeEvent, rootPath: string): Promise<NativeResult<ActionInfo>> {
    const log = new ActionLog();

    try {
        const target = await targetFromRendererRoot(rootPath);
        const methodTarget = await method2Target(target);
        assertVoicePlaygroundSupported();

        log.info("=== Patch Voice Playground index.js ===");
        log.info(`Discord root: ${methodTarget.discordRoot}`);
        log.info(`Voice dir: ${methodTarget.voiceDir}`);

        if (!await looksLikeDiscordVoiceDir(methodTarget.voiceDir)) {
            throw new Error(`Voice Playground Method target folder was not found or is incomplete: ${methodTarget.voiceDir}`);
        }

        await ensurePermanentUnpatchedBackup(methodTarget, log);
        const patchedIndexDir = await prepareMethod2IndexPayload(log);
        await scheduleWorker("Patch", patchedIndexDir, methodTarget, undefined, log, "singleFile", "index.js");
        log.ok("Patch scheduled. Discord will close, install index.js, then reopen.");

        return ok({ ...await installInfoFromTarget(methodTarget), logPath: logPath() }, log.lines);
    } catch (error) {
        log.fail(errorMessage(error));
        return fail(errorMessage(error), log.lines);
    }
}

export async function patchCustomModule(_: IpcMainInvokeEvent, rootPath: string, customFolderPath: string): Promise<NativeResult<ActionInfo>> {
    const log = new ActionLog();

    try {
        const target = await targetFromRendererRoot(rootPath);
        const customDir = normalizeInputPath(customFolderPath);

        log.info("=== Patch Custom Module Method ===");
        log.info(`Discord root: ${target.discordRoot}`);
        log.info(`Voice dir: ${target.voiceDir}`);
        log.info(`Custom module folder: ${customDir}`);

        if (!await pathExists(customDir)) {
            throw new Error(`Custom module folder does not exist: ${customDir}`);
        }

        const hasNodeFile = await isFile(join(customDir, "discord_voice.node"));
        const hasIndexFile = await isFile(join(customDir, "index.js"));

        if (!hasNodeFile && !hasIndexFile) {
            throw new Error(`No discord_voice.node or index.js found in custom folder: ${customDir}`);
        }

        await ensurePermanentUnpatchedBackup(target, log);

        if (hasNodeFile && !hasIndexFile) {
            // skipHubDirCheck=true: user-selected folder may be anywhere on disk
            await scheduleWorker("Patch", customDir, target, "customModule", log, "singleFile", "discord_voice.node", true);
        } else {
            await scheduleWorker("Patch", customDir, target, "customModule", log, "directory", "discord_voice.node", true);
        }

        log.ok("Patch scheduled. Discord will close, install custom module, then reopen.");

        return ok({ ...await installInfoFromTarget(target), logPath: logPath() }, log.lines);
    } catch (error) {
        log.fail(errorMessage(error));
        return fail(errorMessage(error), log.lines);
    }
}

export async function revert(_: IpcMainInvokeEvent, rootPath: string): Promise<NativeResult<ActionInfo>> {
    const log = new ActionLog();

    try {
        const target = await targetFromRendererRoot(rootPath);
        const backupDir = permanentBackupDir(target);

        log.info("=== Revert ===");
        log.info(`Discord root: ${target.discordRoot}`);
        log.info(`Voice dir: ${target.voiceDir}`);

        if (!await looksLikeDiscordVoiceDir(backupDir)) {
            throw new Error(`No permanent UNPATCHED backup found at: ${backupDir}. Run Patch once first to create the baseline.`);
        }

        await scheduleWorker("Revert", backupDir, target, undefined, log);
        log.ok("Revert scheduled. Discord will close, restore the backup, then reopen.");

        return ok({ ...await installInfoFromTarget(target), logPath: logPath() }, log.lines);
    } catch (error) {
        log.fail(errorMessage(error));
        return fail(errorMessage(error), log.lines);
    }
}

function ok<T>(data: T, logs: string[]): NativeResult<T> {
    return { success: true, data, logs };
}

function fail<T>(error: string, logs: string[]): NativeResult<T> {
    return { success: false, error, logs };
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Unknown error.";
}

function platformKey(): string {
    const key = process.platform;
    if (key === "win32") return "windows";
    if (key === "darwin") return "macos";
    if (key === "linux") return "linux";
    return key || "unknown";
}

function platformLabel(key: string): string {
    if (key === "windows") return "Windows";
    if (key === "macos") return "macOS";
    if (key === "linux") return "Linux";
    return key ? key[0].toUpperCase() + key.slice(1) : "Unknown";
}

function assertVoicePlaygroundSupported(): void {
    if (platformKey() !== "windows") {
        throw new Error("Voice Playground Method is only available on Windows. Use Discord Audio Collective Method on Linux.");
    }
}

function readableOs(): string {
    return `${osPlatform()} ${release()} (${arch()})`;
}

function hubDataDir(): string {
    const key = platformKey();
    if (key === "windows") {
        return join(process.env.LOCALAPPDATA || process.env.APPDATA || homedir(), DATA_DIR_NAME);
    }

    if (key === "macos") {
        return join(homedir(), "Library", "Application Support", DATA_DIR_NAME);
    }

    const xdgDataHome = (process.env.XDG_DATA_HOME || "").trim();
    return join(xdgDataHome || join(homedir(), ".local", "share"), DATA_DIR_NAME);
}

function logPath(): string {
    return join(discordVoiceLoggingDir(), "StereoInstaller.log");
}

function fallbackLogPath(): string {
    return join(hubDataDir(), "discord_stereo_hub.log");
}

function logPaths(): string[] {
    return Array.from(new Set([logPath(), fallbackLogPath()].map((pathValue: string) => resolve(pathValue))));
}

function appendLogLine(line: string): void {
    for (const pathValue of logPaths()) {
        try {
            mkdirSync(dirname(pathValue), { recursive: true });
            appendFileSync(pathValue, `${line}\n`, "utf8");
        } catch { }
    }
}

function discordVoiceLoggingDir(): string {
    return join(sourceDiscordVoiceDir() ?? join(hubDataDir(), "StereoMethods", "Discord-Voice"), "Logging");
}

function sourceDiscordVoiceDir(): string | undefined {
    const relativeDiscordVoiceDir = join("src", "userplugins", "stereoInstaller.desktop", "StereoMethods", "Discord-Voice");
    const roots = [
        process.cwd(),
        app.getAppPath(),
        dirname(process.execPath),
        process.env.INIT_CWD,
        process.env.PWD,
    ].filter((pathValue: string | undefined): pathValue is string => !!pathValue);

    for (const root of roots) {
        let current = resolve(root);
        for (let i = 0; i < 8; i++) {
            const candidate = join(current, relativeDiscordVoiceDir);
            if (existsSync(candidate)) return candidate;

            const parent = dirname(current);
            if (parent === current) break;
            current = parent;
        }
    }

    return undefined;
}

function normalizeInputPath(pathValue: string): string {
    if (typeof pathValue !== "string" || !pathValue.trim() || pathValue.length > 4096) {
        throw new Error("Discord install folder is invalid.");
    }

    return resolve(pathValue);
}

function canonicalPath(pathValue: string): string {
    const resolved = resolve(pathValue);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(a: string, b: string): boolean {
    return canonicalPath(a) === canonicalPath(b);
}

function isPathInside(parentPath: string, childPath: string): boolean {
    const rel = relative(canonicalPath(parentPath), canonicalPath(childPath));
    return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel));
}

function assertPathInside(parentPath: string, childPath: string): void {
    if (!isPathInside(parentPath, childPath)) {
        throw new Error("Resolved path is outside the allowed folder.");
    }
}

function rememberAllowedRoot(root: string): void {
    allowedDiscordRoots.add(canonicalPath(root));
}

function defaultDiscordRoots(): string[] {
    const key = platformKey();
    const home = homedir();

    if (key === "windows") {
        const localAppData = process.env.LOCALAPPDATA || "";
        return [
            "Discord",
            "DiscordCanary",
            "DiscordPTB",
            "DiscordDevelopment",
            "Lightcord",
            "Vencord",
            "VoidCord",
            "BetterVencord"
        ].map((name: string) => join(localAppData, name)).filter((pathValue: string) => !!pathValue);
    }

    if (key === "macos") {
        return [
            join(home, "Library", "Application Support", "discord"),
            join(home, "Library", "Application Support", "discordcanary"),
            join(home, "Library", "Application Support", "discordptb")
        ];
    }

    return [
        join(home, ".config", "discord"),
        join(home, ".config", "discordcanary"),
        join(home, ".config", "discordptb"),
        join(home, ".config", "discorddevelopment"),
        join(home, ".var", "app", "com.discordapp.Discord", "config", "discord"),
        join(home, "snap", "discord", "current", ".config", "discord")
    ];
}

function runningDiscordRoots(): string[] {
    const roots: string[] = [];
    const executableDirs = [app.getPath("exe"), process.execPath].map((pathValue: string) => dirname(pathValue));

    for (const executableDir of executableDirs) {
        if (isDiscordAppDirName(basename(executableDir))) roots.push(dirname(executableDir));

        let current = executableDir;
        for (let depth = 0; depth < 6; depth++) {
            if (basename(current).toLowerCase().endsWith(".app")) {
                roots.push(current);
                break;
            }

            const parent = dirname(current);
            if (parent === current) break;
            current = parent;
        }
    }

    roots.push(app.getPath("userData"));
    return roots;
}

async function discoveredDiscordRoots(): Promise<string[]> {
    const key = platformKey();
    const parent = key === "windows"
        ? process.env.LOCALAPPDATA || ""
        : key === "macos"
            ? join(homedir(), "Library", "Application Support")
            : join(homedir(), ".config");
    if (!parent) return [];

    let entries: Dirent[];
    try {
        entries = await readdir(parent, { withFileTypes: true });
    } catch {
        return [];
    }

    return entries
        .filter((entry: Dirent) => entry.isDirectory() && /(discord|cord|vencord|voidcord)/i.test(entry.name))
        .map((entry: Dirent) => join(parent, entry.name));
}

async function candidateDiscordRoots(preferredRoot?: string): Promise<string[]> {
    const roots = preferredRoot ? [normalizeInputPath(preferredRoot)] : [];

    for (const root of [...runningDiscordRoots(), ...defaultDiscordRoots(), ...await discoveredDiscordRoots()]) {
        if (!roots.some((knownRoot: string) => samePath(knownRoot, root))) roots.push(root);
    }

    return roots;
}

function validateRendererDiscordRoot(rootPath: string): string {
    const root = normalizeInputPath(rootPath);
    const canonical = canonicalPath(root);
    const defaultRoots = defaultDiscordRoots().map((pathValue: string) => canonicalPath(pathValue));

    if (allowedDiscordRoots.has(canonical) || defaultRoots.includes(canonical)) return root;

    throw new Error("Use Auto-detect or Browse before running this action.");
}

async function targetFromRendererRoot(rootPath: string): Promise<Target> {
    const root = validateRendererDiscordRoot(rootPath);
    const target = await resolveTarget(root);
    if (!target) throw new Error("Could not find discord_voice.node. Open Discord once, join a voice channel once, then try again.");

    rememberAllowedRoot(target.discordRoot);
    assertPathInside(target.discordRoot, target.voiceDir);

    return target;
}

async function pathExists(pathValue: string): Promise<boolean> {
    try {
        await access(pathValue, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function isDirectory(pathValue: string): Promise<boolean> {
    try {
        return (await stat(pathValue)).isDirectory();
    } catch {
        return false;
    }
}

async function isFile(pathValue: string): Promise<boolean> {
    try {
        return (await stat(pathValue)).isFile();
    } catch {
        return false;
    }
}

async function looksLikeDiscordVoiceDir(pathValue: string): Promise<boolean> {
    return await isDirectory(pathValue) && await isFile(join(pathValue, "discord_voice.node"));
}

function parseAppVersionFromDirName(name: string): number[] {
    const match = /^(?:app-)?([\d.]+)$/i.exec(name);
    if (!match) return [0, 0, 0, 0];

    const parts = match[1].split(".").map((part: string) => Number.parseInt(part, 10));
    if (parts.some((part: number) => Number.isNaN(part))) return [0, 0, 0, 0];
    while (parts.length < 4) parts.push(0);
    return parts.slice(0, 4);
}

function isDiscordAppDirName(name: string): boolean {
    return /^(?:app-)?\d+(?:\.\d+)*$/i.test(name);
}

function compareVersionsDescending(a: string, b: string): number {
    const left = parseAppVersionFromDirName(a);
    const right = parseAppVersionFromDirName(b);

    for (let i = 0; i < 4; i++) {
        if (left[i] !== right[i]) return right[i] - left[i];
    }

    return b.localeCompare(a);
}

async function findDiscordAppDir(discordRoot: string): Promise<string | undefined> {
    let entries: Dirent[];
    try {
        entries = await readdir(discordRoot, { withFileTypes: true });
    } catch {
        return undefined;
    }

    const apps = entries
        .filter((entry: Dirent) => entry.isDirectory() && isDiscordAppDirName(entry.name))
        .map((entry: Dirent) => join(discordRoot, entry.name));

    apps.sort((a: string, b: string) => compareVersionsDescending(basename(a), basename(b)));
    return apps[0];
}

async function findVoiceDirFromAppDir(appDir: string): Promise<string | undefined> {
    const modulesDir = join(appDir, "modules");
    if (!await isDirectory(modulesDir)) return undefined;

    let entries: Dirent[];
    try {
        entries = await readdir(modulesDir, { withFileTypes: true });
    } catch {
        return undefined;
    }

    const candidates = entries
        .filter((entry: Dirent) => entry.isDirectory() && entry.name.toLowerCase().startsWith("discord_voice"))
        .map((entry: Dirent) => join(modulesDir, entry.name))
        .sort((a: string, b: string) => a.localeCompare(b));

    for (const candidate of candidates) {
        const nested = join(candidate, "discord_voice");
        if (await looksLikeDiscordVoiceDir(nested)) return nested;
        if (await looksLikeDiscordVoiceDir(candidate)) return candidate;
    }

    return undefined;
}

async function findDiscordVoiceDirUnder(root: string): Promise<string | undefined> {
    const appDir = await findDiscordAppDir(root);
    if (appDir) {
        const direct = await findVoiceDirFromAppDir(appDir);
        if (direct) return direct;
    }

    const stack = [root];
    let checked = 0;

    while (stack.length && checked < 5000) {
        const current = stack.pop();
        if (!current) break;
        checked++;

        let entries: Dirent[];
        try {
            entries = await readdir(current, { withFileTypes: true });
        } catch {
            continue;
        }

        for (const entry of entries) {
            const child = join(current, entry.name);
            if (entry.isFile() && entry.name === "discord_voice.node") return dirname(child);
            if (entry.isDirectory()) stack.push(child);
        }
    }

    return undefined;
}

async function findVoiceDirWithDiagnostics(discordRoot: string): Promise<{ voiceDir?: string; appDir?: string; diagnostics: string; }> {
    if (!await isDirectory(discordRoot)) return { diagnostics: "Discord root folder not found." };

    const appDir = await findDiscordAppDir(discordRoot);
    if (!appDir) return { diagnostics: "No app folders found. Discord may not be fully installed." };

    const modulesDir = join(appDir, "modules");
    if (!await isDirectory(modulesDir)) return { appDir, diagnostics: `No modules folder found in ${basename(appDir)}.` };

    const voiceDir = await findVoiceDirFromAppDir(appDir);
    if (!voiceDir) return { appDir, diagnostics: "discord_voice module found, but discord_voice.node was not found inside it." };

    return { voiceDir, appDir, diagnostics: "" };
}

async function resolveTarget(preferredRoot?: string): Promise<Target | undefined> {
    for (const root of await candidateDiscordRoots(preferredRoot)) {
        const found = await findVoiceDirWithDiagnostics(root);
        if (found.voiceDir) {
            return {
                discordRoot: root,
                voiceDir: found.voiceDir,
                appDir: found.appDir,
                exeName: clientExeForRoot(root)
            };
        }

        const fallbackVoiceDir = await findDiscordVoiceDirUnder(root);
        if (fallbackVoiceDir) {
            return {
                discordRoot: root,
                voiceDir: fallbackVoiceDir,
                appDir: found.appDir || await findDiscordAppDir(root),
                exeName: clientExeForRoot(root)
            };
        }
    }

    return undefined;
}

function clientExeForRoot(root: string): string | undefined {
    const key = platformKey();
    if (key === "windows") return windowsClientExeForRoot(root);
    if (key === "linux") return linuxClientExeForRoot(root);
    return undefined;
}

function windowsClientExeForRoot(root: string): string {
    const leaf = basename(root).toLowerCase();
    if (leaf === "lightcord") return "Lightcord.exe";
    if (leaf.includes("discordcanary")) return "DiscordCanary.exe";
    if (leaf.includes("discordptb")) return "DiscordPTB.exe";
    if (leaf.includes("discorddevelopment")) return "DiscordDevelopment.exe";
    return "Discord.exe";
}

function linuxClientExeForRoot(root: string): string {
    const normalized = root.toLowerCase();
    if (normalized.includes("discordcanary")) return "discord-canary";
    if (normalized.includes("discordptb")) return "discord-ptb";
    if (normalized.includes("discorddevelopment")) return "discord-development";
    return "discord";
}

function releaseChannelFromRoot(root: string): string | undefined {
    const leaf = basename(root).toLowerCase();
    if (leaf === "discorddevelopment") return "Development";
    if (leaf === "discordcanary") return "Canary";
    if (leaf === "discordptb") return "PTB";
    if (leaf === "discord") return "Stable";
    return undefined;
}

function clientPrefixForRoot(root: string): string {
    const leaf = basename(root).toLowerCase();
    if (["discord", "vencord", "voidcord", "bettervencord"].includes(leaf)) return "Stable";

    const channel = releaseChannelFromRoot(root);
    if (channel) return channel;
    if (leaf === "lightcord" || leaf === "lightchord") return "Lightcord";

    return basename(root).replaceAll("_", " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

function buildLabelFromAppDir(appDir?: string): string {
    if (!appDir) return "";
    const match = /^(?:app-)?([\d.]+)$/i.exec(basename(appDir));
    if (!match) return "";

    const parts = match[1].split(".").filter((part: string) => /^\d+$/.test(part));
    return parts.at(-1) || match[1];
}

function clientLabelForRoot(root: string, buildLabel: string): string {
    const clientPrefix = clientPrefixForRoot(root);
    return clientPrefix && buildLabel ? `${clientPrefix} ${buildLabel}` : clientPrefix || buildLabel || "--";
}

async function installInfoFromTarget(target: Target): Promise<InstallInfo> {
    const buildLabel = buildLabelFromAppDir(target.appDir || await findDiscordAppDir(target.discordRoot));
    const clientLabel = clientLabelForRoot(target.discordRoot, buildLabel);
    const installation = await installationState(target, buildLabel);
    const lastPatchLabels: LastPatchLabels = {
        discordAudioCollective: await lastPatchCaption(target.discordRoot, "discordAudioCollective"),
        voicePlayground: await lastPatchCaption(target.discordRoot, "voicePlayground"),
        customModule: await lastPatchCaption(target.discordRoot, "customModule")
    };

    return {
        platformKey: platformKey(),
        platformLabel: platformLabel(platformKey()),
        readableOs: readableOs(),
        discordRoot: target.discordRoot,
        voiceDir: target.voiceDir,
        appDir: target.appDir,
        clientLabel,
        buildLabel,
        lastPatchLabel: lastPatchLabels.discordAudioCollective,
        lastPatchLabels,
        installStatus: installation.status,
        installedMethod: installation.method,
        repatchWarning: repatchWarning(installation.status)
    };
}

function sanitizedRootKey(root: string): string {
    return root.replace(/[\\/:]/g, "_");
}

function permanentBackupDir(target: Target): string {
    return join(hubDataDir(), "backups", sanitizedRootKey(target.discordRoot), "UNPATCHED");
}

function metaPathForRoot(discordRoot: string, method: PatchMethod): string {
    const fileName = method === "discordAudioCollective"
        ? "quick_hub_meta_discord_audio_collective.json"
        : method === "voicePlayground"
            ? "quick_hub_meta_voice_playground.json"
            : "quick_hub_meta_custom_module.json";

    return join(hubDataDir(), "backups", sanitizedRootKey(discordRoot), fileName);
}

function statePathForRoot(discordRoot: string): string {
    return join(hubDataDir(), "backups", sanitizedRootKey(discordRoot), "installation_state.json");
}

async function readPatchMeta(discordRoot: string, method: PatchMethod): Promise<Record<string, unknown> | undefined> {
    const metaPath = metaPathForRoot(discordRoot, method);
    if (!await isFile(metaPath)) return undefined;

    try {
        const parsed: unknown = JSON.parse((await readFile(metaPath, "utf8")).trimStart());
        return isRecord(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
}

function metaString(meta: Record<string, unknown>, key: string): string {
    const value = meta[key];
    return typeof value === "string" ? value : "";
}

function isPatchMethod(value: unknown): value is PatchMethod {
    return value === "discordAudioCollective" || value === "voicePlayground" || value === "customModule";
}

async function latestPatchMeta(discordRoot: string): Promise<PatchMeta | undefined> {
    let latest: PatchMeta | undefined;
    for (const method of PATCH_METHODS) {
        const meta = await readPatchMeta(discordRoot, method);
        if (!meta || !metaString(meta, "last_patch_utc")) continue;

        const date = new Date(metaString(meta, "last_patch_utc"));
        const patchTime = Number.isNaN(date.getTime()) ? 0 : date.getTime();
        if (latest && patchTime < latest.time) continue;
        latest = { method, buildLabel: metaString(meta, "build_label"), time: patchTime };
    }

    return latest;
}

async function filesEqual(left: string, right: string): Promise<boolean> {
    if (!await isFile(left) || !await isFile(right)) return false;
    if ((await stat(left)).size !== (await stat(right)).size) return false;

    return (await readFile(left)).equals(await readFile(right));
}

async function installationState(target: Target, currentBuildLabel: string): Promise<InstallationState> {
    const backupNode = join(permanentBackupDir(target), "discord_voice.node");
    const installedNode = join(target.voiceDir, "discord_voice.node");
    if (!await isFile(backupNode) || await filesEqual(backupNode, installedNode)) {
        return { status: "notInstalled", method: null };
    }

    const statePath = statePathForRoot(target.discordRoot);
    if (await isFile(statePath)) {
        try {
            const state: unknown = JSON.parse((await readFile(statePath, "utf8")).trimStart());
            if (isRecord(state) && state.status === "notInstalled") return { status: "notInstalled", method: null };
            if (isRecord(state) && state.status === "installed" && isPatchMethod(state.active_method)) {
                const method = state.active_method;
                const buildLabel = metaString(state, "build_label");
                return !currentBuildLabel || !buildLabel || buildLabel !== currentBuildLabel
                    ? { status: "needsReinstall", method }
                    : { status: "installed", method };
            }
        } catch {
            return { status: "notInstalled", method: null };
        }
    }

    const latestPatch = await latestPatchMeta(target.discordRoot);
    if (!latestPatch) return { status: "notInstalled", method: null };
    if (!currentBuildLabel || !latestPatch.buildLabel || latestPatch.buildLabel !== currentBuildLabel) {
        return { status: "needsReinstall", method: latestPatch.method };
    }

    return { status: "installed", method: latestPatch.method };
}

function repatchWarning(status: StereoInstallStatus): string {
    if (status === "needsReinstall") return "Discord updated since StereoInstaller last patched audio. Patch Discord voice again with StereoInstaller.";

    return "";
}

async function lastPatchCaption(discordRoot: string, method: PatchMethod): Promise<string> {
    const metaPath = metaPathForRoot(discordRoot, method);
    if (!await isFile(metaPath)) return "Never";

    try {
        const parsed: unknown = JSON.parse((await readFile(metaPath, "utf8")).trimStart());
        if (!isRecord(parsed)) return `${PATCH_METHOD_LABELS[method]} saved data could not be read.`;

        const iso = typeof parsed.last_patch_utc === "string" ? parsed.last_patch_utc : "";
        if (!iso) return "Never";

        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return iso;

        return date.toLocaleString();
    } catch {
        return `${PATCH_METHOD_LABELS[method]} saved data could not be read.`;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

async function ensurePermanentUnpatchedBackup(target: Target, log: ActionLog): Promise<string> {
    const backupDir = permanentBackupDir(target);
    if (await looksLikeDiscordVoiceDir(backupDir)) {
        log.info(`Permanent UNPATCHED backup already exists: ${backupDir}`);
        return backupDir;
    }

    assertPathInside(target.discordRoot, target.voiceDir);
    assertPathInside(hubDataDir(), backupDir);

    log.info("Creating permanent UNPATCHED backup for the first time.");
    await mkdir(dirname(backupDir), { recursive: true });
    await rm(backupDir, { recursive: true, force: true });
    await cp(target.voiceDir, backupDir, { recursive: true });
    log.ok(`Saved permanent UNPATCHED backup: ${backupDir}`);

    return backupDir;
}

async function clearDirContents(pathValue: string, allowedParent: string): Promise<void> {
    assertPathInside(allowedParent, pathValue);

    if (!await pathExists(pathValue)) {
        await mkdir(pathValue, { recursive: true });
        return;
    }

    if (!await isDirectory(pathValue)) throw new Error(`Expected a folder, got: ${pathValue}`);

    const entries = await readdir(pathValue, { withFileTypes: true });
    for (const entry of entries) {
        const child = join(pathValue, entry.name);
        assertPathInside(pathValue, child);
        await rm(child, { recursive: true, force: true });
    }
}

async function downloadBytes(url: string, timeoutMs: number, accept?: string): Promise<Buffer> {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:") throw new Error("Download URL must use HTTPS.");
    if (!["api.github.com", "raw.githubusercontent.com"].includes(parsedUrl.hostname)) {
        throw new Error(`Download host is not allowed: ${parsedUrl.hostname}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers: Record<string, string> = {
        "User-Agent": VENCORD_USER_AGENT || APP_NAME,
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
    };

    if (accept) headers.Accept = accept;

    const token = (process.env.DISCORD_STEREO_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "").trim();
    if (token) headers.Authorization = token.startsWith("github_pat_") ? `Bearer ${token}` : `token ${token}`;

    try {
        const response = await fetch(parsedUrl, {
            headers,
            signal: controller.signal
        });

        if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);

        const contentLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > MAX_DOWNLOAD_BYTES) {
            throw new Error("Download is too large.");
        }

        const data = Buffer.from(await response.arrayBuffer());
        if (data.byteLength > MAX_DOWNLOAD_BYTES) throw new Error("Download is too large.");

        return data;
    } finally {
        clearTimeout(timeout);
    }
}

function validateDownloadPayload(name: string, data: Buffer): void {
    if (!data.byteLength) throw new Error(`${name}: empty download.`);

    const head = data.subarray(0, 256).toString("utf8").trimStart().toLowerCase();
    if (head.startsWith("<!doctype html") || head.startsWith("<html") || head.includes("<title>")) {
        throw new Error(`${name}: download looks like an HTML error page.`);
    }

    const low = name.toLowerCase();
    if ([".node", ".dll", ".exe", ".tflite", ".so", ".dylib"].some((ext: string) => low.endsWith(ext)) && data.byteLength < 1024) {
        throw new Error(`${name}: binary download is too small.`);
    }
}

function patchedGithubApiForPlatform(): string {
    const key = platformKey();
    if (key === "windows") return PATCHED_WINDOWS_GITHUB_CONTENTS_API;
    if (key === "linux") return PATCHED_LINUX_GITHUB_CONTENTS_API;
    throw new Error("Discord Audio Collective Method supports Windows and Linux patched payloads.");
}

async function method2Target(target: Target): Promise<Target> {
    const appDir = target.appDir || await findDiscordAppDir(target.discordRoot);
    if (!appDir) throw new Error("Could not find the Discord app folder for Voice Playground Method.");

    const voiceDir = join(appDir, "modules", "discord_voice-1", "discord_voice");
    assertPathInside(target.discordRoot, voiceDir);

    return {
        ...target,
        appDir,
        voiceDir
    };
}

function method2Payload(quality: StereoMethod2Quality): string {
    throw new Error("Voice Playground Method is currently disabled because the base64 node files caused a 55MB patcher.js and broke Discord injection.");
}

async function prepareMethod2Payload(quality: StereoMethod2Quality, log: ActionLog): Promise<string> {
    const staging = join(hubDataDir(), "staging", "method2_payload");
    const targetFile = join(staging, "discord_voice.node");
    assertPathInside(hubDataDir(), staging);
    assertPathInside(staging, targetFile);

    await mkdir(staging, { recursive: true });
    await clearDirContents(staging, hubDataDir());
    await writeFile(targetFile, Buffer.from(method2Payload(quality), "base64"));
    validateDownloadPayload("discord_voice.node", await readFile(targetFile));

    log.ok(`Prepared Voice Playground Method payload: ${quality}.`);

    return staging;
}

async function prepareMethod2IndexPayload(log: ActionLog): Promise<string> {
    const staging = join(hubDataDir(), "staging", "method2_index_payload");
    const targetFile = join(staging, "index.js");
    assertPathInside(hubDataDir(), staging);
    assertPathInside(staging, targetFile);

    await mkdir(staging, { recursive: true });
    await clearDirContents(staging, hubDataDir());
    await writeFile(targetFile, Buffer.from(method2Index, "base64"));
    validateDownloadPayload("index.js", await readFile(targetFile));

    log.ok("Prepared Voice Playground Method index.js payload.");

    return staging;
}

function isGithubContentFile(value: unknown): value is GithubContentFile {
    return isRecord(value)
        && value.type === "file"
        && typeof value.name === "string"
        && typeof value.download_url === "string"
        && value.download_url.length > 0;
}

function assertSafeRemoteFileName(name: string): void {
    if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
        throw new Error(`Unsafe remote file name: ${name || "unknown"}`);
    }
}

async function downloadGithubFolderToDir(apiUrl: string, dest: string, log: ActionLog): Promise<void> {
    const raw = await downloadBytes(apiUrl, 60_000, "application/vnd.github.v3+json");
    const parsed: unknown = JSON.parse(raw.toString("utf8"));
    if (!Array.isArray(parsed)) throw new Error("GitHub contents API returned unexpected JSON.");

    await mkdir(dest, { recursive: true });
    await clearDirContents(dest, hubDataDir());

    let downloaded = 0;
    let failed = 0;

    for (const entry of parsed) {
        if (!isGithubContentFile(entry)) continue;

        try {
            assertSafeRemoteFileName(entry.name);
            const targetPath = join(dest, entry.name);
            assertPathInside(dest, targetPath);

            log.info(`Downloading: ${entry.name}`);
            const data = await downloadBytes(entry.download_url, 120_000);
            validateDownloadPayload(entry.name, data);
            await writeFile(targetPath, data);
            if (platformKey() === "linux" && ["discord_voice.node", "gpu_encoder_helper", "libmediapipe.so"].includes(entry.name)) {
                await chmod(targetPath, 0o755);
            }
            downloaded++;
        } catch (error) {
            failed++;
            log.warn(`Failed: ${isRecord(entry) && typeof entry.name === "string" ? entry.name : "unknown"} (${errorMessage(error)})`);
        }
    }

    if (!downloaded) throw new Error("No files were downloaded from the GitHub folder.");
    if (failed) log.warn(`Downloaded ${downloaded} file(s), ${failed} failed.`);
    else log.ok(`Downloaded ${downloaded} file(s).`);
}

async function findVoiceDirInPayloadDir(payloadRoot: string): Promise<string | undefined> {
    if (await looksLikeDiscordVoiceDir(payloadRoot)) return payloadRoot;

    const nested = join(payloadRoot, "discord_voice");
    if (await looksLikeDiscordVoiceDir(nested)) return nested;

    const found = await findDiscordVoiceDirUnder(payloadRoot);
    return found && isPathInside(payloadRoot, found) ? found : undefined;
}

async function downloadPatchedPayload(log: ActionLog): Promise<string> {
    const staging = join(hubDataDir(), "staging", "patched_payload");
    assertPathInside(hubDataDir(), staging);

    const label = platformLabel(platformKey());
    log.info(`Fetching the latest Discord Audio Collective Method module for ${label} from GitHub.`);
    await downloadGithubFolderToDir(patchedGithubApiForPlatform(), staging, log);

    const payloadVoice = await findVoiceDirInPayloadDir(staging);
    if (!payloadVoice || !await looksLikeDiscordVoiceDir(payloadVoice)) {
        throw new Error("Downloaded payload does not contain a valid discord_voice module.");
    }

    return payloadVoice;
}

function shellQuote(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`;
}

function findOnPath(command: string): string | undefined {
    for (const directory of (process.env.PATH || "").split(":")) {
        if (!directory) continue;
        const candidate = join(directory, command);
        if (existsSync(candidate)) return candidate;
    }

    return undefined;
}

/** Picks the command used to start Discord again once the voice module has been replaced. */
function posixRelaunchCommand(relaunch: RelaunchConfig): string {
    const root = relaunch.discordRoot.toLowerCase();

    if (relaunch.platformKey === "macos") return "open -a Discord";

    if (root.includes(".var/app/com.discordapp.discord") && findOnPath("flatpak")) return "flatpak run com.discordapp.Discord";
    if (root.includes("/snap/discord/") && findOnPath("snap")) return "snap run discord";

    const candidates = [relaunch.exeName, "discord"].filter((name): name is string => !!name);
    for (const name of candidates) {
        const resolved = findOnPath(name);
        if (resolved) return shellQuote(resolved);
    }

    if (relaunch.appDir) {
        const binary = readdirSyncSafe(relaunch.appDir).find((entry: string) => /^discord(canary|ptb|development)?$/i.test(entry));
        if (binary) return shellQuote(join(relaunch.appDir, binary));
    }

    return "";
}

function readdirSyncSafe(directory: string): string[] {
    try {
        return readdirSync(directory);
    } catch {
        return [];
    }
}

/** Serializes the worker configuration as shell variable assignments. */
function posixWorkerEnvironment(config: WorkerConfig, configFile: string): string {
    const values: Record<string, string> = {
        CONFIG_FILE: configFile,
        ACTION_NAME: config.actionName,
        PARENT_PID: String(config.parentPid),
        SOURCE_DIR: config.sourceDir,
        TARGET_DIR: config.targetDir,
        COPY_MODE: config.copyMode,
        FILE_NAME: config.fileName ?? "",
        META_PATH: config.metaPath ?? "",
        STATE_PATH: config.statePath,
        ACTIVE_METHOD: config.activeMethod ?? "",
        CLIENT_LABEL: config.patchClientLabel,
        BUILD_LABEL: config.patchBuildLabel,
        LOG_PATHS: config.logPaths.join("\n"),
        RELAUNCH_COMMAND: posixRelaunchCommand(config.relaunch)
    };

    return Object.entries(values).map(([key, value]: [string, string]) => `${key}=${shellQuote(value)}`).join("\n") + "\n";
}

async function scheduleWorker(actionName: "Patch" | "Revert", sourceDir: string, target: Target, metaMethod: PatchMethod | undefined, log: ActionLog, copyMode: WorkerConfig["copyMode"] = "directory", fileName: SingleFileName = "discord_voice.node", skipHubDirCheck = false): Promise<void> {
    // For user-selected custom module folders the sourceDir lives anywhere on disk;
    // only enforce the hubDataDir boundary for internal (downloaded) payloads.
    if (!skipHubDirCheck) assertPathInside(hubDataDir(), sourceDir);
    assertPathInside(target.discordRoot, target.voiceDir);

    const patchBuildLabel = buildLabelFromAppDir(target.appDir || await findDiscordAppDir(target.discordRoot));
    const workerDir = join(hubDataDir(), "worker");
    const usePowershellWorker = platformKey() === "windows";
    const workerExecutable = usePowershellWorker ? powershellPath() : "/bin/sh";
    const workerScript = join(workerDir, usePowershellWorker ? "stereo-installer-worker.ps1" : "stereo-installer-worker.sh");
    const launcherScript = join(workerDir, "stereo-installer-launcher.cmd");
    const configPath = join(workerDir, `stereo-installer-${Date.now()}.${usePowershellWorker ? "json" : "env"}`);
    const taskName = usePowershellWorker ? `StereoInstaller-${process.pid}-${Date.now()}` : undefined;
    const config: WorkerConfig = {
        actionName,
        parentPid: process.pid,
        sourceDir,
        targetDir: target.voiceDir,
        copyMode,
        fileName: copyMode === "singleFile" ? fileName : undefined,
        metaPath: metaMethod ? metaPathForRoot(target.discordRoot, metaMethod) : undefined,
        statePath: statePathForRoot(target.discordRoot),
        activeMethod: metaMethod,
        patchClientLabel: clientLabelForRoot(target.discordRoot, patchBuildLabel),
        patchBuildLabel,
        logPath: logPath(),
        logPaths: logPaths(),
        taskName,
        relaunch: {
            platformKey: platformKey(),
            discordRoot: target.discordRoot,
            appDir: target.appDir,
            exeName: target.exeName
        }
    };

    await mkdir(workerDir, { recursive: true });
    await writeFile(workerScript, usePowershellWorker ? POWERSHELL_WORKER_SOURCE : POSIX_WORKER_SOURCE, "utf8");
    await writeFile(configPath, usePowershellWorker ? JSON.stringify(config) : posixWorkerEnvironment(config, configPath), "utf8");
    if (usePowershellWorker) {
        await writeFile(launcherScript, windowsLauncherSource(workerExecutable, workerScript, configPath, logPath()), "utf8");
    }

    log.info(`Logging actions to: ${logPath()}`);
    log.info(`Worker executable: ${workerExecutable}`);
    log.info(`Worker config: ${configPath}`);

    if (usePowershellWorker) {
        await startWindowsWorker(launcherScript, taskName || "StereoInstaller", log);
    } else {
        const child = spawn(workerExecutable, [workerScript, configPath], {
            detached: true,
            stdio: "ignore"
        });

        child.once("error", (error: Error) => log.fail(`Worker failed to start: ${errorMessage(error)}`));
        child.unref();
    }

    log.info(`Worker started from ${workerScript}.`);
    log.info(`Worker log: ${logPath()}`);
    log.info("Discord exit scheduled so the worker can replace the voice files.");

    setTimeout(() => app.exit(0), 700).unref();
}

async function startWindowsWorker(launcherScript: string, taskName: string, log: ActionLog): Promise<void> {
    const scheduledTime = windowsTaskTime();
    const taskCommand = `${commandProcessorPath()} /d /s /c ""${launcherScript}""`;
    const createTask = await runProcess(schtasksPath(), ["/Create", "/TN", taskName, "/SC", "ONCE", "/ST", scheduledTime, "/TR", taskCommand, "/F", "/RL", "LIMITED"]);

    if (createTask.code === 0) {
        const runTask = await runProcess(schtasksPath(), ["/Run", "/TN", taskName]);
        if (runTask.code === 0) {
            log.info(`Windows Task Scheduler started worker task: ${taskName}`);
            return;
        }

        log.warn(`Task Scheduler run failed: ${runTask.output || `exit ${runTask.code}`}`);
    } else {
        log.warn(`Task Scheduler create failed: ${createTask.output || `exit ${createTask.code}`}`);
    }

    const child = spawn(commandProcessorPath(), ["/d", "/s", "/c", "start", "\"\"", "/min", launcherScript], {
        detached: true,
        stdio: "ignore",
        windowsHide: true
    });

    child.once("error", (error: Error) => log.fail(`Windows launcher failed to start: ${errorMessage(error)}`));
    child.unref();
    log.warn("Falling back to cmd start for the worker launcher.");
}

function runProcess(file: string, args: string[]): Promise<ProcessResult> {
    return new Promise(resolveProcess => {
        let output = "";
        let settled = false;
        const child = spawn(file, args, { windowsHide: true });

        function finish(code: number, text?: string): void {
            if (settled) return;
            settled = true;
            resolveProcess({ code, output: (text || output).trim() });
        }

        child.stdout?.on("data", (chunk: Buffer) => {
            output += chunk.toString("utf8");
        });
        child.stderr?.on("data", (chunk: Buffer) => {
            output += chunk.toString("utf8");
        });
        child.once("error", (error: Error) => finish(-1, errorMessage(error)));
        child.once("close", (code: number | null) => finish(code ?? -1));
    });
}

function windowsTaskTime(): string {
    const date = new Date(Date.now() + 60_000);
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
}

function commandProcessorPath(): string {
    const candidate = join(process.env.SystemRoot || "C:\\Windows", "System32", "cmd.exe");
    return existsSync(candidate) ? candidate : "cmd.exe";
}

function schtasksPath(): string {
    const candidate = join(process.env.SystemRoot || "C:\\Windows", "System32", "schtasks.exe");
    return existsSync(candidate) ? candidate : "schtasks.exe";
}

function powershellPath(): string {
    const candidate = join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    return existsSync(candidate) ? candidate : "powershell.exe";
}

function windowsLauncherSource(powershellExecutable: string, workerScript: string, configPath: string, logPathValue: string): string {
    return `@echo off
setlocal
set "POWERSHELL=${powershellExecutable}"
set "SCRIPT=${workerScript}"
set "CONFIG=${configPath}"
set "LOG=${logPathValue}"
set "BOOTLOG=${logPathValue}.launcher.log"
for %%I in ("%LOG%") do if not exist "%%~dpI" mkdir "%%~dpI" >nul 2>nul
echo [%date% %time%] Launcher started.>> "%LOG%"
"%POWERSHELL%" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%SCRIPT%" "%CONFIG%" >> "%BOOTLOG%" 2>>&1
set "EXIT_CODE=%ERRORLEVEL%"
echo [%date% %time%] PowerShell exited with %EXIT_CODE%.>> "%LOG%"
exit /b %EXIT_CODE%
`;
}

const POWERSHELL_WORKER_SOURCE = `
$ErrorActionPreference = "Stop"

function Write-InstallerLog {
    param([string] $Line)

    $paths = @()
    if ($config.logPaths) {
        foreach ($path in $config.logPaths) {
            if ($path) { $paths += [string] $path }
        }
    }
    if ($paths.Count -eq 0 -and $config.logPath) {
        $paths += [string] $config.logPath
    }

    $fullLine = "[{0}] {1}" -f (Get-Date), $Line
    foreach ($path in $paths) {
        try {
            $parent = [System.IO.Path]::GetDirectoryName($path)
            if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
            Add-Content -LiteralPath $path -Value $fullLine -Encoding UTF8
        } catch {}
    }
}

function Wait-ParentProcess {
    for ($i = 0; $i -lt 80; $i++) {
        try {
            $parent = Get-Process -Id ([int] $config.parentPid) -ErrorAction Stop
            if ($null -eq $parent) { return }
            Start-Sleep -Milliseconds 250
        } catch {
            return
        }
    }

    try {
        Stop-Process -Id ([int] $config.parentPid) -Force -ErrorAction SilentlyContinue
    } catch {}
    Start-Sleep -Milliseconds 1200
}

function Stop-DiscordUnderRoot {
    $root = [System.IO.Path]::GetFullPath([string] $config.relaunch.discordRoot).TrimEnd([char[]] @([char] 92, [char] 47))
    $rootPrefix = $root + [System.IO.Path]::DirectorySeparatorChar
    $names = @("Discord.exe", "DiscordCanary.exe", "DiscordPTB.exe", "DiscordDevelopment.exe", "Lightcord.exe", "Vencord.exe", "Equicord.exe", "BetterVencord.exe", "Update.exe")

    try {
        $processes = Get-CimInstance Win32_Process | Where-Object {
            $exePath = $_.ExecutablePath
            if (-not $exePath) { return $false }
            if ($names -notcontains $_.Name) { return $false }

            try {
                $fullExe = [System.IO.Path]::GetFullPath($exePath)
                return $fullExe.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)
            } catch {
                return $false
            }
        }

        foreach ($process in $processes) {
            try {
                Write-InstallerLog ("Stopping process " + $process.Name + " pid=" + $process.ProcessId)
                Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
            } catch {}
        }
    } catch {
        Write-InstallerLog ("WARN: Could not enumerate Discord processes: " + $_.Exception.Message)
    }

    Start-Sleep -Milliseconds 900
}

function Clear-DirContents {
    param([string] $PathValue)

    if (-not $PathValue) { throw "Missing target directory." }
    New-Item -ItemType Directory -Force -Path $PathValue | Out-Null
    Get-ChildItem -LiteralPath $PathValue -Force | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }
}

function Copy-DirContents {
    param([string] $SourceDir, [string] $TargetDir)

    if (-not $SourceDir -or -not $TargetDir) { throw "Missing source or target directory." }
    New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
    Get-ChildItem -LiteralPath $SourceDir -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $TargetDir -Recurse -Force
    }
}

function Copy-SingleFile {
    param([string] $SourceDir, [string] $TargetDir, [string] $FileName)

    if (-not $SourceDir -or -not $TargetDir) { throw "Missing source or target directory." }
    if (-not $FileName) { $FileName = "discord_voice.node" }
    if ($FileName -ne "discord_voice.node" -and $FileName -ne "index.js") {
        throw ("Unsupported file name: " + $FileName)
    }

    New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

    $src = Join-Path $SourceDir $FileName
    $dst = Join-Path $TargetDir $FileName
    if (-not (Test-Path -LiteralPath $src -PathType Leaf)) {
        throw ("Source " + $FileName + " was not found: " + $src)
    }

    $beforeSize = 0
    if (Test-Path -LiteralPath $dst -PathType Leaf) {
        $beforeSize = (Get-Item -LiteralPath $dst).Length
    }

    Copy-Item -LiteralPath $src -Destination $dst -Force
    $afterSize = (Get-Item -LiteralPath $dst).Length
    Write-InstallerLog ("Copied " + $src + " -> " + $dst + " (before " + $beforeSize + " bytes, after " + $afterSize + " bytes).")
}

function Start-DiscordAgain {
    $root = [string] $config.relaunch.discordRoot
    $exe = [string] $config.relaunch.exeName
    if (-not $exe) { $exe = "Discord.exe" }

    $updateExe = Join-Path $root "Update.exe"
    if (Test-Path -LiteralPath $updateExe -PathType Leaf) {
        Start-Process -FilePath $updateExe -ArgumentList @("--processStart", $exe) -WorkingDirectory $root -WindowStyle Hidden
        Write-InstallerLog ("Relaunched Discord via Update.exe (" + $exe + ").")
        return
    }

    $appDir = [string] $config.relaunch.appDir
    if ($appDir) {
        $exePath = Join-Path $appDir $exe
        if (Test-Path -LiteralPath $exePath -PathType Leaf) {
            Start-Process -FilePath $exePath -WorkingDirectory $appDir -WindowStyle Hidden
            Write-InstallerLog ("Relaunched Discord directly (" + $exe + ").")
            return
        }
    }

    Write-InstallerLog "WARN: Could not relaunch Discord automatically. Please start it manually."
}

$configPath = $args[0]
try {
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    Write-InstallerLog ("PowerShell worker started. pid=" + $PID)
    Write-InstallerLog ("Config path: " + $configPath)
    Write-InstallerLog ("Source dir: " + $config.sourceDir)
    Write-InstallerLog ("Target dir: " + $config.targetDir)
    Write-InstallerLog ("Copy mode: " + $config.copyMode)
    if ($config.fileName) { Write-InstallerLog ("File name: " + $config.fileName) }
    Write-InstallerLog ($config.actionName + ": waiting for Discord to close.")
    Wait-ParentProcess
    Write-InstallerLog ($config.actionName + ": wait finished.")
    Stop-DiscordUnderRoot
    Write-InstallerLog ($config.actionName + ": installing files.")

    if ($config.copyMode -eq "singleFile") {
        Copy-SingleFile -SourceDir ([string] $config.sourceDir) -TargetDir ([string] $config.targetDir) -FileName ([string] $config.fileName)
    } else {
        Clear-DirContents -PathValue ([string] $config.targetDir)
        Write-InstallerLog "Cleared target directory."
        Copy-DirContents -SourceDir ([string] $config.sourceDir) -TargetDir ([string] $config.targetDir)
        Write-InstallerLog "Copied directory contents."
    }

    if ($config.metaPath) {
        $metaParent = [System.IO.Path]::GetDirectoryName([string] $config.metaPath)
        if ($metaParent) { New-Item -ItemType Directory -Force -Path $metaParent | Out-Null }
        $meta = [ordered]@{ last_patch_utc = (Get-Date).ToUniversalTime().ToString("o") }
        if ($config.patchClientLabel) { $meta.client_label = [string] $config.patchClientLabel }
        if ($config.patchBuildLabel) { $meta.build_label = [string] $config.patchBuildLabel }
        $meta | ConvertTo-Json | Set-Content -LiteralPath ([string] $config.metaPath) -Encoding UTF8
        Write-InstallerLog ("Wrote metadata: " + $config.metaPath)
    }

    if ($config.statePath -and ($config.actionName -eq "Revert" -or $config.activeMethod)) {
        $stateParent = [System.IO.Path]::GetDirectoryName([string] $config.statePath)
        if ($stateParent) { New-Item -ItemType Directory -Force -Path $stateParent | Out-Null }
        $stateStatus = if ($config.actionName -eq "Revert") { "notInstalled" } else { "installed" }
        $state = [ordered]@{ status = $stateStatus; build_label = [string] $config.patchBuildLabel; updated_utc = (Get-Date).ToUniversalTime().ToString("o") }
        if ($config.activeMethod) { $state["active_method"] = [string] $config.activeMethod }
        $state | ConvertTo-Json | Set-Content -LiteralPath ([string] $config.statePath) -Encoding UTF8
        Write-InstallerLog ("Wrote installation state: " + $config.statePath)
    }

    Write-InstallerLog ("OK: " + $config.actionName + " complete.")
    Start-DiscordAgain
} catch {
    Write-InstallerLog ("FAIL: " + $_.Exception.Message)
    Write-InstallerLog ([string] $_.ScriptStackTrace)
} finally {
    if ($config.taskName) {
        try {
            schtasks.exe /Delete /TN ([string] $config.taskName) /F | Out-Null
            Write-InstallerLog ("Deleted scheduled task: " + $config.taskName)
        } catch {
            Write-InstallerLog ("WARN: Could not delete scheduled task: " + $_.Exception.Message)
        }
    }

    try {
        Remove-Item -LiteralPath $configPath -Force -ErrorAction SilentlyContinue
    } catch {}
}
`;

/**
 * Worker for Linux and macOS. It is a plain shell script because the Discord binary
 * cannot be used as a Node runtime (its RunAsNode fuse is disabled).
 * It receives a file of shell variables written by scheduleWorker().
 */
const POSIX_WORKER_SOURCE = `#!/bin/sh
. "$1"

log() {
    line="[$(date '+%d/%m/%Y %H:%M:%S')] $1"
    printf '%s\\n' "$LOG_PATHS" | while IFS= read -r log_path; do
        [ -n "$log_path" ] || continue
        mkdir -p "$(dirname "$log_path")" 2>/dev/null
        printf '%s\\n' "$line" >> "$log_path" 2>/dev/null
    done
}

fail() {
    log "FAIL: $1"
    rm -f "$CONFIG_FILE" 2>/dev/null
    exit 1
}

log "Worker started. pid=$$"
log "Source dir: $SOURCE_DIR"
log "Target dir: $TARGET_DIR"
log "$ACTION_NAME: waiting for Discord to close."

waited=0
while kill -0 "$PARENT_PID" 2>/dev/null && [ "$waited" -lt 80 ]; do
    sleep 0.25
    waited=$((waited + 1))
done

if kill -0 "$PARENT_PID" 2>/dev/null; then
    kill "$PARENT_PID" 2>/dev/null
    sleep 1.2
fi

log "$ACTION_NAME: wait finished."
log "$ACTION_NAME: installing files."

[ -d "$SOURCE_DIR" ] || fail "Source directory is missing: $SOURCE_DIR"
mkdir -p "$TARGET_DIR" || fail "Could not create $TARGET_DIR"

if [ "$COPY_MODE" = "singleFile" ]; then
    cp -f "$SOURCE_DIR/$FILE_NAME" "$TARGET_DIR/$FILE_NAME" || fail "Could not copy $FILE_NAME"
    log "Copied $FILE_NAME."
else
    find "$TARGET_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} + || fail "Could not clear $TARGET_DIR"
    log "Cleared target directory."
    cp -R "$SOURCE_DIR"/. "$TARGET_DIR"/ || fail "Could not copy the module files"
    chmod 755 "$TARGET_DIR"/*.node "$TARGET_DIR"/*.so "$TARGET_DIR"/gpu_encoder_helper 2>/dev/null
    log "Copied directory contents."
fi

now_utc="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

if [ -n "$META_PATH" ]; then
    mkdir -p "$(dirname "$META_PATH")"
    printf '{\\n  "last_patch_utc": "%s",\\n  "client_label": "%s",\\n  "build_label": "%s"\\n}\\n' "$now_utc" "$CLIENT_LABEL" "$BUILD_LABEL" > "$META_PATH"
    log "Wrote metadata: $META_PATH"
fi

if [ -n "$STATE_PATH" ] && { [ "$ACTION_NAME" = "Revert" ] || [ -n "$ACTIVE_METHOD" ]; }; then
    mkdir -p "$(dirname "$STATE_PATH")"
    if [ "$ACTION_NAME" = "Revert" ]; then state_status="notInstalled"; else state_status="installed"; fi
    if [ -n "$ACTIVE_METHOD" ]; then
        printf '{\\n  "status": "%s",\\n  "build_label": "%s",\\n  "updated_utc": "%s",\\n  "active_method": "%s"\\n}\\n' "$state_status" "$BUILD_LABEL" "$now_utc" "$ACTIVE_METHOD" > "$STATE_PATH"
    else
        printf '{\\n  "status": "%s",\\n  "build_label": "%s",\\n  "updated_utc": "%s"\\n}\\n' "$state_status" "$BUILD_LABEL" "$now_utc" > "$STATE_PATH"
    fi
    log "Wrote installation state: $STATE_PATH"
fi

log "OK: $ACTION_NAME complete."

if [ -n "$RELAUNCH_COMMAND" ]; then
    nohup sh -c "$RELAUNCH_COMMAND" >/dev/null 2>&1 &
    log "Relaunched Discord."
else
    log "Could not relaunch Discord automatically. Please start it manually."
fi

rm -f "$CONFIG_FILE" 2>/dev/null
`;
