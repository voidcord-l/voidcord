/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addContextMenuPatch, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { t } from "@utils/esharqI18n";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/esharqModals";
import definePlugin from "@utils/types";
import { RelationshipType } from "@vencord/discord-types/enums";
import { filters, find } from "@webpack";
import { FluxDispatcher, GuildMemberStore, Menu, React, RelationshipStore, Toasts, UserStore, UserUtils } from "@webpack/common";
import { Logger } from "@utils/Logger";

const logger = new Logger("FakeFriends");

// In-memory only ΓÇö fake state resets on restart (nothing is ever sent to Discord's servers).
const fakeState = new Map<string, "pending" | "accepted">();

function toast(message: string, type = Toasts.Type.MESSAGE) {
    Toasts.show({ message, type, id: Toasts.genId() });
}

// ΓöÇΓöÇ Patch RelationshipStore (local reads only) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
let origGetRelType: Function | null = null;
let origIsFriend: Function | null = null;
let origGetFriendIDs: Function | null = null;
let origGetMutable: Function | null = null;

function patchStore() {
    const store = RelationshipStore as any;
    if (!origGetRelType && typeof store.getRelationshipType === "function") {
        origGetRelType = store.getRelationshipType;
        store.getRelationshipType = function (userId: string) {
            const s = fakeState.get(userId);
            if (s === "accepted") return RelationshipType.FRIEND;
            if (s === "pending") return RelationshipType.INCOMING_REQUEST;
            return origGetRelType!.call(this, userId);
        };
    }
    if (!origIsFriend && typeof store.isFriend === "function") {
        origIsFriend = store.isFriend;
        store.isFriend = function (userId: string) {
            if (fakeState.get(userId) === "accepted") return true;
            return origIsFriend!.call(this, userId);
        };
    }
    if (!origGetFriendIDs && typeof store.getFriendIDs === "function") {
        origGetFriendIDs = store.getFriendIDs;
        store.getFriendIDs = function () {
            const real: string[] = origGetFriendIDs!.call(this);
            const extra = [...fakeState.entries()].filter(([, s]) => s === "accepted").map(([id]) => id);
            return [...new Set([...real, ...extra])];
        };
    }
    if (!origGetMutable && typeof store.getMutableRelationships === "function") {
        origGetMutable = store.getMutableRelationships;
        store.getMutableRelationships = function () {
            const real = origGetMutable!.call(this);
            for (const [id, s] of fakeState) {
                if (s === "accepted") real.set(id, RelationshipType.FRIEND);
                if (s === "pending") real.set(id, RelationshipType.INCOMING_REQUEST);
            }
            return real;
        };
    }
}

function unpatchStore() {
    const store = RelationshipStore as any;
    if (origGetRelType) { store.getRelationshipType = origGetRelType; origGetRelType = null; }
    if (origIsFriend) { store.isFriend = origIsFriend; origIsFriend = null; }
    if (origGetFriendIDs) { store.getFriendIDs = origGetFriendIDs; origGetFriendIDs = null; }
    if (origGetMutable) { store.getMutableRelationships = origGetMutable; origGetMutable = null; }
}

// ΓöÇΓöÇ Patch acceptFriend (accepting a fake request stays local) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
let origAccept: Function | null = null;

function patchAcceptFriend() {
    try {
        const RA = find(filters.byProps("acceptFriend", "addFriend")) as any;
        if (!RA || origAccept) return;
        origAccept = RA.acceptFriend;
        RA.acceptFriend = async function (userId: string, ...args: any[]) {
            if (fakeState.get(userId) === "pending") {
                fakeState.set(userId, "accepted");
                FluxDispatcher.dispatch({
                    type: "RELATIONSHIP_UPDATE",
                    relationship: { id: userId, type: RelationshipType.FRIEND, nickname: null, since: new Date().toISOString() }
                });
                return;
            }
            return origAccept!.call(this, userId, ...args);
        };
    } catch (e) { console.warn("[FakeFriends] patchAcceptFriend:", e); }
}

function unpatchAcceptFriend() {
    try {
        if (!origAccept) return;
        const RA = find(filters.byProps("acceptFriend", "addFriend")) as any;
        if (RA) RA.acceptFriend = origAccept;
        origAccept = null;
    } catch (err) { logger.debug("Ignored error", err); }
}

// ΓöÇΓöÇ Helpers ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function isBot(user: any): boolean {
    if (!user) return true;
    if (user.bot === true) return true;
    if ((user.publicFlags ?? 0) & (1 << 19)) return true;
    return false;
}

function makeUserPayload(user: any) {
    return {
        id: user.id,
        username: user.username,
        global_name: user.globalName ?? user.username,
        avatar: user.avatar ?? null,
        discriminator: user.discriminator ?? "0",
        public_flags: user.publicFlags ?? 0,
        flags: user.flags ?? 0,
        bot: isBot(user),
    };
}

function dispatchRelationship(user: any, type: RelationshipType) {
    FluxDispatcher.dispatch({
        type: "RELATIONSHIP_UPDATE",
        relationship: { id: user.id, type, nickname: null, since: new Date().toISOString(), user: makeUserPayload(user) }
    });
}

async function addDirectFriend(user: any) {
    fakeState.set(user.id, "accepted");
    dispatchRelationship(user, RelationshipType.FRIEND);
}

async function addPendingRequest(user: any) {
    fakeState.set(user.id, "pending");
    FluxDispatcher.dispatch({
        type: "RELATIONSHIP_ADD",
        relationship: {
            id: user.id,
            type: RelationshipType.INCOMING_REQUEST,
            nickname: null,
            since: new Date().toISOString(),
            user: makeUserPayload(user),
        },
        incoming: true,
    });
}

async function loadUser(userId: string): Promise<any | null> {
    try { await UserUtils.getUser(userId); } catch (err) { logger.debug("Ignored error", err); }
    return UserStore.getUser(userId) ?? null;
}

async function doFakeFriend(userId: string) {
    const user = await loadUser(userId);
    if (!user || isBot(user)) return;
    await addDirectFriend(user);
}

async function doFakeFriendRequest(userId: string) {
    const user = await loadUser(userId);
    if (!user || isBot(user)) return;
    await addPendingRequest(user);
}

async function removeFake(userId: string) {
    fakeState.delete(userId);
    try { FluxDispatcher.dispatch({ type: "RELATIONSHIP_REMOVE", relationship: { id: userId } }); } catch (err) { logger.debug("Ignored error", err); }
}

// ΓöÇΓöÇ Count modal ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function askCount(title: string, max: number): Promise<number | null> {
    return new Promise(resolve => {
        const resolveRef = { current: resolve, done: false };

        function CountModal({ modalProps }: { modalProps: any; }) {
            const [value, setValue] = React.useState(String(Math.min(10, max)));
            const parsed = parseInt(value, 10);
            const valid = !isNaN(parsed) && parsed > 0 && parsed <= max;

            function confirm() {
                if (!valid || resolveRef.done) return;
                resolveRef.done = true;
                modalProps.onClose();
                resolveRef.current(parsed);
            }
            function cancel() {
                if (!resolveRef.done) { resolveRef.done = true; resolveRef.current(null); }
                modalProps.onClose();
            }

            return (
                <ModalRoot {...modalProps} size="small">
                    <ModalHeader>
                        <ModalCloseButton onClick={cancel} />
                        <h2 style={{ flex: 1, fontSize: 16, fontWeight: 700, color: "var(--white-500)" }}>{title}</h2>
                    </ModalHeader>
                    <ModalContent style={{ padding: "16px 20px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: ".04em" }}>
                                {t(`╪º┘ä╪╣╪»╪» (╪º┘ä╪¡╪» ╪º┘ä╪ú┘é╪╡┘ë ${max})`, `Number (max ${max})`)}
                            </label>
                            <input
                                autoFocus
                                type="number"
                                min={1}
                                max={max}
                                value={value}
                                onChange={e => setValue(e.currentTarget.value)}
                                onKeyDown={e => { if (e.key === "Enter") confirm(); }}
                                style={{ background: "var(--background-secondary)", border: "1px solid var(--background-modifier-accent)", borderRadius: 4, color: "#fff", fontSize: 16, padding: "8px 12px", width: "100%", outline: "none" }}
                            />
                        </div>
                    </ModalContent>
                    <ModalFooter>
                        <button onClick={confirm} disabled={!valid}
                            style={{ background: valid ? "var(--brand-experiment)" : "var(--button-secondary-background)", border: "none", borderRadius: 4, color: "var(--white-500)", cursor: valid ? "pointer" : "not-allowed", fontSize: 14, fontWeight: 500, padding: "8px 20px" }}>
                            {t("╪¬╪ú┘â┘è╪»", "Confirm")}
                        </button>
                        <button onClick={cancel}
                            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14, padding: "8px 16px" }}>
                            {t("╪Ñ┘ä╪║╪º╪í", "Cancel")}
                        </button>
                    </ModalFooter>
                </ModalRoot>
            );
        }

        openModal(modalProps => <CountModal modalProps={modalProps} />);
    });
}

// ΓöÇΓöÇ Guild candidates (already-cached members only ΓÇö no scraping) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function getGuildCandidates(guildId: string): string[] {
    const me = UserStore.getCurrentUser()?.id;
    const memberIds: string[] = (GuildMemberStore.getMemberIds(guildId) as string[]) ?? [];
    const realRelNone = (id: string) => {
        const fn = origGetRelType ?? ((uid: string) => (RelationshipStore as any).getRelationshipType(uid));
        return fn.call(RelationshipStore, id) === RelationshipType.NONE;
    };
    return memberIds.filter(id => {
        if (id === me || !realRelNone(id)) return false;
        const cached = UserStore.getUser(id) as any;
        if (cached && isBot(cached)) return false;
        return true;
    });
}

async function floodGuild(guildId: string) {
    // Uses only members Discord has already cached (from scrolling the member list) ΓÇö we never
    // enumerate the guild ourselves, so no member-scraping traffic reaches Discord.
    const candidates = getGuildCandidates(guildId);
    if (!candidates.length) {
        toast(t("┘ä╪º ┘à╪▒╪┤┘æ╪¡┘è┘å ┘à╪¬╪º╪¡┘è┘å (┘à╪▒┘æ╪▒ ┘é╪º╪ª┘à╪⌐ ╪º┘ä╪ú╪╣╪╢╪º╪í ╪ú┘ê┘ä╪º┘ï ┘ä╪¬╪¡┘à┘è┘ä┘ç┘à)", "No candidates available (scroll the member list first to load them)"), Toasts.Type.FAILURE);
        return;
    }

    const count = await askCount(t("┘â┘à ╪╣╪»╪» ╪╖┘ä╪¿╪º╪¬ ╪º┘ä╪╡╪»╪º┘é╪⌐ ╪º┘ä┘ê┘ç┘à┘è╪⌐╪ƒ", "How many fake friend requests to send?"), candidates.length);
    if (!count) return;

    const selected = [...candidates].sort(() => Math.random() - 0.5).slice(0, count);
    const BATCH = 10;
    let sent = 0;
    for (let i = 0; i < selected.length; i += BATCH) {
        const users = await Promise.all(selected.slice(i, i + BATCH).map(id => loadUser(id)));
        for (const user of users) {
            if (!user || isBot(user)) continue;
            await addPendingRequest(user);
            sent++;
        }
        await new Promise(r => setTimeout(r, 60));
    }
    toast(t(`╪¬┘à ╪Ñ┘å╪┤╪º╪í ${sent} ╪╖┘ä╪¿ ╪╡╪»╪º┘é╪⌐ ┘ê┘ç┘à┘è!`, `${sent} fake friend request${sent > 1 ? "s" : ""} created!`), sent > 0 ? Toasts.Type.SUCCESS : Toasts.Type.FAILURE);
}

async function removeFakeFriendsForGuild(guildId: string) {
    const memberIds = new Set<string>(GuildMemberStore.getMemberIds(guildId) as string[]);
    const toRemove = [...fakeState.keys()].filter(id => memberIds.has(id));
    if (!toRemove.length) {
        toast(t("┘ä╪º ╪╖┘ä╪¿╪º╪¬ ┘ê┘ç┘à┘è╪⌐ ┘ä╪Ñ╪▓╪º┘ä╪¬┘ç╪º ┘à┘å ┘ç╪░╪º ╪º┘ä╪«╪º╪»┘à", "No fake requests to remove for this server"));
        return;
    }
    for (const id of toRemove) await removeFake(id);
    toast(t(`╪¬┘à┘æ╪¬ ╪Ñ╪▓╪º┘ä╪⌐ ${toRemove.length} ╪╖┘ä╪¿ ┘ê┘ç┘à┘è!`, `${toRemove.length} fake request${toRemove.length > 1 ? "s" : ""} removed!`), Toasts.Type.SUCCESS);
}

// ΓöÇΓöÇ Context menus ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
const userContextPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!children || !Array.isArray(children)) return;
    try {
        const userId = props?.user?.id ?? props?.userId;
        if (!userId || userId === UserStore.getCurrentUser()?.id) return;

        const state = fakeState.get(userId);
        const realRel = origGetRelType
            ? origGetRelType.call(RelationshipStore, userId)
            : (RelationshipStore as any).getRelationshipType(userId);

        if (!state && realRel !== RelationshipType.NONE) return;

        const followIndex = children.findIndex((c: any) => c?.props?.id === "follow-user" || c?.key === "follow-user");

        let items: React.ReactElement[] = [];
        if (!state) {
            items = [
                <Menu.MenuItem key="ff-friend" id="ff-friend" label={t("╪╡╪»┘è┘é ┘ê┘ç┘à┘è", "Fake Friend")} action={() => doFakeFriend(userId)} />,
                <Menu.MenuItem key="ff-request" id="ff-request" label={t("╪╖┘ä╪¿ ╪╡╪»╪º┘é╪⌐ ┘ê┘ç┘à┘è", "Fake Friend Request")} action={() => doFakeFriendRequest(userId)} />,
            ];
        } else if (state === "pending") {
            items = [
                <Menu.MenuItem key="ff-cancel" id="ff-cancel" label={t("╪Ñ┘ä╪║╪º╪í ╪º┘ä╪╖┘ä╪¿ ╪º┘ä┘ê┘ç┘à┘è", "Cancel fake request")} color="danger" action={() => removeFake(userId)} />
            ];
        } else {
            items = [
                <Menu.MenuItem key="ff-remove" id="ff-remove" label={t("╪Ñ╪▓╪º┘ä╪⌐ ┘à┘å ╪º┘ä╪ú╪╡╪»┘é╪º╪í ╪º┘ä┘ê┘ç┘à┘è┘è┘å", "Remove from fake friends")} color="danger" action={() => removeFake(userId)} />
            ];
        }

        const group = <Menu.MenuGroup key="ff-group" label={t("╪ú╪╡╪»┘é╪º╪í ┘ê┘ç┘à┘è┘ê┘å", "Fake Friends")}>{items}</Menu.MenuGroup>;

        if (followIndex !== -1) children.splice(followIndex + 1, 0, group);
        else children.push(<Menu.MenuSeparator key="ff-sep" />, group);
    } catch (e) {
        console.error("[FakeFriends] Context menu patch error:", e);
    }
};

const guildContextPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!children || !Array.isArray(children)) return;
    try {
        const guildId = props?.guild?.id ?? props?.guildId;
        if (!guildId) return;

        const memberIds = new Set<string>(GuildMemberStore.getMemberIds(guildId) as string[]);
        const fakeCount = [...fakeState.keys()].filter(id => memberIds.has(id)).length;

        const items = [
            <Menu.MenuItem key="ff-g-flood" id="ff-g-flood" label={t("╪╖┘ä╪¿ ╪╡╪»╪º┘é╪⌐ ┘ê┘ç┘à┘è", "Fake Friend Request")} action={() => floodGuild(guildId)} />
        ];
        if (fakeCount > 0) {
            items.push(
                <Menu.MenuItem key="ff-g-remove" id="ff-g-remove"
                    label={t(`╪Ñ╪▓╪º┘ä╪⌐ ╪╖┘ä╪¿╪º╪¬ ╪º┘ä╪╡╪»╪º┘é╪⌐ ╪º┘ä┘ê┘ç┘à┘è╪⌐ (${fakeCount})`, `Remove fake friend requests (${fakeCount})`)}
                    color="danger" action={() => removeFakeFriendsForGuild(guildId)} />
            );
        }

        children.push(
            <Menu.MenuSeparator key="ff-g-sep" />,
            <Menu.MenuGroup key="ff-g-group" label={t("╪ú╪╡╪»┘é╪º╪í ┘ê┘ç┘à┘è┘ê┘å", "Fake Friends")}>{items}</Menu.MenuGroup>
        );
    } catch (e) {
        console.error("[FakeFriends] Guild context menu patch error:", e);
    }
};

// ΓöÇΓöÇ Plugin ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
export default definePlugin({
    name: "FakeFriends",
    description: "Locally simulate Discord friends and friend requests from the right-click menu. In-memory only (resets on restart); nothing is ever sent to Discord.",
    authors: [{ name: t("┘à╪ñ┘ä┘ü ╪║┘è╪▒ ┘à╪╣╪▒┘ê┘ü", "Unknown"), id: 0n }],
    dependencies: ["ContextMenuAPI"],

    start() {
        patchStore();
        patchAcceptFriend();
        addContextMenuPatch("user-context", userContextPatch);
        addContextMenuPatch("guild-context", guildContextPatch);
    },

    stop() {
        removeContextMenuPatch("user-context", userContextPatch);
        removeContextMenuPatch("guild-context", guildContextPatch);
        unpatchAcceptFriend();
        unpatchStore();
        fakeState.clear();
    },
});