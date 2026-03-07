const { getConfig, setConfig } = require('../lib/configdb');
const { isSudo } = require('../lib/index');
const fs = require('fs');
const path = require('path');

const ALLOWED_CODES_PATH = path.join(__dirname, '../data/allowedCodes.json');

function getAllowedCodes() {
    try {
        if (fs.existsSync(ALLOWED_CODES_PATH)) {
            return JSON.parse(fs.readFileSync(ALLOWED_CODES_PATH, 'utf8'));
        }
    } catch {}
    return [];
}

function saveAllowedCodes(codes) {
    const dir = path.dirname(ALLOWED_CODES_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ALLOWED_CODES_PATH, JSON.stringify(codes, null, 2));
}

function isAutoblockEnabled() {
    return getConfig('AUTOBLOCK') === 'true';
}

async function handleAutoblock(sock, message) {
    if (!isAutoblockEnabled()) return false;
    if (message.key.fromMe) return false;

    const senderId = message.key.participant || message.key.remoteJid;
    if (!senderId || senderId.endsWith('@g.us')) return false;

    try {
        if (await isSudo(senderId)) return false;
    } catch {}

    const allowedCodes = getAllowedCodes();
    if (allowedCodes.length === 0) return false;

    const number = senderId.replace('@s.whatsapp.net', '');
    const isAllowed = allowedCodes.some(code => number.startsWith(code));

    if (!isAllowed) {
        try {
            await sock.updateBlockStatus(senderId, 'block');
            console.log(`[AUTOBLOCK] Blocked ${senderId} - country code not in allowed list`);
            return true;
        } catch (err) {
            console.error('[AUTOBLOCK] Error blocking:', err.message);
        }
    }
    return false;
}

async function autoblockCommand(sock, chatId, senderId, message, userMessage, prefix) {
    try {
        if (!message.key.fromMe && !await isSudo(senderId)) {
            return sock.sendMessage(chatId, { text: '❗ Only the bot owner can use this command.' }, { quoted: message });
        }

        const args = userMessage.split(/\s+/).slice(1);
        const action = args[0]?.toLowerCase();

        if (!action) {
            const enabled = isAutoblockEnabled();
            const codes = getAllowedCodes();
            return sock.sendMessage(chatId, {
                text: `*🚫 Auto Block*\n\nStatus: ${enabled ? '🟢 ON' : '🔴 OFF'}\nAllowed Codes: ${codes.length > 0 ? codes.join(', ') : 'None'}\n\n*Commands:*\n${prefix}autoblock on - Enable\n${prefix}autoblock off - Disable\n${prefix}autoblock add 254 - Add country code\n${prefix}autoblock remove 254 - Remove code\n${prefix}autoblock list - Show allowed codes`
            }, { quoted: message });
        }

        if (action === 'on') {
            setConfig('AUTOBLOCK', 'true');
            return sock.sendMessage(chatId, { text: '✅ Auto block enabled. Numbers from non-allowed country codes will be blocked.' }, { quoted: message });
        }

        if (action === 'off') {
            setConfig('AUTOBLOCK', 'false');
            return sock.sendMessage(chatId, { text: '✅ Auto block disabled.' }, { quoted: message });
        }

        if (action === 'add') {
            const code = args[1];
            if (!code || !/^\d+$/.test(code)) {
                return sock.sendMessage(chatId, { text: `❌ Provide a valid country code.\nExample: ${prefix}autoblock add 254` }, { quoted: message });
            }
            const codes = getAllowedCodes();
            if (codes.includes(code)) {
                return sock.sendMessage(chatId, { text: `⚠️ Code ${code} already in allowed list.` }, { quoted: message });
            }
            codes.push(code);
            saveAllowedCodes(codes);
            return sock.sendMessage(chatId, { text: `✅ Added ${code} to allowed codes.\nCurrent: ${codes.join(', ')}` }, { quoted: message });
        }

        if (action === 'remove') {
            const code = args[1];
            const codes = getAllowedCodes();
            const idx = codes.indexOf(code);
            if (idx === -1) {
                return sock.sendMessage(chatId, { text: `❌ Code ${code} not found in list.` }, { quoted: message });
            }
            codes.splice(idx, 1);
            saveAllowedCodes(codes);
            return sock.sendMessage(chatId, { text: `✅ Removed ${code} from allowed codes.\nCurrent: ${codes.length > 0 ? codes.join(', ') : 'None'}` }, { quoted: message });
        }

        if (action === 'list') {
            const codes = getAllowedCodes();
            return sock.sendMessage(chatId, { text: `*Allowed Country Codes:*\n${codes.length > 0 ? codes.join(', ') : 'None set'}` }, { quoted: message });
        }

        return sock.sendMessage(chatId, { text: `❌ Unknown action "${action}".\nUse: ${prefix}autoblock on/off/add/remove/list` }, { quoted: message });

    } catch (err) {
        console.error('Autoblock command error:', err);
        await sock.sendMessage(chatId, { text: `❌ Error: ${err.message}` }, { quoted: message });
    }
}

module.exports = { autoblockCommand, isAutoblockEnabled, handleAutoblock };
