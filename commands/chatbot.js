const axios = require('axios');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const ffmpeg = require('fluent-ffmpeg');

const {
    storeUserMessage,
    getUserMessages,
    getSetting,
    setSetting
} = require('../lib/chatbot.db');

const { downloadMediaMessage } = require('@whiskeysockets/baileys');

/* ================== TYPING INDICATOR ================== */
async function showTypingIndicator(sock, chatId) {
    try {
        await sock.sendPresenceUpdate('composing', chatId);
    } catch {}
}

async function stopTypingIndicator(sock, chatId) {
    try {
        await sock.sendPresenceUpdate('paused', chatId);
    } catch {}
}

/* ================== SPEECH TO TEXT ================== */
const FormData = require('form-data');

async function speechToText(audioPath) {
    try {
        const form = new FormData();
        form.append('file', fs.createReadStream(audioPath));

        const res = await fetch('https://api.bk9.dev/ai/stt', {
            method: 'POST',
            body: form,
            headers: form.getHeaders()
        });

        const data = await res.json();

        console.log('STT Response:', data); // debug

        return data?.result || data?.text || null;
    } catch (err) {
        console.error('STT Error:', err.message);
        return null;
    }
}
/* ================== CHATBOT COMMAND ================== */
async function handleChatbotCommand(sock, chatId, message, match, isOwner) {
    let enabled = await getSetting('chatbot_enabled');
    enabled = enabled === 'true';
    let currentMode = await getSetting('chatbot_mode') || 'group';

    if (!match) {
        return sock.sendMessage(chatId, {
            text: `*CHATBOT SETUP — OWNER ONLY*

*.chatbot on*
Enable chatbot

*.chatbot off*
Disable chatbot

*.chatbot mode dm*
Only respond in DMs

*.chatbot mode group*
Only respond in groups

*.chatbot mode all*
Respond everywhere

*Current Status:* ${enabled ? '🟢 ON' : '🔴 OFF'}
*Current Mode:* ${currentMode}`,
            quoted: message
        });
    }

    if (!isOwner) {
        return sock.sendMessage(chatId, {
            text: '❌ Only the bot owner can control the chatbot!',
            quoted: message
        });
    }

    if (match === 'on') {
        await setSetting('chatbot_enabled', 'true');
        return sock.sendMessage(chatId, {
            text: 'Chatbot enabled successfully',
            quoted: message
        });
    }

    if (match === 'off') {
        await setSetting('chatbot_enabled', 'false');
        return sock.sendMessage(chatId, {
            text: '🤖 Chatbot DISABLED',
            quoted: message
        });
    }

    if (match === 'mode') {
        const args = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').split(/\s+/);
        const modeArg = args[2]?.toLowerCase();
        const validModes = ['dm', 'group', 'all'];
        if (!validModes.includes(modeArg)) {
            return sock.sendMessage(chatId, {
                text: `❌ Invalid mode. Use: .chatbot mode dm/group/all\nCurrent mode: ${currentMode}`,
                quoted: message
            });
        }
        await setSetting('chatbot_mode', modeArg);
        return sock.sendMessage(chatId, {
            text: `✅ Chatbot mode set to: *${modeArg}*`,
            quoted: message
        });
    }
}

/* ================== CHATBOT RESPONSE ================== */
async function handleChatbotResponse(sock, chatId, message, userMessage, senderId) {
    try {
        if (message.key.fromMe) return;

        let enabled = await getSetting('chatbot_enabled');
        if (enabled !== 'true') return;

        const chatbotMode = await getSetting('chatbot_mode') || 'group';
        const isGroup = chatId.endsWith('@g.us');

        if (chatbotMode === 'dm' && isGroup) return;
        if (chatbotMode === 'group' && !isGroup) return;

        let finalText = userMessage;

        /* ===== VOICE NOTE HANDLING ===== */
        if (message.message?.audioMessage?.ptt) {
            await showTypingIndicator(sock, chatId);

            const audioPath = path.join(__dirname, `../tmp/${Date.now()}.ogg`);
            const buffer = await downloadMediaMessage(
                message,
                'buffer',
                {},
                { logger: console }
            );

            fs.writeFileSync(audioPath, buffer);

            finalText = await speechToText(audioPath);
            fs.unlinkSync(audioPath);

            if (!finalText) {
                await stopTypingIndicator(sock, chatId);
                return sock.sendMessage(chatId, {
                    text: "🤖 I couldn't understand the voice note.",
                }, { quoted: message });
            }
        }

        // ❌ Ignore empty text
        if (!finalText || finalText.startsWith('.')) return;

        /* ===== MEMORY ===== */
        storeUserMessage(senderId, finalText);
        const history = await getUserMessages(senderId, 10);

        /* ===== AI REQUEST ===== */
        const query = encodeURIComponent(finalText);
        const prompt = encodeURIComponent(
            "You are TRUTH MD AI WhatsApp bot made by Courtney. Be friendly, smart, human-like. Reply in user's language. Use emojis lightly."
        );

        const apiUrl = `https://api.bk9.dev/ai/BK93?BK9=${prompt}&q=${query}`;

        await showTypingIndicator(sock, chatId);
        const { data } = await axios.get(apiUrl);
        await stopTypingIndicator(sock, chatId);

        if (data?.BK9) {
            await sock.sendMessage(chatId, { text: data.BK9 }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, {
                text: "🤖 I could not respond properly."
            }, { quoted: message });
        }

    } catch (err) {
        await stopTypingIndicator(sock, chatId);
        console.error('Chatbot Error:', err.message);
    }
}

module.exports = {
    handleChatbotCommand,
    handleChatbotResponse
};
