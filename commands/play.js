const fs = require("fs");
const axios = require("axios");
const yts = require("yt-search");
const path = require("path");

let ytdl;
try {
    ytdl = require("@distube/ytdl-core");
} catch {
    try {
        ytdl = require("ytdl-core");
    } catch {
        ytdl = null;
    }
}

const AXIOS_DEFAULTS = {
    timeout: 30000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
};

const MEDIA_API = 'https://media.cypherxbot.space';

async function downloadViaCypherX(youtubeUrl, filePath) {
    const res = await axios.get(`${MEDIA_API}/download/youtube/audio?url=${encodeURIComponent(youtubeUrl)}`, AXIOS_DEFAULTS);
    if (!res?.data?.success || !res.data.result?.download_url) throw new Error('CypherX: no download_url');

    const dlUrl = res.data.result.download_url;
    const audioStream = await axios({ method: "get", url: dlUrl, responseType: "stream", timeout: 120000 });
    const writer = fs.createWriteStream(filePath);
    audioStream.data.pipe(writer);

    await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
        audioStream.data.on("error", reject);
    });

    const size = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    if (size > 0) return res.data.result.title || 'YouTube Audio';
    throw new Error('CypherX: empty file');
}

async function downloadDirect(youtubeUrl, filePath) {
    if (!ytdl) throw new Error('ytdl not available');

    const info = await ytdl.getInfo(youtubeUrl);
    const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' })
        || ytdl.chooseFormat(info.formats, { quality: 'lowestvideo' });

    if (!format) throw new Error('No audio format found');

    const stream = ytdl.downloadFromInfo(info, { format });
    const writer = fs.createWriteStream(filePath);

    return new Promise((resolve, reject) => {
        stream.pipe(writer);
        writer.on('finish', () => {
            const size = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
            if (size > 0) resolve(info.videoDetails?.title || 'YouTube Audio');
            else reject(new Error('Empty file'));
        });
        writer.on('error', reject);
        stream.on('error', reject);
        setTimeout(() => reject(new Error('Download timeout')), 120000);
    });
}

async function downloadViaPrinceTech(youtubeUrl, filePath) {
    const res = await axios.get(`https://api.princetechn.com/api/download/ytaudio?url=${encodeURIComponent(youtubeUrl)}&apikey=prince`, AXIOS_DEFAULTS);
    if (!res?.data?.success || !res.data.result?.download_url) throw new Error('PrinceTech: no download_url');

    const dlUrl = res.data.result.download_url;
    const audioStream = await axios({ method: "get", url: dlUrl, responseType: "stream", timeout: 120000 });
    const writer = fs.createWriteStream(filePath);
    audioStream.data.pipe(writer);

    await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
        audioStream.data.on("error", reject);
    });

    const size = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    if (size > 0) return res.data.result.title || 'YouTube Audio';
    throw new Error('PrinceTech: empty file');
}

async function downloadViaApi(youtubeUrl, filePath) {
    const apis = [
        `https://apiskeith.top/download/audio?url=${encodeURIComponent(youtubeUrl)}`,
        `https://apiskeith.top/download/ytmp3?url=${encodeURIComponent(youtubeUrl)}`,
    ];

    let lastError;
    for (const apiUrl of apis) {
        try {
            const res = await axios.get(apiUrl, AXIOS_DEFAULTS);
            if (!res?.data) continue;

            const data = res.data;
            const result = data.result || data.data || data;
            const url = (typeof result === 'string' && result.startsWith('http')) ? result :
                result?.download || result?.url || result?.downloadUrl || result?.link ||
                result?.audio || result?.audio_url || data?.download || data?.url || null;

            if (!url) continue;

            const audioStream = await axios({ method: "get", url, responseType: "stream", timeout: 120000 });
            const writer = fs.createWriteStream(filePath);
            audioStream.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on("finish", resolve);
                writer.on("error", reject);
            });

            const size = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
            if (size > 0) return result?.title || data?.title || 'YouTube Audio';

        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error('All APIs failed');
}

async function playCommand(sock, chatId, message) {
    try {
        await sock.sendMessage(chatId, { react: { text: "🎼", key: message.key } });

        const tempDir = path.join(__dirname, "temp");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

        const text =
            message.message?.conversation ||
            message.message?.extendedTextMessage?.text ||
            "";

        const parts = text.split(" ");
        const query = parts.slice(1).join(" ").trim();

        if (!query)
            return sock.sendMessage(chatId, { text: "🎵 Provide a song name!\nExample: .play Not Like Us" }, { quoted: message });

        if (query.length > 100)
            return sock.sendMessage(chatId, { text: "📝 Song name too long! Max 100 chars." }, { quoted: message });

        const search = await yts(`${query} official`);
        const video = search.videos[0];

        if (!video)
            return sock.sendMessage(chatId, { text: "😕 Couldn't find that song. Try another one!" }, { quoted: message });

        const timestamp = Date.now();
        const fileName = `audio_${timestamp}.mp3`;
        const filePath = path.join(tempDir, fileName);

        let songTitle;

        try {
            songTitle = await downloadViaCypherX(video.url, filePath);
        } catch (cypherErr) {
            console.error('[PLAY] CypherX failed:', cypherErr.message);
            try {
                songTitle = await downloadViaPrinceTech(video.url, filePath);
            } catch (princeErr) {
                console.error('[PLAY] PrinceTech failed:', princeErr.message);
                try {
                    songTitle = await downloadViaApi(video.url, filePath);
                } catch (apiErr) {
                    console.error('[PLAY] API fallback failed:', apiErr.message);
                    try {
                        songTitle = await downloadDirect(video.url, filePath);
                    } catch (directErr) {
                        console.error('[PLAY] ytdl failed:', directErr.message);
                        throw new Error('All download methods failed. Try again later.');
                    }
                }
            }
        }

        songTitle = songTitle || video.title;

        if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0)
            throw new Error("Download failed or empty file!");

        await sock.sendMessage(chatId, { text: `Playing: \n ${songTitle}` });

        await sock.sendMessage(
            chatId,
            {
                document: { url: filePath },
                mimetype: "audio/mpeg",
                fileName: `${songTitle.substring(0, 100)}.mp3`
            },
            { quoted: message }
        );

        try { fs.unlinkSync(filePath); } catch {}

    } catch (error) {
        console.error("Play command error:", error.message || error);
        await sock.sendMessage(chatId, { text: `🚫 Error: ${error.message}` }, { quoted: message });
    }
}

module.exports = playCommand;
