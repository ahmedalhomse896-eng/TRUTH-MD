const fs = require('fs');
const path = require('path');

const SOCKET_FILE = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Socket', 'socket.js');
const CHATS_FILE = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Socket', 'chats.js');
const MESSAGES_RECV_FILE = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Socket', 'messages-recv.js');

function patchSocket() {
    if (!fs.existsSync(SOCKET_FILE)) { console.log('[patch-baileys] socket.js not found, skipping'); return; }
    let code = fs.readFileSync(SOCKET_FILE, 'utf-8');

    if (code.includes('// [PATCHED] event buffer disabled')) {
        console.log('[patch-baileys] socket.js already patched');
        return;
    }

    let patched = false;

    const bufferBlock = /if \(creds\.me\?\.id\) \{\s*\/\/ start buffering important events\s*\/\/ if we're logged in\s*ev\.buffer\(\);\s*didStartBuffer = true;\s*\}/;
    if (bufferBlock.test(code)) {
        code = code.replace(bufferBlock, '// [PATCHED] event buffer disabled\n            didStartBuffer = false;');
        patched = true;
    }

    const offlineFlush = /if \(didStartBuffer\) \{\s*ev\.flush\(\);\s*logger\.trace\('flushed events for initial buffer'\);\s*\}/;
    if (offlineFlush.test(code)) {
        code = code.replace(offlineFlush, '// [PATCHED] no buffer to flush');
        patched = true;
    }

    code = code.replace(
        /if \(!offlineHandled && didStartBuffer\) \{/,
        'if (!offlineHandled) {'
    );

    code = code.replace(
        "logger.warn('CB:ib,,offline never fired, force-flushing buffer and signaling readiness');",
        "logger.warn('CB:ib,,offline never fired, signaling readiness');"
    );

    const forceFlushLine = /offlineHandled = true;\s*ev\.flush\(\);\s*ev\.emit\('connection\.update'/;
    if (forceFlushLine.test(code)) {
        code = code.replace(forceFlushLine, "offlineHandled = true;\n            ev.emit('connection.update'");
        patched = true;
    }

    if (patched) {
        fs.writeFileSync(SOCKET_FILE, code, 'utf-8');
        console.log('[patch-baileys] socket.js patched - event buffering disabled');
    } else {
        console.log('[patch-baileys] socket.js - no matching patterns found');
    }
}

function patchChats() {
    if (!fs.existsSync(CHATS_FILE)) { console.log('[patch-baileys] chats.js not found, skipping'); return; }
    let code = fs.readFileSync(CHATS_FILE, 'utf-8');

    if (code.includes('Skipping AwaitingInitialSync')) {
        console.log('[patch-baileys] chats.js already patched');
        return;
    }

    const syncBlock = /syncState = SyncState\.AwaitingInitialSync;\s*logger\.info\('Connection is now AwaitingInitialSync, buffering events'\);\s*ev\.buffer\(\);[\s\S]*?(?=\s*\}\);)/;

    if (syncBlock.test(code)) {
        code = code.replace(syncBlock,
            "syncState = SyncState.Online;\n        logger.info('Skipping AwaitingInitialSync \\u2014 transitioning directly to Online (no buffering).');\n        try { ev.flush(); } catch(_) {}"
        );
        fs.writeFileSync(CHATS_FILE, code, 'utf-8');
        console.log('[patch-baileys] chats.js patched - AwaitingInitialSync bypassed');
    } else {
        console.log('[patch-baileys] chats.js - no matching patterns found (may already be patched differently)');
    }
}

function patchMessagesRecv() {
    if (!fs.existsSync(MESSAGES_RECV_FILE)) { console.log('[patch-baileys] messages-recv.js not found, skipping'); return; }
    let recvContent = fs.readFileSync(MESSAGES_RECV_FILE, 'utf-8');

    if (!recvContent.includes('// silenced mex newsletter')) {
        recvContent = recvContent.replace(
            "logger.warn({ node }, 'Invalid mex newsletter notification');",
            '// silenced mex newsletter\n            return;'
        );
        recvContent = recvContent.replace(
            "logger.warn({ data }, 'Invalid mex newsletter notification content');",
            '// silenced mex newsletter content\n            return;'
        );
        fs.writeFileSync(MESSAGES_RECV_FILE, recvContent, 'utf-8');
        console.log('[patch-baileys] Silenced mex newsletter notification warnings');
    } else {
        console.log('[patch-baileys] Newsletter warnings already silenced');
    }
}

function patchSessionCipher() {
    const SESSION_CIPHER_FILE = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'node_modules', 'libsignal', 'src', 'session_cipher.js');
    if (!fs.existsSync(SESSION_CIPHER_FILE)) { console.log('[patch-baileys] session_cipher.js not found, skipping'); return; }
    let cipherContent = fs.readFileSync(SESSION_CIPHER_FILE, 'utf-8');

    if (!cipherContent.includes('// silenced decrypt errors')) {
        cipherContent = cipherContent.replace(
            'console.error("Failed to decrypt message with any known session...");',
            '// silenced decrypt errors'
        );
        cipherContent = cipherContent.replace(
            'console.error("Session error:" + e, e.stack);',
            '// silenced session error log'
        );
        fs.writeFileSync(SESSION_CIPHER_FILE, cipherContent, 'utf-8');
        console.log('[patch-baileys] Silenced libsignal decrypt error console logs');
    } else {
        console.log('[patch-baileys] libsignal decrypt errors already silenced');
    }
}

function patchSendDiagnostics() {
    if (!fs.existsSync(SOCKET_FILE)) return;
    let code = fs.readFileSync(SOCKET_FILE, 'utf-8');

    if (code.includes('// [PATCHED] send diagnostics')) {
        console.log('[patch-baileys] send diagnostics already patched');
        return;
    }

    // Patch sendRawMessage to log ws.isOpen state and any send errors
    const original = `    const sendRawMessage = async (data) => {
        if (!ws.isOpen) {
            throw new boom_1.Boom('Connection Closed', { statusCode: Types_1.DisconnectReason.connectionClosed });
        }
        const bytes = noise.encodeFrame(data);
        await (0, Utils_1.promiseTimeout)(connectTimeoutMs, async (resolve, reject) => {
            try {
                await sendPromise.call(ws, bytes);
                resolve();
            }
            catch (error) {
                reject(error);
            }
        });
    };`;

    const patched = `    // [PATCHED] send diagnostics
    const sendRawMessage = async (data) => {
        if (!ws.isOpen) {
            console.error('[TRUTH-MD] sendRawMessage BLOCKED: ws.isOpen=false (connection closed), bytes:', data && data.length);
            throw new boom_1.Boom('Connection Closed', { statusCode: Types_1.DisconnectReason.connectionClosed });
        }
        const bytes = noise.encodeFrame(data);
        await (0, Utils_1.promiseTimeout)(connectTimeoutMs, async (resolve, reject) => {
            try {
                await sendPromise.call(ws, bytes);
                resolve();
            }
            catch (error) {
                console.error('[TRUTH-MD] sendRawMessage FAILED:', error && error.message);
                reject(error);
            }
        });
    };`;

    if (code.includes(original)) {
        code = code.replace(original, patched);
        fs.writeFileSync(SOCKET_FILE, code, 'utf-8');
        console.log('[patch-baileys] send diagnostics patched into socket.js');
    } else {
        console.log('[patch-baileys] send diagnostics: pattern not matched in socket.js');
    }
}

const MESSAGES_SEND_FILE = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Socket', 'messages-send.js');

function patchRelaySendDiagnostics() {
    if (!fs.existsSync(MESSAGES_SEND_FILE)) { console.log('[patch-baileys] messages-send.js not found'); return; }
    let code = fs.readFileSync(MESSAGES_SEND_FILE, 'utf-8');

    if (code.includes('// [PATCHED] relay diagnostics')) {
        console.log('[patch-baileys] relay diagnostics already patched');
        return;
    }

    // Wrap sendMessage to log call + errors
    const original = `        sendMessage: async (jid, content, options = {}) => {`;
    const patched = `        // [PATCHED] relay diagnostics
        sendMessage: async (jid, content, options = {}) => {
            console.log('[TRUTH-MD] sendMessage called → jid:', jid, 'type:', content && Object.keys(content)[0]);`;

    if (code.includes(original)) {
        code = code.replace(original, patched);
        fs.writeFileSync(MESSAGES_SEND_FILE, code, 'utf-8');
        console.log('[patch-baileys] relay diagnostics patched into messages-send.js');
    } else {
        console.log('[patch-baileys] relay diagnostics: sendMessage pattern not matched');
    }
}

function findRelayFile(filename) {
    const xsqlite3Dir = path.join(__dirname, '..', 'node_modules', 'xsqlite3');
    if (!fs.existsSync(xsqlite3Dir)) return null;
    function walk(dir, depth) {
        if (depth > 60) return null;
        try {
            const entries = fs.readdirSync(dir);
            for (const entry of entries) {
                const full = path.join(dir, entry);
                if (entry === filename) return full;
                try {
                    if (fs.statSync(full).isDirectory()) {
                        const found = walk(full, depth + 1);
                        if (found) return found;
                    }
                } catch (_) {}
            }
        } catch (_) {}
        return null;
    }
    return walk(xsqlite3Dir, 0);
}

function patchCommandSpeed() {
    const mainFile = findRelayFile('main.js');
    if (!mainFile) { console.log('[patch-baileys] main.js not found in relay'); return; }

    let code = fs.readFileSync(mainFile, 'utf-8');

    if (code.includes('// [PATCHED] pre-command delay removed')) {
        console.log('[patch-baileys] main.js command speed already patched');
        return;
    }

    let patched = false;

    // Remove the 1000-1800ms pre-command typing wait
    const preDelay = `        // For DMs: show typing indicator BEFORE command executes so it feels natural
        if (!isGroup && isAutotypingEnabled()) {
            try {
                await sock.sendPresenceUpdate('composing', chatId);
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 800));
            } catch (_) {}
        }`;
    const preDelayPatched = `        // [PATCHED] pre-command delay removed — respond instantly
        if (!isGroup && isAutotypingEnabled()) {
            try { await sock.sendPresenceUpdate('composing', chatId); } catch (_) {}
        }`;
    if (code.includes(preDelay)) {
        code = code.replace(preDelay, preDelayPatched);
        patched = true;
    }

    // Remove post-command typing/recording status calls
    const postDelay = `            // Command was executed, now show typing/recording status after command execution
            await showTypingAfterCommand(sock, chatId);
            showRecordingAfterCommand(sock, chatId).catch(() => {});`;
    const postDelayPatched = `            // [PATCHED] post-command typing/recording removed for speed`;
    if (code.includes(postDelay)) {
        code = code.replace(postDelay, postDelayPatched);
        patched = true;
    }

    if (patched) {
        fs.writeFileSync(mainFile, code, 'utf-8');
        console.log('[patch-baileys] main.js patched - command response delays removed');
    } else {
        console.log('[patch-baileys] main.js - delay patterns not matched');
    }
}

function patchOwnerDisplay() {
    const setownerFile = findRelayFile('setowner.js');
    const helpFile = findRelayFile('help.js');

    // Patch setowner.js: change default name from 'Not Set!' to ''
    if (setownerFile) {
        let code = fs.readFileSync(setownerFile, 'utf-8');
        if (code.includes('// [PATCHED] owner default empty')) {
            console.log('[patch-baileys] setowner.js already patched');
        } else {
            const orig = `const DEFAULT_OWNER_NAME = 'Not Set!';`;
            const patched = `// [PATCHED] owner default empty\nconst DEFAULT_OWNER_NAME = 'Not Set';`;
            if (code.includes(orig)) {
                code = code.replace(orig, patched);
                fs.writeFileSync(setownerFile, code, 'utf-8');
                console.log('[patch-baileys] setowner.js patched - owner default set to empty');
            } else {
                console.log('[patch-baileys] setowner.js - DEFAULT_OWNER_NAME pattern not found');
            }
        }
    } else {
        console.log('[patch-baileys] setowner.js not found in relay');
    }

    // Patch help.js: skip Owner line when name is empty
    if (helpFile) {
        let code = fs.readFileSync(helpFile, 'utf-8');
        if (code.includes('// [PATCHED] owner line conditional')) {
            console.log('[patch-baileys] help.js owner line already patched');
        } else {
            const orig = `    menu += \`◆ *Owner:* \${newOwner}\\n\`;`;
            const patched = `    // [PATCHED] owner line conditional\n    if (newOwner) menu += \`◆ *Owner:* \${newOwner}\\n\`;`;
            if (code.includes(orig)) {
                code = code.replace(orig, patched);
                fs.writeFileSync(helpFile, code, 'utf-8');
                console.log('[patch-baileys] help.js patched - owner line hidden when empty');
            } else {
                console.log('[patch-baileys] help.js - owner menu line pattern not found');
            }
        }
    } else {
        console.log('[patch-baileys] help.js not found in relay');
    }
}

function patchOwnerAccess() {
    const libIndexFile = findRelayFile('index.js');
    // We need lib/index.js specifically (has isSudo), not the root index.js
    // findRelayFile returns the FIRST match — check if it has isSudo
    let libFile = null;
    const xsqlite3Dir = path.join(__dirname, '..', 'node_modules', 'xsqlite3');
    function findLibIndex(dir, depth) {
        if (depth > 60) return null;
        try {
            const entries = fs.readdirSync(dir);
            for (const entry of entries) {
                const full = path.join(dir, entry);
                if (entry === 'index.js') {
                    const content = fs.readFileSync(full, 'utf-8');
                    if (content.includes('async function isSudo')) return full;
                }
                try {
                    if (fs.statSync(full).isDirectory()) {
                        const found = findLibIndex(full, depth + 1);
                        if (found) return found;
                    }
                } catch (_) {}
            }
        } catch (_) {}
        return null;
    }
    libFile = findLibIndex(xsqlite3Dir, 0);

    if (!libFile) { console.log('[patch-baileys] lib/index.js (isSudo) not found'); return; }

    let code = fs.readFileSync(libFile, 'utf-8');
    if (code.includes('// [PATCHED] owner access - connected number')) {
        console.log('[patch-baileys] isSudo already patched for owner access');
        return;
    }

    // Add connected socket's phone number + OWNER_NUMBER to sudo check
    const orig = `    for (const num of ownerNumbers) {
        if (!num) continue;
        if (senderId === num + '@s.whatsapp.net' || senderNum === num) return true;
    }`;
    const patched = `    // [PATCHED] owner access - connected number always treated as owner
    try {
        const connId = global.currentSocket?.user?.id;
        if (connId) {
            const connNum = connId.split(':')[0].split('@')[0];
            if (connNum && !ownerNumbers.includes(connNum)) ownerNumbers.push(connNum);
        }
    } catch (_) {}
    for (const num of ownerNumbers) {
        if (!num) continue;
        if (senderId === num + '@s.whatsapp.net' || senderNum === num) return true;
    }`;

    if (code.includes(orig)) {
        code = code.replace(orig, patched);
        fs.writeFileSync(libFile, code, 'utf-8');
        console.log('[patch-baileys] isSudo patched - connected number always has owner access');
    } else {
        console.log('[patch-baileys] isSudo - owner access pattern not matched');
    }
}

function patchConnectionMessage() {
    const relayIndexFile = (() => {
        const xsqlite3Dir = path.join(__dirname, '..', 'node_modules', 'xsqlite3');
        function findRootIndex(dir, depth) {
            if (depth > 60) return null;
            try {
                const entries = fs.readdirSync(dir);
                for (const entry of entries) {
                    const full = path.join(dir, entry);
                    if (entry === 'index.js') {
                        const content = fs.readFileSync(full, 'utf-8');
                        if (content.includes('connectionMessageSent') && content.includes('sendWelcomeMessage')) return full;
                    }
                    try {
                        if (fs.statSync(full).isDirectory()) {
                            const found = findRootIndex(full, depth + 1);
                            if (found) return found;
                        }
                    } catch (_) {}
                }
            } catch (_) {}
            return null;
        }
        return findRootIndex(xsqlite3Dir, 0);
    })();

    if (!relayIndexFile) { console.log('[patch-baileys] relay index.js (connectionMessageSent) not found'); return; }

    let code = fs.readFileSync(relayIndexFile, 'utf-8');
    if (code.includes('// [PATCHED] always send connection msg to owner')) {
        console.log('[patch-baileys] connection message already patched');
        return;
    }

    // Always send to OWNER_NUMBER — remove the !== pNumber guard
    const orig = `                const envOwner = (process.env.OWNER_NUMBER || '').trim();
                if (envOwner && envOwner + '@s.whatsapp.net' !== pNumber) {
                    await XeonBotInc.sendMessage(envOwner + '@s.whatsapp.net', { text: connectionMsg }).catch(() => {});
                }`;
    const patched = `                // [PATCHED] always send connection msg to owner
                const envOwner = (process.env.OWNER_NUMBER || '').trim();
                if (envOwner) {
                    await XeonBotInc.sendMessage(envOwner + '@s.whatsapp.net', { text: connectionMsg }).catch(e => console.error('[TRUTH-MD] Connection msg to owner failed:', e.message));
                }`;

    if (code.includes(orig)) {
        code = code.replace(orig, patched);
        fs.writeFileSync(relayIndexFile, code, 'utf-8');
        console.log('[patch-baileys] connection message patched - always sends to OWNER_NUMBER');
    } else {
        console.log('[patch-baileys] connection message - pattern not matched');
    }
}

function patchOwnerAlwaysAccess() {
    const xsqlite3Dir = path.join(__dirname, '..', 'node_modules', 'xsqlite3');
    let mainFile = null;
    function findMainJs(dir, depth) {
        if (depth > 60) return null;
        try {
            const entries = fs.readdirSync(dir);
            for (const entry of entries) {
                const full = path.join(dir, entry);
                if (entry === 'main.js') {
                    const content = fs.readFileSync(full, 'utf-8');
                    if (content.includes('senderIsSudo') && content.includes('isSudo')) return full;
                }
                try {
                    if (fs.statSync(full).isDirectory()) {
                        const found = findMainJs(full, depth + 1);
                        if (found) return found;
                    }
                } catch (_) {}
            }
        } catch (_) {}
        return null;
    }
    mainFile = findMainJs(xsqlite3Dir, 0);
    if (!mainFile) { console.log('[patch-baileys] main.js (senderIsSudo) not found'); return; }

    let code = fs.readFileSync(mainFile, 'utf-8');
    if (code.includes('// [PATCHED] owner always access')) {
        console.log('[patch-baileys] main.js owner always access already patched');
        return;
    }

    const orig = `        const resolvedSenderId = resolveToPhoneJid(senderId);
        const senderIsSudo = await isSudo(resolvedSenderId);`;
    const patched = `        const resolvedSenderId = resolveToPhoneJid(senderId);
        // [PATCHED] owner always access
        let senderIsSudo = await isSudo(resolvedSenderId);
        if (!senderIsSudo) {
            try {
                const _ownerNum = (process.env.OWNER_NUMBER || '').trim();
                const _senderNum = (resolvedSenderId || '').split('@')[0];
                const _connId = global.currentSocket?.user?.id || '';
                const _connNum = _connId.split(':')[0].split('@')[0];
                if (message.key.fromMe === true) senderIsSudo = true;
                else if (_ownerNum && _senderNum === _ownerNum) senderIsSudo = true;
                else if (_connNum && _senderNum === _connNum) senderIsSudo = true;
            } catch (_) {}
        }`;

    if (code.includes(orig)) {
        code = code.replace(orig, patched);
        fs.writeFileSync(mainFile, code, 'utf-8');
        console.log('[patch-baileys] main.js patched - owner always has sudo access (fromMe + OWNER_NUMBER + connected number)');
    } else {
        console.log('[patch-baileys] main.js owner always access - pattern not matched');
    }
}

function patchConnectionMessageReliable() {
    const xsqlite3Dir = path.join(__dirname, '..', 'node_modules', 'xsqlite3');
    let relayIndexFile = null;
    function findRelayIdx(dir, depth) {
        if (depth > 60) return null;
        try {
            const entries = fs.readdirSync(dir);
            for (const entry of entries) {
                const full = path.join(dir, entry);
                if (entry === 'index.js') {
                    const content = fs.readFileSync(full, 'utf-8');
                    if (content.includes('connectionMessageSent') && content.includes('sendWelcomeMessage')) return full;
                }
                try {
                    if (fs.statSync(full).isDirectory()) {
                        const found = findRelayIdx(full, depth + 1);
                        if (found) return found;
                    }
                } catch (_) {}
            }
        } catch (_) {}
        return null;
    }
    relayIndexFile = findRelayIdx(xsqlite3Dir, 0);
    if (!relayIndexFile) { console.log('[patch-baileys] relay index.js for reliable conn msg not found'); return; }

    let code = fs.readFileSync(relayIndexFile, 'utf-8');
    if (code.includes('// [PATCHED] reliable connection message')) {
        console.log('[patch-baileys] connection message reliability already patched');
        return;
    }

    // Fix: wrap the self-send in its own .catch() so that if it fails,
    // the owner send still runs; also add a 3s delay so Baileys is ready
    const orig = `                await XeonBotInc.sendMessage(pNumber, { text: connectionMsg });
                // [PATCHED] always send connection msg to owner
                const envOwner = (process.env.OWNER_NUMBER || '').trim();
                if (envOwner) {
                    await XeonBotInc.sendMessage(envOwner + '@s.whatsapp.net', { text: connectionMsg }).catch(e => console.error('[TRUTH-MD] Connection msg to owner failed:', e.message));
                }`;
    const patched = `                // [PATCHED] reliable connection message
                // Wait 3s for Baileys to fully stabilize before sending
                await new Promise(r => setTimeout(r, 3000));
                // Self-send (Saved Messages) – isolated catch so owner send always runs
                await XeonBotInc.sendMessage(pNumber, { text: connectionMsg }).catch(e => console.error('[TRUTH-MD] Self conn msg failed:', e.message));
                // Owner send – always attempt regardless of self-send result
                const envOwner = (process.env.OWNER_NUMBER || '').trim();
                if (envOwner) {
                    await XeonBotInc.sendMessage(envOwner + '@s.whatsapp.net', { text: connectionMsg }).catch(e => console.error('[TRUTH-MD] Owner conn msg failed:', e.message));
                }`;

    if (code.includes(orig)) {
        code = code.replace(orig, patched);
        fs.writeFileSync(relayIndexFile, code, 'utf-8');
        console.log('[patch-baileys] connection message reliability patched - 3s delay + independent catches');
    } else {
        console.log('[patch-baileys] reliable connection message - pattern not matched');
    }
}

function patchMenuPhoneNumber() {
    const xsqlite3Dir = path.join(__dirname, '..', 'node_modules', 'xsqlite3');
    let helpFile = null;
    function findHelpJs(dir, depth) {
        if (depth > 60) return null;
        try {
            const entries = fs.readdirSync(dir);
            for (const entry of entries) {
                const full = path.join(dir, entry);
                if (entry === 'help.js') {
                    const content = fs.readFileSync(full, 'utf-8');
                    if (content.includes('createFakeContact') && content.includes('vcard')) return full;
                }
                try {
                    if (fs.statSync(full).isDirectory()) {
                        const found = findHelpJs(full, depth + 1);
                        if (found) return found;
                    }
                } catch (_) {}
            }
        } catch (_) {}
        return null;
    }
    helpFile = findHelpJs(xsqlite3Dir, 0);
    if (!helpFile) { console.log('[patch-baileys] help.js (createFakeContact) not found'); return; }

    let code = fs.readFileSync(helpFile, 'utf-8');
    if (code.includes('// [PATCHED] no phone number in menu')) {
        console.log('[patch-baileys] menu phone number already patched');
        return;
    }

    // Replace the dynamic sender phone number in the vcard with a static placeholder
    const orig = `vcard: \`BEGIN:VCARD\\nVERSION:3.0\\nN:Sy;Bot;;;\\nFN: whatsapp bot\\nitem1.TEL;waid=\${message.key.participant?.split('@')[0] || message.key.remoteJid.split('@')[0]}:\${message.key.participant?.split('@')[0] || message.key.remoteJid.split('@')[0]}\\nitem1.X-ABLabel:Ponsel\\nEND:VCARD\``;
    const patched = `// [PATCHED] no phone number in menu\nvcard: \`BEGIN:VCARD\\nVERSION:3.0\\nN:TRUTH;MD;;;\\nFN: TRUTH-MD BOT\\nitem1.TEL;waid=0:0\\nitem1.X-ABLabel:Bot\\nEND:VCARD\``;

    if (code.includes(orig)) {
        code = code.replace(orig, patched);
        fs.writeFileSync(helpFile, code, 'utf-8');
        console.log('[patch-baileys] help.js patched - phone number removed from menu contact card');
    } else {
        console.log('[patch-baileys] help.js menu phone number - pattern not matched, trying regex');
        // Regex fallback for any whitespace variation
        const regex = /vcard:\s*`BEGIN:VCARD[^`]*waid=\$\{[^}]+\}[^`]*END:VCARD`/;
        if (regex.test(code)) {
            code = code.replace(regex, '// [PATCHED] no phone number in menu\nvcard: `BEGIN:VCARD\\nVERSION:3.0\\nN:TRUTH;MD;;;\\nFN: TRUTH-MD BOT\\nitem1.TEL;waid=0:0\\nitem1.X-ABLabel:Bot\\nEND:VCARD`');
            fs.writeFileSync(helpFile, code, 'utf-8');
            console.log('[patch-baileys] help.js patched via regex - phone number removed from menu contact card');
        } else {
            console.log('[patch-baileys] help.js - could not patch menu phone number');
        }
    }
}

function patchGroupDetectionSafety() {
    const xsqlite3Dir = path.join(__dirname, '..', 'node_modules', 'xsqlite3');
    let mainFile = null;
    function findMainJs(dir, depth) {
        if (depth > 60) return null;
        try {
            const entries = fs.readdirSync(dir);
            for (const entry of entries) {
                const full = path.join(dir, entry);
                if (entry === 'main.js') {
                    const content = fs.readFileSync(full, 'utf-8');
                    if (content.includes('handleBadwordDetection') && content.includes('Antilink')) return full;
                }
                try {
                    if (fs.statSync(full).isDirectory()) {
                        const found = findMainJs(full, depth + 1);
                        if (found) return found;
                    }
                } catch (_) {}
            }
        } catch (_) {}
        return null;
    }
    mainFile = findMainJs(xsqlite3Dir, 0);
    if (!mainFile) { console.log('[patch-baileys] main.js for group detection safety not found'); return; }

    let code = fs.readFileSync(mainFile, 'utf-8');
    if (code.includes('// [PATCHED] group detection safety')) {
        console.log('[patch-baileys] group detection safety already patched');
        return;
    }

    // Wrap all the un-try-caught group detection calls so they can never block command processing
    const orig = `        // Check for bad words FIRST, before ANY other processing
        if (isGroup && userMessage) {
            await handleBadwordDetection(sock, chatId, message, userMessage, senderId);
            await Antilink(message, sock);
        }

        if (isGroup) {
            await handleStickerDetection(sock, chatId, message, senderId);
            await handlePhotoDetection(sock, chatId, message, senderId);
            await handleGroupMentionDetection(sock, chatId, message, senderId);
        }`;
    const patched = `        // [PATCHED] group detection safety - wrapped in try-catch so errors never block commands
        if (isGroup && userMessage) {
            try { await handleBadwordDetection(sock, chatId, message, userMessage, senderId); } catch (_) {}
            try { await Antilink(message, sock); } catch (_) {}
        }
        if (isGroup) {
            try { await handleStickerDetection(sock, chatId, message, senderId); } catch (_) {}
            try { await handlePhotoDetection(sock, chatId, message, senderId); } catch (_) {}
            try { await handleGroupMentionDetection(sock, chatId, message, senderId); } catch (_) {}
        }`;

    if (code.includes(orig)) {
        code = code.replace(orig, patched);
        fs.writeFileSync(mainFile, code, 'utf-8');
        console.log('[patch-baileys] group detection calls wrapped in try-catch - errors will never block commands');
    } else {
        console.log('[patch-baileys] group detection safety - pattern not matched');
    }
}

function patchGroupSendRetry() {
    const xsqlite3Dir = path.join(__dirname, '..', 'node_modules', 'xsqlite3');
    let relayFile = null;
    function findRelayIdx(dir, depth) {
        if (depth > 60) return null;
        try {
            const entries = fs.readdirSync(dir);
            for (const entry of entries) {
                const full = path.join(dir, entry);
                if (entry === 'index.js') {
                    const c = fs.readFileSync(full, 'utf-8');
                    if (c.includes('AUTOFONT') && c.includes('_origSendMessage')) return full;
                }
                try {
                    if (fs.statSync(full).isDirectory()) {
                        const found = findRelayIdx(full, depth + 1);
                        if (found) return found;
                    }
                } catch (_) {}
            }
        } catch (_) {}
        return null;
    }
    relayFile = findRelayIdx(xsqlite3Dir, 0);
    if (!relayFile) { console.log('[patch-baileys] relay index.js for group send retry not found'); return; }

    let code = fs.readFileSync(relayFile, 'utf-8');
    if (code.includes('// [PATCHED] group send retry')) {
        console.log('[patch-baileys] group send retry already patched');
        return;
    }

    // Patch the AUTOFONT wrapper to retry group sends once after 3 seconds on failure
    const orig = `        return _origSendMessage(jid, content, options);
    };`;
    const patched = `        // [PATCHED] group send retry - retry group sends once on failure (Signal session warmup)
        if (typeof jid === 'string' && jid.endsWith('@g.us')) {
            try {
                return await _origSendMessage(jid, content, options);
            } catch (e1) {
                try {
                    await new Promise(r => setTimeout(r, 3000));
                    return await _origSendMessage(jid, content, options);
                } catch (e2) {
                    console.error('[TRUTH-MD] group sendMessage retry also failed:', e2.message || e2);
                    throw e2;
                }
            }
        }
        return _origSendMessage(jid, content, options);
    };`;

    if (code.includes(orig)) {
        code = code.replace(orig, patched);
        fs.writeFileSync(relayFile, code, 'utf-8');
        console.log('[patch-baileys] group send retry patched - group replies will retry once on failure');
    } else {
        console.log('[patch-baileys] group send retry - pattern not matched');
    }
}

function patchOsslDecryptError() {
    const xsqlite3Dir = path.join(__dirname, '..', 'node_modules', 'xsqlite3');
    let relayIndexFile = null;
    function findRelayIdx(dir, depth) {
        if (depth > 60) return null;
        try {
            const entries = fs.readdirSync(dir);
            for (const entry of entries) {
                const full = path.join(dir, entry);
                if (entry === 'index.js') {
                    const content = fs.readFileSync(full, 'utf-8');
                    if (content.includes('connectionMessageSent') && content.includes('handleMessages error')) return full;
                }
                try {
                    if (fs.statSync(full).isDirectory()) {
                        const found = findRelayIdx(full, depth + 1);
                        if (found) return found;
                    }
                } catch (_) {}
            }
        } catch (_) {}
        return null;
    }
    relayIndexFile = findRelayIdx(xsqlite3Dir, 0);
    if (!relayIndexFile) { console.log('[patch-baileys] relay index.js for OSSL patch not found'); return; }

    let code = fs.readFileSync(relayIndexFile, 'utf-8');
    if (code.includes('// [PATCHED] OSSL decrypt recovery')) {
        console.log('[patch-baileys] OSSL decrypt error handler already patched');
        return;
    }

    // 1. Patch the messages.upsert error handler to handle ERR_OSSL_BAD_DECRYPT gracefully
    const orig1 = `                        Promise.race([handler, timeout]).catch(e => {
                            console.error(chalk.red(\`[ERROR] handleMessages error:\`), e);
                            log(e.message, 'red', true);
                        });`;
    const patched1 = `                        Promise.race([handler, timeout]).catch(e => {
                            // [PATCHED] OSSL decrypt recovery
                            if (e && (e.code === 'ERR_OSSL_BAD_DECRYPT' || (e.message && e.message.includes('bad decrypt')))) {
                                // Signal session decrypt failure - skip this message silently, session will self-heal
                                console.error('[TRUTH-MD] Signal decrypt error (skipping message) - consider regenerating SESSION_ID if frequent');
                                return;
                            }
                            if (e && e.message && e.message.includes('timed out')) {
                                console.error(chalk.yellow('[WARN] handleMessages timed out'));
                                return;
                            }
                            console.error(chalk.red(\`[ERROR] handleMessages error:\`), e.message || e);
                        });`;

    // 2. Patch downloadSessionData to validate creds.json after writing
    const orig2 = `            const base64Data = global.SESSION_ID.includes("TRUTH-MD:~") ? global.SESSION_ID.split("TRUTH-MD:~")[1] : global.SESSION_ID;
            const sessionData = Buffer.from(base64Data, 'base64');
            await fs.promises.writeFile(credsPath, sessionData);
            // Save the hash so next restart knows this SESSION_ID was already applied
            fs.writeFileSync(sessionIdHashFile, currentHash);
            console.log(chalk.green('Session restored from Base64'));`;
    const patched2 = `            const base64Data = global.SESSION_ID.includes("TRUTH-MD:~") ? global.SESSION_ID.split("TRUTH-MD:~")[1] : global.SESSION_ID;
            const sessionData = Buffer.from(base64Data, 'base64');
            // [PATCHED] OSSL decrypt recovery - validate creds JSON before writing
            try { JSON.parse(sessionData.toString()); } catch (_) {
                console.error('[TRUTH-MD] SESSION_ID decodes to invalid JSON - clearing it. Bot will use OWNER_NUMBER to pair.');
                try { fs.unlinkSync(credsPath); } catch (_2) {}
                return;
            }
            await fs.promises.writeFile(credsPath, sessionData);
            // Save the hash so next restart knows this SESSION_ID was already applied
            fs.writeFileSync(sessionIdHashFile, currentHash);
            console.log(chalk.green('Session restored from Base64'));`;

    let patched = false;
    if (code.includes(orig1)) {
        code = code.replace(orig1, patched1);
        patched = true;
        console.log('[patch-baileys] messages.upsert OSSL error handler patched');
    } else {
        console.log('[patch-baileys] OSSL messages handler - pattern not matched');
    }
    if (code.includes(orig2)) {
        code = code.replace(orig2, patched2);
        patched = true;
        console.log('[patch-baileys] downloadSessionData OSSL validation patched');
    } else {
        console.log('[patch-baileys] OSSL session validation - pattern not matched');
    }
    if (patched) {
        fs.writeFileSync(relayIndexFile, code, 'utf-8');
    }
}

console.log('[patch-baileys] Applying Baileys patches...');
patchSocket();
patchChats();
patchMessagesRecv();
patchSessionCipher();
patchSendDiagnostics();
patchRelaySendDiagnostics();
patchCommandSpeed();
patchOwnerDisplay();
patchOwnerAccess();
patchConnectionMessage();
patchOwnerAlwaysAccess();
patchConnectionMessageReliable();
patchMenuPhoneNumber();
patchGroupDetectionSafety();
patchGroupSendRetry();
patchOsslDecryptError();
console.log('[patch-baileys] Done.');
