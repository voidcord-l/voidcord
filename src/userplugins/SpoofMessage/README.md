# 🕵️ SpoofMessage

**SpoofMessage** is a [Vencord](https://github.com/Vencord/Vencord) plugin that adds a `/spoof` slash command to send messages using visually identical **Unicode homoglyphs** — useful for bypassing message filters, profanity censors, and keyword detectors on Discord servers.

## 💬 Example

You type:

<img width="400" height="100" alt="image" src="https://github.com/user-attachments/assets/15d6e84a-59ca-4a5f-acfc-ca64ae1f6e57" />


It sends:

<img width="450" height="100" alt="image" src="https://github.com/user-attachments/assets/f958d013-7e10-465b-9e01-200c90baca98" />

  
Indistinguishable, right? Well, not to the AutoMod or other bots filtering!

## 📦 Installation

1. Clone this repo or copy the plugin to your Vencord dev setup:

   ```bash
   git clone https://github.com/skidaim/SpoofMessage.git
   ```

2. Place the plugin in:

   ```
   src/userplugins/SpoofMessage/index.tsx
   ```

3. In the root of your Vencord setup, run:

   ```bash
   pnpm build
   pnpm inject
   ```

4. Reload Discord, enable the plugin in Vencord settings and use `/spoof`!

## In-depth tutorial on how to install custom plugins in the [VENCORD WEBSITE](https://docs.vencord.dev/installing/custom-plugins/)

