const { getConfig, setConfig } = require('../lib/configdb');
const { isSudo } = require('../lib/index');
const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const statusStore = new Map();
const TEMP_DIR = path.join(__dirname, '../tmp');

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function isStatusAntideleteEnabled() {
    return getConfig('STATUSANTIDELETE') === 'true';
}

async function storeStatus(sock, message) {
    try {
        if (!isStatusAntideleteEnabled()) return;
        if (!message.key || message.key.remoteJid !== 'status@broadcast') return;

        const msgId = message.key.id;
        const sender = message.key.participant || message.key.remoteJid;
        const msg = message.message;
        if (!msg) return;

        const stored = {
            key: message.key,
            sender,
            timestamp: Date.now(),
            pushName: message.pushName || 'Unknown'
        };

        if (msg.imageMessage) {
            stored.type = 'image';
            stored.caption = msg.imageMessage.caption || '';
            try {
                const stream = await downloadContentFromMessage(msg.imageMessage, 'image');
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                const buffer = Buffer.concat(chunks);
                const filePath = path.join(TEMP_DIR, `status_${msgId}.jpg`);
                fs.writeFileSync(filePath, buffer);
                stored.mediaPath = filePath;
            } catch {}
        } else if (msg.videoMessage) {
            stored.type = 'video';
            stored.caption = msg.videoMessage.caption || '';
            try {
                const stream = await downloadContentFromMessage(msg.videoMessage, 'video');
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                const buffer = Buffer.concat(chunks);
                const filePath = path.join(TEMP_DIR, `status_${msgId}.mp4`);
                fs.writeFileSync(filePath, buffer);
                stored.mediaPath = filePath;
            } catch {}
        } else if (msg.extendedTextMessage || msg.conversation) {
            stored.type = 'text';
            stored.text = msg.extendedTextMessage?.text || msg.conversation || '';
        } else {
            return;
        }

        statusStore.set(msgId, stored);

        if (statusStore.size > 200) {
            const oldest = [...statusStore.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
            while (statusStore.size > 150) {
                const [id, data] = oldest.shift();
                if (data.mediaPath && fs.existsSync(data.mediaPath)) {
                    try { fs.unlinkSync(data.mediaPath); } catch {}
                }
                statusStore.delete(id);
            }
        }
    } catch (err) {
        console.error('[STATUS-ANTIDELETE] Store error:', err.message);
    }
}

async function handleStatusRevocation(sock, message) {
    try {
        if (!isStatusAntideleteEnabled()) return;

        const protocol = message.message?.protocolMessage;
        if (!protocol || protocol.type !== 0) return;
        if (message.key.remoteJid !== 'status@broadcast') return;

        const deletedId = protocol.key?.id;
        if (!deletedId) return;

        const stored = statusStore.get(deletedId);
        if (!stored) return;

        const ownerJid = sock.user?.id?.replace(/:.*@/, '@');
        if (!ownerJid) return;

        const header = `*🔔 Deleted Status Detected*\n\n👤 *From:* ${stored.pushName} (@${stored.sender.replace('@s.whatsapp.net', '')})\n⏰ *Posted:* ${new Date(stored.timestamp).toLocaleString()}`;

        if (stored.type === 'text') {
            await sock.sendMessage(ownerJid, {
                text: `${header}\n📝 *Type:* Text\n\n${stored.text}`
            });
        } else if (stored.type === 'image' && stored.mediaPath && fs.existsSync(stored.mediaPath)) {
            await sock.sendMessage(ownerJid, {
                image: fs.readFileSync(stored.mediaPath),
                caption: `${header}\n📷 *Type:* Image\n${stored.caption ? `\n${stored.caption}` : ''}`
            });
        } else if (stored.type === 'video' && stored.mediaPath && fs.existsSync(stored.mediaPath)) {
            await sock.sendMessage(ownerJid, {
                video: fs.readFileSync(stored.mediaPath),
                caption: `${header}\n🎥 *Type:* Video\n${stored.caption ? `\n${stored.caption}` : ''}`
            });
        }

        if (stored.mediaPath && fs.existsSync(stored.mediaPath)) {
            try { fs.unlinkSync(stored.mediaPath); } catch {}
        }
        statusStore.delete(deletedId);

    } catch (err) {
        console.error('[STATUS-ANTIDELETE] Revocation error:', err.message);
    }
}

async function statusAntideleteCommand(sock, chatId, senderId, message, userMessage, prefix) {
    try {
        if (!message.key.fromMe && !await isSudo(senderId)) {
            return sock.sendMessage(chatId, { text: '❗ Only the bot owner can use this command.' }, { quoted: message });
        }

        const args = userMessage.split(/\s+/).slice(1);
        const status = args[0]?.toLowerCase();

        if (!['on', 'off'].includes(status)) {
            const current = isStatusAntideleteEnabled();
            return sock.sendMessage(chatId, {
                text: `*🔔 Status Anti-Delete*\n\nStatus: ${current ? '🟢 ON' : '🔴 OFF'}\n\nWhen enabled, deleted statuses will be forwarded to the bot owner.\n\nUsage: ${prefix}statusantidelete on/off`
            }, { quoted: message });
        }

        setConfig('STATUSANTIDELETE', status === 'on' ? 'true' : 'false');
        await sock.sendMessage(chatId, { text: `✅ Status anti-delete has been turned ${status}.` }, { quoted: message });
    } catch (err) {
        console.error('Status antidelete command error:', err);
        await sock.sendMessage(chatId, { text: `❌ Error: ${err.message}` }, { quoted: message });
    }
}

module.exports = { statusAntideleteCommand, isStatusAntideleteEnabled, storeStatus, handleStatusRevocation };
