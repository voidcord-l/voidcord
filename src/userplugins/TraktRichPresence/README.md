# Trakt Rich Presence (Vencord Userplugin)

This userplugin connects your Trakt account to Discord through Vencord, showing what you're currently watching as a Rich Presence activity (movie or TV episode title, season/episode, and artwork via TMDB).

## Why this exists

Stremio does not provide a native Discord Rich Presence client on Linux. This plugin works around that limitation by polling your Trakt activity (which Stremio and many other players can scrobble to) and then publishing it as a local presence to Discord through Vencord.

## Requirements

- Vencord with userplugins enabled
- A Trakt account: https://trakt.tv
- (Recommended) A Trakt API application for OAuth
- (Optional, but recommended for posters) A TMDB API key: https://www.themoviedb.org

## Basic configuration

1. **Enable the plugin**
   - Open Vencord settings → User Plugins → `TraktRichPresence`.

2. **Create a Trakt API application** (recommended for OAuth)
   - Go to https://trakt.tv/oauth/applications and create a new application.
   - Set **Redirect URI** to `urn:ietf:wg:oauth:2.0:oob` (exactly this string).
   - Copy the **Client ID** and **Client Secret**.

3. **Fill in Trakt settings**
   - `Trakt client ID`: paste the Client ID from the Trakt application.
   - `Trakt client secret`: paste the Client Secret (this is stored locally by the client; do not share it).
   - `Trakt username`: your Trakt username (not email).

4. **(Optional but recommended) Enable OAuth**
   - Toggle `Use OAuth to access your Trakt account`.
   - In the **Trakt OAuth** section:
     1. Click **Open Trakt auth page**.
     2. Authorize the application in your browser.
     3. Copy the code Trakt shows you.
     4. Paste it into the input field in settings.
     5. Click **Exchange code**.
   - The plugin will save your access and refresh tokens and automatically refresh them when needed.

5. **(Optional) Configure TMDB for artwork**
   - Create a free account at https://www.themoviedb.org and generate an API key.
   - Set `TMDB API key for posters` to your TMDB key.
   - When available, the plugin will use TMDB images in your activity (large and small images for movies/shows/episodes/seasons).

6. **History fallback (for players that only scrobble)**
   - Some players only send scrobbles, not live "/watching" updates, to Trakt.
   - Enable `If /watching is empty, use recent /sync/history scrobble as presence` if you want the plugin to treat your last scrobble as "currently watching".
   - Adjust `Maximum age (in minutes) of last scrobble to count as 'currently watching'` to control how long after a scrobble the presence should remain active.

7. **Polling interval**
   - `Polling interval in seconds` controls how often the plugin queries Trakt.
   - Lower values update presence more frequently but can cause more API traffic.

## How it works

- On start, the plugin optionally refreshes your OAuth token (if enabled and valid).
- It periodically calls Trakt's `/users/{username}/watching` endpoint.
- If nothing is currently watching and history fallback is enabled, it checks `/sync/history?limit=1` and, if the scrobble is recent enough, uses it as the currently watching item.
- It then:
  - Fetches additional artwork from TMDB (if a TMDB key is configured),
  - Constructs a Discord `WATCHING` rich presence (title, show/episode info, timestamps, images), and
  - Dispatches it locally via `LOCAL_ACTIVITY_UPDATE` so it appears as your Discord activity.

When the plugin is stopped or disabled, it clears the interval and sends a final `LOCAL_ACTIVITY_UPDATE` with `activity: null` to remove the custom presence.

## Privacy & safety

- Your Trakt Client Secret and OAuth tokens are stored locally by Vencord and are **never** sent anywhere except to Trakt's own API.
- Do **not** share screenshots or logs that contain your tokens.
- You can revoke access at any time from your Trakt account under *Settings → Your Apps*.
