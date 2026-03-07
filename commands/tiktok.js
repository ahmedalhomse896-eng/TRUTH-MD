const axios = require('axios');

const MEDIA_API = 'https://media.cypherxbot.space';

async function tiktokCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        
        if (!text) {
            return await sock.sendMessage(chatId, { 
                text: "Please provide a TikTok video URL."
            });
        }

        const url = text.replace(/^tt\s+/i, '').trim();
        
        if (!url) {
            return await sock.sendMessage(chatId, { 
                text: "Please provide a TikTok video URL."
            });
        }

        const tiktokPatterns = [
            /https?:\/\/(?:www\.)?tiktok\.com\//,
            /https?:\/\/(?:vm\.)?tiktok\.com\//,
            /https?:\/\/(?:vt\.)?tiktok\.com\//,
            /https?:\/\/(?:www\.)?tiktok\.com\/@/,
            /https?:\/\/(?:www\.)?tiktok\.com\/t\//
        ];

        const isValidUrl = tiktokPatterns.some(pattern => pattern.test(url));
        
        if (!isValidUrl) {
            return await sock.sendMessage(chatId, { 
                text: "Please provide a valid TikTok video link."
            });
        }

        await sock.sendMessage(chatId, {
            react: { text: '🤳', key: message.key }
        });

        let videoUrl = null;
        let caption = `「 *TikTok Downloader* 」`;

        try {
            const res = await axios.get(`${MEDIA_API}/download/tiktok/video?url=${encodeURIComponent(url)}`, { timeout: 30000 });
            if (res?.data?.success && res.data.result?.download_url) {
                videoUrl = res.data.result.download_url;
                caption = `「 *TikTok Downloader* 」\n\n🎵 Title: ${res.data.result.title || 'Unknown'}`;
            }
        } catch {}

        if (!videoUrl) {
            const tiktokApis = [
                { url: `https://apiskeith.top/download/tiktokdl?url=${encodeURIComponent(url)}`, type: 'keith' },
                { url: `https://apis.xcasper.space/api/tiktok-dl?url=${encodeURIComponent(url)}`, type: 'xcasper' },
            ];

            for (const api of tiktokApis) {
                try {
                    const response = await axios.get(api.url, {
                        timeout: 30000,
                        headers: { 'accept': '*/*', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                    });
                    const data = response.data;
                    if (!data) continue;

                    const result = data.result || data.data || data;

                    const nowm = result?.nowm || result?.video_no_watermark || result?.no_watermark ||
                                 result?.url || result?.download || result?.video || data?.url || data?.download || null;

                    if (nowm) {
                        videoUrl = nowm;
                        caption = `「 *TikTok Downloader* 」\n
🎵 Title: ${result?.title || data?.title || "Unknown"}
👤 Author: ${result?.caption || result?.author || data?.author || "Unknown"}
🌍 Region: ${result?.region || "Unknown"}
⏱ Duration: ${result?.duration || "Unknown"}s
🎑 Views: ${result?.stats?.views || result?.views || "Unknown"}
❤️ Likes: ${result?.stats?.likes || result?.likes || "Unknown"}
💬 Comments: ${result?.stats?.comment || result?.comments || "Unknown"}
🔁 Shares: ${result?.stats?.share || result?.shares || "Unknown"}`;
                        break;
                    }
                } catch {
                    continue;
                }
            }
        }

        if (!videoUrl) {
            return await sock.sendMessage(chatId, {
                text: "❌ Failed to fetch TikTok video. All APIs failed. Please try again later."
            }, { quoted: message });
        }

        try {
            try {
                const videoResponse = await axios.get(videoUrl, {
                    responseType: 'arraybuffer',
                    timeout: 60000,
                    maxContentLength: 100 * 1024 * 1024,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'video/mp4,video/*,*/*;q=0.9',
                        'Referer': 'https://www.tiktok.com/'
                    }
                });
                const videoBuffer = Buffer.from(videoResponse.data);
                if (videoBuffer.length === 0) throw new Error("Empty buffer");
                await sock.sendMessage(chatId, { video: videoBuffer, caption, mimetype: "video/mp4" }, { quoted: message });
            } catch {
                await sock.sendMessage(chatId, { video: { url: videoUrl }, caption, mimetype: "video/mp4" }, { quoted: message });
            }

            await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        } catch (error) {
            console.error("TikTok send error:", error);
            await sock.sendMessage(chatId, { text: "❌ Failed to send TikTok video. Please try again." }, { quoted: message });
        }
    } catch (error) {
        console.error('Error in TikTok command:', error);
        await sock.sendMessage(chatId, { 
            text: "❌ An unexpected error occurred. Please try again later."
        }, { quoted: message });
    }
}

module.exports = tiktokCommand;
