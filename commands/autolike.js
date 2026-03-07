const fs = require('fs');
const path = require('path');

// Import user settings system
let userSettings;
try {
    userSettings = require('../lib/userSettings');
} catch (e) {
    console.error('Failed to load user settings:', e.message);
}

const DATA_FILE = path.join(__dirname, '..', 'data', 'autolike.json');

function loadAutolikeSettings() {
    // Try user settings database first
    if (userSettings) {
        return userSettings.getGlobalSetting('AUTOLIKE_SETTINGS', { enabled: false });
    }

    // Fallback to JSON file
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (err) {
        console.error('Error loading autolike settings:', err);
    }
    return { enabled: false };
}

function saveAutolikeSettings(settings) {
    // Save to user settings database
    if (userSettings) {
        userSettings.setGlobalSetting('AUTOLIKE_SETTINGS', settings, 'Auto-like status updates settings');
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
        console.error('Error saving autolike settings:', err);
    }
}

async function autolikeCommand(sock, chatId, message, userMessage) {
    try {
        const isOwner = message.key.fromMe;
        if (!isOwner) {
            await sock.sendMessage(chatId, {
                text: '❌ Only owner can use this command!'
            }, { quoted: message });
            return;
        }

        const args = userMessage.toLowerCase().split(/\s+/).slice(1)[0];
        const settings = loadAutolikeSettings();

        if (args === 'on' || args === 'enable') {
            settings.enabled = true;
            saveAutolikeSettings(settings);
            await sock.sendMessage(chatId, {
                text: '✅ *Autolike* has been turned *ON*\n\n_Bot will automatically like all status updates_'
            }, { quoted: message });
        } else if (args === 'off' || args === 'disable') {
            settings.enabled = false;
            saveAutolikeSettings(settings);
            await sock.sendMessage(chatId, {
                text: '❌ *Autolike* has been turned *OFF*'
            }, { quoted: message });
        } else {
            const status = settings.enabled ? '✅ ON' : '❌ OFF';
            await sock.sendMessage(chatId, {
                text: `*Autolike Status:* ${status}\n\n📝 Usage: ${userMessage.split(' ')[0]} on/off`
            }, { quoted: message });
        }
    } catch (error) {
        console.error('Error in autolike command:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Error: ${error.message}`
        }, { quoted: message });
    }
}

function isAutolikeEnabled() {
    const settings = loadAutolikeSettings();
    return settings.enabled === true;
}

async function handleAutolikeStatus(sock, statusUpdate) {
    try {
        if (!isAutolikeEnabled()) return;

        const { key } = statusUpdate;
        if (!key) return;

        // Like reaction emoji
        await sock.sendMessage(key.remoteJid, {
            react: { text: '❤️', key: key }
        });

        console.log('✅ Auto-liked status');
    } catch (error) {
        console.error('Error in handleAutolikeStatus:', error);
    }
}

module.exports = {
    autolikeCommand,
    isAutolikeEnabled,
    handleAutolikeStatus,
    loadAutolikeSettings
};