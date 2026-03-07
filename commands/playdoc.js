const axios = require('axios');
const yts = require('yt-search');

const MEDIA_API = 'https://media.cypherxbot.space';

async function playdocCommand(sock, chatId, message) {
    try {
        await sock.sendMessage(chatId, {
            react: { text: "🎵", key: message.key }
        });

        const q = message.message?.conversation ||
            message.message?.extendedTextMessage?.text ||
            message.message?.imageMessage?.caption ||
            message.message?.videoMessage?.caption || '';

        const args = q.split(' ').slice(1);
        const query = args.join(' ').trim();

        if (!query) {
            return await sock.sendMessage(chatId, {
                text: '*🎵 Audio Player*\nPlease provide a song name to play.*'
            }, { quoted: message });
        }

        const search = await yts(query);
        const video = search.videos[0];

        if (!video) {
            return await sock.sendMessage(chatId, {
                text: '*❌ No Results Found*\nNo songs found for your query. Please try different keywords.*'
            }, { quoted: message });
        }

        const safeTitle = video.title.replace(/[\\/:*?"<>|]/g, '');
        const fileName = `${safeTitle}.mp3`;

        let audioDoc = null;

        try {
            const res = await axios.get(`${MEDIA_API}/download/youtube/audio?url=${encodeURIComponent(video.url)}`, { timeout: 30000 });
            if (res?.data?.success && res.data.result?.download_url) {
                audioDoc = res.data.result.download_url;
            }
        } catch {}

        if (!audioDoc) {
            try {
                const princeRes = await axios.get(`https://api.princetechn.com/api/download/ytaudio?url=${encodeURIComponent(video.url)}&apikey=prince`, { timeout: 30000 });
                if (princeRes?.data?.success && princeRes.data.result?.download_url) {
                    audioDoc = princeRes.data.result.download_url;
                }
            } catch {}
        }

        if (!audioDoc) {
            const apis = [
                `https://apiskeith.top/download/audio?url=${encodeURIComponent(video.url)}`,
                `https://apiskeith.top/download/ytmp3?url=${encodeURIComponent(video.url)}`,
            ];

            for (const apiUrl of apis) {
                try {
                    const response = await axios.get(apiUrl, { timeout: 60000 });
                    const data = response.data;
                    if (!data?.status) continue;

                    const result = data.result;
                    const url = (typeof result === 'string' && result.startsWith('http')) ? result :
                        result?.download || result?.url || result?.downloadUrl || result?.link || null;

                    if (url) { audioDoc = url; break; }
                } catch (e) { continue; }
            }
        }

        if (!audioDoc) {
            return await sock.sendMessage(chatId, {
                text: '*❌ Download Failed*\nFailed to retrieve the MP3 download link. Please try again later.*'
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            document: { url: audioDoc },
            mimetype: 'audio/mpeg',
            fileName: fileName,
            caption: ''
        }, { quoted: message });

    } catch (err) {
        console.error('[PLAYDOC] Error:', err.message);
        await sock.sendMessage(chatId, {
            text: '*❌ Error Occurred*'
        }, { quoted: message });
    }
}

module.exports = playdocCommand;
