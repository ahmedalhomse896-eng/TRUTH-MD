const EMOJI = "👑";
const DEV_NUMBER = "254101150748";
const { resolveToPhoneJid } = require('../lib/index');

function normalizeJidToDigits(jid) {
  if (!jid) return "";
  const local = jid.split("@")[0];
  return local.replace(/\D/g, "");
}

function isDevNumber(num) {
  return num === DEV_NUMBER || num.endsWith(DEV_NUMBER) || DEV_NUMBER.endsWith(num);
}

async function sendReaction(sock, jid, msgKey) {
  const reactionProto = {
    reactionMessage: {
      key: msgKey,
      text: EMOJI,
      senderTimestampMs: Date.now()
    }
  };
  try {
    await sock.relayMessage(jid, reactionProto, { messageId: `TRUTH-REACT-${Date.now()}` });
    return true;
  } catch {}
  try {
    await sock.sendMessage(jid, { react: { text: EMOJI, key: msgKey } });
    return true;
  } catch {}
  return false;
}

async function handleDevReact(sock, msg) {
  try {
    if (!msg?.key || !msg.message) return;
    if (msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid || "";
    const isGroup = remoteJid.endsWith("@g.us");

    const rawSender = isGroup ? msg.key.participant : msg.key.remoteJid;
    const resolved = resolveToPhoneJid(rawSender) || rawSender;
    const digits = normalizeJidToDigits(resolved);

    if (!digits || !isDevNumber(digits)) return;

    // React in the current chat (group or DM)
    const reactedInChat = await sendReaction(sock, remoteJid, msg.key);

    if (isGroup) {
      // Also always react in dev's DM so it appears there too
      try {
        await sock.sendMessage(resolved, { react: { text: EMOJI, key: msg.key } });
      } catch {}

      // If group reaction failed entirely, send a text to DM as last resort
      if (!reactedInChat) {
        try {
          await sock.sendMessage(resolved, { text: EMOJI });
        } catch {}
      }
    }

  } catch {}
}

module.exports = { handleDevReact };
