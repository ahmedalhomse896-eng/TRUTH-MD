const fetch = require('node-fetch');
const settings = require('../settings');

async function forkCommand(sock, chatId, message) {
    const fkontak = {
        key: {
            participants: "0@s.whatsapp.net",
            remoteJid: "status@broadcast",
            fromMe: false,
            id: "TRUTH-MD-FORK"
        },
        message: {
            contactMessage: {
                vcard: `BEGIN:VCARD\nVERSION:3.0\nN:Sy;Bot;;;\nFN:TRUTH MD\nitem1.TEL;waid=${message.key.participant?.split('@')[0] || message.key.remoteJid.split('@')[0]}:${message.key.participant?.split('@')[0] || message.key.remoteJid.split('@')[0]}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
            }
        },
        participant: "0@s.whatsapp.net"
    };

    try {
        const repoPath = settings.githubRepo || 'Courtney250/TRUTH-MD';
        const repoUrl = `https://github.com/${repoPath}`;
        const forkUrl = `${repoUrl}/fork`;

        const res = await fetch(`https://api.github.com/repos/${repoPath}`, {
            headers: { 'User-Agent': 'TRUTH-MD-Bot/1.0' }
        });

        let forks = 0;
        let stars = 0;
        if (res.ok) {
            const json = await res.json();
            forks = json.forks_count || 0;
            stars = json.stargazers_count || 0;
        }

        const pushname = message.pushName || "User";

        let txt = `🍴  \`𝙵𝙾𝚁𝙺 𝚃𝚁𝚄𝚃𝙷-𝙼𝙳\`\n\n`;
        txt += `Hey @${pushname}! Fork the official TRUTH-MD repo to get your own copy.\n\n`;
        txt += `🔗 *Fork here:*\n${forkUrl}\n\n`;
        txt += `📊 *Current Stats:*\n`;
        txt += `   ⭐ Stars: ${stars}\n`;
        txt += `   🍴 Forks: ${forks}\n\n`;
        txt += `📋 *How to deploy:*\n`;
        txt += `1. Click the fork link above\n`;
        txt += `2. Click "Create Fork" on GitHub\n`;
        txt += `3. Deploy to Heroku/Panel/Replit\n`;
        txt += `4. Set your SESSION_ID and start\n\n`;
        txt += `🌟 Don't forget to ⭐ star the repo!`;

        await sock.sendMessage(chatId, {
            text: txt,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: false,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363409714698622@newsletter',
                    newsletterName: 'TRUTH-MD Official',
                    serverMessageId: -1
                }
            }
        }, { quoted: fkontak });

        await sock.sendMessage(chatId, {
            react: { text: '🍴', key: message.key }
        });

    } catch (error) {
        console.error('Fork command error:', error.message);
        await sock.sendMessage(chatId, { text: '❌ Error generating fork link.' }, { quoted: message });
    }
}

module.exports = forkCommand;
