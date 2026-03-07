const { getConfig, setConfig } = require('../lib/configdb');
const { isSudo } = require('../lib/index');

const FONT_MAPS = {
    serif_bold: { offset: 0x1D400, name: 'Serif Bold' },
    serif_italic: { offset: 0x1D434, name: 'Serif Italic' },
    sans: { offset: 0x1D5A0, name: 'Sans-Serif' },
    sans_bold: { offset: 0x1D5D4, name: 'Sans-Serif Bold' },
    sans_italic: { offset: 0x1D608, name: 'Sans-Serif Italic' },
    script: { offset: 0x1D49C, name: 'Script' },
    monospace: { offset: 0x1D670, name: 'Monospace' },
    double_struck: { offset: 0x1D538, name: 'Double-Struck' },
    fraktur: { offset: 0x1D504, name: 'Fraktur' },
    circled: { offset: 0x24B6, name: 'Circled' },
    squared: { offset: 0x1F130, name: 'Squared' },
};

function convertChar(char, fontOffset) {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) {
        return String.fromCodePoint(fontOffset + (code - 65));
    }
    if (code >= 97 && code <= 122) {
        return String.fromCodePoint(fontOffset + 26 + (code - 97));
    }
    return char;
}

function applyFont(text, fontName) {
    const font = FONT_MAPS[fontName];
    if (!font) return text;
    return [...text].map(c => convertChar(c, font.offset)).join('');
}

function getCurrentFont() {
    return getConfig('FONTSTYLE') || 'off';
}

function isFontStyleEnabled() {
    const font = getCurrentFont();
    return font !== 'off' && font !== 'false' && FONT_MAPS[font];
}

function applyFontStyle(text) {
    const font = getCurrentFont();
    if (font === 'off' || font === 'false' || !FONT_MAPS[font]) return text;
    return applyFont(text, font);
}

async function fontstyleCommand(sock, chatId, senderId, message, userMessage, prefix) {
    try {
        if (!message.key.fromMe && !await isSudo(senderId)) {
            return sock.sendMessage(chatId, { text: '❗ Only the bot owner can use this command.' }, { quoted: message });
        }

        const args = userMessage.split(/\s+/).slice(1);
        const style = args[0]?.toLowerCase();

        if (!style) {
            const current = getCurrentFont();
            const fontList = Object.entries(FONT_MAPS).map(([key, val]) => `  ${key} - ${val.name}`).join('\n');
            const sample = Object.entries(FONT_MAPS).map(([key, val]) => `  ${val.name}: ${applyFont('Hello', val.offset)}`).join('\n');

            return sock.sendMessage(chatId, {
                text: `*🔤 Font Style*\n\nCurrent: ${current}\n\n*Available Styles:*\n${fontList}\n  off - Disable\n\n*Preview:*\n${sample}\n\nUsage: ${prefix}fontstyle <style>`
            }, { quoted: message });
        }

        if (style === 'off') {
            setConfig('FONTSTYLE', 'off');
            return sock.sendMessage(chatId, { text: '✅ Font style disabled.' }, { quoted: message });
        }

        if (!FONT_MAPS[style]) {
            return sock.sendMessage(chatId, { text: `❌ Unknown font style "${style}". Use ${prefix}fontstyle to see available styles.` }, { quoted: message });
        }

        setConfig('FONTSTYLE', style);
        await sock.sendMessage(chatId, { text: `✅ Font style set to: ${FONT_MAPS[style].name}\n\nSample: ${applyFont('Truth MD Bot', FONT_MAPS[style].offset)}` }, { quoted: message });
    } catch (err) {
        console.error('Fontstyle command error:', err);
        await sock.sendMessage(chatId, { text: `❌ Error: ${err.message}` }, { quoted: message });
    }
}

module.exports = { fontstyleCommand, isFontStyleEnabled, applyFontStyle, getCurrentFont };
