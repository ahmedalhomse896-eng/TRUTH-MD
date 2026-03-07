const fs = require('fs');
const path = require('path');

// Import user settings system
let userSettings;
try {
    userSettings = require('../lib/userSettings');
} catch (e) {
    console.error('Failed to load user settings:', e.message);
}

const DATA_FILE = path.join(__dirname, '..', 'data', 'autoview.json');

function loadAutoviewSettings() {
    // Try user settings database first
    if (userSettings) {
        return userSettings.getGlobalSetting('AUTOVIEW_SETTINGS', { enabled: false });
    }

    // Fallback to JSON file
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (err) {
        console.error('Error loading autoview settings:', err);
    }
    return { enabled: false };
}

function saveAutoviewSettings(settings) {
    // Save to user settings database
    if (userSettings) {
        userSettings.setGlobalSetting('AUTOVIEW_SETTINGS', settings, 'Auto-view status updates settings');
        return;
    }

    // Fallback to JSON file
    try {
        const dataDir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(settings, null, 2));
    } catch (err) {
        console.error('Error saving autoview settings:', err);
    }
}

async function autoviewCommand(sock, chatId, message, userMessage) {
    try {
        const isOwner = message.key.fromMe;
        if (!isOwner) {
            await sock.sendMessage(chatId, {
                text: '❌ Only owner can use this command!'
            }, { quoted: message });
            return;
        }

        const args = userMessage.toLowerCase().split(/\s+/).slice(1)[0];
        const settings = loadAutoviewSettings();

        if (args === 'on' || args === 'enable') {
            settings.enabled = true;
            saveAutoviewSettings(settings);
            await sock.sendMessage(chatId, {
                text: '✅ *Autoview* has been turned *ON*\n\n_Bot will automatically view all status updates_'
            }, { quoted: message });
        } else if (args === 'off' || args === 'disable') {
            settings.enabled = false;
            saveAutoviewSettings(settings);
            await sock.sendMessage(chatId, {
                text: '❌ *Autoview* has been turned *OFF*'
            }, { quoted: message });
        } else {
            const status = settings.enabled ? '✅ ON' : '❌ OFF';
            await sock.sendMessage(chatId, {
                text: `*Autoview Status:* ${status}\n\n📝 Usage: ${userMessage.split(' ')[0]} on/off`
            }, { quoted: message });
        }
    } catch (error) {
        console.error('Error in autoview command:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Error: ${error.message}`
        }, { quoted: message });
    }
}

function isAutoviewEnabled() {
    const settings = loadAutoviewSettings();
    return settings.enabled === true;
}

async function handleAutoviewStatus(sock, statusUpdate) {
    try {
        if (!isAutoviewEnabled()) return;

        const { key } = statusUpdate;
        if (!key) return;

        // Send view receipt
        await sock.sendReadReceipt(key.remoteJid, undefined, [key.id]);

        console.log('✅ Auto-viewed status');
    } catch (error) {
        console.error('Error in handleAutoviewStatus:', error);
    }
}

module.exports = {
    autoviewCommand,
    isAutoviewEnabled,
    handleAutoviewStatus,
    loadAutoviewSettings
};