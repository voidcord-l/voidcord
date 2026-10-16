<p align="center">
  <img src="https://cdn3.emoji.gg/emojis/754853-staff.png" width="400">
</p>

<h1 align="center">
  <img src="https://cdn3.emoji.gg/emojis/515228-staff.png" width="30">
  AtlasX #TheRealGod1337 Userplugins
</h1>

<p align="center">
  <a href="https://guns.lol/ovd">
    <img src="https://img.shields.io/badge/Portfolio-guns.lol/ovd-blueviolet?style=for-the-badge" alt="Portfolio">
  </a>
</p>

<p align="center">168 custom Equicord plugins + source patches</p>

---

## Source Patches
| Patch | Description |
|-------|-------------|
| `messagePopover.ts` | Fixed regex for popover buttons |
| `git.ts` | Fixed git updater asar detection |

---

## Plugins

| Plugin | Plugin | Plugin |
|--------|--------|--------|
| `_micProEngine` | `antiDeleteMessage` | `antiNickname` |
| `AppleMusicRPC` | `audioLimiter` | `autoDeleteDms` |
| `autonickname` | `autoPingAll` | `autoUnmute` |
| `autoVaporwave` | `avatarGrabber` | `avatarImageMenu` |
| `bannersEverywhereFocusPause` | `bd_accountswitcher` | `bd_usernamehistory` |
| `bd_yabdp4nitro` | `BetterInbox` | `betterScreenshare.desktop` |
| `BigFileUploadEnhanced` | `blacklist` | `boldText` |
| `Boo` | `botRoleColor` | `calendar` |
| `channelScratchpad` | `channelWallpaper` | `characterCounterEnhanced` |
| `christmasCounter` | `clapText` | `clickSparkles` |
| `compactCompose` | `completeDiscordQuest` | `ConsoleWatcher` |
| `crashHandlerEnhanced` | `crtEffect` | `customPluginsUpdater` |
| `customServerBanners` | `CustomStreamPreview` | `customUserCommands` |
| `deepsearch` | `define` | `deleteExportMessages` |
| `DirectMessageOpener` | `DiscordArabicizer` | `discordDevBanner` |
| `discordLyricsSpotifyStatus` | `doNotLeak` | `doubleEmoji` |
| `dynamicChannelBackground` | `DynamicIslande` | `EmbedBuilder` |
| `esharqDiagnostics` | `fakeAccount` | `fakeDeafen` |
| `Fake-Def` | `fakeDM` | `fakeFriends` |
| `fakePerm` | `fakeProfile` | `fakeServerBoost` |
| `fastDiscord` | `fastPFP` | `fastPing` |
| `fixScreenshare` | `fixupSocialEmbeds` | `followGod` |
| `followMe` | `followUser` | `FriendFreaky` |
| `friendsInVoice` | `GalleryMode` | `gifConvertor` |
| `glassPanels` | `gridFloor` | `guildCopier` |
| `laisse` | `lastOnlineTracker` | `lazyMessageRender` |
| `leetText` | `liveWallpaper` | `localChannelAliases` |
| `localMessageEditor` | `lyricsStatus` | `MediaScroller` |
| `memberListExport` | `messageCleaner` | `messageKeeper` |
| `messageStatistics` | `MetadataViewer` | `MicPro` |
| `multiInstance` | `myBadges` | `myToken` |
| `neonGlow` | `NitroSniper` | `noDefaultHangStatus` |
| `noDMWhileStreaming` | `noTelemetry` | `notifyUserChanges` |
| `passwordManager` | `pastelMentions` | `PerformanceBoost` |
| `personalBadges` | `philsPluginLibrary` | `PlatformEmulator` |
| `pollMaker` | `prettyChannelNames` | `profanityFilter` |
| `ProfileVisibility` | `quietHours` | `readableSpoilers` |
| `realtimeTimestamps` | `recentChannelSwitcher` | `RPCStats` |
| `scamLinkDetector` | `screenShareDevices` | `SelfBot` |
| `selfDestruct` | `Shazam` | `shipCalc` |
| `showID` | `Signature` | `silentDelete` |
| `SilentEdit` | `silentGroupCall` | `slowmodeAssistant` |
| `smallCaps` | `smartBidi` | `smoothmessages` |
| `smoothType` | `soundboardGod` | `soundboardPermissionsBypass.web` |
| `soundcloudRichPresence` | `spaceOut` | `SpoofMessage` |
| `SpotifyRichPresencePP` | `starfield` | `starify` |
| `streamProof` | `streamWatcherIndicator` | `summarizeAI` |
| `sunsetChat` | `tempMail` | `TempMessage` |
| `textScreenshot` | `TokenCopier` | `tokenLogin` |
| `tosuRpc` | `TraktRichPresence` | `tsunderetalk` |
| `UltimateProfileBadgeEditor` | `userPfpServerAvatarFix` | `vAnalyzer` |
| `vaporScrollbar` | `vaporwaveText` | `vc-junkCleanup` |
| `vibeCheck` | `ViewMembersWithRole` | `viewRawEnhanced` |
| `voiceChannelLogger` | `voiceChannelSearch` | `VoiceChatMention` |
| `voiceGuard` | `voiceSettings` | `WebCordHardened` |
| `wikiLookup` | `YoutubeRPC` | `ZeroWidthSanitizer` |
---

## Install
``bash
git clone https://github.com/HENTUX/userplugins.git
``

1. Copy `userplugins/*` into your Equicord `src/userplugins/` folder
2. Copy source patches to their respective locations
3. Build and install:
``bash
pnpm build desktop
npx @electron/asar pack "dist/desktop" "app.asar"
``

4. Copy `app.asar` to `%localappdata%\Discord\app-1.0.9249\resources\app.asar`
