/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { BadgePosition, ProfileBadge } from "@api/Badges";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { Margins } from "@utils/margins";
import definePlugin, { OptionType } from "@utils/types";
import { RenderModalProps, User } from "@vencord/discord-types";
import { Button, Forms, Menu, Modal, openModal, UserStore } from "@webpack/common";

interface BadgeDef {
    id: string;
    name: string;
    icon: string;
    link: string;
}

const icon = (hash: string) => `https://cdn.discordapp.com/badge-icons/${hash}.png`;

const BADGES: BadgeDef[] = [
    { id: "discord-staff", name: "Discord Staff", icon: icon("5e74e9b61934fc1f67c65515d1f7e60d"), link: "https://discord.com/company" },
    { id: "partnered-server-owner", name: "Partnered Server Owner", icon: icon("3f9748e53446a137a052f3454e2de41e"), link: "https://discord.com/partners" },
    { id: "moderator-programs-alumni", name: "Moderator Programs Alumni", icon: icon("fee1624003e2fee35cb398e125dc479b"), link: "https://support.discord.com/hc/en-us/articles/360035962891" },
    { id: "early-supporter", name: "Early Supporter", icon: icon("7060786766c9c840eb3019e725d2b358"), link: "https://discord.com/settings/premium" },
    { id: "active-developer", name: "Active Developer", icon: icon("6bdc42827a38498929a4920da12695d9"), link: "https://discord.com/developers/active-developer" },
    { id: "early-verified-bot-developer", name: "Early Verified Bot Developer", icon: icon("6df5892e0f35b051f8b61eace34f4967"), link: "https://support.discord.com/hc/en-us/articles/360035962891" },
    { id: "bug-hunter", name: "Discord Bug Hunter", icon: icon("2717692c7dca7289b35297368a940dd0"), link: "https://support.discord.com/hc/en-us/articles/360035962891" },
    { id: "golden-bug-hunter", name: "Discord Golden Bug Hunter", icon: icon("848f79194d4be5ff5f81505cbd0ce1e6"), link: "https://support.discord.com/hc/en-us/articles/360035962891" },
    { id: "hypesquad-events", name: "HypeSquad Events", icon: icon("bf01d1073931f921909045f3a39fd264"), link: "https://discord.com/settings/hypesquad-online" },
    { id: "hypesquad-bravery", name: "HypeSquad Bravery", icon: icon("8a88d63823d8a71cd5e390baa45efa02"), link: "https://discord.com/settings/hypesquad-online" },
    { id: "hypesquad-brilliance", name: "HypeSquad Brilliance", icon: icon("011940fd013da3f7fb926e4a1cd2e618"), link: "https://discord.com/settings/hypesquad-online" },
    { id: "hypesquad-balance", name: "HypeSquad Balance", icon: icon("3aa41de486fa12454c3761e8e223442e"), link: "https://discord.com/settings/hypesquad-online" },
    { id: "discord-quests", name: "Discord Quests", icon: icon("7d9ae358c8c5e118768335dbe68b4fb8"), link: "https://discord.com/discovery/quests" },
    { id: "legacy-username", name: "Legacy Username", icon: icon("6de6d34650760ba5551a79732e98ed60"), link: "https://support.discord.com/hc/en-us/articles/12620128861463" },
    { id: "orbs", name: "Orbs", icon: icon("83d8a1eb09a8d64e59233eec5d4d5c2d"), link: "https://support.discord.com/hc/en-us/articles/30593690165783" },
    { id: "a-clown", name: "A Clown, For a Limited Time", icon: "https://discord.com/assets/971cfe4aa5c0582000ea.svg", link: "https://www.youtube.com/watch?v=cc2-4ci4G84" },
    { id: "supports-commands", name: "Supports Commands", icon: icon("6f9e37f9029ff57aef81db857890005e"), link: "https://support-dev.discord.com/hc/en-us/articles/7612640996503" },
    { id: "premium-app", name: "Premium App", icon: icon("d2010c413a8da2208b7e4f35bd8cd4ac"), link: "https://support-dev.discord.com/hc/en-us/articles/17709085688727" },
    { id: "uses-automod", name: "Uses AutoMod", icon: icon("f2459b691ac7453ed6039bbcfaccbfcd"), link: "https://support-dev.discord.com/hc/en-us/articles/13847462843543" },
    { id: "nitro", name: "Discord Nitro", icon: icon("2ba85e8026a8614b640c2837bcdfe21b"), link: "https://discord.com/settings/premium" },
    { id: "nitro-bronze", name: "Discord Nitro Bronze", icon: icon("4f33c4a9c64ce221936bd256c356f91f"), link: "https://discord.com/settings/premium" },
    { id: "nitro-silver", name: "Discord Nitro Silver", icon: icon("4514fab914bdbfb4ad2fa23df76121a6"), link: "https://discord.com/settings/premium" },
    { id: "nitro-gold", name: "Discord Nitro Gold", icon: icon("2895086c18d5531d499862e41d1155a6"), link: "https://discord.com/settings/premium" },
    { id: "nitro-platinum", name: "Discord Nitro Platinum", icon: icon("0334688279c8359120922938dcb1d6f8"), link: "https://discord.com/settings/premium" },
    { id: "nitro-diamond", name: "Discord Nitro Diamond", icon: icon("0d61871f72bb9a33a7ae568c1fb4f20a"), link: "https://discord.com/settings/premium" },
    { id: "nitro-emerald", name: "Discord Nitro Emerald", icon: icon("11e2d339068b55d3a506cff34d3780f3"), link: "https://discord.com/settings/premium" },
    { id: "nitro-ruby", name: "Discord Nitro Ruby", icon: icon("cd5e2cfd9d7f27a8cdcd3e8a8d5dc9f4"), link: "https://discord.com/settings/premium" },
    { id: "nitro-opal", name: "Discord Nitro Opal", icon: icon("5b154df19c53dce2af92c9b61e6be5e2"), link: "https://discord.com/settings/premium" },
    { id: "booster-1mo", name: "Server Booster (1 Month)", icon: icon("51040c70d4f20a921ad6674ff86fc95c"), link: "https://discord.com/settings/premium" },
    { id: "booster-2mo", name: "Server Booster (2 Months)", icon: icon("0e4080d1d333bc7ad29ef6528b6f2fb7"), link: "https://discord.com/settings/premium" },
    { id: "booster-3mo", name: "Server Booster (3 Months)", icon: icon("72bed924410c304dbe3d00a6e593ff59"), link: "https://discord.com/settings/premium" },
    { id: "booster-6mo", name: "Server Booster (6 Months)", icon: icon("df199d2050d3ed4ebf84d64ae83989f8"), link: "https://discord.com/settings/premium" },
    { id: "booster-9mo", name: "Server Booster (9 Months)", icon: icon("996b3e870e8a22ce519b3a50e6bdd52f"), link: "https://discord.com/settings/premium" },
    { id: "booster-12mo", name: "Server Booster (12 Months)", icon: icon("991c9f39ee33d7537d9f408c3e53141e"), link: "https://discord.com/settings/premium" },
    { id: "booster-15mo", name: "Server Booster (15 Months)", icon: icon("cb3ae83c15e970e8f3d410bc62cb8b99"), link: "https://discord.com/settings/premium" },
    { id: "booster-18mo", name: "Server Booster (18 Months)", icon: icon("7142225d31238f6387d9f09efaa02759"), link: "https://discord.com/settings/premium" },
    { id: "booster-24mo", name: "Server Booster (24 Months)", icon: icon("ec92202290b48d0879b7413d2dde3bab"), link: "https://discord.com/settings/premium" }
];

const ENABLED_KEY: Array<"enabledBadges"> = ["enabledBadges"];

const settings = definePluginSettings({
    enabledBadges: {
        type: OptionType.CUSTOM,
        description: "Badges currently shown on your profile.",
        default: [] as string[]
    },
    openEditor: {
        type: OptionType.COMPONENT,
        description: "Open the badge editor.",
        component: () => (
            <Button onClick={openBadgeEditor}>
                Open Badge Editor
            </Button>
        )
    }
});

function isCurrentUser(userId: string) {
    return userId === UserStore.getCurrentUser()?.id;
}

function openBadgeEditor() {
    openModal(props => <BadgeEditorModal rootProps={props} />);
}

const BadgeEditorModal = ErrorBoundary.wrap(({ rootProps }: { rootProps: RenderModalProps; }) => {
    const { enabledBadges } = settings.use(ENABLED_KEY);
    const enabled = new Set<string>(enabledBadges);

    function toggle(id: string, on: boolean) {
        const next = new Set(enabled);
        if (on) next.add(id);
        else next.delete(id);
        settings.store.enabledBadges = [...next];
    }

    const shown = BADGES.filter(b => enabled.has(b.id));

    return (
        <Modal
            {...rootProps}
            size="md"
            title="Edit Badges"
            actions={[{ text: "Done", variant: "primary", onClick: rootProps.onClose }]}
        >
            <Heading className={Margins.bottom8}>Preview</Heading>
            <div className="vc-upbe-preview">
                {shown.length
                    ? shown.map(b => (
                        <img key={b.id} className="vc-upbe-preview-icon" src={b.icon} alt={b.name} title={b.name} />
                    ))
                    : <span className="vc-upbe-preview-empty">No badges selected.</span>}
            </div>

            <Forms.FormText className={Margins.top8}>
                Reopen your profile (close and open it again) to apply changes.
            </Forms.FormText>

            <Heading className={Margins.top16}>Available Badges</Heading>
            <div className="vc-upbe-list">
                {BADGES.map(b => (
                    <FormSwitch
                        key={b.id}
                        value={enabled.has(b.id)}
                        onChange={v => toggle(b.id, v)}
                        title={
                            <span className="vc-upbe-title">
                                <img className="vc-upbe-icon" src={b.icon} alt="" />
                                {b.name}
                            </span>
                        }
                    />
                ))}
            </div>
        </Modal>
    );
}, { noop: true });

const EditIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2 4 5.5v5.4c0 4.6 3.2 8.9 8 10.1 4.8-1.2 8-5.5 8-10.1V5.5L12 2Zm-1.2 13.4-3.3-3.3 1.4-1.4 1.9 1.9 4.6-4.6 1.4 1.4-6 6Z" />
    </svg>
);

const userContextPatch: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user || !isCurrentUser(user.id)) return;

    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuItem
            id="vc-upbe-edit-badges"
            label="Edit Badges"
            icon={EditIcon}
            action={openBadgeEditor}
        />
    );
};

const profileBadge: ProfileBadge = {
    id: "vc-ultimate-profile-badge-editor",
    position: BadgePosition.START,
    shouldShow: ({ userId }) => isCurrentUser(userId),
    getBadges: () => {
        const enabled = new Set<string>(settings.store.enabledBadges);
        return BADGES.filter(b => enabled.has(b.id)).map(b => ({
            id: b.id,
            description: b.name,
            iconSrc: b.icon,
            link: b.link
        }));
    }
};

export default definePlugin({
    name: "UltimateProfileBadgeEditor",
    description: "Add and remove visual profile badges on your own account, client-side only. Other users never see them.",
    authors: [{ name: "overocai", id: 1288832011452153910n }],
    dependencies: ["BadgeAPI"],
    settings,
    searchTerms: ["badge", "badges", "profile", "client side", "fake badge"],

    settingsAboutComponent: () => (
        <Forms.FormText>
            These badges are purely visual and only appear in your own client. They do not change your account or get sent to Discord, so nobody else can see them.
        </Forms.FormText>
    ),

    contextMenus: {
        "user-context": userContextPatch
    },

    userProfileBadges: [profileBadge]
});
