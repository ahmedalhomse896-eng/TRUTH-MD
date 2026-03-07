const { fallbackManager } = require('../lib/apiFallbacks');
const fs = require('fs');
const path = require('path');

async function addApiCommand(sock, chatId, message) {
    try {
        // Check if user is the devreact number (owner)
        const senderId = message.key.participant || message.key.remoteJid;
        const isOwner = message.key.fromMe;

        // Get owner number from settings
        let ownerNumber = '';
        try {
            const ownerFile = path.join(__dirname, '..', 'data', 'owner.json');
            if (fs.existsSync(ownerFile)) {
                const ownerData = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
                ownerNumber = ownerData.split('@')[0];
            }
        } catch (e) {
            console.error('Error reading owner number:', e);
        }

        const senderNumber = senderId.split('@')[0];

        // Only allow owner/devreact number to add APIs
        if (!isOwner && senderNumber !== ownerNumber) {
            await sock.sendMessage(chatId, {
                text: '❌ Only the owner/devreact number can add APIs to the fallback system!'
            }, { quoted: message });
            return;
        }

        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const args = text.slice(7).trim().split('|').map(arg => arg.trim()); // Remove ".addapi " prefix

        if (args.length < 4) {
            await sock.sendMessage(chatId, {
                text: `❌ *API Addition Guide*\n\nUsage: \`.addapi category | name | endpoint | method | responsePath? | timeout? | headers?\`\n\n*Parameters:*\n• category: ai_chat, image_generation, tts, etc.\n• name: API display name\n• endpoint: Full API URL\n• method: GET, POST, etc.\n• responsePath: JSON path to extract data (optional)\n• timeout: Request timeout in ms (optional, default: 30000)\n• headers: JSON string of headers (optional)\n\n*Examples:*\n\`.addapi ai_chat | MyAI | https://api.example.com/chat?text= | GET | response | 5000\`\n\n\`.addapi image_generation | MyImg | https://api.example.com/gen?prompt= | GET |  | 30000 | {"Authorization":"Bearer token"}\``
            }, { quoted: message });
            return;
        }

        const [category, name, endpoint, method, responsePath = 'response', timeoutStr = '30000', headersStr = '{}'] = args;

        // Validate category
        const validCategories = ['ai_chat', 'image_generation', 'tts', 'search', 'downloader', 'random'];
        if (!validCategories.includes(category)) {
            await sock.sendMessage(chatId, {
                text: `❌ Invalid category! Valid categories: ${validCategories.join(', ')}`
            }, { quoted: message });
            return;
        }

        // Parse timeout
        const timeout = parseInt(timeoutStr);
        if (isNaN(timeout) || timeout < 1000 || timeout > 120000) {
            await sock.sendMessage(chatId, {
                text: '❌ Invalid timeout! Must be between 1000-120000ms'
            }, { quoted: message });
            return;
        }

        // Parse headers
        let headers = {};
        try {
            headers = JSON.parse(headersStr);
        } catch (e) {
            await sock.sendMessage(chatId, {
                text: '❌ Invalid headers JSON format!'
            }, { quoted: message });
            return;
        }

        // Create API config
        const apiConfig = {
            name: name,
            endpoint: endpoint,
            method: method.toUpperCase(),
            responsePath: responsePath || undefined,
            timeout: timeout,
            headers: headers
        };

        // Add to fallback manager
        fallbackManager.addFallback(category, apiConfig);

        // Save to persistent storage
        const apiStoragePath = path.join(__dirname, '..', 'data', 'custom_apis.json');
        let customAPIs = {};

        try {
            if (fs.existsSync(apiStoragePath)) {
                customAPIs = JSON.parse(fs.readFileSync(apiStoragePath, 'utf8'));
            }
        } catch (e) {
            console.error('Error reading custom APIs file:', e);
        }

        if (!customAPIs[category]) {
            customAPIs[category] = [];
        }

        // Check if API already exists
        const existingIndex = customAPIs[category].findIndex(api => api.name === name);
        if (existingIndex !== -1) {
            customAPIs[category][existingIndex] = apiConfig;
            await sock.sendMessage(chatId, {
                text: `✅ *API Updated!*\n\n📝 **${name}** in category **${category}** has been updated.`
            }, { quoted: message });
        } else {
            customAPIs[category].push(apiConfig);
            await sock.sendMessage(chatId, {
                text: `✅ *API Added Successfully!*\n\n📝 **${name}** added to **${category}** category.\n\n🔗 Endpoint: ${endpoint}\n⚡ Method: ${method}\n⏱️ Timeout: ${timeout}ms`
            }, { quoted: message });
        }

        // Save to file
        fs.writeFileSync(apiStoragePath, JSON.stringify(customAPIs, null, 2));

        // Show current APIs in category
        const availableAPIs = fallbackManager.getAvailableAPIs(category);
        await sock.sendMessage(chatId, {
            text: `📊 *Current APIs in ${category}:*\n${availableAPIs.map(api => `• ${api}`).join('\n')}`
        }, { quoted: message });

    } catch (err) {
        console.error('Add API command error:', err);
        await sock.sendMessage(chatId, {
            text: `❌ Error adding API: ${err.message}`
        }, { quoted: message });
    }
}

module.exports = addApiCommand;