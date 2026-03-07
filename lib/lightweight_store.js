const fs = require('fs');
const path = require('path');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

const STORE_FILE = path.join(__dirname, '..', 'baileys_store.json');
const settings = require('../settings');
const MAX_MESSAGES = settings.maxStoreMessages || 20;

function buildLidMapFromContacts(contacts) {
    try {
        const { updateLidMap } = require('./index');
        const entries = [];
        for (const [id, c] of Object.entries(contacts)) {
            if (c.id && c.lid) {
                entries.push({ id: c.id, lid: c.lid });
            }
        }
        if (entries.length > 0) updateLidMap(entries);
    } catch (_) {}
}

const store = {
    chats: {},
    contacts: {},
    messages: {},

    bind(ev) {
        ev.on('chats.upsert', (newChats) => {
            for (const chat of newChats) {
                store.chats[chat.id] = { ...(store.chats[chat.id] || {}), ...chat };
            }
        });

        ev.on('chats.update', (updates) => {
            for (const update of updates) {
                if (store.chats[update.id]) {
                    Object.assign(store.chats[update.id], update);
                }
            }
        });

        ev.on('contacts.upsert', (contacts) => {
            const newEntries = [];
            for (const contact of contacts) {
                store.contacts[contact.id] = { ...(store.contacts[contact.id] || {}), ...contact };
                if (contact.id && contact.lid) {
                    newEntries.push({ id: contact.id, lid: contact.lid });
                }
            }
            if (newEntries.length > 0) {
                try { const { updateLidMap } = require('./index'); updateLidMap(newEntries); } catch (_) {}
            }
        });

        ev.on('contacts.update', (updates) => {
            for (const update of updates) {
                if (store.contacts[update.id]) {
                    Object.assign(store.contacts[update.id], update);
                    if (update.lid) {
                        try { const { updateLidMap } = require('./index'); updateLidMap([{ id: update.id, lid: update.lid }]); } catch (_) {}
                    }
                }
            }
        });

        ev.on('messages.upsert', ({ messages: newMessages, type }) => {
            for (const msg of newMessages) {
                const jid = jidNormalizedUser(msg.key.remoteJid);
                if (!store.messages[jid]) store.messages[jid] = [];

                const liteMsg = { ...msg };
                if (liteMsg.message) {
                    const m = { ...liteMsg.message };
                    for (const k of Object.keys(m)) {
                        if (m[k] && typeof m[k] === 'object') {
                            const v = { ...m[k] };
                            delete v.jpegThumbnail;
                            delete v.thumbnailDirectPath;
                            delete v.mediaKey;
                            delete v.directPath;
                            delete v.thumbnailSha256;
                            delete v.thumbnailEncSha256;
                            m[k] = v;
                        }
                    }
                    liteMsg.message = m;
                }

                const existing = store.messages[jid].findIndex(m => m.key.id === msg.key.id);
                if (existing >= 0) {
                    store.messages[jid][existing] = liteMsg;
                } else {
                    store.messages[jid].push(liteMsg);
                    if (store.messages[jid].length > MAX_MESSAGES) {
                        store.messages[jid] = store.messages[jid].slice(-MAX_MESSAGES);
                    }
                }
            }
        });

        ev.on('messages.update', (updates) => {
            for (const { key, update } of updates) {
                const jid = jidNormalizedUser(key.remoteJid);
                if (store.messages[jid]) {
                    const msg = store.messages[jid].find(m => m.key.id === key.id);
                    if (msg) Object.assign(msg, update);
                }
            }
        });
    },

    loadMessage(jid, id) {
        const normalJid = jidNormalizedUser(jid);
        const msgs = store.messages[normalJid] || [];
        return msgs.find(m => m.key.id === id) || null;
    },

    readFromFile() {
        try {
            if (fs.existsSync(STORE_FILE)) {
                const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
                if (data.chats) store.chats = data.chats;
                if (data.contacts) store.contacts = data.contacts;
                if (data.messages) store.messages = data.messages;
                if (data.contacts) buildLidMapFromContacts(data.contacts);
            }
        } catch (e) {
            console.error('Store readFromFile error:', e.message);
        }
    },

    writeToFile() {
        try {
            const data = {
                chats: store.chats,
                contacts: store.contacts,
                messages: store.messages
            };
            fs.writeFileSync(STORE_FILE, JSON.stringify(data));
        } catch (e) {
            console.error('Store writeToFile error:', e.message);
        }
    },

    cleanupMessages() {
        try {
            const chatIds = Object.keys(store.messages);
            let totalMsgs = 0;
            for (const jid of chatIds) {
                if (store.messages[jid].length > MAX_MESSAGES) {
                    store.messages[jid] = store.messages[jid].slice(-MAX_MESSAGES);
                }
                totalMsgs += store.messages[jid].length;
                if (store.messages[jid].length === 0) {
                    delete store.messages[jid];
                }
            }
            if (chatIds.length > 500) {
                const sorted = chatIds.sort((a, b) => {
                    const lastA = store.messages[a]?.[store.messages[a].length - 1]?.messageTimestamp || 0;
                    const lastB = store.messages[b]?.[store.messages[b].length - 1]?.messageTimestamp || 0;
                    return lastA - lastB;
                });
                const toRemove = sorted.slice(0, chatIds.length - 500);
                for (const jid of toRemove) {
                    delete store.messages[jid];
                }
            }
        } catch (e) {
            console.error('Store cleanup error:', e.message);
        }
    }
};

module.exports = store;
