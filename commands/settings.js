const fs = require('fs');
const { getConfig } = require('../lib/configdb');
const { getPrefix } = require('./setprefix');
const { getOwnerName } = require('./setowner');
const { getBotName } = require('./setbot');
const { getOwnerNumber } = require('./setownernumber');
const { getSetting } = require('../lib/chatbot.db');
const { getCurrentFont } = require('./fontstyle');
const { isAutolikeEnabled } = require('./autolike');
const { isAutoviewEnabled } = require('./autoview');

// Import user settings system
let userSettings;
try {
    userSettings = require('../lib/userSettings');
} catch (e) {
    console.error('Failed to load user settings:', e.message);
}

function readJsonSafe(filePath, fallback) {
    try {
        const txt = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(txt);
    } catch (_) {
        return fallback;
    }
}

function cfgBool(key, fallback) {
    const val = getConfig(key);
    if (val === 'true') return 'ON';
    if (val === 'false') return 'OFF';
    return fallback || 'OFF';
}

// Helper function to get setting from user settings database
function getUserSetting(key, fallback = 'OFF') {
    if (!userSettings) return fallback;
    const value = userSettings.getGlobalSetting(key);
    if (value === 'true') return 'ON';
    if (value === 'false') return 'OFF';
    return value || fallback;
}

async function settingsCommand(sock, chatId, message, senderIsSudo) {
    try {
        if (!message.key.fromMe && !senderIsSudo) {
            await sock.sendMessage(chatId, { text: 'Only bot owner can use this command!' }, { quoted: message });
            return;
        }

        const dataDir = './data';
        const settings = require('../settings');
        const prefix = getPrefix();
        const currentMode = getConfig('MODE') || settings.commandMode || 'public';

        // Get settings from user settings database
        const autoStatus = userSettings ? userSettings.getGlobalSetting('AUTOSTATUS_SETTINGS', { enabled: false, reactOn: false }) : readJsonSafe(`${dataDir}/autoStatus.json`, { enabled: false, reactOn: false });
        const anticall = userSettings ? userSettings.getGlobalSetting('ANTICALL_SETTINGS', { enabled: false }) : readJsonSafe(`${dataDir}/anticall.json`, { enabled: false });

        let chatbotEnabled = 'OFF';
        let chatbotMode = 'group';
        try {
            chatbotEnabled = (await getSetting('chatbot_enabled')) === 'true' ? 'ON' : 'OFF';
            chatbotMode = (await getSetting('chatbot_mode')) || 'group';
        } catch {}

        const fontStyle = getCurrentFont();
        const autoread = userSettings ? userSettings.getGlobalSetting('AUTOREAD', { enabled: false }) : readJsonSafe(`${dataDir}/autoread.json`, { enabled: false });
        const antiedit = userSettings ? userSettings.getGlobalSetting('ANTIEDIT', { enabled: false }) : readJsonSafe(`${dataDir}/antiedit.json`, { enabled: false });
        const autolike = isAutolikeEnabled() ? 'ON' : 'OFF';
        const autoview = isAutoviewEnabled() ? 'ON' : 'OFF';

        const statusEmojis = autoStatus.customEmojis || ['🧡','💚','🔥','✨','❤️','🥰','😎'];

        const lines = [];
        lines.push('⚙️ *Current Bot Settings:*');
        lines.push('');
        lines.push(`❇️ *prefix*: ${prefix}`);
        lines.push(`❇️ *mode*: ${currentMode}`);
        lines.push(`❇️ *autobio*: ${getUserSetting('AUTOBIO')}`);
        lines.push(`❇️ *anticall*: ${anticall.enabled ? 'ON' : 'OFF'}`);
        lines.push(`❇️ *chatbot*: ${chatbotEnabled}`);
        lines.push(`❇️ *antibug*: ${getUserSetting('ANTIBUG')}`);
        lines.push(`❇️ *autotype*: ${getUserSetting('AUTOTYPING')}`);
        lines.push(`❇️ *autoread*: ${autoread.enabled ? 'ON' : 'OFF'}`);
        lines.push(`❇️ *fontstyle*: ${fontStyle === 'off' || fontStyle === 'false' ? 'OFF' : fontStyle}`);
        lines.push(`❇️ *antiedit*: ${antiedit.enabled ? 'ON' : 'OFF'}`);
        lines.push(`❇️ *menustyle*: ${getConfig('MENUSTYLE') || '5'}`);
        lines.push(`❇️ *autoreact*: ${getUserSetting('AUTOREACT')}`);
        lines.push(`❇️ *autoblock*: ${getUserSetting('AUTOBLOCK')}`);
        lines.push(`❇️ *autorecord*: ${getUserSetting('AUTORECORDING')}`);
        lines.push(`❇️ *antidelete*: ${getUserSetting('ANTIDELETE')}`);
        lines.push(`❇️ *alwaysonline*: ${getUserSetting('ALWAYSONLINE')}`);
        lines.push(`❇️ *autoviewstatus*: ${autoStatus.enabled ? 'ON' : 'OFF'}`);
        lines.push(`❇️ *autoreactstatus*: ${autoStatus.reactOn ? 'ON' : 'OFF'}`);
        lines.push(`❇️ *autorecordtype*: ${getUserSetting('AUTORECORDTYPE')}`);
        lines.push(`❇️ *statusantidelete*: ${getUserSetting('STATUSANTIDELETE')}`);
        lines.push(`❇️ *antiviewonce*: ${getUserSetting('ANTIVIEWONCE')}`);
        lines.push(`❇️ *autosavestatus*: ${getUserSetting('AUTOSAVESTATUS')}`);
        lines.push(`❇️ *chatbotMode*: ${chatbotMode}`);
        lines.push(`❇️ *antisticker*: ${getUserSetting('ANTISTICKER')}`);
        lines.push(`❇️ *autolike*: ${autolike}`);
        lines.push(`❇️ *autoview*: ${autoview}`);
        lines.push('');
        lines.push(`❇️ *botname*: ${getBotName()}`);
        lines.push(`❇️ *ownername*: ${getOwnerName()}`);
        lines.push(`❇️ *ownernumber*: ${getOwnerNumber().split('@')[0]}`);
        lines.push(`❇️ *statusemoji*: ${statusEmojis.join(',')}`);
        lines.push(`❇️ *watermark*: ${watermark}`);
        lines.push(`❇️ *author*: ${stAuthor}`);
        lines.push(`❇️ *packname*: ${stPack}`);
        lines.push(`❇️ *timezone*: ${timezone}`);
        lines.push(`❇️ *contextlink*: ${contextLink}`);
        lines.push(`❇️ *menuimage*: ${menuImage || '(not set)'}`);
        lines.push(`❇️ *anticallmsg*: ${anticallMsg}`);
        lines.push(`❇️ *warnLimit*: ${warnLimit}`);

        await sock.sendMessage(chatId, { text: lines.join('\n') }, { quoted: message });
        await sock.sendMessage(chatId, { react: { text: '☑️', key: message.key } });
    } catch (error) {
        console.error('Error in settings command:', error);
        await sock.sendMessage(chatId, { text: 'Failed to read settings.' }, { quoted: message });
    }
}

module.exports = settingsCommand;
