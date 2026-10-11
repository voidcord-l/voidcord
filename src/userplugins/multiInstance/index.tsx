/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { DataStore } from "@api/index";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { PluginNative } from "@utils/types";
import { findByProps } from "@webpack";
import { Button, ContextMenuApi, createRoot, FluxDispatcher, Forms, IconUtils, Menu, React, TextInput, Toasts, UserStore } from "@webpack/common";

const Native = VencordNative.pluginHelpers.MultiInstance as PluginNative<typeof import("./native")>;
const STORE_KEY = "TokenImporter_accounts";
const MI_TOKEN_CACHE_KEY = "multiinstance_token_cache";
const HIDDEN_ACCOUNTS_KEY = "multiinstance_hidden_accounts";
const FAVORITES_KEY = "multiinstance_favorites";
const DISPLAY_NAMES_KEY = "multiinstance_display_names";
const ACCOUNT_COLORS_KEY = "multiinstance_account_colors";
const ACCOUNT_ORDER_KEY = "multiinstance_account_order";
const QSO_ROOT_ID = "multi-instance-qso-root";
const TOGGLE_KEYBIND_DEFAULT = "Ctrl+Shift+I";

const COLOR_PRESETS = [
    "#5865f2", "#ed4245", "#3ba55c", "#faa81a",
    "#eb459e", "#57f287", "#fee75c", "#b5bac1",
    "#9b59b6", "#1abc9c", "#e67e22", "#34495e",
];

interface SavedAccount {
    id: string;
    token: string;
    username: string;
    avatar: string;
}

interface AccountEntry extends SavedAccount {
    hasToken: boolean;
    isNative: boolean;
    note?: string;
    displayName?: string;
    color?: string;
    isFavorite?: boolean;
}

let tokenCache: Record<string, string> = {};
let tokenCacheLoaded = false;
let encryptHooked = false;

async function loadTokenCache(): Promise<void> {
    if (tokenCacheLoaded) return;
    tokenCache = (await DataStore.get<Record<string, string>>(MI_TOKEN_CACHE_KEY)) ?? {};
    tokenCacheLoaded = true;
}

async function saveTokenCache(): Promise<void> {
    await DataStore.set(MI_TOKEN_CACHE_KEY, tokenCache);
}

function cacheToken(userId: string, token: string): void {
    if (!userId || !token) return;
    tokenCache[userId] = token;
}

function captureCurrentToken(): void {
    try {
        const tokenMod = findByProps("getToken", "encryptAndStoreTokens");
        const token = tokenMod?.getToken?.();
        const user = UserStore.getCurrentUser();
        if (token && user?.id) {
            cacheToken(user.id, token);
            saveTokenCache();
        }
    } catch { }
}

function hookEncryptAndStoreTokens(): void {
    if (encryptHooked) return;
    try {
        const tokenMod = findByProps("getToken", "encryptAndStoreTokens");
        if (!tokenMod?.encryptAndStoreTokens) return;
        const orig = tokenMod.encryptAndStoreTokens.bind(tokenMod);
        tokenMod.encryptAndStoreTokens = async function (tokens: Record<string, string>) {
            for (const [id, token] of Object.entries(tokens)) {
                if (id && token) cacheToken(id, token);
            }
            saveTokenCache();
            return orig(tokens);
        };
        encryptHooked = true;
    } catch { }
}

function hookFluxDispatcher(): (() => void) | null {
    try {
        if (!FluxDispatcher?.subscribe) return null;
        const handler = (event: any) => {
            if (event?.token && event?.userId) {
                cacheToken(event.userId, event.token);
                saveTokenCache();
            }
        };
        FluxDispatcher.subscribe("MULTI_ACCOUNT_VALIDATE_TOKEN_SUCCESS", handler);
        return () => FluxDispatcher.unsubscribe("MULTI_ACCOUNT_VALIDATE_TOKEN_SUCCESS", handler);
    } catch { return null; }
}

function getAvatarUrl(id: string, hash?: string | null): string {
    return hash ? IconUtils.getUserAvatarURL({ id, avatar: hash } as any, false, 64) : IconUtils.getDefaultAvatarURL(id);
}

function getNativeAccounts(): SavedAccount[] {
    try {
        const store = findByProps("getUsers", "getValidUsers");
        const users: any[] = store?.getUsers?.() ?? [];
        return users.filter(u => u?.id).map(u => ({
            id: u.id,
            token: tokenCache[u.id] ?? "",
            username: u.globalName || u.username || `User_${u.id.slice(-4)}`,
            avatar: getAvatarUrl(u.id, u.avatar),
        }));
    } catch {
        return [];
    }
}

function switchToQuick(token: string) {
    try {
        window.localStorage.setItem("token", `"${token}"`);
        location.reload();
    } catch {
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        document.body.appendChild(iframe);
        try { (iframe as any).contentWindow.localStorage.token = `"${token}"`; } catch { }
        document.body.removeChild(iframe);
        location.reload();
    }
}

function switchNativeAccount(userId: string) {
    try {
        const multiAuth = findByProps("switchAccount", "loginToken") ?? findByProps("switchAccount");
        if (multiAuth?.switchAccount) {
            multiAuth.switchAccount(userId);
            return;
        }
        if (FluxDispatcher?.dispatch) {
            FluxDispatcher.dispatch({ type: "MULTI_ACCOUNT_SWITCH_ATTEMPT", userId });
        }
    } catch {
        console.warn("[MultiInstance] switchNativeAccount failed for", userId);
    }
}

function copyToClipboard(text: string) {
    try {
        navigator.clipboard.writeText(text);
        Toasts.show({ message: "Copied to clipboard", type: Toasts.Type.SUCCESS });
    } catch { }
}

async function handleValidateTokens(): Promise<void> {
    const saved = await DataStore.get<SavedAccount[]>(STORE_KEY) ?? [];
    if (saved.length === 0) {
        Toasts.show({ message: "No tokens to validate", type: Toasts.Type.WARNING });
        return;
    }
    let valid = 0;
    let invalid = 0;
    for (const acc of saved) {
        try {
            const res = await fetch("https://discord.com/api/v9/users/@me", {
                headers: { Authorization: acc.token }
            });
            if (res.ok) valid++;
            else invalid++;
        } catch { invalid++; }
    }
    Toasts.show({
        message: `Validation complete: ${valid} valid, ${invalid} invalid (out of ${saved.length})`,
        type: invalid === 0 ? Toasts.Type.SUCCESS : Toasts.Type.WARNING,
    });
}

async function handleExportTokens(): Promise<void> {
    const saved = await DataStore.get<SavedAccount[]>(STORE_KEY) ?? [];
    if (saved.length === 0) {
        Toasts.show({ message: "No tokens to export", type: Toasts.Type.WARNING });
        return;
    }
    const text = saved.map(a => a.token).join("\n");
    copyToClipboard(text);
    Toasts.show({ message: `Exported ${saved.length} token(s) to clipboard`, type: Toasts.Type.SUCCESS });
}

function parseToken(token: string): { id: string; token: string } | null {
    try {
        const parts = token.split(".");
        if (parts.length >= 2) {
            const id = Buffer.from(parts[0], "base64").toString("utf-8");
            if (id && /^\d+$/.test(id)) return { id, token };
        }
    } catch { }
    const match = token.match(/^(\d{17,20})\./);
    if (match) return { id: match[1], token };
    return null;
}

function getDisplayName(acc: AccountEntry, customNames: Record<string, string>): string {
    return customNames[acc.id] || acc.username;
}

function parseKeybind(bind: string): { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean; key: string } {
    const parts = bind.split("+").map(p => p.trim().toLowerCase());
    return {
        ctrl: parts.includes("ctrl"),
        shift: parts.includes("shift"),
        alt: parts.includes("alt"),
        meta: parts.includes("meta"),
        key: parts[parts.length - 1],
    };
}

function matchKeybind(e: KeyboardEvent, bind: string): boolean {
    const kb = parseKeybind(bind);
    return (
        e.key.toLowerCase() === kb.key &&
        e.ctrlKey === kb.ctrl &&
        e.shiftKey === kb.shift &&
        e.altKey === kb.alt &&
        e.metaKey === kb.meta
    );
}

interface AccountMenuActions {
    isOpen: boolean;
    isFavorite: boolean;
    note: string;
    currentName: string;
    currentColor: string | null;
    onNewDetached(): void;
    onNewGrouped(): void;
    onSwitch(): void;
    onCopyToken(): void;
    onCopyId(): void;
    onHide(): void;
    onToggleFavorite(): void;
    onSetNote(text: string): void;
    onRename(name: string): void;
    onSetColor(color: string | null): void;
}

interface TextPromptProps {
    modalProps: ModalProps;
    title: string;
    placeholder: string;
    initialValue: string;
    onSubmit(value: string): void;
}

function TextPromptModal({ modalProps, title, placeholder, initialValue, onSubmit }: TextPromptProps) {
    const [value, setValue] = React.useState(initialValue);
    const submit = () => {
        onSubmit(value.trim());
        modalProps.onClose();
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.SMALL}>
            <ModalHeader>
                <Forms.FormTitle tag="h2" style={{ margin: 0 }}>{title}</Forms.FormTitle>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent>
                <TextInput
                    value={value}
                    placeholder={placeholder}
                    autoFocus
                    onChange={setValue}
                    onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") submit(); }}
                />
            </ModalContent>
            <ModalFooter>
                <Button color={Button.Colors.BRAND} onClick={submit}>Save</Button>
                <Button color={Button.Colors.TRANSPARENT} look={Button.Looks.LINK} onClick={modalProps.onClose}>Cancel</Button>
            </ModalFooter>
        </ModalRoot>
    );
}

function openTextPrompt(options: Omit<TextPromptProps, "modalProps">) {
    openModal(modalProps => <TextPromptModal modalProps={modalProps} {...options} />);
}

function AccountContextMenu({ acc, actions }: { acc: AccountEntry; actions: AccountMenuActions; }) {
    const { isOpen, isFavorite, note, currentName, currentColor } = actions;

    return (
        <Menu.Menu navId="multi-instance-account" onClose={ContextMenuApi.closeContextMenu} aria-label={currentName}>
            <Menu.MenuGroup label={currentName}>
                {acc.hasToken && (
                    <>
                        <Menu.MenuItem id="mi-new-detached" label="New detached instance" icon={WindowIcon} action={actions.onNewDetached} />
                        <Menu.MenuItem id="mi-new-grouped" label="New grouped instance" icon={GroupedIcon} action={actions.onNewGrouped} />
                    </>
                )}
                <Menu.MenuItem id="mi-switch" label="Quick switch" icon={SwitchIcon} action={actions.onSwitch} />
            </Menu.MenuGroup>

            <Menu.MenuGroup>
                {acc.hasToken && <Menu.MenuItem id="mi-copy-token" label="Copy token" icon={CopyIcon} action={actions.onCopyToken} />}
                <Menu.MenuItem id="mi-copy-id" label="Copy ID" icon={CopyIcon} action={actions.onCopyId} />
            </Menu.MenuGroup>

            <Menu.MenuGroup>
                <Menu.MenuItem
                    id="mi-favorite"
                    label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                    icon={() => <StarIcon filled={isFavorite} />}
                    action={actions.onToggleFavorite}
                />
                <Menu.MenuItem
                    id="mi-rename"
                    label="Rename"
                    icon={RenameIcon}
                    action={() => openTextPrompt({ title: "Rename account", placeholder: "Custom name...", initialValue: currentName, onSubmit: actions.onRename })}
                />
                <Menu.MenuItem id="mi-color" label={currentColor ? "Change color" : "Set color"} icon={() => <ColorIcon color={currentColor} />}>
                    <Menu.MenuItem id="mi-color-none" label="No color" action={() => actions.onSetColor(null)} />
                    {COLOR_PRESETS.map(color => (
                        <Menu.MenuItem
                            key={color}
                            id={`mi-color-${color}`}
                            label={color}
                            icon={() => <ColorIcon color={color} />}
                            action={() => actions.onSetColor(color)}
                        />
                    ))}
                </Menu.MenuItem>
                <Menu.MenuItem
                    id="mi-note"
                    label={note ? "Edit note" : "Add note"}
                    icon={NoteIcon}
                    action={() => openTextPrompt({ title: "Account note", placeholder: "Account note...", initialValue: note, onSubmit: actions.onSetNote })}
                />
            </Menu.MenuGroup>

            <Menu.MenuGroup>
                <Menu.MenuItem id="mi-hide" label="Hide account" color="danger" icon={HideIcon} action={actions.onHide} />
                {isOpen && (
                    <Menu.MenuItem
                        id="mi-close-instance"
                        label="Close instance"
                        color="danger"
                        icon={CloseIcon}
                        action={() => void Native.closeInstance(acc.id).catch(() => { })}
                    />
                )}
            </Menu.MenuGroup>
        </Menu.Menu>
    );
}

function QuickSwitchOverlay({ accounts, onClose, customNames }: { accounts: AccountEntry[]; onClose: () => void; customNames: Record<string, string> }) {
    const [query, setQuery] = React.useState("");
    const [selectedIndex, setSelectedIndex] = React.useState(0);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const filtered = React.useMemo(() => {
        const q = query.toLowerCase();
        return accounts.filter(a => {
            const name = (customNames[a.id] || a.username).toLowerCase();
            return name.includes(q) || a.id.includes(q);
        });
    }, [accounts, query, customNames]);

    React.useEffect(() => {
        inputRef.current?.focus();
    }, []);

    React.useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    const handleKey = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, filtered.length - 1)); }
        if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
        if (e.key === "Enter" && filtered[selectedIndex]) {
            e.preventDefault();
            const acc = filtered[selectedIndex];
            if (acc.token) switchToQuick(acc.token);
            else switchNativeAccount(acc.id);
            onClose();
        }
        if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };

    return (
        <div className="mi-qso-backdrop" onClick={onClose}>
            <div className="mi-qso-panel" onClick={e => e.stopPropagation()}>
                <div className="mi-qso-search-wrap">
                    <SearchIcon />
                    <input
                        ref={inputRef}
                        className="mi-qso-input"
                        value={query}
                        onChange={e => setQuery(e.currentTarget.value)}
                        onKeyDown={handleKey}
                        placeholder="Search accounts..."
                    />
                </div>
                <div className="mi-qso-list">
                    {filtered.length === 0 ? (
                        <div className="mi-qso-empty">No accounts found</div>
                    ) : filtered.map((acc, i) => {
                        const name = customNames[acc.id] || acc.username;
                        return (
                            <div
                                key={acc.id}
                                className={`mi-qso-item${i === selectedIndex ? " mi-qso-item--sel" : ""}`}
                                onClick={() => {
                                    if (acc.token) switchToQuick(acc.token);
                                    else switchNativeAccount(acc.id);
                                    onClose();
                                }}
                                onMouseEnter={() => setSelectedIndex(i)}
                            >
                                <img src={acc.avatar} className="mi-qso-avatar" alt="" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                <span className="mi-qso-name">{name}</span>
                                {!acc.hasToken && <span className="mi-qso-badge">No token</span>}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function MultiInstanceModal({ rootProps }: { rootProps: any; }) {
    const currentUser = UserStore.getCurrentUser();
    const [savedAccounts, setSavedAccounts] = React.useState<SavedAccount[]>([]);
    const [nativeAccounts, setNativeAccounts] = React.useState<SavedAccount[]>([]);
    const [openInstances, setOpenInstances] = React.useState<string[]>([]);
    const [hiddenIds, setHiddenIds] = React.useState<string[]>([]);
    const [status, setStatus] = React.useState<string | null>(null);
    const [tab, setTab] = React.useState<"accounts" | "tokens" | "hidden">("accounts");
    const [tokenInput, setTokenInput] = React.useState("");
    const [tokenAccounts, setTokenAccounts] = React.useState<SavedAccount[]>([]);
    const [notes, setNotes] = React.useState<Record<string, string>>({});
    const [favorites, setFavorites] = React.useState<string[]>([]);
    const [customNames, setCustomNames] = React.useState<Record<string, string>>({});
    const [accountColors, setAccountColors] = React.useState<Record<string, string>>({});
    const [accountOrder, setAccountOrder] = React.useState<string[]>([]);
    const [searchQuery, setSearchQuery] = React.useState("");
    const [showBulkImport, setShowBulkImport] = React.useState(false);
    const [bulkText, setBulkText] = React.useState("");

    React.useEffect(() => {
        captureCurrentToken();
        const load = async () => {
            const saved = await DataStore.get<SavedAccount[]>(STORE_KEY);
            setSavedAccounts(saved ?? []);
            const hidden = await DataStore.get<string[]>(HIDDEN_ACCOUNTS_KEY);
            setHiddenIds(hidden ?? []);
            const savedNotes = await DataStore.get<Record<string, string>>("multiinstance_notes");
            setNotes(savedNotes ?? {});
            setTokenAccounts(saved ?? []);
            const favs = await DataStore.get<string[]>(FAVORITES_KEY);
            setFavorites(favs ?? []);
            const names = await DataStore.get<Record<string, string>>(DISPLAY_NAMES_KEY);
            setCustomNames(names ?? {});
            const colors = await DataStore.get<Record<string, string>>(ACCOUNT_COLORS_KEY);
            setAccountColors(colors ?? {});
            const order = await DataStore.get<string[]>(ACCOUNT_ORDER_KEY);
            setAccountOrder(order ?? []);
        };
        load();
        setNativeAccounts(getNativeAccounts());
        Native.getOpenInstances().then(ids => setOpenInstances(ids ?? [])).catch(() => { });
    }, []);

    const allAccounts = React.useMemo<AccountEntry[]>(() => {
        const seen = new Set<string>();
        const result: AccountEntry[] = [];
        for (const acc of nativeAccounts) {
            if (acc.id === currentUser?.id || seen.has(acc.id)) continue;
            seen.add(acc.id);
            const saved = savedAccounts.find(s => s.id === acc.id);
            const token = saved?.token || acc.token || tokenCache[acc.id] || "";
            result.push({
                ...acc,
                token,
                hasToken: !!token,
                isNative: true,
                note: notes[acc.id],
                displayName: customNames[acc.id],
                color: accountColors[acc.id],
                isFavorite: favorites.includes(acc.id),
            });
        }
        for (const acc of savedAccounts) {
            if (acc.id === currentUser?.id || seen.has(acc.id)) continue;
            seen.add(acc.id);
            result.push({
                ...acc,
                hasToken: true,
                isNative: false,
                note: notes[acc.id],
                displayName: customNames[acc.id],
                color: accountColors[acc.id],
                isFavorite: favorites.includes(acc.id),
            });
        }
        if (accountOrder.length > 0) {
            const ordered = [...result];
            const orderMap = new Map(accountOrder.map((id, i) => [id, i]));
            ordered.sort((a, b) => {
                const ai = orderMap.get(a.id);
                const bi = orderMap.get(b.id);
                if (ai !== undefined && bi !== undefined) return ai - bi;
                if (ai !== undefined) return -1;
                if (bi !== undefined) return 1;
                return 0;
            });
            return ordered;
        }
        return result;
    }, [savedAccounts, nativeAccounts, currentUser, notes, favorites, customNames, accountColors, accountOrder]);

    const sortedAccounts = React.useMemo(() => {
        const favs = allAccounts.filter(a => a.isFavorite);
        const rest = allAccounts.filter(a => !a.isFavorite);
        return [...favs, ...rest];
    }, [allAccounts]);

    const visibleAccounts = React.useMemo(() => {
        const q = searchQuery.toLowerCase();
        return sortedAccounts
            .filter(a => !hiddenIds.includes(a.id))
            .filter(a => {
                if (!q) return true;
                const name = (customNames[a.id] || a.username).toLowerCase();
                return name.includes(q) || a.id.includes(q);
            });
    }, [sortedAccounts, hiddenIds, searchQuery, customNames]);

    const hiddenAccounts = React.useMemo(() => {
        const q = searchQuery.toLowerCase();
        return sortedAccounts
            .filter(a => hiddenIds.includes(a.id))
            .filter(a => {
                if (!q) return true;
                const name = (customNames[a.id] || a.username).toLowerCase();
                return name.includes(q) || a.id.includes(q);
            });
    }, [sortedAccounts, hiddenIds, searchQuery, customNames]);

    const refreshInstances = async () => {
        const ids = await Native.getOpenInstances().catch(() => []);
        setOpenInstances(ids ?? []);
    };

    const handleNewDetached = async (acc: AccountEntry) => {
        if (!acc.hasToken) return;
        setStatus("Opening detached instance...");
        const res = await Native.openInstanceWindow(acc.token, acc.id, true, acc.username).catch(() => ({ ok: false, error: "error" }));
        if ((res as any).ok) {
            setStatus("Instance opened");
            await refreshInstances();
        } else {
            setStatus("Error: " + ((res as any).error ?? "unknown"));
        }
        setTimeout(() => setStatus(null), 3000);
    };

    const handleNewGrouped = async (acc: AccountEntry) => {
        if (!acc.hasToken) return;
        setStatus("Opening grouped instance...");
        const res = await Native.openInstanceWindowGrouped(acc.token, acc.id, acc.username).catch(() => ({ ok: false, error: "error" }));
        if ((res as any).ok) {
            setStatus("Instance opened");
            await refreshInstances();
        } else {
            setStatus("Error: " + ((res as any).error ?? "unknown"));
        }
        setTimeout(() => setStatus(null), 3000);
    };

    const handleAddToken = async () => {
        const raw = tokenInput.trim();
        if (!raw) return;
        const parsed = parseToken(raw);
        if (!parsed) {
            setStatus("Invalid token format");
            setTimeout(() => setStatus(null), 3000);
            return;
        }
        if (savedAccounts.some(a => a.id === parsed.id)) {
            setStatus("Account already exists");
            setTimeout(() => setStatus(null), 3000);
            return;
        }
        const newAcc: SavedAccount = {
            id: parsed.id,
            token: parsed.token,
            username: `User_${parsed.id.slice(-4)}`,
            avatar: getAvatarUrl(parsed.id, null),
        };
        const updated = [...savedAccounts, newAcc];
        setSavedAccounts(updated);
        setTokenAccounts(updated);
        await DataStore.set(STORE_KEY, updated);
        cacheToken(parsed.id, parsed.token);
        await saveTokenCache();
        setTokenInput("");
        setStatus("Token added");
        setTimeout(() => setStatus(null), 2000);
    };

    const handleDeleteToken = async (id: string) => {
        const updated = savedAccounts.filter(a => a.id !== id);
        setSavedAccounts(updated);
        setTokenAccounts(updated);
        await DataStore.set(STORE_KEY, updated);
    };

    const handleCopyToken = (token: string) => {
        copyToClipboard(token);
    };

    const handleToggleHide = async (id: string) => {
        const isHidden = hiddenIds.includes(id);
        const updated = isHidden ? hiddenIds.filter(h => h !== id) : [...hiddenIds, id];
        setHiddenIds(updated);
        await DataStore.set(HIDDEN_ACCOUNTS_KEY, updated);
    };

    const handleUnhideAll = async () => {
        setHiddenIds([]);
        await DataStore.set(HIDDEN_ACCOUNTS_KEY, []);
    };

    const handleSetNote = async (id: string, text: string) => {
        const updated = { ...notes };
        if (text) updated[id] = text;
        else delete updated[id];
        setNotes(updated);
        await DataStore.set("multiinstance_notes", updated);
    };

    const handleToggleFavorite = async (id: string) => {
        const isFav = favorites.includes(id);
        const updated = isFav ? favorites.filter(f => f !== id) : [...favorites, id];
        setFavorites(updated);
        await DataStore.set(FAVORITES_KEY, updated);
    };

    const handleRename = async (id: string, name: string) => {
        const updated = { ...customNames };
        if (name.trim()) updated[id] = name.trim();
        else delete updated[id];
        setCustomNames(updated);
        await DataStore.set(DISPLAY_NAMES_KEY, updated);
    };

    const handleSetColor = async (id: string, color: string | null) => {
        const updated = { ...accountColors };
        if (color) updated[id] = color;
        else delete updated[id];
        setAccountColors(updated);
        await DataStore.set(ACCOUNT_COLORS_KEY, updated);
    };

    const handleMoveUp = async (id: string) => {
        const current = [...accountOrder];
        const idx = current.indexOf(id);
        if (idx <= 0) return;
        [current[idx - 1], current[idx]] = [current[idx], current[idx - 1]];
        setAccountOrder(current);
        await DataStore.set(ACCOUNT_ORDER_KEY, current);
    };

    const handleMoveDown = async (id: string) => {
        const current = [...accountOrder];
        const idx = current.indexOf(id);
        if (idx === -1 || idx >= current.length - 1) return;
        [current[idx], current[idx + 1]] = [current[idx + 1], current[idx]];
        setAccountOrder(current);
        await DataStore.set(ACCOUNT_ORDER_KEY, current);
    };

    const handleBulkImport = async () => {
        const lines = bulkText.split("\n").map(l => l.trim()).filter(Boolean);
        let added = 0;
        const updated = [...savedAccounts];
        for (const line of lines) {
            const parsed = parseToken(line);
            if (!parsed || updated.some(a => a.id === parsed.id)) continue;
            updated.push({
                id: parsed.id,
                token: parsed.token,
                username: `User_${parsed.id.slice(-4)}`,
                avatar: getAvatarUrl(parsed.id, null),
            });
            cacheToken(parsed.id, parsed.token);
            added++;
        }
        if (added > 0) {
            setSavedAccounts(updated);
            setTokenAccounts(updated);
            await DataStore.set(STORE_KEY, updated);
            await saveTokenCache();
        }
        setBulkText("");
        setShowBulkImport(false);
        setStatus(`Imported ${added} token(s)`);
        setTimeout(() => setStatus(null), 3000);
    };

    const openCtx = (e: React.MouseEvent, acc: AccountEntry) => {
        e.preventDefault();
        e.stopPropagation();

        const actions: AccountMenuActions = {
            isOpen: openInstances.includes(acc.id),
            isFavorite: favorites.includes(acc.id),
            note: acc.note || "",
            currentName: customNames[acc.id] || acc.username,
            currentColor: accountColors[acc.id] || null,
            onNewDetached: () => handleNewDetached(acc),
            onNewGrouped: () => handleNewGrouped(acc),
            onSwitch: () => acc.token ? switchToQuick(acc.token) : switchNativeAccount(acc.id),
            onCopyToken: () => handleCopyToken(acc.token),
            onCopyId: () => copyToClipboard(acc.id),
            onHide: () => handleToggleHide(acc.id),
            onToggleFavorite: () => handleToggleFavorite(acc.id),
            onSetNote: text => handleSetNote(acc.id, text),
            onRename: name => handleRename(acc.id, name),
            onSetColor: color => handleSetColor(acc.id, color)
        };

        ContextMenuApi.openContextMenu(e, () => <AccountContextMenu acc={acc} actions={actions} />);
    };

    const renderTokenTab = () => (
        <>
            <div className="mi-section-label">ADD TOKEN</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <input
                    className="mi-token-input"
                    value={tokenInput}
                    onChange={e => setTokenInput(e.currentTarget.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleAddToken(); }}
                    placeholder="Paste Discord token here..."
                />
                <button className="mi-btn mi-btn--primary" onClick={handleAddToken} disabled={!tokenInput.trim()}>Add</button>
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                <button className="mi-btn" onClick={() => setShowBulkImport(true)} style={{ fontSize: 11, padding: "4px 10px" }}>Bulk import</button>
                <button className="mi-btn" onClick={handleValidateTokens} style={{ fontSize: 11, padding: "4px 10px" }}>Validate all</button>
                <button className="mi-btn" onClick={handleExportTokens} style={{ fontSize: 11, padding: "4px 10px" }}>Export tokens</button>
            </div>

            {showBulkImport && (
                <div style={{ marginBottom: 10 }}>
                    <textarea
                        className="mi-token-input mi-bulk-textarea"
                        value={bulkText}
                        onChange={e => setBulkText(e.currentTarget.value)}
                        placeholder="Paste tokens here, one per line..."
                        rows={5}
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                        <button className="mi-btn mi-btn--primary" onClick={handleBulkImport} disabled={!bulkText.trim()}>Import</button>
                        <button className="mi-btn" onClick={() => { setBulkText(""); setShowBulkImport(false); }}>Cancel</button>
                    </div>
                </div>
            )}

            <div className="mi-section-label">{tokenAccounts.length} SAVED TOKEN{tokenAccounts.length !== 1 ? "S" : ""}</div>
            {tokenAccounts.length === 0 ? (
                <div className="mi-empty">No tokens saved. Add one above.</div>
            ) : tokenAccounts.map(acc => (
                <div key={acc.id} className="mi-token-row">
                    <img src={acc.avatar} className="mi-token-avatar" alt="" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <div className="mi-account-info" style={{ flex: 1 }}>
                        <span className="mi-account-name" style={{ fontSize: 13 }}>{customNames[acc.id] || acc.username}</span>
                        <span className="mi-account-tag" style={{ fontSize: 10, fontFamily: "monospace", wordBreak: "break-all" }}>{acc.token.slice(0, 40)}...</span>
                    </div>
                    <button className="mi-btn mi-btn--icon" onClick={() => handleCopyToken(acc.token)} title="Copy token">
                        <CopyIcon />
                    </button>
                    <button className="mi-btn mi-btn--danger" onClick={() => handleDeleteToken(acc.id)} title="Delete token">
                        ×
                    </button>
                </div>
            ))}
        </>
    );

    const renderHiddenTab = () => (
        <>
            <div className="mi-section-label">HIDDEN ACCOUNTS</div>
            {hiddenAccounts.length === 0 ? (
                <div className="mi-empty">No hidden accounts.</div>
            ) : (
                <>
                    {hiddenAccounts.map(acc => {
                        const name = customNames[acc.id] || acc.username;
                        return (
                            <div key={acc.id} className="mi-account-row" onClick={() => { }}>
                                {accountColors[acc.id] && <div className="mi-color-stripe" style={{ background: accountColors[acc.id] }} />}
                                <AccountAvatar url={acc.avatar} name={name} />
                                <div className="mi-account-info">
                                    <span className="mi-account-name">{name}</span>
                                    <span className="mi-account-tag">{acc.isNative ? "Native" : "Token"}</span>
                                </div>
                                <button className="mi-btn mi-btn--primary" style={{ fontSize: 10, padding: "3px 8px" }} onClick={() => handleToggleHide(acc.id)}>Unhide</button>
                            </div>
                        );
                    })}
                    <button className="mi-btn" style={{ marginTop: 6 }} onClick={handleUnhideAll}>Unhide all</button>
                </>
            )}
        </>
    );

    return (
        <ModalRoot {...rootProps} size="small">
            <ModalHeader separator={false}>
                <Forms.FormTitle tag="h4" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, color: "#fff" }}>
                    <DiscordIcon /> Multi-instance
                </Forms.FormTitle>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>

            <ModalContent className="mi-modal-content">
                <div className="mi-tabs">
                    {(["accounts", "tokens", "hidden"] as const).map(t => (
                        <button key={t} className={`mi-tab${tab === t ? " mi-tab--active" : ""}`} onClick={() => setTab(t)}>
                            {t === "accounts" ? `Accounts (${visibleAccounts.length})` : t === "tokens" ? "Tokens" : `Hidden (${hiddenAccounts.length})`}
                        </button>
                    ))}
                </div>

                {tab === "accounts" && <>
                    <div className="mi-search-wrap">
                        <SearchIcon />
                        <input
                            className="mi-search-input"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.currentTarget.value)}
                            placeholder="Search accounts..."
                        />
                        {searchQuery && <button className="mi-search-clear" onClick={() => setSearchQuery("")}>×</button>}
                    </div>

                    {currentUser && (
                        <div className="mi-list">
                            <div className="mi-section-label">ACTIVE ACCOUNT</div>
                            <div className="mi-account-row mi-account-row--current">
                                <AccountAvatar
                                    url={getAvatarUrl(currentUser.id, currentUser.avatar)}
                                    name={currentUser.username}
                                />
                                <div className="mi-account-info">
                                    <span className="mi-account-name">
                                        {(currentUser as any).globalName || currentUser.username}
                                    </span>
                                    <span className="mi-account-tag">@{currentUser.username}</span>
                                </div>
                                <span className="mi-badge-current">Active</span>
                            </div>
                        </div>
                    )}

                    <div className="mi-list">
                        <div className="mi-section-label">
                            {visibleAccounts.length} {visibleAccounts.length !== 1 ? "OTHER ACCOUNTS" : "OTHER ACCOUNT"}
                        </div>

                        {visibleAccounts.length === 0 ? (
                            <div className="mi-empty">
                                No other accounts found.<br />
                                Use <strong>Switch Account</strong> in Discord or add tokens via the <strong>Tokens</strong> tab.
                            </div>
                        ) : visibleAccounts.map(acc => {
                            const isOpen = openInstances.includes(acc.id);
                            const name = customNames[acc.id] || acc.username;
                            const tagText = acc.hasToken
                                ? (acc.isNative ? "Discord Account" : "Token")
                                : "Switch only";
                            return (
                                <div
                                    key={acc.id}
                                    className={`mi-account-row${isOpen ? " mi-account-row--active" : ""}${!acc.hasToken ? " mi-account-row--no-token" : ""}`}
                                    onClick={e => openCtx(e, acc)}
                                    onContextMenu={e => openCtx(e, acc)}
                                >
                                    {accountColors[acc.id] && <div className="mi-color-stripe" style={{ background: accountColors[acc.id] }} />}
                                    <AccountAvatar url={acc.avatar} name={name} />
                                    <div className="mi-account-info">
                                        <span className="mi-account-name">
                                            {name}
                                            {acc.isFavorite && <StarIcon filled={true} small />}
                                            {acc.note && <span className="mi-note-indicator" title={acc.note}><NoteIcon /></span>}
                                        </span>
                                        <span className="mi-account-tag">{tagText}</span>
                                    </div>
                                    <div className="mi-reorder-btns">
                                        <button className="mi-btn mi-btn--icon mi-btn--tiny" onClick={e => { e.stopPropagation(); handleMoveUp(acc.id); }} title="Move up">▲</button>
                                        <button className="mi-btn mi-btn--icon mi-btn--tiny" onClick={e => { e.stopPropagation(); handleMoveDown(acc.id); }} title="Move down">▼</button>
                                    </div>
                                    {isOpen
                                        ? <span className="mi-badge-open">Open</span>
                                        : <span className="mi-badge-arrow">›</span>}
                                </div>
                            );
                        })}
                    </div>
                </>}

                {tab === "tokens" && renderTokenTab()}
                {tab === "hidden" && renderHiddenTab()}

                {status && (
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textAlign: "center", margin: "4px 0 0" }}>
                        {status}
                    </p>
                )}
            </ModalContent>
        </ModalRoot>
    );
}

function AccountAvatar({ url, name }: { url: string; name: string; }) {
    const [err, setErr] = React.useState(false);
    if (err || !url) return <div className="mi-avatar mi-avatar--ph">{name?.[0]?.toUpperCase() ?? "?"}</div>;
    return <img src={url} className="mi-avatar" alt="" onError={() => setErr(true)} />;
}

function DiscordIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.73 4.87a18.2 18.2 0 0 0-4.6-1.44c-.21.4-.4.8-.58 1.21-1.69-.25-3.4-.25-5.1 0-.18-.41-.37-.82-.59-1.2-1.6.27-3.14.75-4.6 1.43A19.04 19.04 0 0 0 .96 17.7a18.43 18.43 0 0 0 5.63 2.87c.46-.62.86-1.28 1.2-1.98-.65-.25-1.29-.55-1.9-.92.17-.12.32-.24.47-.37 3.58 1.7 7.7 1.7 11.28 0l.46.37c-.6.36-1.25.67-1.9.92.35.7.75 1.35 1.2 1.98 2.03-.63 3.94-1.6 5.64-2.87.47-4.87-.78-9.09-3.3-12.83ZM8.3 15.12c-1.1 0-2-1.02-2-2.27 0-1.24.88-2.26 2-2.26s2.02 1.02 2 2.26c0 1.25-.89 2.27-2 2.27Zm7.4 0c-1.1 0-2-1.02-2-2.27 0-1.24.88-2.26 2-2.26s2.02 1.02 2 2.26c0 1.25-.88 2.27-2 2.27Z" />
        </svg>
    );
}

function WindowIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8h16v10z" />
        </svg>
    );
}

function SwitchIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 17v-3H9v-4h7V7l5 5-5 5zm-9 2H5V5h2V3H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h2v-2z" />
        </svg>
    );
}

function GroupedIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 7h20v2H2zm0 4h20v2H2zm0 4h20v2H2z" />
        </svg>
    );
}

function CloseIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
        </svg>
    );
}

function CopyIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
        </svg>
    );
}

function HideIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" />
        </svg>
    );
}

function NoteIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
        </svg>
    );
}

function StarIcon({ filled, small }: { filled: boolean; small?: boolean }) {
    const size = small ? 12 : 14;
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "#faa81a" : "currentColor"} opacity={filled ? 1 : 0.5}>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
    );
}

function RenameIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
        </svg>
    );
}

function ColorIcon({ color }: { color: string | null }) {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill={color || "currentColor"}>
            <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
        </svg>
    );
}

function SearchIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" opacity={0.5}>
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
        </svg>
    );
}

function MultiInstanceIcon({ width = 20, height = 20 }: { width?: number; height?: number; }) {
    return (
        <svg width={width} height={height} viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.73 4.87a18.2 18.2 0 0 0-4.6-1.44c-.21.4-.4.8-.58 1.21-1.69-.25-3.4-.25-5.1 0-.18-.41-.37-.82-.59-1.2-1.6.27-3.14.75-4.6 1.43A19.04 19.04 0 0 0 .96 17.7a18.43 18.43 0 0 0 5.63 2.87c.46-.62.86-1.28 1.2-1.98-.65-.25-1.29-.55-1.9-.92.17-.12.32-.24.47-.37 3.58 1.7 7.7 1.7 11.28 0l.46.37c-.6.36-1.25.67-1.9.92.35.7.75 1.35 1.2 1.98 2.03-.63 3.94-1.6 5.64-2.87.47-4.87-.78-9.09-3.3-12.83ZM8.3 15.12c-1.1 0-2-1.02-2-2.27 0-1.24.88-2.26 2-2.26s2.02 1.02 2 2.26c0 1.25-.89 2.27-2 2.27Zm7.4 0c-1.1 0-2-1.02-2-2.27 0-1.24.88-2.26 2-2.26s2.02 1.02 2 2.26c0 1.25-.88 2.27-2 2.27Z" />
            <circle cx="19.5" cy="19.5" r="4.5" fill="var(--brand-500, #5865f2)" />
            <path d="M19.5 17.5v4M17.5 19.5h4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
    );
}

let showButton = true;
let modalRef: any = null;
let qsoRef: (() => void) | null = null;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

function MultiInstanceButton() {
    return (
        <HeaderBarButton
            icon={MultiInstanceIcon}
            tooltip="Multi-instance"
            onClick={() => {
                modalRef = openModal(props => <MultiInstanceModal rootProps={props} />);
            }}
        />
    );
}

export default definePlugin({
    name: "MultiInstance",
    enabledByDefault: true,
    description: "Multi-instance manager — open Discord windows with other accounts, manage tokens, hide accounts. Features quick switch overlay, favorites, custom names, color tags, advanced keybinds.",
    authors: [
        { name: "naxiwow", id: 875342291001278504n },
        { name: "x870", id: 1389444830882562131n },
    ],
    dependencies: ["HeaderBarAPI"],

    _fluxUnsub: null as (() => void) | null,
    _buttonName: "multi-instance" as string,

    async start() {
        await loadTokenCache();
        hookEncryptAndStoreTokens();
        this._fluxUnsub = hookFluxDispatcher();
        captureCurrentToken();
        showButton = true;
        addHeaderBarButton(this._buttonName, () => <MultiInstanceButton />, 9);

        keydownHandler = (e: KeyboardEvent) => {
            const bindToggleBtn = TOGGLE_KEYBIND_DEFAULT;
            const bindToggleModal = "Ctrl+Shift+M";
            const bindQuickSwitch = "Ctrl+Shift+K";
            const bindHideCurrent = "Ctrl+Shift+H";

            if (matchKeybind(e, bindToggleBtn)) {
                e.preventDefault();
                e.stopPropagation();
                showButton = !showButton;
                if (showButton) {
                    addHeaderBarButton(this._buttonName, () => <MultiInstanceButton />, 9);
                } else {
                    removeHeaderBarButton(this._buttonName);
                }
                return;
            }

            if (matchKeybind(e, bindToggleModal)) {
                e.preventDefault();
                e.stopPropagation();
                if (modalRef) {
                    modalRef = null;
                } else {
                    modalRef = openModal(props => <MultiInstanceModal rootProps={props} />);
                }
                return;
            }

            if (matchKeybind(e, bindQuickSwitch)) {
                e.preventDefault();
                e.stopPropagation();
                qsoRef?.();
                const accounts: AccountEntry[] = [];
                try {
                    const native = getNativeAccounts();
                    const seen = new Set<string>();
                    const currentUser = UserStore.getCurrentUser();
                    for (const acc of native) {
                        if (acc.id === currentUser?.id || seen.has(acc.id)) continue;
                        seen.add(acc.id);
                        const token = acc.token || tokenCache[acc.id] || "";
                        accounts.push({ ...acc, token, hasToken: !!token, isNative: true });
                    }
                    DataStore.get<SavedAccount[]>(STORE_KEY).then(saved => {
                        for (const acc of saved ?? []) {
                            if (acc.id === currentUser?.id || seen.has(acc.id)) continue;
                            seen.add(acc.id);
                            accounts.push({ ...acc, hasToken: true, isNative: false });
                        }
                        DataStore.get<Record<string, string>>(DISPLAY_NAMES_KEY).then(names => {
                            qsoRef?.();
                            const container = document.body.appendChild(document.createElement("div"));
                            container.id = QSO_ROOT_ID;
                            const reactRoot = createRoot(container);
                            const close = () => {
                                reactRoot.unmount();
                                container.remove();
                                if (qsoRef === close) qsoRef = null;
                            };
                            qsoRef = close;
                            reactRoot.render(
                                <QuickSwitchOverlay
                                    accounts={accounts}
                                    onClose={close}
                                    customNames={names ?? {}}
                                />
                            );
                        });
                    });
                } catch { }
                return;
            }

            if (matchKeybind(e, bindHideCurrent)) {
                e.preventDefault();
                e.stopPropagation();
                const currentUser = UserStore.getCurrentUser();
                if (currentUser?.id) {
                    DataStore.get<string[]>(HIDDEN_ACCOUNTS_KEY).then(hidden => {
                        const updated = hidden?.includes(currentUser.id)
                            ? hidden.filter(h => h !== currentUser.id)
                            : [...(hidden ?? []), currentUser.id];
                        DataStore.set(HIDDEN_ACCOUNTS_KEY, updated);
                        Toasts.show({
                            message: updated.includes(currentUser.id)
                                ? "Current account hidden"
                                : "Current account unhidden",
                            type: Toasts.Type.SUCCESS,
                        });
                    });
                }
                return;
            }
        };
        document.addEventListener("keydown", keydownHandler);
    },

    stop() {
        removeHeaderBarButton(this._buttonName);
        if (this._fluxUnsub) { this._fluxUnsub(); this._fluxUnsub = null; }
        if (keydownHandler) { document.removeEventListener("keydown", keydownHandler); keydownHandler = null; }
        qsoRef?.();
        modalRef = null;
        document.getElementById(QSO_ROOT_ID)?.remove();
    },
});
