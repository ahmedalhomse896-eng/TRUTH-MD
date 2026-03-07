const gTTS = require('gtts');
const fs = require('fs');
const path = require('path');
const { fallbackManager } = require('../lib/apiFallbacks');

async function ttsCommand(sock, chatId, text, message, language = 'en') {
    if (!text) {
        await sock.sendMessage(chatId, { text: 'Please provide the text for TTS conversion.' });
        return;
    }

    const fileName = `tts-${Date.now()}.mp3`;
    const filePath = path.join(__dirname, '..', 'assets', fileName);

    // Try primary gTTS first
    try {
        const gtts = new gTTS(text, language);
        await new Promise((resolve, reject) => {
            gtts.save(filePath, function (err) {
                if (err) reject(err);
                else resolve();
            });
        });

        await sock.sendMessage(chatId, {
            audio: { url: filePath },
            mimetype: 'audio/mpeg'
        }, { quoted: message });

        fs.unlinkSync(filePath);
        return;

    } catch (gttsError) {
        console.error('gTTS error:', gttsError);

        // Try fallback APIs from PrexzyVilla
        console.log(`🔄 gTTS failed, trying fallback TTS for text: "${text.substring(0, 50)}..."`);
        const fallbackResult = await fallbackManager.tryFallbacks('tts', text);

        if (fallbackResult.success) {
            await sock.sendMessage(chatId, {
                audio: fallbackResult.data,
                mimetype: 'audio/mpeg',
                caption: `🔊 TTS (Fallback: ${fallbackResult.api})`
            }, { quoted: message });
            return;
        }

        // If all methods fail
        await sock.sendMessage(chatId, {
            text: '❌ Failed to generate TTS audio with both primary and fallback services.'
        });
    }
}

module.exports = ttsCommand;
