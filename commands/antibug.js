const { getConfig, setConfig } = require('../lib/configdb');
const { isSudo } = require('../lib/index');

async function antibugCommand(sock, chatId, senderId, message, userMessage, prefix) {
    try {
        if (!message.key.fromMe && !await isSudo(senderId)) {
            return sock.sendMessage(chatId, { text: '❗ Only the bot owner can use this command.' }, { quoted: message });
        }

        const args = userMessage.split(/\s+/).slice(1);
        const status = args[0]?.toLowerCase();

        if (!['on', 'off'].includes(status)) {
            const current = getConfig('ANTIBUG') || 'off';
            return sock.sendMessage(chatId, {
                text: `*🛡️ Anti-Bug Protection*\n\nCurrent Status: ${current === 'true' ? '🟢 ON' : '🔴 OFF'}\n\nUsage: ${prefix}antibug on/off\n\nWhen enabled, the bot will detect and block crash-inducing messages.`
            }, { quoted: message });
        }

        setConfig('ANTIBUG', status === 'on' ? 'true' : 'false');
        await sock.sendMessage(chatId, { text: `✅ Anti-Bug has been turned ${status}.` }, { quoted: message });
    } catch (err) {
        console.error('Antibug command error:', err);
        await sock.sendMessage(chatId, { text: `❌ Error: ${err.message}` }, { quoted: message });
    }
}

function isAntibugEnabled() {
    return getConfig('ANTIBUG') === 'true';
}

function isBugMessage(message) {
    try {
        const msg = message.message;
        if (!msg) return false;

        const str = JSON.stringify(msg);
        if (str.length > 50000) return true;

        if (msg.buttonsMessage?.contentText?.length > 5000) return true;
        if (msg.listMessage?.sections?.length > 100) return true;
        if (msg.templateMessage?.hydratedTemplate?.hydratedButtons?.length > 50) return true;

        const vcardMatch = str.match(/BEGIN:VCARD/gi);
        if (vcardMatch && vcardMatch.length > 100) return true;

        return false;
    } catch {
        return false;
    }
}

async function handleAntibug(sock, message) {
    if (!isAntibugEnabled()) return false;
    if (!isBugMessage(message)) return false;

    try {
        const chatId = message.key.remoteJid;
        const senderId = message.key.participant || message.key.remoteJid;

        await sock.sendMessage(chatId, {
            delete: message.key
        });

        console.log(`[ANTIBUG] Blocked crash message from ${senderId} in ${chatId}`);
        return true;
    } catch (err) {
        console.error('[ANTIBUG] Error handling bug message:', err.message);
        return false;
    }
}

module.exports = { antibugCommand, isAntibugEnabled, handleAntibug };
