const isAdmin = require('../lib/isAdmin');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

async function downloadMediaMessage(message, mediaType) {
    const stream = await downloadContentFromMessage(message, mediaType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    const filePath = path.join(__dirname, '../temp/', `${Date.now()}.${mediaType}`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

async function tagAdminCommand(sock, chatId, senderId, messageText, replyMessage, message) {
    const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

    if (!isBotAdmin) {
        await sock.sendMessage(chatId, { text: 'Please make the bot an admin first.' }, { quoted: message });
        return;
    }

    if (!isSenderAdmin) {
        await sock.sendMessage(chatId, { text: 'Only admins can use the .tagadmin command.' }, { quoted: message });
        return;
    }

    const groupMetadata = await sock.groupMetadata(chatId);
    const participants = groupMetadata.participants || [];
    const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id);

    if (admins.length === 0) {
        await sock.sendMessage(chatId, { text: 'No admins found in this group.' }, { quoted: message });
        return;
    }

    if (replyMessage) {
        let content = {};
        if (replyMessage.imageMessage) {
            const filePath = await downloadMediaMessage(replyMessage.imageMessage, 'image');
            content = { image: { url: filePath }, caption: messageText || replyMessage.imageMessage.caption || '', mentions: admins };
        } else if (replyMessage.videoMessage) {
            const filePath = await downloadMediaMessage(replyMessage.videoMessage, 'video');
            content = { video: { url: filePath }, caption: messageText || replyMessage.videoMessage.caption || '', mentions: admins };
        } else if (replyMessage.conversation || replyMessage.extendedTextMessage) {
            content = { text: replyMessage.conversation || replyMessage.extendedTextMessage.text, mentions: admins };
        } else if (replyMessage.documentMessage) {
            const filePath = await downloadMediaMessage(replyMessage.documentMessage, 'document');
            content = { document: { url: filePath }, fileName: replyMessage.documentMessage.fileName, caption: messageText || '', mentions: admins };
        }

        if (Object.keys(content).length > 0) {
            await sock.sendMessage(chatId, content);
        }
    } else {
        let adminList = `*👑 Tagging all admins:*\n\n`;
        admins.forEach(id => { adminList += `@${id.split('@')[0]}\n`; });
        if (messageText) adminList += `\n💬 ${messageText}`;
        await sock.sendMessage(chatId, { text: adminList, mentions: admins });
    }
}

module.exports = tagAdminCommand;
