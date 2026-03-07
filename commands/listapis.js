const { fallbackManager } = require('../lib/apiFallbacks');

async function listApisCommand(sock, chatId, message) {
    try {
        const categories = ['ai_chat', 'image_generation', 'tts', 'search', 'downloader', 'random'];
        let response = '🔗 *Available Fallback APIs*\n\n';

        for (const category of categories) {
            const apis = fallbackManager.getAvailableAPIs(category);
            if (apis.length > 0) {
                response += `📂 *${category.toUpperCase()}*\n`;
                apis.forEach((api, index) => {
                    response += `  ${index + 1}. ${api}\n`;
                });
                response += '\n';
            }
        }

        response += '_Total APIs loaded from system and custom storage_';

        await sock.sendMessage(chatId, {
            text: response
        }, { quoted: message });

    } catch (err) {
        console.error('List APIs command error:', err);
        await sock.sendMessage(chatId, {
            text: `❌ Error listing APIs: ${err.message}`
        }, { quoted: message });
    }
}

module.exports = listApisCommand;