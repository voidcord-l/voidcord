# 🎵 Shazam for Vencord

A [Vencord](https://vencord.dev) userplugin that identifies songs playing in your Discord voice channel — right from the chat bar.

Press the music note button while music is playing in your voice channel (music bot, someone's stream audio, etc.), it records a few seconds of the incoming audio and identifies the song using the [AudD](https://audd.io) music recognition API. The result pops up as a notification — click it to open the song link.

## Features

- 🎧 One-click song identification from the chat bar
- 🔴 Button turns red while listening
- 🔔 Result shown as a notification with artist, title, album and release date — click to open the song page
- ⚙️ Adjustable recording duration (5–15 seconds)

## Screenshots

Press the button while a music bot is playing — the plugin records the incoming voice audio:

![Listening notification](./listening.png)

A few seconds later the identified song pops up; click the notification to open it:

![Result notification](./result.png)

## Requirements

| Requirement | Why |
|---|---|
| [Vesktop](https://github.com/Vencord/Vesktop) (recommended) or Discord in the browser | The stock Discord desktop app processes voice audio in its native engine, so plugins cannot access it. Vesktop and browser Discord use in-page WebRTC, which this plugin can tap into. |
| Free [AudD api token](https://dashboard.audd.io) | AudD does the actual music recognition. The free tier is enough for casual use. |
| A [Vencord dev install](https://docs.vencord.dev/installing/) | Userplugins require building Vencord from source. |

## Installation

1. Set up a Vencord dev build if you don't have one — see the [official guide](https://docs.vencord.dev/installing/)
2. Clone this repo into your Vencord `src/userplugins` folder:

   ```sh
   git clone https://github.com/kadrxy/vencord-shazam src/userplugins/shazam
   ```

3. Build and inject:

   ```sh
   pnpm build
   ```

   (For Vesktop: point Vesktop's `Vencord Location` setting to your build's `dist` folder and restart.)

4. Enable **Shazam** in Vencord's plugin settings and paste your AudD api token

## Usage

1. Make sure the plugin is enabled **before** joining the voice channel (if you enable it while already connected, just rejoin)
2. Join a voice channel where music is playing
3. Click the music note button in the chat bar
4. Wait a few seconds — the result appears as a notification; click it to open the song

If recognition fails, increase the recording duration in the plugin settings or try again during a clearer part of the song.

## Settings

| Setting | Description | Default |
|---|---|---|
| Api token | Your AudD.io api token | — |
| Duration | Seconds of audio to record before identifying | 8 |

## How it works

- Hooks `RTCPeerConnection.prototype.setRemoteDescription` to keep track of Discord's voice connections
- On button press, collects the live incoming audio tracks from those connections, mixes them with an `AudioContext` and records them with `MediaRecorder` (webm/opus)
- Sends the recording to AudD from the Electron main process (Discord's CSP blocks the request from the renderer)

## Limitations

- ❌ Does not work on the stock Discord desktop client (native voice engine — audio is not reachable from JavaScript)
- ❌ In the browser, audio capture works but the api request cannot bypass CSP, so recognition needs Vesktop/desktop
- Your own microphone is not captured — only incoming audio from others in the channel

## Privacy

Nothing is recorded or sent anywhere until you press the button. When you do, a short recording of the voice channel's incoming audio is sent to AudD's servers for recognition and the result is returned to you. See [AudD's privacy policy](https://audd.io/privacy/).

## License

[GPL-3.0](./LICENSE), same as Vencord.
