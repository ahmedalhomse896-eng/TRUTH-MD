const axios = require('axios');

const MEDIA_API = 'https://media.cypherxbot.space';

async function spotifyCommand(sock, chatId, message) {
    try {
        const rawText = message.message?.conversation?.trim() ||
            message.message?.extendedTextMessage?.text?.trim() ||
            message.message?.imageMessage?.caption?.trim() ||
            message.message?.videoMessage?.caption?.trim() ||
            '';
        
        const used = (rawText || '').split(/\s+/)[0] || '.spotify';
        const query = rawText.slice(used.length).trim();
        
        if (!query) {
            await sock.sendMessage(chatId, { 
                text: 'Usage: .spotify <song/artist/keywords or Spotify URL>\n\nExample: .spotify Faded\nExample: .spotify https://open.spotify.com/track/...' 
            }, { quoted: message });
            return;
        }

        const isSpotifyUrl = query.includes('open.spotify.com/track/');
        
        let audioUrl, trackInfo;

        if (isSpotifyUrl) {
            await sock.sendMessage(chatId, { react: { text: '🎼', key: message.key } });

            try {
                const res = await axios.get(`${MEDIA_API}/download/spotify/audio?url=${encodeURIComponent(query)}`, { timeout: 30000 });
                if (res?.data?.success && res.data.result?.download_url) {
                    audioUrl = res.data.result.download_url;
                    trackInfo = {
                        title: res.data.result.title || 'Unknown Title',
                        artist: res.data.result.artist || 'Unknown Artist',
                        duration: res.data.result.duration || '',
                        thumbnail: res.data.result.thumbnail || null,
                        spotifyUrl: query
                    };
                }
            } catch {}

            if (!audioUrl) {
                const spotifyApis = [
                    `https://apiskeith.top/download/spotifydl?url=${encodeURIComponent(query)}`,
                    `https://apis.xcasper.space/api/ytmp3?url=${encodeURIComponent(query)}`,
                ];

                for (const apiUrl of spotifyApis) {
                    try {
                        const { data } = await axios.get(apiUrl, { timeout: 20000, headers: { 'user-agent': 'Mozilla/5.0' } });
                        const track = data?.track || data?.result || data?.data || data;
                        const url = track?.audio?.url || track?.url || track?.download || track?.downloadUrl || data?.url || data?.download || null;
                        if (url) {
                            audioUrl = url;
                            trackInfo = {
                                title: track?.title || data?.title || 'Unknown Title',
                                artist: track?.artist || data?.artist || 'Unknown Artist',
                                duration: track?.duration || data?.duration || '',
                                thumbnail: track?.thumbnail || track?.album?.cover || data?.thumbnail || null,
                                spotifyUrl: track?.spotify_url || query
                            };
                            break;
                        }
                    } catch { continue; }
                }
            }
            if (!audioUrl) throw new Error('No result from any Spotify downloader API');

        } else {
            const searchApis = [
                `https://casper-tech-apis.vercel.app/api/play/sportify?q=${encodeURIComponent(query)}`,
            ];

            let found = false;
            for (const apiUrl of searchApis) {
                try {
                    const { data } = await axios.get(apiUrl, { timeout: 20000, headers: { 'user-agent': 'Mozilla/5.0' } });
                    const results = data?.results;
                    if (results && results.length > 0) {
                        const result = results[0];
                        audioUrl = result.download_url;
                        trackInfo = {
                            title: result.title || result.name || 'Unknown Title',
                            artist: result.artists?.join(', ') || result.artist || 'Unknown Artist',
                            duration: result.duration?.formatted || '',
                            thumbnail: result.thumbnail || result.album?.cover,
                            spotifyUrl: result.spotify_url,
                            album: result.album?.name,
                            popularity: result.popularity
                        };
                        found = true;
                        break;
                    }
                    const track = data?.result || data?.data || data;
                    const url = track?.url || track?.download || data?.url || null;
                    if (url) {
                        audioUrl = url;
                        trackInfo = {
                            title: track?.title || data?.title || query,
                            artist: track?.artist || 'Unknown Artist',
                            duration: track?.duration || '',
                            thumbnail: track?.thumbnail || null,
                            spotifyUrl: query
                        };
                        found = true;
                        break;
                    }
                } catch { continue; }
            }
            if (!found) throw new Error('No results found for this query');
        }

        if (!audioUrl) {
            await sock.sendMessage(chatId, { 
                text: 'No downloadable audio found for this query.' 
            }, { quoted: message });
            return;
        }

        let caption = `📔 Title: *${trackInfo.title}*\n👤 Artist: ${trackInfo.artist}`;
        if (trackInfo.album) caption += `\n💿 Album: ${trackInfo.album}`;
        if (trackInfo.duration) caption += `\n⏰ Duration: ${trackInfo.duration}`;
        if (trackInfo.popularity) caption += `\n📊 Popularity: ${trackInfo.popularity}%`;
        caption += `\n🖇️ ${trackInfo.spotifyUrl}`;

        if (trackInfo.thumbnail) {
            await sock.sendMessage(chatId, { 
                image: { url: trackInfo.thumbnail }, 
                caption 
            }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, { 
                text: caption 
            }, { quoted: message });
        }

        const filename = trackInfo.title.replace(/[\\/:*?"<>|]/g, '');
        await sock.sendMessage(chatId, {
            audio: { url: audioUrl },
            mimetype: 'audio/mpeg',
            fileName: `${filename}.mp3`
        }, { quoted: message });

        await sock.sendMessage(chatId, {
            react: { text: '🪩', key: message.key }
        });

    } catch (error) {
        console.error('[SPOTIFY] error:', error?.message || error);
        const errorMsg = error?.response?.data?.message || error?.message || 'Unknown error';
        await sock.sendMessage(chatId, { 
            text: `❌ Failed to fetch Spotify audio.\nError: ${errorMsg}\n\nTry another query or check the URL.` 
        }, { quoted: message });
    }
}

module.exports = spotifyCommand;
