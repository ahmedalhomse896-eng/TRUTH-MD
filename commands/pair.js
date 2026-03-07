const axios = require('axios');

const PAIR_API = 'https://web-production-a554.up.railway.app/code';

async function pairCommand(sock, chatId, message, pairArgs) {
    try {
        const messageText = message?.message?.conversation || message?.message?.extendedTextMessage?.text || '';
        const phoneNumber = (pairArgs || messageText.split(' ').slice(1).join(' ') || '').replace(/[^0-9]/g, '');

        if (!phoneNumber) {
            await sock.sendMessage(chatId, {
                text: "❌ Please provide a phone number!\nExample: .pair 254743XXXXXX"
            });
            return;
        }

        console.log('[PAIR] Requesting code for:', phoneNumber);
        await sock.sendMessage(chatId, {
            text: "🔄 Generating pairing code, please wait..."
        });

        const res = await axios.get(PAIR_API, {
            params: { number: phoneNumber },
            timeout: 30000
        });

        console.log('[PAIR] API response:', JSON.stringify(res.data));
        const code = res.data?.code;

        if (!code || code === 'Please provide a phone number') {
            await sock.sendMessage(chatId, {
                text: "❌ Failed to generate pairing code. Please check the number and try again."
            });
            return;
        }

        const formatted = code.includes('-') ? code : (code.match(/.{1,4}/g)?.join('-') || code);

        const bodyText = `╔══════════════════╗\n║  *TRUTH-MD PAIRING*  ║\n╚══════════════════╝\n\n` +
            `📱 *Phone:* +${phoneNumber}\n` +
            `🔑 *Code:* \`\`\`${formatted}\`\`\`\n\n` +
            `📚 *How to link:*\n` +
            `1. Open WhatsApp → Settings → Linked Devices\n` +
            `2. Tap "Link a Device"\n` +
            `3. Select "Link with phone number"\n` +
            `4. Enter the code above\n\n` +
            `⏳ Code valid for *2 minutes*.\n` +
            `📩 Your SESSION_ID will be sent here once linked.\n\n` +
            `_© TRUTH-MD Bot_`;

        await sock.sendMessage(chatId, { text: bodyText }, { quoted: message });

        await sock.sendMessage(chatId, { text: formatted });
        console.log('[PAIR] Pairing code sent successfully');

    } catch (error) {
        console.error('Pair command error:', error.message || error);
        await sock.sendMessage(chatId, {
            text: "❌ Error generating pairing code. The pairing server might be starting up — try again in a minute."
        });
    }
}

module.exports = pairCommand;
