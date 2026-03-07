const fs = require('fs');
const path = require('path');
const { tmpdir } = require('os');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { writeFile } = require('fs/promises');
const { appendWatermark } = require('../lib/watermark');

const messageStore = new Map();
const MAX_STORED_MESSAGES = 50;
const MAX_MESSAGE_AGE_MS = 4 * 60 * 60 * 1000;
const CONFIG_PATH = path.join(__dirname, '../data/antidelete.json');
const TEMP_MEDIA_DIR = path.join(__dirname, '../tmp');

// Ensure tmp dir exists
if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

// Function to get folder size in MB
const getFolderSizeInMB = (folderPath) => {
    try {
        const files = fs.readdirSync(folderPath);
        let totalSize = 0;

        for (const file of files) {
            const filePath = path.join(folderPath, file);
            if (fs.statSync(filePath).isFile()) {
                totalSize += fs.statSync(filePath).size;
            }
        }

        return totalSize / (1024 * 1024); // Convert bytes to MB
    } catch (err) {
        console.error('Error getting folder size:', err);
        return 0;
    }
};

// Function to clean temp folder if size exceeds 10MB
const cleanTempFolderIfLarge = () => {
    try {
        const sizeMB = getFolderSizeInMB(TEMP_MEDIA_DIR);

        if (sizeMB > 200) {
            const files = fs.readdirSync(TEMP_MEDIA_DIR);
            for (const file of files) {
                const filePath = path.join(TEMP_MEDIA_DIR, file);
                fs.unlinkSync(filePath);
            }
        }
    } catch (err) {
        console.error('Temp cleanup error:', err);
    }
};

// Start periodic cleanup check every 1 minute
setInterval(cleanTempFolderIfLarge, 60 * 1000);

// Load config
function loadAntideleteConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return { enabled: false };
        return JSON.parse(fs.readFileSync(CONFIG_PATH));
    } catch {
        return { enabled: false };
    }
}

// Save config
function saveAntideleteConfig(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (err) {
        console.error('Config save error:', err);
    }
}

// Command Handler
async function handleAntideleteCommand(sock, chatId, message, match) {
    const { isSudo } = require('../lib/index');
    const senderId = message.key.participant || message.key.remoteJid;
    const senderIsSudo = await isSudo(senderId);

    if (!message.key.fromMe && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: '*Only the bot owner can use this command.*' }, { quoted: message });
    }

    const config = loadAntideleteConfig();

    if (!match) {
        return sock.sendMessage(chatId, {
            text: `*ANTIDELETE SETUP*\n\nCurrent Status: ${config.enabled ? '✅ Enabled' : '❌ Disabled'}\n\n*.antidelete on* - Enable\n*.antidelete off* - Disable`
        }, { quoted: message });
    }

    if (match === 'on') {
        config.enabled = true;
    } else if (match === 'off') {
        config.enabled = false;
    } else {
        return sock.sendMessage(chatId, { text: '*Invalid command. Use .antidelete to see usage.*' }, { quoted: message });
    }

    saveAntideleteConfig(config);
    return sock.sendMessage(chatId, { text: `*Antidelete ${match === 'on' ? 'enabled' : 'disabled'}*` }, { quoted: message });
}

// Store incoming messages (also handles anti-view-once by forwarding immediately)
async function storeMessage(sock, message) {
    try {
        const config = loadAntideleteConfig();
        if (!config.enabled) return; // Don't store if antidelete is disabled

        if (!message.key?.id) return;

        const messageId = message.key.id;
        let content = '';
        let mediaType = '';
        let mediaPath = '';
        let isViewOnce = false;

        const sender = message.key.participant || message.key.remoteJid;

        // Detect content (including view-once wrappers)
        const viewOnceContainer = message.message?.viewOnceMessageV2?.message || message.message?.viewOnceMessage?.message;
        if (viewOnceContainer) {
            // unwrap view-once content
            if (viewOnceContainer.imageMessage?.mediaKey) {
                mediaType = 'image';
                content = viewOnceContainer.imageMessage.caption || '';
                const stream = await downloadContentFromMessage(viewOnceContainer.imageMessage, 'image');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.jpg`);
                await writeFile(mediaPath, buffer);
                isViewOnce = true;
            } else if (viewOnceContainer.videoMessage?.mediaKey) {
                mediaType = 'video';
                content = viewOnceContainer.videoMessage.caption || '';
                const stream = await downloadContentFromMessage(viewOnceContainer.videoMessage, 'video');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`);
                await writeFile(mediaPath, buffer);
                isViewOnce = true;
            }
        } else if (message.message?.conversation) {
            content = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
            content = message.message.extendedTextMessage.text;
        } else if (message.message?.imageMessage?.mediaKey) {
            mediaType = 'image';
            content = message.message.imageMessage.caption || '';
            const stream = await downloadContentFromMessage(message.message.imageMessage, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.jpg`);
            await writeFile(mediaPath, buffer);
        } else if (message.message?.stickerMessage?.mediaKey) {
            mediaType = 'sticker';
            const stream = await downloadContentFromMessage(message.message.stickerMessage, 'sticker');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.webp`);
            await writeFile(mediaPath, buffer);
        } else if (message.message?.videoMessage?.mediaKey) {
            mediaType = 'video';
            content = message.message.videoMessage.caption || '';
            const stream = await downloadContentFromMessage(message.message.videoMessage, 'video');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`);
            await writeFile(mediaPath, buffer);
        } else if (message.message?.audioMessage?.mediaKey) {
            mediaType = 'audio';
            const mime = message.message.audioMessage.mimetype || '';
            const ext = mime.includes('mpeg') ? 'mp3' : (mime.includes('ogg') ? 'ogg' : 'mp3');
            const stream = await downloadContentFromMessage(message.message.audioMessage, 'audio');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`);
            await writeFile(mediaPath, buffer);
        }

        messageStore.set(messageId, {
            content,
            mediaType,
            mediaPath,
            sender,
            group: message.key.remoteJid.endsWith('@g.us') ? message.key.remoteJid : null,
            timestamp: new Date().toISOString(),
            _ts: Date.now()
        });

        if (messageStore.size > MAX_STORED_MESSAGES) {
            const now = Date.now();
            for (const [id, msg] of messageStore) {
                if (now - (msg._ts || 0) > MAX_MESSAGE_AGE_MS) {
                    if (msg.mediaPath) { try { fs.unlinkSync(msg.mediaPath); } catch (_) {} }
                    messageStore.delete(id);
                }
            }
            if (messageStore.size > MAX_STORED_MESSAGES) {
                const sorted = [...messageStore.entries()].sort((a, b) => (a[1]._ts || 0) - (b[1]._ts || 0));
                const toRemove = sorted.slice(0, messageStore.size - MAX_STORED_MESSAGES);
                for (const [id, msg] of toRemove) {
                    if (msg.mediaPath) { try { fs.unlinkSync(msg.mediaPath); } catch (_) {} }
                    messageStore.delete(id);
                }
            }
        }

        // Anti-ViewOnce: forward immediately to owner if captured
        if (isViewOnce && mediaType && fs.existsSync(mediaPath)) {
            try {
                const ownerNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                const senderName = sender.split('@')[0];
                const mediaOptions = {
                    caption: `*Anti-ViewOnce ${mediaType}*\n\nFrom: @${senderName}`,
                    mentions: [sender]
                };
                if (mediaType === 'image') {
                    await sock.sendMessage(ownerNumber, { image: { url: mediaPath }, ...mediaOptions });
                } else if (mediaType === 'video') {
                    await sock.sendMessage(ownerNumber, { video: { url: mediaPath }, ...mediaOptions });
                }
                // Cleanup immediately for view-once forward
                try { fs.unlinkSync(mediaPath); } catch { }
            } catch (e) {
                // ignore
            }
        }

    } catch (err) {
        console.error('storeMessage error:', err);
    }
}

// Handle message deletion
async function handleMessageRevocation(sock, revocationMessage) {
    try {
        const config = loadAntideleteConfig();
        if (!config.enabled) return;

        const protocolMsg = revocationMessage.message.protocolMessage;
        const messageId = protocolMsg.key.id;
        const chatJid = revocationMessage.key.remoteJid;
        const isGroup = chatJid.endsWith('@g.us');
        const ownerNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const ownerLid = sock.user.id.split(':')[0];

        const deletedBy = isGroup
            ? (revocationMessage.key.participant || revocationMessage.participant || chatJid)
            : chatJid;

        const deletedByNumber = deletedBy.split('@')[0].split(':')[0];
        if (deletedByNumber === ownerLid || deletedBy === ownerNumber || deletedBy.includes(sock.user.id)) return;

        const original = messageStore.get(messageId);
        if (!original) return;

        const sender = original.sender;
        const senderName = sender.split('@')[0];
        const senderIsSame = sender === deletedBy || senderName === deletedByNumber;

        let groupName = '';
        let deleteType = '';
        if (isGroup) {
            try {
                const metadata = await sock.groupMetadata(chatJid);
                groupName = metadata.subject || chatJid.split('@')[0];
                if (!senderIsSame) {
                    const deleter = metadata.participants?.find(p => p.id === deletedBy || p.id.split(':')[0] === deletedByNumber);
                    if (deleter && (deleter.admin === 'admin' || deleter.admin === 'superadmin')) {
                        deleteType = '🛡️ Admin Delete';
                    } else {
                        deleteType = '🗑️ Deleted by other';
                    }
                } else {
                    deleteType = '🗑️ Self Delete';
                }
            } catch (err) {
                groupName = chatJid.split('@')[0];
                deleteType = senderIsSame ? '🗑️ Self Delete' : '🗑️ Deleted by other';
            }
        } else {
            deleteType = '🗑️ Self Delete (DM)';
        }

        const now = new Date();
        const deletedAt = now.toLocaleTimeString('en-US', {
            timeZone: 'Africa/Nairobi',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        }) + ' EAT';

        const originalDate = new Date(original.timestamp);
        const timeSent = originalDate.toLocaleTimeString('en-US', {
            timeZone: 'Africa/Nairobi',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        }) + ' EAT';

        const dateSent = originalDate.toLocaleDateString('en-GB', {
            timeZone: 'Africa/Nairobi',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        let text = `*🔮 𝙳𝙴𝙻𝙴𝚃𝙴𝙳 𝙼𝙴𝚂𝚂𝙰𝙶𝙴! 🔮*\n`;
        text += `\n📍 𝚆𝙷𝙴𝚁𝙴: ${isGroup ? `Group — ${groupName}` : `Private Chat — @${chatJid.split('@')[0]}`}`;
        text += `\n👤 𝚂𝙴𝙽𝚃 𝙱𝚈: @${senderName}`;
        text += `\n🗑️ 𝙳𝙴𝙻𝙴𝚃𝙴𝙳 𝙱𝚈: @${deletedByNumber}`;
        text += `\n⚡ 𝚃𝚈𝙿𝙴: ${deleteType}`;
        text += `\n🕐 𝚂𝙴𝙽𝚃 𝙰𝚃: ${timeSent} — ${dateSent}`;
        text += `\n🕐 𝙳𝙴𝙻𝙴𝚃𝙴𝙳 𝙰𝚃: ${deletedAt}`;

        if (original.content) {
            text += `\n\n💬 𝙼𝙴𝚂𝚂𝙰𝙶𝙴:\n${original.content}`;
        } else if (original.mediaType) {
            text += `\n\n📎 𝙼𝙴𝙳𝙸𝙰: [${original.mediaType.toUpperCase()}]`;
        }

        const mentions = [sender];
        if (deletedBy !== sender) mentions.push(deletedBy);
        if (isGroup && !mentions.includes(chatJid)) { /* no group mention needed */ }
        else if (!isGroup) mentions.push(chatJid);

        await sock.sendMessage(ownerNumber, { text, mentions });

        // Media sending
        if (original.mediaType && fs.existsSync(original.mediaPath)) {
            const mediaOptions = {
                caption: `🔮 𝙳𝙴𝙻𝙴𝚃𝙴𝙳 ${original.mediaType.toUpperCase()}!\n📍 ${isGroup ? `Group — ${groupName}` : `DM — @${chatJid.split('@')[0]}`}\n👤 From: @${senderName}\n🗑️ Deleted by: @${deletedByNumber}\n⚡ ${deleteType}`,
                mentions
            };

            try {
                switch (original.mediaType) {
                    case 'image':
                        await sock.sendMessage(ownerNumber, {
                            image: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                    case 'sticker':
                        await sock.sendMessage(ownerNumber, {
                            sticker: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                    case 'video':
                        await sock.sendMessage(ownerNumber, {
                            video: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                    case 'audio':
                        await sock.sendMessage(ownerNumber, {
                            audio: { url: original.mediaPath },
                            mimetype: 'audio/mpeg',
                            ptt: false,
                            ...mediaOptions
                        });
                        break;
                }
            } catch (err) {
                await sock.sendMessage(ownerNumber, {
                    text: `⚠️ Error sending media: ${err.message}`
                });
            }

            // Cleanup
            try {
                if (fs.existsSync(original.mediaPath)) {
                    fs.unlinkSync(original.mediaPath);
                }
            } catch (err) {
                // Ignore cleanup errors
            }
        }

        messageStore.delete(messageId);

    } catch (err) {
        console.error('handleMessageRevocation error:', err);
    }
}

module.exports = {
    handleAntideleteCommand,
    handleMessageRevocation,
    storeMessage
};
