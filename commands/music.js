const axios = require('axios');
const yts = require('yt-search');

const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
};

/* =========================
   SAFE REQUEST WITH RETRY
========================= */
async function tryRequest(getter, attempts = 3) {
    let lastError;
    for (let i = 1; i <= attempts; i++) {
        try {
            return await getter();
        } catch (err) {
            lastError = err;
            if (i < attempts) {
                await new Promise(r => setTimeout(r, i * 1000));
            }
        }
    }
    throw lastError;
}

/* =========================
   KEITH AUDIO DOWNLOADER
   (ALL RESPONSE TYPES)
========================= */
function extractAudioUrl(data) {
    if (!data) return null;
    const result = data.result || data.data || data;
    if (typeof result === 'string' && result.startsWith('http')) return result;
    return result?.url || result?.download || result?.downloadUrl || result?.link ||
           result?.audio || result?.audio_url || data?.download || data?.url || null;
}

async function getKeithDownload(youtubeUrl) {
    const apis = [
        `https://apiskeith.top/download/audio?url=${encodeURIComponent(youtubeUrl)}`,
        `https://apis.xcasper.space/api/ytmp3?url=${encodeURIComponent(youtubeUrl)}`,
        `https://apis.xcasper.space/api/yt-dl?url=${encodeURIComponent(youtubeUrl)}`,
        `https://apis.xcasper.space/api/yt-dl2?url=${encodeURIComponent(youtubeUrl)}`,
    ];

    let lastError;
    for (const apiUrl of apis) {
        try {
            const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
            if (!res?.data) continue;

            const data = res.data;
            const result = data.result || data.data || data;
            const downloadUrl = extractAudioUrl(data);

            if (downloadUrl) {
                return {
                    download: downloadUrl,
                    title: result?.title || data?.title || 'YouTube Audio',
                    thumbnail: result?.thumbnail || data?.thumbnail || 'https://img.youtube.com/vi/default/hqdefault.jpg',
                    duration: result?.duration || data?.duration || '0:00'
                };
            }
        } catch (err) {
            lastError = err;
            continue;
        }
    }

    throw lastError || new Error('All audio APIs failed');
}

/* =========================
   SONG COMMAND
========================= */
async function songCommand(sock, chatId, message) {
    try {
        const text =
            message.message?.conversation ||
            message.message?.extendedTextMessage?.text ||
            '';

        if (!text) {
            return sock.sendMessage(
                chatId,
                { text: 'Usage: .song <song name or YouTube link>' },
                { quoted: message }
            );
        }

        let video;

        // If user pasted YouTube link
        if (text.includes('youtube.com') || text.includes('youtu.be')) {
            const search = await yts(text);
            video = search?.videos?.[0] || {
                url: text,
                title: 'YouTube Audio',
                thumbnail: 'https://img.youtube.com/vi/default/hqdefault.jpg',
                timestamp: '0:00'
            };
        } else {
            // Search by name
            const search = await yts(text);
            if (!search?.videos?.length) {
                return sock.sendMessage(
                    chatId,
                    { text: '❌ No results found.' },
                    { quoted: message }
                );
            }
            video = search.videos[0];
        }

        // Send downloading message
        await sock.sendMessage(
            chatId,
            {
                text: `🎵 *Downloading Audio...*\n\n*Title:* ${video.title}\n*Duration:* ${video.timestamp || '0:00'}`
            },
            { quoted: message }
        );

        // Get download link from Keith API
        const audio = await getKeithDownload(video.url);

        if (!audio?.download) {
            throw new Error('Download URL not found');
        }

        // SEND AUDIO (FIXED)
        await sock.sendMessage(
    chatId,
    {
        document: { url: audio.download },
        mimetype: "audio/mpeg",
        fileName: `${video.title.substring(0, 100)}.mp3`,
        contextInfo: {
            externalAdReply: {
                title: video.title,
                body: 'YouTube Audio Download',
                mediaType: 2,
                thumbnailUrl: video.thumbnail,
                mediaUrl: video.url,
                sourceUrl: video.url,
                showAdAttribution: true
            }
        }
    },
    { quoted: message }
);
    } catch (err) {
        console.error('Song command error:', err);
        await sock.sendMessage(
            chatId,
            { text: `❌ Failed to download song:\n${err.message}` },
            { quoted: message }
        );
    }

}

module.exports = songCommand;
