const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { appendWatermark } = require('../lib/watermark');
const fs = require('fs');
const path = require('path');

const TEMP_DIR = path.join(__dirname, '..', 'tmp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function findViewOnceMedia(message) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!quoted) return null;

    const viewOnceMsg = quoted.viewOnceMessageV2?.message
        || quoted.viewOnceMessage?.message
        || quoted.viewOnceMessageV2Extension?.message
        || null;

    if (viewOnceMsg) {
        if (viewOnceMsg.imageMessage) return { type: 'image', media: viewOnceMsg.imageMessage };
        if (viewOnceMsg.videoMessage) return { type: 'video', media: viewOnceMsg.videoMessage };
    }

    if (quoted.imageMessage?.viewOnce) {
        return { type: 'image', media: quoted.imageMessage };
    }
    if (quoted.videoMessage?.viewOnce) {
        return { type: 'video', media: quoted.videoMessage };
    }

    if (quoted.imageMessage) {
        return { type: 'image', media: quoted.imageMessage };
    }
    if (quoted.videoMessage) {
        return { type: 'video', media: quoted.videoMessage };
    }

    return null;
}

async function vvReplyCommand(sock, chatId, message, userMessage) {
    try {
        const isOwner = message.key.fromMe;
        if (!isOwner) {
            await sock.sendMessage(chatId, {
                text: '❌ Only owner can use this command!'
            }, { quoted: message });
            return;
        }

        const result = findViewOnceMedia(message);

        if (!result) {
            await sock.sendMessage(chatId, {
                text: '❌ Please reply to a view-once image or video.'
            }, { quoted: message });
            return;
        }

        // Get the reply text from command arguments
        const args = userMessage.slice(7).trim(); // Remove ".vvreply " prefix
        const replyText = args || '🔥';

        console.log(`[VV-REPLY] Processing ${result.type} with reply: ${replyText}`);

        if (result.type === 'image') {
            const stream = await downloadContentFromMessage(result.media, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            if (buffer.length < 1000) {
                await sock.sendMessage(chatId, {
                    text: '❌ This view-once has already been opened or expired.'
                }, { quoted: message });
                return;
            }

            // Send image with reply to original sender
            const senderJid = message.message?.extendedTextMessage?.contextInfo?.participant;
            const groupJid = chatId;

            await sock.sendMessage(groupJid, {
                image: buffer,
                caption: replyText
            }, { quoted: message.message?.extendedTextMessage?.contextInfo?.quotedMessage ? { key: { ...message.key, id: message.message?.extendedTextMessage?.contextInfo?.stanzaId } } : undefined });

            await sock.sendMessage(chatId, { text: '✅ View-once image replied successfully!' });
            console.log('[VV-REPLY] Image replied');

        } else if (result.type === 'video') {
            const stream = await downloadContentFromMessage(result.media, 'video');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            if (buffer.length < 1000) {
                await sock.sendMessage(chatId, {
                    text: '❌ This view-once has already been opened or expired.'
                }, { quoted: message });
                return;
            }

            const tmpPath = path.join(TEMP_DIR, `vv_reply_${Date.now()}.mp4`);
            fs.writeFileSync(tmpPath, buffer);

            await sock.sendMessage(chatId, {
                video: { url: tmpPath },
                caption: replyText
            }, { quoted: message.message?.extendedTextMessage?.contextInfo?.quotedMessage ? { key: { ...message.key, id: message.message?.extendedTextMessage?.contextInfo?.stanzaId } } : undefined });

            await sock.sendMessage(chatId, { text: '✅ View-once video replied successfully!' });
            console.log('[VV-REPLY] Video replied');

            try { fs.unlinkSync(tmpPath); } catch {}
        }
    } catch (error) {
        console.error('Error in vvreply command:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Error: ${error.message}`
        }, { quoted: message });
    }
}

async function vvDmCommand(sock, chatId, message, userMessage) {
    try {
        const isOwner = message.key.fromMe;
        if (!isOwner) {
            await sock.sendMessage(chatId, {
                text: '❌ Only owner can use this command!'
            }, { quoted: message });
            return;
        }

        // Extract recipient number from args
        const args = userMessage.slice(5).trim().split(' '); // Remove ".vvdm " prefix
        const recipientNum = args[0];

        if (!recipientNum || recipientNum.length < 10) {
            await sock.sendMessage(chatId, {
                text: '📝 *Usage:* `.vvdm 234XXXXXXXXXX` while replying to a view-once\n\n_Sends the view-once media to that person in DM_'
            }, { quoted: message });
            return;
        }

        const result = findViewOnceMedia(message);

        if (!result) {
            await sock.sendMessage(chatId, {
                text: '❌ Please reply to a view-once image or video.'
            }, { quoted: message });
            return;
        }

        // Format receiver JID
        let receiverJid = recipientNum;
        if (!receiverJid.includes('@')) {
            receiverJid = recipientNum.replace(/\D/g, '') + '@s.whatsapp.net';
        }

        console.log(`[VV-DM] Sending ${result.type} to ${receiverJid}`);

        if (result.type === 'image') {
            const stream = await downloadContentFromMessage(result.media, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            if (buffer.length < 1000) {
                await sock.sendMessage(chatId, {
                    text: '❌ This view-once has already been opened or expired.'
                }, { quoted: message });
                return;
            }

            await sock.sendMessage(receiverJid, {
                image: buffer,
                caption: appendWatermark(result.media.caption || 'Sent from bot')
            });

            await sock.sendMessage(chatId, { text: `✅ View-once image sent to ${recipientNum}!` });
            console.log('[VV-DM] Image sent');

        } else if (result.type === 'video') {
            const stream = await downloadContentFromMessage(result.media, 'video');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            if (buffer.length < 1000) {
                await sock.sendMessage(chatId, {
                    text: '❌ This view-once has already been opened or expired.'
                }, { quoted: message });
                return;
            }

            const tmpPath = path.join(TEMP_DIR, `vv_dm_${Date.now()}.mp4`);
            fs.writeFileSync(tmpPath, buffer);

            await sock.sendMessage(receiverJid, {
                video: { url: tmpPath },
                caption: appendWatermark(result.media.caption || 'Sent from bot')
            });

            await sock.sendMessage(chatId, { text: `✅ View-once video sent to ${recipientNum}!` });
            console.log('[VV-DM] Video sent');

            try { fs.unlinkSync(tmpPath); } catch {}
        }
    } catch (error) {
        console.error('Error in vvdm command:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Error: ${error.message}`
        }, { quoted: message });
    }
}

module.exports = {
    vvReplyCommand,
    vvDmCommand
};