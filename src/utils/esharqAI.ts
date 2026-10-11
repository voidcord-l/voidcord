/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface AIChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export const GROQ_MODEL_OPTIONS = [
    { label: "Llama 3.3 70B Versatile", value: "llama-3.3-70b-versatile", default: true },
    { label: "Llama 3.1 8B Instant", value: "llama-3.1-8b-instant" },
    { label: "Gemma2 9B", value: "gemma2-9b-it" },
] as const;

export async function esharqChat(opts: {
    apiKey: string;
    model: string;
    messages: AIChatMessage[];
    temperature?: number;
    maxTokens?: number;
}): Promise<string> {
    if (!opts.apiKey) throw new Error("Missing Groq API key. Add one in the plugin settings (console.groq.com/keys).");

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${opts.apiKey}`
        },
        body: JSON.stringify({
            model: opts.model,
            messages: opts.messages,
            temperature: opts.temperature,
            max_tokens: opts.maxTokens
        })
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Groq API error ${res.status}: ${text || res.statusText}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Groq API returned an unexpected response.");
    return content;
}
