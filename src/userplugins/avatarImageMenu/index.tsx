import { addContextMenuPatch, removeContextMenuPatch } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { copyToClipboard } from "@utils/clipboard";
import { Menu, IconUtils, GuildMemberStore } from "@webpack/common";
import { User } from "@vencord/discord-types";

const Engines = {
    Google: "https://lens.google.com/uploadbyurl?url=",
    Yandex: "https://yandex.com/images/search?rpt=imageview&url=",
    SauceNAO: "https://saucenao.com/search.php?url=",
    IQDB: "https://iqdb.org/?url=",
    Bing: "https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:",
    TinEye: "https://www.tineye.com/search?url=",
    ImgOps: "https://imgops.com/start?url="
} as const;

function searchImage(src: string, engine: string) {
    open(engine + encodeURIComponent(src), "_blank");
}

function userContextPatch(children: any[], props: { guildId?: string; user: User }) {
    if (!props?.user) return;
    const { user, guildId } = props;

    let avatarUrl: string | null = null;
    if (guildId) {
        const member = GuildMemberStore.getMember(guildId, user.id);
        const memberAvatar = member?.avatar;
        if (memberAvatar) {
            avatarUrl = IconUtils.getGuildMemberAvatarURLSimple({
                userId: user.id,
                avatar: memberAvatar,
                guildId,
                canAnimate: true
            });
        }
    }
    if (!avatarUrl) {
        avatarUrl = IconUtils.getUserAvatarURL(user, true);
    }

    const url = avatarUrl;

    children.push(
        <Menu.MenuGroup id="hentux-avatar-image-menu">
            <Menu.MenuItem
                id="hentux-copy-image-link"
                label="Copy Image Link"
                action={() => copyToClipboard(url)}
            />
            <Menu.MenuItem
                id="hentux-open-image-link"
                label="Open Image Link"
                action={() => window.open(url, "_blank")}
            />
            <Menu.MenuItem
                id="hentux-search-image"
                label="Search Image"
            >
                {Object.keys(Engines).map(engine => (
                    <Menu.MenuItem
                        key={`hasi-${engine}`}
                        id={`hasi-${engine}`}
                        label={engine}
                        action={() => searchImage(url, Engines[engine as keyof typeof Engines])}
                    />
                ))}
            </Menu.MenuItem>
        </Menu.MenuGroup>
    );
}

function imageContextPatch(children: any[], props: { src?: string }) {
    if (!props?.src) return;
    const url = props.src;

    children.push(
        <Menu.MenuGroup id="hentux-image-search">
            <Menu.MenuItem
                id="hentux-copy-image-link"
                label="Copy Image Link"
                action={() => copyToClipboard(url)}
            />
            <Menu.MenuItem
                id="hentux-open-image-link"
                label="Open Image Link"
                action={() => window.open(url, "_blank")}
            />
            <Menu.MenuItem
                id="hentux-search-image"
                label="Search Image"
            >
                {Object.keys(Engines).map(engine => (
                    <Menu.MenuItem
                        key={`hasi-${engine}`}
                        id={`hasi-${engine}`}
                        label={engine}
                        action={() => searchImage(url, Engines[engine as keyof typeof Engines])}
                    />
                ))}
            </Menu.MenuItem>
        </Menu.MenuGroup>
    );
}

export default definePlugin({
    name: "AvatarImageMenu",
    authors: [{ name: "HENTUX", id: 1389444830882562131n }],
    description: "Adds Copy Link, Open Link, and Search Image to user and image context menus.",
    tags: ["avatar", "image", "context-menu"],

    start() {
        addContextMenuPatch("user-context", userContextPatch);
        addContextMenuPatch("image-context", imageContextPatch);
    },

    stop() {
        removeContextMenuPatch("user-context", userContextPatch);
        removeContextMenuPatch("image-context", imageContextPatch);
    }
});
