const { igdl } = require("ruhend-scraper");
const axios = require('axios');

const MEDIA_API = 'https://media.cypherxbot.space';

const processedMessages = new Set();

function extractUniqueMedia(mediaData) {
    const uniqueMedia = [];
    const seenUrls = new Set();
    
    for (const media of mediaData) {
        if (!media.url) continue;
        if (!seenUrls.has(media.url)) {
            seenUrls.add(media.url);
            uniqueMedia.push(media);
        }
    }
    
    return uniqueMedia;
}

async function instagramCommand(sock, chatId, message) {
    try {
        if (processedMessages.has(message.key.id)) {
            return;
        }
        
        processedMessages.add(message.key.id);
        
        setTimeout(() => {
            processedMessages.delete(message.key.id);
        }, 5 * 60 * 1000);

        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        
        if (!text) {
            return await sock.sendMessage(chatId, { 
                text: "Please provide an Instagram link for the video."
            });
        }

        const instagramPatterns = [
            /https?:\/\/(?:www\.)?instagram\.com\//,
            /https?:\/\/(?:www\.)?instagr\.am\//,
            /https?:\/\/(?:www\.)?instagram\.com\/p\//,
            /https?:\/\/(?:www\.)?instagram\.com\/reel\//,
            /https?:\/\/(?:www\.)?instagram\.com\/tv\//
        ];

        const isValidUrl = instagramPatterns.some(pattern => pattern.test(text));
        
        if (!isValidUrl) {
            return await sock.sendMessage(chatId, { 
                text: "That is not a valid Instagram link. Please provide a valid Instagram post, reel, or video link."
            });
        }

        await sock.sendMessage(chatId, {
            react: { text: '🔄', key: message.key }
        });

        let mediaData = [];

        try {
            const res = await axios.get(`${MEDIA_API}/download/instagram/video?url=${encodeURIComponent(text)}`, { timeout: 30000 });
            if (res?.data?.success && res.data.result?.download_url) {
                mediaData = [{ url: res.data.result.download_url, type: 'video' }];
            }
        } catch {}

        if (mediaData.length === 0) {
            const xcasperApis = [
                `https://apis.xcasper.space/api/dl-ig?url=${encodeURIComponent(text)}`,
                `https://apis.xcasper.space/api/dl-ig2?url=${encodeURIComponent(text)}`,
            ];

            for (const apiUrl of xcasperApis) {
                try {
                    const res = await axios.get(apiUrl, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
                    const data = res.data;
                    const items = data?.data || data?.result || data?.media || data?.items || (Array.isArray(data) ? data : null);
                    if (items && items.length > 0) {
                        mediaData = items.map(item => ({
                            url: item.url || item.download || item.src || item,
                            type: item.type || (String(item.url || item).includes('.mp4') ? 'video' : 'image')
                        })).filter(m => m.url);
                        if (mediaData.length > 0) break;
                    }
                } catch { continue; }
            }
        }

        if (mediaData.length === 0) {
            try {
                const downloadData = await igdl(text);
                if (downloadData?.data?.length > 0) mediaData = downloadData.data;
            } catch {}
        }

        if (mediaData.length === 0) {
            return await sock.sendMessage(chatId, { 
                text: "❌ No media found at the provided link. The post might be private or the link is invalid."
            });
        }
        
        const uniqueMedia = extractUniqueMedia(mediaData);
        const mediaToDownload = uniqueMedia.slice(0, 20);
        
        if (mediaToDownload.length === 0) {
            return await sock.sendMessage(chatId, { 
                text: "❌ No valid media found to download. This might be a private post or the scraper failed."
            });
        }

        for (let i = 0; i < mediaToDownload.length; i++) {
            try {
                const media = mediaToDownload[i];
                const mediaUrl = media.url;

                const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(mediaUrl) || 
                              media.type === 'video' || 
                              text.includes('/reel/') || 
                              text.includes('/tv/');

                if (isVideo) {
                    await sock.sendMessage(chatId, {
                        video: { url: mediaUrl },
                        mimetype: "video/mp4",
                        caption: ""
                    }, { quoted: message });
                } else {
                    await sock.sendMessage(chatId, {
                        image: { url: mediaUrl },
                        caption: ""
                    }, { quoted: message });
                }
                
                if (i < mediaToDownload.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
            } catch (mediaError) {
                console.error(`Error downloading media ${i + 1}:`, mediaError);
            }
        }

    } catch (error) {
        console.error('Error in Instagram command:', error);
        await sock.sendMessage(chatId, { 
            text: "❌ An error occurred while processing the Instagram request. Please try again."
        });
    }
}

module.exports = instagramCommand;
