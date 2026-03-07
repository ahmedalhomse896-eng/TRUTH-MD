const { resolveToPhoneJid } = require('../lib/index');

async function approveAllCommand(sock, chatId, message) {
    try {
        if (!chatId.endsWith('@g.us')) {
            return await sock.sendMessage(chatId, {
                text: '❌ This command only works in groups!'
            }, { quoted: message });
        }

        const requests = await sock.groupRequestParticipantsList(chatId);

        if (!requests || requests.length === 0) {
            return await sock.sendMessage(chatId, {
                text: '📭 No pending join requests for this group.'
            }, { quoted: message });
        }

        const participants = requests.map(r => r.jid);

        const result = await sock.groupRequestParticipantsUpdate(
            chatId,
            participants,
            'approve'
        );

        const approved = result ? result.filter(r => r.status === '200' || r.status === 200).length : participants.length;

        await sock.sendMessage(chatId, {
            text: `✅ Approved ${approved} pending join request(s)!`
        }, { quoted: message });

    } catch (error) {
        console.error('approveAll error:', error.message);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to approve requests. Make sure the bot is a group admin.'
        }, { quoted: message });
    }
}

async function rejectAllCommand(sock, chatId, message) {
    try {
        if (!chatId.endsWith('@g.us')) {
            return await sock.sendMessage(chatId, {
                text: '❌ This command only works in groups!'
            }, { quoted: message });
        }

        const requests = await sock.groupRequestParticipantsList(chatId);

        if (!requests || requests.length === 0) {
            return await sock.sendMessage(chatId, {
                text: '📭 No pending join requests to reject.'
            }, { quoted: message });
        }

        const participants = requests.map(r => r.jid);

        const result = await sock.groupRequestParticipantsUpdate(
            chatId,
            participants,
            'reject'
        );

        const rejected = result ? result.filter(r => r.status === '200' || r.status === 200).length : participants.length;

        await sock.sendMessage(chatId, {
            text: `❌ Rejected ${rejected} pending join request(s).`
        }, { quoted: message });

    } catch (error) {
        console.error('rejectAll error:', error.message);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to reject requests. Make sure the bot is a group admin.'
        }, { quoted: message });
    }
}

async function pendingRequestsCommand(sock, chatId, message) {
    try {
        if (!chatId.endsWith('@g.us')) {
            return await sock.sendMessage(chatId, {
                text: '❌ This command only works in groups!'
            }, { quoted: message });
        }

        const requests = await sock.groupRequestParticipantsList(chatId);

        if (!requests || requests.length === 0) {
            return await sock.sendMessage(chatId, {
                text: '📭 No pending join requests for this group.'
            }, { quoted: message });
        }

        let text = `📋 *Pending Join Requests: ${requests.length}*\n\n`;
        const mentions = [];

        requests.forEach((req, index) => {
            const jid = req.jid;
            const phone = jid.split('@')[0];
            text += `${index + 1}. @${phone}\n`;
            mentions.push(jid);
        });

        text += `\n💡 *Commands:*\n• approveall — approve all requests\n• rejectall — reject all requests`;

        await sock.sendMessage(chatId, {
            text: text,
            mentions: mentions
        }, { quoted: message });

    } catch (error) {
        console.error('pendingRequests error:', error.message);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to fetch pending requests. Make sure the bot is a group admin.'
        }, { quoted: message });
    }
}

module.exports = {
    pendingRequestsCommand,
    approveAllCommand,
    rejectAllCommand
};
