export async function fetchLyrics(queryString: string): Promise<string | null> {
    try {
        const url = `https://lrclib.net/api/get?${queryString}`;
        const res = await fetch(url, { headers: { "user-agent": "DiscordLyricsSpotifyStatus/1.0" } });
        if (res.status === 404) return null;
        if (!res.ok) return null;
        return await res.text();
    } catch { return null; }
}
