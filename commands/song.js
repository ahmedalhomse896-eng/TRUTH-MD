const axios = require('axios');
const yts = require('yt-search');

const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
};

const MEDIA_API = 'https://media.cypherxbot.space';

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

function extractUrl(data) {
    if (!data) return null;
    const result = data.result || data.data || data;
    if (typeof result === 'string' && result.startsWith('http')) return result;
    return result?.download || result?.url || result?.downloadUrl || result?.link ||
           result?.audio || result?.audio_url || data?.download || data?.url || null;
}

async function getAudioDownload(youtubeUrl) {
    try {
        const res = await axios.get(`${MEDIA_API}/download/youtube/audio?url=${encodeURIComponent(youtubeUrl)}`, AXIOS_DEFAULTS);
        if (res?.data?.success && res.data.result?.download_url) {
            return {
                download: res.data.result.download_url,
                title: res.data.result.title || 'YouTube Audio',
                thumbnail: res.data.result.thumbnail || '',
                duration: '0:00'
            };
        }
    } catch {}

    try {
        const princeRes = await axios.get(`https://api.princetechn.com/api/download/ytaudio?url=${encodeURIComponent(youtubeUrl)}&apikey=prince`, AXIOS_DEFAULTS);
        if (princeRes?.data?.success && princeRes.data.result?.download_url) {
            return {
                download: princeRes.data.result.download_url,
                title: princeRes.data.result.title || 'YouTube Audio',
                thumbnail: princeRes.data.result.thumbnail || '',
                duration: princeRes.data.result.duration || '0:00'
            };
        }
    } catch {}

    const apis = [
        `https://apiskeith.top/download/audio?url=${encodeURIComponent(youtubeUrl)}`,
        `https://apiskeith.top/download/ytmp3?url=${encodeURIComponent(youtubeUrl)}`,
        `https://apis.xcasper.space/api/ytmp3?url=${encodeURIComponent(youtubeUrl)}`,
    ];

    let lastError;
    for (const apiUrl of apis) {
        try {
            const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
            if (!res?.data) continue;

            const data = res.data;
            const result = data.result || data.data || data;
            const downloadUrl = extractUrl(data);

            if (downloadUrl) {
                return {
                    download: downloadUrl,
                    title: result?.title || data?.title || 'YouTube Audio',
                    thumbnail: result?.thumbnail || result?.thumb || data?.thumbnail || '',
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

        if (text.includes('youtube.com') || text.includes('youtu.be')) {
            const search = await yts(text);
            video = search?.videos?.[0] || {
                url: text,
                title: 'YouTube Audio',
                thumbnail: 'https://img.youtube.com/vi/default/hqdefault.jpg',
                timestamp: '0:00'
            };
        } else {
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

        await sock.sendMessage(
            chatId,
            {
                text: `🎵 *Downloading Audio...*\n\n*Title:* ${video.title}\n*Duration:* ${video.timestamp || '0:00'}`
            },
            { quoted: message }
        );

        const audio = await getAudioDownload(video.url);

        await sock.sendMessage(
            chatId,
            {
                audio: { url: audio.download },
                mimetype: 'audio/mpeg',
                ptt: false,
                contextInfo: {
                    externalAdReply: {
                        title: audio.title || video.title,
                        body: 'YouTube Audio Download',
                        mediaType: 2,
                        thumbnailUrl: audio.thumbnail || video.thumbnail,
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
