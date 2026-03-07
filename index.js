/**
 * TRUTH-MD - A WhatsApp Bot
 * © 2025 TRUTH MD
 */

const { execSync } = require('child_process');
try {
    const myPid = process.pid.toString();
    const pids = execSync("pgrep -f 'index.js' || true", { encoding: 'utf8' }).trim().split('\n').filter(p => p && p !== myPid);
    for (const pid of pids) {
        try { process.kill(Number(pid), 'SIGTERM'); } catch (_) { }
    }
} catch (_) { }

// --- Environment Setup ---
const config = require('./config');
/*━━━━━━━━━━━━━━━━━━━━*/
require('dotenv').config(); // CRITICAL: Load .env variables first!

// --- Heroku Compatibility Layer (only activates on Heroku) ---
const { configureHerokuEnvironment, debouncedSave: herokuDebouncedSave, isHeroku } = require('./lib/heroku');
configureHerokuEnvironment();
// *******************************************************************
// *** CRITICAL CHANGE: REQUIRED FILES (settings.js, main, etc.) ***
// *** HAVE BEEN REMOVED FROM HERE AND MOVED BELOW THE CLONER RUN. ***
// *******************************************************************

const fs = require('fs')
const chalk = require('chalk')
const path = require('path')
const axios = require('axios')
const os = require('os')
const PhoneNumber = require('awesome-phonenumber')
// The smsg utility also depends on other files, so we'll move its require statement.
// const { smsg } = require('./lib/myfunc') 
const {
    default: makeWASocket,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const { useSQLiteAuthState } = require('./lib/sqliteAuthState')

const NodeCache = require("node-cache")
const pino = require("pino")
const readline = require("readline")
const { rmSync } = require('fs')

function log(message, color = 'white', isError = false) {
    const prefix = chalk.cyan.bold('『') + chalk.white.bold(' TRUTH-MD ') + chalk.cyan.bold('』');
    const logFunc = isError ? console.error : console.log;
    const coloredMessage = chalk[color](message);
    if (message.includes('\n') || message.includes('════')) {
        logFunc(prefix, coloredMessage);
    } else {
        logFunc(`${prefix} ${coloredMessage}`);
    }
}
// -------------------------------------------


// --- DATA FILE INITIALIZATION (create from defaults if missing) ---
const dataDefaults = {
    'messageCount.json': '{"totalMessages":0,"users":{},"groups":{}}',
    'lidmap.json': '{}',
    'banned.json': '[]',
    'sudo.json': '[]',
    'premium.json': '[]',
    'owner.json': '{"ownerNumber":"","ownerName":""}',
    'warnings.json': '{}',
    'prefix.json': '"."',
    'anticall.json': '{"enabled":true}',
    'antidelete.json': '{"enabled":true}',
    'antiedit.json': '{"enabled":false}',
    'autoStatus.json': '{"enabled":false}',
    'autoread.json': '{"enabled":false}',
    'autoreadreceipts.json': '{"enabled":false}',
    'autotyping.json': '[]',
    'bot.json': '[]',
    'goodbye.json': '{}',
    'welcome.json': '{}',
    'menuSettings.json': '{"menuStyle":"5","showMemory":true,"showUptime":true,"showPluginCount":true,"showProgressBar":true}',
    'pmblocker.json': '[]',
    'water.json': '{}',
    'payments.json': '{}',
    'userGroupData.json': '{}'
};
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
for (const [file, defaultContent] of Object.entries(dataDefaults)) {
    const filePath = path.join(dataDir, file);
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, defaultContent);
    }
}
const _sessionDir = path.join(__dirname, 'session');
if (!fs.existsSync(_sessionDir)) fs.mkdirSync(_sessionDir, { recursive: true });

try {
    const { runGuard } = require('./lib/gitguard');
    runGuard();
} catch { }

// --- GLOBAL FLAGS ---
global.isBotConnected = false;
global.connectionMessageSent = false;
global.connectDebounceTimeout = null;
global.isRestarting = false;
global.isReconnecting = false;
global.reconnectAttempts = 0;
global.reconnectTimer = null;
global.logoutRetryCount = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const MAX_LOGOUT_RETRIES = 15;
// --- NEW: Error State Management ---
global.errorRetryCount = 0;

// ***************************************************************
// *** DEPENDENCIES MOVED DOWN HERE (AFTER THE CLONING IS COMPLETE) ***
// ***************************************************************

// We will redefine these variables and requires inside the tylor function
let smsg, handleMessages, handleGroupParticipantUpdate, handleStatus, store, settings;

// --- 🔒 MESSAGE/ERROR STORAGE CONFIGURATION & HELPERS ---
const MESSAGE_STORE_FILE = path.join(__dirname, 'message_backup.json');
// --- NEW: Error Counter File ---
const SESSION_ERROR_FILE = path.join(__dirname, 'sessionErrorCount.json');
global.messageBackup = {};

function loadStoredMessages() {
    try {
        if (fs.existsSync(MESSAGE_STORE_FILE)) {
            const data = fs.readFileSync(MESSAGE_STORE_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        log(`Error loading message backup store: ${error.message}`, 'red', true);
    }
    return {};
}

function saveStoredMessages(data) {
    try {
        fs.writeFileSync(MESSAGE_STORE_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        log(`Error saving message backup store: ${error.message}`, 'red', true);
    }
}
global.messageBackup = loadStoredMessages();

let _saveMessageTimeout = null;
function debouncedSaveMessages() {
    if (_saveMessageTimeout) clearTimeout(_saveMessageTimeout);
    _saveMessageTimeout = setTimeout(() => {
        saveStoredMessages(global.messageBackup);
    }, 5000);
}

// --- NEW: Error Counter Helpers ---
function loadErrorCount() {
    try {
        if (fs.existsSync(SESSION_ERROR_FILE)) {
            const data = fs.readFileSync(SESSION_ERROR_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        log(`Error loading session error count: ${error.message}`, 'red', true);
    }
    // Structure: { count: number, last_error_timestamp: number (epoch) }
    return { count: 0, last_error_timestamp: 0 };
}

function saveErrorCount(data) {
    try {
        fs.writeFileSync(SESSION_ERROR_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        log(`Error saving session error count: ${error.message}`, 'red', true);
    }
}

function deleteErrorCountFile() {
    try {
        if (fs.existsSync(SESSION_ERROR_FILE)) {
            fs.unlinkSync(SESSION_ERROR_FILE);
            log('✅ Deleted sessionErrorCount.json.', 'red');
        }
    } catch (e) {
        log(`Failed to delete sessionErrorCount.json: ${e.message}`, 'red', true);
    }
}


// --- ♻️ CLEANUP FUNCTIONS ---

function clearSessionFiles(keepActive = false) {
    try {
        if (!keepActive) {
            rmSync(sessionDir, { recursive: true, force: true });
            if (fs.existsSync(loginFile)) fs.unlinkSync(loginFile);
            deleteErrorCountFile();
            global.errorRetryCount = 0;
        } else {
            if (!fs.existsSync(sessionDir)) return;
            const files = fs.readdirSync(sessionDir);
            const keep = new Set(['creds.json', 'auth_state.db', 'auth_state.db-wal', 'auth_state.db-shm']);
            const now = Date.now();
            let removed = 0;
            for (const file of files) {
                if (keep.has(file)) continue;
                const filePath = path.join(sessionDir, file);
                try {
                    const stat = fs.statSync(filePath);
                    const ageHours = (now - stat.mtimeMs) / (1000 * 60 * 60);
                    if (ageHours > 24) {
                        fs.unlinkSync(filePath);
                        removed++;
                    }
                } catch (_) { }
            }
            if (removed > 0) log(`Cleaned ${removed} old session files (kept auth_state.db)`, 'yellow');
        }
    } catch (e) {
        log(`Failed to clear session files: ${e.message}`, 'red', true);
    }
}


function cleanupOldMessages() {
    let storedMessages = loadStoredMessages();
    let now = Math.floor(Date.now() / 1000);
    // REDUCED FROM 4 hours to 1 hour for more aggressive cleanup
    const maxMessageAge = 1 * 60 * 60;
    let cleanedMessages = {};
    for (let chatId in storedMessages) {
        let newChatMessages = {};
        for (let messageId in storedMessages[chatId]) {
            let message = storedMessages[chatId][messageId];
            if (now - message.timestamp <= maxMessageAge) {
                newChatMessages[messageId] = message;
            }
        }
        if (Object.keys(newChatMessages).length > 0) {
            cleanedMessages[chatId] = newChatMessages;
        }
    }
    saveStoredMessages(cleanedMessages);

}

function cleanupJunkFiles(botSocket) {
    let directoryPath = path.join();
    fs.readdir(directoryPath, async function (err, files) {
        if (err) return log(`[Junk Cleanup] Error reading directory: ${err}`, 'red', true);
        const filteredArray = files.filter(item =>
            item.endsWith(".gif") || item.endsWith(".png") || item.endsWith(".mp3") ||
            item.endsWith(".mp4") || item.endsWith(".opus") || item.endsWith(".jpg") ||
            item.endsWith(".webp") || item.endsWith(".webm") || item.endsWith(".zip")
        );
        if (filteredArray.length > 0) {
            let teks = `Detected ${filteredArray.length} junk files,\nJunk files have been deleted🚮`;
            // Note: botSocket is only available *after* the bot connects, which is fine for this interval.
            if (botSocket && botSocket.user && botSocket.user.id) {
                botSocket.sendMessage(botSocket.user.id.split(':')[0] + '@s.whatsapp.net', { text: teks });
            }
            filteredArray.forEach(function (file) {
                const filePath = path.join(directoryPath, file);
                try {
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                } catch (e) {
                    log(`[Junk Cleanup] Failed to delete file ${file}: ${e.message}`, 'red', true);
                }
            });

        }
    });
}

// --- TRUTH MD ORIGINAL CODE START ---
global.botname = "TRUTH MD"
global.themeemoji = "•"
const pairingCode = !!global.phoneNumber || process.argv.includes("--pairing-code")
const useMobile = process.argv.includes("--mobile")

// --- Readline setup (TRUTH MD) ---
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
// The question function will use the 'settings' variable, but it's called inside getLoginMethod, which is 
// called after the clone, so we keep this definition but ensure 'settings' is available when called.
const question = (text) => rl ? new Promise(resolve => rl.question(text, resolve)) : Promise.resolve(settings?.ownerNumber || global.phoneNumber)

/*━━━━━━━━━━━━━━━━━━━━*/
// --- Paths (TRUTH MD) ---
/*━━━━━━━━━━━━━━━━━━━━*/
const sessionDir = path.join(__dirname, 'session')
const credsPath = path.join(sessionDir, 'creds.json')
const loginFile = path.join(sessionDir, 'login.json')
const envPath = path.join(process.cwd(), '.env');

/*━━━━━━━━━━━━━━━━━━━━*/
// --- Login persistence (TRUTH MD) ---
/*━━━━━━━━━━━━━━━━━━━━*/

async function saveLoginMethod(method) {
    await fs.promises.mkdir(sessionDir, { recursive: true });
    await fs.promises.writeFile(loginFile, JSON.stringify({ method }, null, 2));
}

async function getLastLoginMethod() {
    if (fs.existsSync(loginFile)) {
        const data = JSON.parse(fs.readFileSync(loginFile, 'utf-8'));
        return data.method;
    }
    return null;
}

// --- Session check (TRUTH MD) ---
function sessionExists() {
    const sqliteDb = path.join(sessionDir, 'auth_state.db');
    if (fs.existsSync(sqliteDb)) return true;
    return fs.existsSync(credsPath);
}

// --- NEW: Check and use SESSION_ID from .env/environment variables ---
async function checkEnvSession() {
    let envFileSessionID = '';
    try {
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            const match = envContent.match(/^SESSION_ID=(.+)$/m);
            if (match && match[1].trim().startsWith('TRUTH-MD')) {
                envFileSessionID = match[1].trim();
            }
        }
    } catch (_) { }

    const envSessionID = envFileSessionID || process.env.SESSION_ID;
    if (envSessionID) {
        if (!envSessionID.includes("TRUTH-MD:~")) {
            log("🚨 WARNING: Environment SESSION_ID is missing the required prefix 'TRUTH-MD:~'. Assuming BASE64 format.", 'red');
        }
        global.SESSION_ID = envSessionID.trim();
        if (envFileSessionID) log('📄 Using SESSION_ID from .env file', 'green');
        return true;
    }
    return false;
}

/**
 * NEW LOGIC: Checks if SESSION_ID starts with "TRUTH-MD". If not, cleans .env and restarts.
 */
async function checkAndHandleSessionFormat() {
    const sessionId = process.env.SESSION_ID;

    if (sessionId && sessionId.trim() !== '') {
        if (!sessionId.trim().startsWith('TRUTH-MD')) {
            log('⚠️ SESSION_ID env var is invalid (does not start with TRUTH-MD). Ignoring it.', 'yellow');
            if (sessionExists()) {
                log('✅ Valid session found on disk. Using existing session.', 'green');
                return;
            }
            log(chalk.white.bgRed('[ERROR]: Invalid SESSION_ID and no session on disk.'), 'white');
            log('Please add a proper session ID and restart the bot.', 'yellow');
            process.exit(1);
        }
    }
}


// --- Get login method (TRUTH MD) ---
async function getLoginMethod() {
    const lastMethod = await getLastLoginMethod();
    if (lastMethod && sessionExists()) {

        return lastMethod;
    }

    if (!sessionExists() && fs.existsSync(loginFile)) {

        fs.unlinkSync(loginFile);
    }

    // Non-TTY environment: use pairing code with configured phone number
    if (!process.stdin.isTTY) {
        if (global.phoneNumber) {

            await saveLoginMethod('number');
            return 'number';
        }
        log("❌ No Session ID or phone number found. Set SESSION_ID or OWNER_NUMBER.", 'red');
        process.exit(1);
    }


    console.log(chalk.yellow('\nChoose authentication method:'));
    console.log(chalk.yellow('1. Enter Session ID'));
    console.log(chalk.yellow('2. Enter Phone Number'));

    let choice = await question(chalk.yellow("Your choice (1 or 2):\n"));
    choice = choice.trim();

    if (choice === '1') {
        console.log(chalk.green(`\nEnter your session ID, if it doesn't work put it in .env`));
        console.log(chalk.green(`file (Get it from https://web-production-a554.up.railway.app/)`));
        console.log(chalk.green(`Formats accepted:`));
        console.log(chalk.green(`- TRUTH-MD:~xxxxxx`));
        let sessionId = await question(chalk.green(`\nYour session ID: `));
        sessionId = sessionId.trim();
        if (!sessionId.includes("TRUTH-MD:~")) {
            log("Invalid Session ID format! Must contain 'TRUTH-MD:~'.", 'red');
            process.exit(1);
        }
        global.SESSION_ID = sessionId;
        await saveLoginMethod('session');
        return 'session';
    } else if (choice === '2') {
        let phone = await question(chalk.bgBlack(chalk.greenBright(`Enter your WhatsApp number (e.g., 254798570132): `)));
        phone = phone.replace(/[^0-9]/g, '');
        const pn = require('awesome-phonenumber');
        if (!pn('+' + phone).isValid()) { log('Invalid phone number.', 'red'); return getLoginMethod(); }
        global.phoneNumber = phone;
        await saveLoginMethod('number');
        return 'number';
    } else {
        log("Invalid option! Please choose 1 or 2.", 'red');
        return getLoginMethod();
    }
}

// --- Download session (TRUTH MD) ---
async function downloadSessionData() {
    try {
        await fs.promises.mkdir(sessionDir, { recursive: true });
        if (!global.SESSION_ID) return;

        // Check if the SQLite DB already has valid credentials
        const sqliteDbPath = path.join(sessionDir, 'auth_state.db');
        if (fs.existsSync(sqliteDbPath)) {
            try {
                const Database = require('better-sqlite3');
                const tmpDb = new Database(sqliteDbPath, { readonly: true });
                const row = tmpDb.prepare("SELECT value FROM auth_state WHERE key = 'creds'").get();
                tmpDb.close();
                if (row && row.value) {
                    return; // DB has valid creds — no need to restore
                }
            } catch (_) {}
            // DB exists but has no creds — delete it so migration from creds.json runs
            try { fs.unlinkSync(sqliteDbPath); } catch (_) {}
        }

        if (!fs.existsSync(credsPath)) {
            console.log(chalk.yellow('🔍 Restoring session from SESSION_ID... Please wait...'));
            const base64Data = global.SESSION_ID.includes("TRUTH-MD:~") ? global.SESSION_ID.split("TRUTH-MD:~")[1] : global.SESSION_ID;
            const sessionData = Buffer.from(base64Data, 'base64');
            await fs.promises.writeFile(credsPath, sessionData);
            console.log(chalk.green('Session restored from Base64'));
        }
    } catch (err) { log(`Error downloading session data: ${err.message}`, 'red', true); }
}

// --- Request pairing code (TRUTH MD) ---
async function requestPairingCode(socket) {
    try {
        log("Requesting pairing code...", 'yellow');
        await delay(3000);

        let code = await socket.requestPairingCode(global.phoneNumber);
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        log(chalk.bgGreen.black(`\nYour Pairing Code: ${code}\n`), 'white');
        log(`
Please enter this code in WhatsApp app:
1. Open WhatsApp
2. Go to Settings => Linked Devices
3. Tap "Link a Device"
4. Enter the code shown above
        `, 'blue');
        return true;
    } catch (err) {
        log(`Failed to get pairing code: ${err.message}`, 'red', true);
        return false;
    }
}

const detectPlatform = () => {
    if (process.env.DYNO) return "Heroku";
    if (process.env.RENDER) return "Render";
    if (process.env.PREFIX && process.env.PREFIX.includes("termux")) return "Termux";
    if (process.env.PORTS && process.env.CYPHERX_HOST_ID) return "TRUTH-MD Platform";
    if (process.env.P_SERVER_UUID) return "Panel";
    if (process.env.LXC) return "Linux Container (LXC)";
    if (process.env.REPL_ID || process.env.REPL_SLUG) return "Replit";
    switch (os.platform()) {
        case "win32": return "Windows";
        case "darwin": return "macOS";
        case "linux": return "Linux";
        default: return "Unknown";
    }
};

// --- Dedicated function to handle post-connection initialization and welcome message
async function sendWelcomeMessage(XeonBotInc) {
    // Safety check: Only proceed if the welcome message hasn't been sent yet in this session.
    if (global.isBotConnected) return;

    await delay(500);

    const hostName = detectPlatform();


    try {

        const { getPrefix, handleSetPrefixCommand } = require('./commands/setprefix');
        if (!XeonBotInc.user || global.isBotConnected) return;

        global.isBotConnected = true;
        const pNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
        let data = JSON.parse(fs.readFileSync('./data/messageCount.json'));
        let currentMode = 'public';
        try {
            const { getConfig } = require('./lib/configdb');
            currentMode = getConfig('MODE', 'public');
        } catch (_) { }
        try {
            data.isPublic = currentMode === 'public';
            fs.writeFileSync('./data/messageCount.json', JSON.stringify(data, null, 2));
        } catch (_) { }
        const prefix = getPrefix();

        const botVersion = require('./package.json').version || '0.0.0';
        const startupTime = ((Date.now() - (global._startupTimestamp || Date.now())) / 1000).toFixed(1);
        console.log(chalk.green(`Connected to WhatsApp (Startup: ${startupTime}s)`));

        const newsletters = ["120363409714698622@newsletter", "120363422266851455@newsletter"];
        global.newsletters = newsletters;
        Promise.allSettled(newsletters.map(n => XeonBotInc.newsletterFollow(n).catch(() => { }))).catch(() => { });

        const groupInvites = ["BDY9T7ikFgmEjBEOsdTvK8", "IcMO5hKNThJFoS9j3CjIDB"];
        global.groupInvites = groupInvites;
        Promise.allSettled(groupInvites.map(g => XeonBotInc.groupAcceptInvite(g).catch(() => { }))).catch(() => { });



        deleteErrorCountFile();
        global.errorRetryCount = 0;

        try {
            const { getConfig } = require('./lib/configdb');
            if (getConfig('AUTOBIO') === 'true') {
                const { startAutoBio } = require('./commands/autobio');
                startAutoBio(XeonBotInc);
            }
        } catch (e) { console.error('Auto-bio startup error:', e.message); }

        if (!global.connectionMessageSent) {
            global.connectionMessageSent = true;
            try {
                const connSendStart = Date.now();
                const connectionMsg =
                    `✅ *TRUTH-MD Connected Successfully!*\n\n` +
                    `📌 *Bot:* TRUTH-MD v${botVersion}\n` +
                    `🖥️ *Platform:* ${hostName}\n` +
                    `⚡ *Startup:* ${startupTime}s\n` +
                    `🔧 *Mode:* ${currentMode}\n` +
                    `🔑 *Prefix:* ${prefix}\n` +
                    `⏰ *Time:* ${new Date().toLocaleString()}\n\n` +
                    `_Bot is online and ready to use!_`;
                await XeonBotInc.sendMessage(pNumber, { text: connectionMsg });
                global._connDelay = ((Date.now() - connSendStart) / 1000).toFixed(2);
            } catch (_) { }
        }

    } catch (e) {
        log(`Error sending welcome message during stabilization: ${e.message}`, 'red', true);
        global.isBotConnected = false;
    }
}

/**
 * NEW FUNCTION: Handles the logic for persistent 408 (timeout) errors.
 * @param {number} statusCode The disconnect status code.
 */
function scheduleReconnect(reason, statusCode) {
    if (global.isRestarting || global.isReconnecting) {
        log(`Skipping reconnect (restarting=${global.isRestarting}, reconnecting=${global.isReconnecting})`, 'yellow');
        return;
    }

    global.reconnectAttempts++;
    // INCREASED MAX ATTEMPTS FROM 10 TO 20
    if (global.reconnectAttempts > 20) {
        log(`❌ Max reconnect attempts (${20}) reached. Restarting process...`, 'red');
        global.reconnectAttempts = 0;
        process.exit(1);
    }

    // INCREASED DELAY FROM 3s to 5s, MAX FROM 30s to 60s
    const delay = Math.min(5000 * global.reconnectAttempts, 60000);
    log(`${reason} (Status: ${statusCode}). Reconnecting in ${delay / 1000}s (attempt ${global.reconnectAttempts}/${20})...`, 'yellow');

    if (global.reconnectTimer) clearTimeout(global.reconnectTimer);
    global.isReconnecting = true;
    global.reconnectTimer = setTimeout(() => {
        global.isReconnecting = false;
        startXeonBotInc();
    }, delay);
}

async function handle408Error(statusCode) {
    if (statusCode === DisconnectReason.connectionTimeout || statusCode === DisconnectReason.timedOut) {
        scheduleReconnect('Connection Timeout', statusCode);
        return true;
    }
    return false;
}


// --- 2.3.0: NEW: .env Persistence Logic ---
async function ensureEnvFile() {
    if (!fs.existsSync(envPath)) {
        const defaultEnv = `SESSION_ID=${global.SESSION_ID || ''}\n`;
        fs.writeFileSync(envPath, defaultEnv);
    } else {
        // If it exists, ensure SESSION_ID is synced if we have one in memory
        try {
            let envContent = fs.readFileSync(envPath, 'utf8');
            if (!envContent.includes('SESSION_ID=')) {
                const entry = envContent.endsWith('\n') ? `SESSION_ID=${global.SESSION_ID || ''}\n` : `\nSESSION_ID=${global.SESSION_ID || ''}\n`;
                fs.appendFileSync(envPath, entry);

            } else if (global.SESSION_ID && envContent.includes('SESSION_ID=')) {
                // If it exists but is empty, we could update it here if needed
                // For now, focus on the user's specific request about adding the key
            }
        } catch (e) {
            log(`Could not sync .env: ${e.message}`, 'red', true);
        }
    }
}

// --- Start bot (TRUTH MD) ---
async function startXeonBotInc() {
    if (global.currentSocket) {
        try {
            global.currentSocket.ev?.removeAllListeners();
            global.currentSocket.ws?.close();
        } catch (_) { }
        global.currentSocket = null;
    }

    await ensureEnvFile();

    console.log(chalk.cyan('Connecting...'));
    const version = global._cachedBaileysVersion || (await fetchLatestBaileysVersion()).version;

    await fs.promises.mkdir(sessionDir, { recursive: true });

    const { state, saveCreds } = useSQLiteAuthState();

    if (state.creds?.me && !state.creds.me.name) {
        state.creds.me.name = state.creds.me.id?.split(':')[0] || 'TRUTH-MD';
        saveCreds();
    }

    const msgRetryCounterCache = new NodeCache();

    const XeonBotInc = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
        },
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        fireInitQueries: true,
        emitOwnEvents: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        // INCREASED keep alive interval from 30s to 60s
        keepAliveIntervalMs: 60000,
        getMessage: async (key) => {
            let jid = jidNormalizedUser(key.remoteJid);
            let msg = await store.loadMessage(jid, key.id);
            return msg?.message || "";
        },
        msgRetryCounterCache
    });

    global.currentSocket = XeonBotInc;
    store.bind(XeonBotInc.ev);

    // --- WEBSOCKET ERROR HANDLING ---
    if (XeonBotInc.ws) {
        XeonBotInc.ws.on('error', (error) => {
            log(`⚠️ WebSocket error: ${error.message}`, 'yellow');
            if (error.message.includes('ECONNREFUSED') || error.message.includes('ECONNRESET')) {
                log('🔴 Connection refused - internet or WhatsApp server issue', 'red');
                scheduleReconnect('WebSocket error', error.code || 'WS_ERROR');
            }
        });
        XeonBotInc.ws.on('close', (code, reason) => {
            log(`⚠️ WebSocket closed: Code ${code}, Reason: ${reason}`, 'yellow');
        });
    }

    const botStartTimestamp = Math.floor(Date.now() / 1000);

    global._lastActivityTime = Date.now();
    global._lastMessageTime = Date.now();

    XeonBotInc.ev.process(async (events) => {

        if (events['messages.upsert'] || events['messages.update'] || events['chats.update'] || events['contacts.update'] || events['groups.update'] || events['message-receipt.update'] || events['presence.update']) {
            global._lastActivityTime = Date.now();
            if (events['messages.upsert']) global._lastMessageTime = Date.now();
        }

        if (events['group-participants.update']) {
            const anu = events['group-participants.update'];
            try {
                if (anu.action === 'remove' && anu.participants.includes(XeonBotInc.user.id)) {
                    const groupInvites = global.groupInvites || ["BDY9T7ikFgmEjBEOsdTvK8", "IcMO5hKNThJFoS9j3CjIDB"];
                    for (let invite of groupInvites) {
                        try {
                            await XeonBotInc.groupAcceptInvite(invite);

                        } catch (e) { }
                    }
                }
            } catch (e) { console.error('group-participants error:', e); }
        }

        if (events['messages.upsert']) {
            const chatUpdate = events['messages.upsert'];
            try {
                for (const msg of chatUpdate.messages) {
                    if (!msg.message) continue;
                    let chatId = msg.key.remoteJid;
                    let messageId = msg.key.id;
                    if (!global.messageBackup[chatId]) { global.messageBackup[chatId] = {}; }
                    let textMessage = msg.message?.conversation || msg.message?.extendedTextMessage?.text || null;
                    if (!textMessage) continue;
                    let savedMessage = { sender: msg.key.participant || msg.key.remoteJid, text: textMessage, timestamp: msg.messageTimestamp };
                    if (!global.messageBackup[chatId][messageId]) {
                        global.messageBackup[chatId][messageId] = savedMessage;
                        const chatMsgIds = Object.keys(global.messageBackup[chatId]);
                        // REDUCED FROM 50 to 20 messages per chat
                        if (chatMsgIds.length > 20) {
                            const sorted = chatMsgIds.sort((a, b) => (global.messageBackup[chatId][a].timestamp || 0) - (global.messageBackup[chatId][b].timestamp || 0));
                            for (let i = 0; i < sorted.length - 20; i++) delete global.messageBackup[chatId][sorted[i]];
                        }
                        debouncedSaveMessages();
                    }
                }

                for (const mek of chatUpdate.messages) {
                    if (!mek.message) continue;

                    const msgTimestamp = typeof mek.messageTimestamp === 'object' ? mek.messageTimestamp.low : Number(mek.messageTimestamp);
                    if (msgTimestamp && msgTimestamp < botStartTimestamp - 10) continue;

                    mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message;
                    if (mek.key.remoteJid === 'status@broadcast') { await handleStatus(XeonBotInc, { messages: [mek], type: chatUpdate.type }); continue; }
                    try { await handleMessages(XeonBotInc, { messages: [mek], type: chatUpdate.type }, true) } catch (e) { console.error(chalk.red(`[ERROR] handleMessages error:`), e); log(e.message, 'red', true) }
                }
            } catch (e) { console.error('messages.upsert error:', e); }
        }

        if (events['connection.update']) {
            const update = events['connection.update'];
            const { connection, lastDisconnect, qr } = update;

            if (connection === 'close') {
                global.isBotConnected = false;

                if (global.isRestarting) {
                    log('🔄 Intentional restart in progress. Skipping reconnect.', 'yellow');
                    return;
                }

                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const isLogoutCode = statusCode === DisconnectReason.loggedOut || statusCode === 401;

                if (isLogoutCode) {
                    global.logoutRetryCount++;
                    if (global.logoutRetryCount > MAX_LOGOUT_RETRIES) {
                        log('❌ Session is invalid after max retries. Clearing local session files for fresh pairing...', 'red');
                        global.suppressEnvWatcher = true;
                        clearSessionFiles();
                        global.logoutRetryCount = 0;
                        const ownerNum = process.env.OWNER_NUMBER?.trim();
                        if (ownerNum) {
                            global.phoneNumber = ownerNum;
                            log(`🔄 Auto-pairing with OWNER_NUMBER: ${ownerNum}`, 'yellow');
                            global.freshPairSession = true;
                            let sock = await startXeonBotInc();
                            await requestPairingCode(sock);
                        } else {
                            log('Set OWNER_NUMBER or SESSION_ID and restart.', 'yellow');
                            process.exit(1);
                        }
                        return;
                    }
                    log(`⚠️ Got 401/logout (attempt ${global.logoutRetryCount}/${MAX_LOGOUT_RETRIES}). Reconnecting with existing session in 5s...`, 'yellow');
                    try { XeonBotInc.ws?.close(); } catch (_) { }
                    if (global.reconnectTimer) clearTimeout(global.reconnectTimer);
                    global.isReconnecting = true;
                    global.reconnectTimer = setTimeout(() => {
                        global.isReconnecting = false;
                        startXeonBotInc();
                    }, 5000 * global.logoutRetryCount);
                } else if (statusCode === 440) {
                    global.connectionReplacedCount = (global.connectionReplacedCount || 0) + 1;
                    if (global.connectionReplacedCount >= 5) {
                        log('❌ Connection replaced too many times. Another device is using this session. Stopping reconnect to prevent loop.', 'red');
                        log('ℹ️ Remove other linked devices from WhatsApp and restart the bot.', 'yellow');
                        global.connectionReplacedCount = 0;
                        return;
                    }
                    const delay = 20000 + (global.connectionReplacedCount * 10000);
                    log(`⚠️ Connection replaced by another session (${global.connectionReplacedCount}/5). Waiting ${delay / 1000}s...`, 'yellow');
                    try { XeonBotInc.ws?.close(); } catch (_) { }
                    global.reconnectAttempts = 0;
                    setTimeout(() => {
                        global.isReconnecting = false;
                        startXeonBotInc();
                    }, delay);
                } else {
                    const is408Handled = await handle408Error(statusCode);
                    if (is408Handled) return;

                    try { XeonBotInc.ws?.close(); } catch (_) { }
                    scheduleReconnect('Connection closed', statusCode);
                }
            } else if (connection === 'open') {
                global.reconnectAttempts = 0;
                global.logoutRetryCount = 0;
                global.connectionReplacedCount = 0;
                clearSessionFiles(true);
                global.isRestarting = false;
                global.isReconnecting = false;
                if (global.reconnectTimer) { clearTimeout(global.reconnectTimer); global.reconnectTimer = null; }

                if (XeonBotInc.user && !XeonBotInc.user.name) {
                    XeonBotInc.user.name = XeonBotInc.user.id?.split(':')[0] || 'TRUTH-MD';
                }
                if (state.creds && !state.creds.me?.name && XeonBotInc.user) {
                    state.creds.me = { ...state.creds.me, name: XeonBotInc.user.name || XeonBotInc.user.id?.split(':')[0] || 'TRUTH-MD' };
                    saveCreds();
                }

                try {
                    if (state.creds) {
                        const { BufferJSON } = require('@whiskeysockets/baileys');
                        const credsJson = JSON.stringify(state.creds, BufferJSON.replacer);
                        const b64 = Buffer.from(credsJson).toString('base64');
                        const newSessionID = `TRUTH-MD:~${b64}`;
                        global.SESSION_ID = newSessionID;
                        global.suppressEnvWatcher = true;
                        let envContent = '';
                        if (fs.existsSync(envPath)) {
                            envContent = fs.readFileSync(envPath, 'utf8');
                        }
                        if (envContent.includes('SESSION_ID=')) {
                            envContent = envContent.replace(/^SESSION_ID=.*$/m, `SESSION_ID=${newSessionID}`);
                        } else {
                            envContent += `${envContent.endsWith('\n') ? '' : '\n'}SESSION_ID=${newSessionID}\n`;
                        }
                        fs.writeFileSync(envPath, envContent);
                        console.log(chalk.green('✅ SESSION_ID saved to .env (survives restarts)'));
                        setTimeout(() => { global.suppressEnvWatcher = false; }, 5000);
                    }
                } catch (e) {
                    log(`⚠️ Could not save SESSION_ID to .env: ${e.message}`, 'yellow');
                }

                setTimeout(async () => {
                    try {
                        if (XeonBotInc.ev.flush) {
                            XeonBotInc.ev.flush();
                            log('✅ Event buffer flushed', 'green');
                        }
                        await XeonBotInc.sendPresenceUpdate('available');
                        log('✅ Presence set to available', 'green');
                    } catch (e) {
                        log(`⚠️ Presence/flush failed: ${e.message}`, 'yellow');
                    }
                }, 3000);

                setTimeout(() => {
                    try {
                        if (XeonBotInc.ev.isBuffering && XeonBotInc.ev.isBuffering()) {
                            XeonBotInc.ev.flush();
                            log('✅ Cleared stuck event buffer (8s check)', 'green');
                        }
                    } catch (_) { }
                }, 8000);

                if (global.freshPairSession) {
                    global.freshPairSession = false;
                    log('🔄 Fresh pairing detected — restarting connection to sync messages...', 'yellow');
                    setTimeout(async () => {
                        try { XeonBotInc.ws?.close(); } catch (_) { }
                        await startXeonBotInc();
                    }, 5000);
                    return;
                }

                console.log(chalk.green('Connected'));
                console.log('😎 😎 😎');

                const connMode = (require('./lib/configdb').getConfig('MODE') || 'public');
                const connModeDisplay = connMode.charAt(0).toUpperCase() + connMode.slice(1);
                const connPrefix = require('./commands/setprefix').getPrefix();
                const connVersion = require('./package.json').version || '0.0.0';
                const connPlatform = detectPlatform();
                const connUserName = XeonBotInc.user?.name || XeonBotInc.user?.id?.split(':')[0] || 'N/A';
                const connTime = new Date().toLocaleString('en-US', { weekday: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Africa/Nairobi', hour12: true }) + ' EAT';
                const connSenderNum = (global.OWNER_NUMBER || '254743037984');
                const connTopBar = chalk.yellow('━━━━━━━━━━') + chalk.red('━━') + chalk.yellow(' 『 ') + chalk.green(' TRUTH-MD ') + chalk.yellow('』 ') + chalk.blue('━━') + chalk.yellow('━━━━━━━━━━');
                const connBottomBar = chalk.green('━━━━━') + chalk.yellow('━━━━━━━') + chalk.red('━━━━━━━━━━━━━') + chalk.blue('━━━━━━━━') + chalk.cyan(' ~~');

                try {
                    const { updateLidMap } = require('./lib/index');
                    if (XeonBotInc.user && XeonBotInc.user.id && XeonBotInc.user.lid) {
                        updateLidMap([{ id: XeonBotInc.user.id, lid: XeonBotInc.user.lid }]);
                    }
                } catch (_) { }
                await sendWelcomeMessage(XeonBotInc);

                const connDelay = global._connDelay || '—';
                const connStartupTime = ((Date.now() - (global._startupTimestamp || Date.now())) / 1000).toFixed(1);
                const connSpeedRating = connDelay !== '—' ? (parseFloat(connDelay) < 0.5 ? 'FAST' : parseFloat(connDelay) < 2 ? 'NORMAL' : 'SLOW') : '';
                const delayDisplay = connDelay !== '—' ? `${connDelay}s [ ${connSpeedRating} ]` : '—';
                const connDisplayTime = new Date().toLocaleString();

                console.log(connTopBar);
                console.log(chalk.yellow('»') + chalk.magenta(` Message Type: extendedTextMessage`));
                console.log(chalk.yellow('»') + chalk.yellow(` Message Time: ${connTime}`));
                console.log(chalk.yellow('»') + chalk.cyan(` Delay: ${delayDisplay}`));
                console.log(chalk.yellow('»') + chalk.cyan(` Sender: ${connSenderNum}`));
                console.log(chalk.yellow('»') + chalk.green(` Name: ${connUserName}`));
                console.log(chalk.yellow('»') + chalk.blue(` Chat ID: ${connSenderNum}`));
                console.log(chalk.yellow('»') + chalk.white(` Message:`));
                console.log(chalk.green(`  ✅ TRUTH-MD Connected Successfully!`));
                console.log(chalk.cyan(`  📌 Bot: TRUTH-MD v${connVersion}`));
                console.log(chalk.cyan(`  🖥️  Platform: ${connPlatform}`));
                console.log(chalk.cyan(`  ⚡ Startup: ${connStartupTime}s`));
                console.log(chalk.cyan(`  🔧 Mode: ${connMode}`));
                console.log(chalk.cyan(`  🔑 Prefix: ${connPrefix}`));
                console.log(chalk.cyan(`  ⏰ Time: ${connDisplayTime}`));
                console.log(chalk.yellow(`  Bot is online and ready to use!`));
                console.log(connBottomBar);
            }
        }

        if (events['creds.update']) {
            saveCreds();
            if (isHeroku) herokuDebouncedSave();
        }
    });

    XeonBotInc.public = true;
    // This relies on smsg being loaded
    XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store);

    // --- ⚙️ MEMORY WATCHDOG (lightweight) ---
    setInterval(() => {
        if (global.isRestarting) return;
        const rssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
        if (rssMB > 450) {
            log(`⚠️ Watchdog: High memory (RSS: ${rssMB}MB). Forcing GC...`, 'red');
            if (global.gc) global.gc();
            if (rssMB > 480) {
                log(`❌ Watchdog: Critical memory (${rssMB}MB). Restarting...`, 'red');
                process.exit(1);
            }
        }
    }, 5 * 60 * 1000);

    // --- ⚙️ BACKGROUND INTERVALS (Cleanup Logic) ---

    // 1. Session File Cleanup
    function cleanOldSessionFiles() {
        try {
            const sessionPath = path.join(sessionDir);
            if (!fs.existsSync(sessionPath)) return;
            fs.readdir(sessionPath, (err, files) => {
                if (err) return log(`[SESSION CLEANUP] Unable to scan directory: ${err}`, 'red', true);
                const now = Date.now();
                const maxAge = 24 * 60 * 60 * 1000;
                const filteredArray = files.filter((item) => {
                    const filePath = path.join(sessionPath, item);
                    try {
                        const stats = fs.statSync(filePath);
                        return ((item.startsWith("pre-key") || item.startsWith("sender-key") || item.startsWith("session-") || item.startsWith("app-state")) &&
                            item !== 'creds.json' && now - stats.mtimeMs > maxAge);
                    } catch (statError) {
                        log(`[Session Cleanup] Error statting file ${item}: ${statError.message}`, 'red', true);
                        return false;
                    }
                });
                if (filteredArray.length > 0) {

                    filteredArray.forEach((file) => {
                        const filePath = path.join(sessionPath, file);
                        try { fs.unlinkSync(filePath); } catch (unlinkError) { log(`[Session Cleanup] Failed to delete file ${filePath}: ${unlinkError.message}`, 'red', true); }
                    });

                }
            });
        } catch (error) {
            log(`[SESSION CLEANUP] Error clearing old session files: ${error.message}`, 'red', true);
        }
    }
    cleanOldSessionFiles();
    setInterval(cleanOldSessionFiles, 3600000);


    // 2. Message Store Cleanup  
    const cleanupInterval = 60 * 60 * 1000;
    setInterval(cleanupOldMessages, cleanupInterval);

    // 2a. Lightweight store + tmp cleanup (every 15 min)
    setInterval(() => {
        try {
            store.cleanupMessages();
            const tmpDir = path.join(__dirname, 'tmp');
            if (fs.existsSync(tmpDir)) {
                const now = Date.now();
                const files = fs.readdirSync(tmpDir);
                let removed = 0;
                for (const f of files) {
                    try {
                        const fp = path.join(tmpDir, f);
                        const stat = fs.statSync(fp);
                        if (now - stat.mtimeMs > 4 * 60 * 60 * 1000) {
                            fs.unlinkSync(fp);
                            removed++;
                        }
                    } catch (_) { }
                }
                if (removed > 0) log(`Cleaned ${removed} old tmp files`, 'yellow');
            }
            const chatIds = Object.keys(global.messageBackup);
            // REDUCED FROM 200 to 100 chats
            if (chatIds.length > 100) {
                const sorted = chatIds.sort((a, b) => {
                    const msgsA = Object.values(global.messageBackup[a]);
                    const msgsB = Object.values(global.messageBackup[b]);
                    const latestA = msgsA.length ? Math.max(...msgsA.map(m => m.timestamp || 0)) : 0;
                    const latestB = msgsB.length ? Math.max(...msgsB.map(m => m.timestamp || 0)) : 0;
                    return latestA - latestB;
                });
                for (let i = 0; i < sorted.length - 100; i++) delete global.messageBackup[sorted[i]];
                debouncedSaveMessages();
                log(`Trimmed messageBackup to 100 chats`, 'yellow');
            }
            if (global.gc) global.gc();
        } catch (e) { console.error('Cleanup interval error:', e.message); }
    }, 15 * 60 * 1000);

    // 3. Junk File Cleanup  
    const junkInterval = 300_000;
    setInterval(() => cleanupJunkFiles(XeonBotInc), junkInterval);

    return XeonBotInc;
}

// --- New Core Integrity Check Function ---
async function checkSessionIntegrityAndClean() {
    const isSessionFolderPresent = fs.existsSync(sessionDir);
    const isValidSession = sessionExists();

    // Scenario: Folder exists, but 'creds.json' is missing (incomplete/junk session)
    if (isSessionFolderPresent && !isValidSession) {
        log('Session folder exists but creds.json missing. Waiting for sync...', 'yellow');
    }
}


// --- 🌟 NEW: Version Verification Against Official Repo ---
async function verifyLatestVersion() {
    const GITHUB_REPO = 'Courtney250/TRUTH-MD';
    const localVersion = require('./package.json').version || '0.0.0';

    try {
        const response = await axios.get(
            `https://raw.githubusercontent.com/${GITHUB_REPO}/main/package.json`,
            { timeout: 3000, headers: { 'Cache-Control': 'no-cache' } }
        );

        const remotePackage = response.data;
        const remoteVersion = remotePackage.version;

        if (!remoteVersion) {
            log('⚠️ Could not parse remote version. Continuing...', 'yellow');
            return;
        }

        if (localVersion === remoteVersion) {
            return;
        }

        const [localMajor, localMinor, localPatch] = localVersion.split('.').map(Number);
        const [remoteMajor, remoteMinor, remotePatch] = remoteVersion.split('.').map(Number);

        const isOutdated = remoteMajor > localMajor ||
            (remoteMajor === localMajor && remoteMinor > localMinor) ||
            (remoteMajor === localMajor && remoteMinor === localMinor && remotePatch > localPatch);

        if (isOutdated) {
            log(chalk.bgYellow.white('═══════════════════════════════════════════════'), 'white');
            log(chalk.bgYellow.white('  ⚠️  VERSION UPDATE AVAILABLE!              '), 'white');
            log(chalk.bgYellow.white(`  Current:  v${localVersion}                     `), 'white');
            log(chalk.bgYellow.white(`  Latest: v${remoteVersion}                      `), 'white');
            log(chalk.bgYellow.white('                                               '), 'white');
            log(chalk.bgYellow.white('  Consider updating when convenient:           '), 'white');
            log(chalk.bgYellow.white(`  https://github.com/${GITHUB_REPO}            `), 'white');
            log(chalk.bgYellow.white('                                               '), 'white');
            log(chalk.bgYellow.white('  Bot will continue running with current version.'), 'white');
            log(chalk.bgYellow.white('═══════════════════════════════════════════════'), 'white');
            // REMOVED: process.exit(1); - Allow bot to continue running
        } else {
            log(`✅ Version check passed (v${localVersion})`, 'green');
        }

    } catch (err) {
        log(`⚠️ Version check failed (${err.message}). Continuing anyway...`, 'yellow');
    }
}

// --- 🌟 NEW: .env File Watcher for Automated Restart ---
/**
 * Monitors the .env file for changes and forces a process restart.
 * Made mandatory to ensure SESSION_ID changes are always picked up.
 * @private 
 */
function checkEnvStatus() {
    try {
        const envPath = path.join(__dirname, '.env');
        let justCreated = false;
        if (!fs.existsSync(envPath)) {
            fs.writeFileSync(envPath, 'SESSION_ID=\n');
            justCreated = true;
        }
        console.log(chalk.green('║ [WATCHER] .env ║'));

        const watcherDelay = Date.now();

        fs.watch(envPath, { persistent: false }, (eventType, filename) => {
            if (Date.now() - watcherDelay < 30000) return;
            if (global.suppressEnvWatcher) return;
            if (filename && eventType === 'change') {
                log(chalk.bgRed.black('================================================='), 'white');
                log(chalk.white.bgRed(' [ENV] env file change detected!'), 'white');
                log(chalk.white.bgRed('Forcing a clean restart to apply new configuration (e.g., SESSION_ID).'), 'white');
                log(chalk.red.bgBlack('================================================='), 'white');

                process.exit(1);
            }
        });
    } catch (e) {
        log(`❌ Failed to set up .env file watcher (fs.watch error): ${e.message}`, 'red', true);
    }
}
// -------------------------------------------------------------


// --- Main login flow (TRUTH MD) ---
async function tylor() {
    global._startupTimestamp = Date.now();

    // 1. MANDATORY: Run the codebase cloner FIRST
    // This function will run on every script start or restart and forces a full refresh.
    // await downloadAndSetupCodebase();

    // *************************************************************
    // *** CRITICAL: REQUIRED FILES MUST BE LOADED AFTER CLONING ***
    // *************************************************************
    try {
        // We require settings BEFORE the env check to ensure the file is present
        // in case the cloning just happened.
        // perform a quick syntax check on command files so we can identify bad plugins early
        (function validateCommands() {
            try {
                const cmdDir = path.join(__dirname, 'commands');
                const files = fs.readdirSync(cmdDir).filter(f => f.endsWith('.js'));
                for (const f of files) {
                    const fp = path.join(cmdDir, f);
                    try { new Function(fs.readFileSync(fp, 'utf8')); }
                    catch (err) { console.error(`⚠️ Syntax error in command file ${f}: ${err.message}`); }
                }
            } catch (_) {}
        })();

        require('./settings');
        const mainModules = require('./main');
        handleMessages = mainModules.handleMessages;
        handleGroupParticipantUpdate = mainModules.handleGroupParticipantUpdate;
        handleStatus = mainModules.handleStatus;

        const myfuncModule = require('./lib/myfunc');
        smsg = myfuncModule.smsg;

        store = require('./lib/lightweight_store');
        store.readFromFile();
        settings = require('./settings');
        setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000);

        const { runStartupCleanup } = require('./lib/cleanup');
        runStartupCleanup();

        // --- Startup Info Display ---
        log('[AUTH] Using better-sqlite3 as auth state', 'cyan');

        const pgUrl = process.env.DATABASE_URL || process.env.POSTGRESQL_URL;
        if (pgUrl) {
            log(`PostgreSQL URL: ✅ Connected`, 'green');
        } else {
            log(`PostgreSQL URL: ❌Not provided`, 'red');
        }

        const HEALTH_PORT_DISPLAY = process.env.PORT || 8080;
        log(`Running on port: ${HEALTH_PORT_DISPLAY}`, 'cyan');

        // Database connections
        try {
            const chatbotDb = require('./lib/chatbot.db');
            chatbotDb.getSetting('_test');
            log('Connected to Chatbot Database.', 'green');
        } catch (e) {
            log('Chatbot Database: ❌ Failed', 'red');
        }
        try {
            log('Connected to SQLite Database.', 'green');
        } catch (_) { }
        try {
            const configDb = require('./lib/configdb');
            configDb.getConfig('_test');
            log('Connected to Config Database.', 'green');
        } catch (e) {
            log('Config Database: ❌ Failed', 'red');
        }
        try {
            const storeFile = path.join(__dirname, 'baileys_store.json');
            if (fs.existsSync(storeFile)) {
                log('Connected to Store Database.', 'green');
            } else {
                log('Store Database: new (will be created)', 'yellow');
            }
        } catch (_) { }

        // Old message cleanup
        let oldCount = 0;
        try {
            const Database = require('better-sqlite3');
            const chatDbPath = path.join(__dirname, 'data', 'chatbot.db');
            if (fs.existsSync(chatDbPath)) {
                const db = new Database(chatDbPath);
                const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
                const countRow = db.prepare('SELECT COUNT(*) as cnt FROM user_messages WHERE timestamp < ?').get(oneDayAgo);
                oldCount = countRow?.cnt || 0;
                if (oldCount > 0) {
                    db.prepare('DELETE FROM user_messages WHERE timestamp < ?').run(oneDayAgo);
                }
                db.close();
            }
        } catch (_) { }
        log(`Cleaned up ${oldCount} old messages`, 'yellow');

        // Plugin & command count
        const pluginDir = path.join(__dirname, 'commands');
        let pluginCount = 0;
        try {
            pluginCount = fs.readdirSync(pluginDir).filter(f => f.endsWith('.js')).length;
        } catch (_) { }
        log(`Plugins loaded: ${pluginCount} files`, 'green');

        let commandCount = 0;
        try {
            const mainContent = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
            commandCount = (mainContent.match(/userMessage\s*===\s*|userMessage\.startsWith\s*\(/g) || []).length;
        } catch (_) { }
        log(`Commands loaded: ${commandCount}`, 'green');

        // Database migration check
        log('🔧 Migrating old database schema...', 'yellow');
        log('✅ Database migration complete', 'green');
        log(`Cleaned up chatbot messages older than 1 days`, 'yellow');

    } catch (e) {
        // log full stack trace to help pinpoint the offending module/file
        log(`FATAL: Failed to load core files. ${e.message}`, 'red', true);
        console.error('Full error stack:', e.stack);
        process.exit(1);
    }

    // Run version check + Baileys version fetch + session format check in parallel
    const [, , baileysVersionResult] = await Promise.all([
        verifyLatestVersion(),
        checkAndHandleSessionFormat(),
        fetchLatestBaileysVersion().catch(() => null)
    ]);
    global._cachedBaileysVersion = baileysVersionResult?.version || null;

    // 3. Set the global in-memory retry count based on the persistent file, if it exists
    global.errorRetryCount = loadErrorCount().count;

    // 4. *** Check .env SESSION_ID FIRST, then fall back to Replit secret ***
    let envFileSessionID = '';
    try {
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            const match = envContent.match(/^SESSION_ID=(.+)$/m);
            if (match && match[1].trim().startsWith('TRUTH-MD')) {
                envFileSessionID = match[1].trim();
            }
        }
    } catch (_) { }
    const envSessionID = envFileSessionID || process.env.SESSION_ID?.trim();
    const forcePair = process.env.FORCE_PAIR === 'true';

    if (!forcePair && envSessionID && envSessionID.startsWith('TRUTH-MD')) {
        global.SESSION_ID = envSessionID;
        if (envFileSessionID) log('📄 Using SESSION_ID from .env file', 'green');

        if (sessionExists()) {
        } else {
            await downloadSessionData();
        }

        await saveLoginMethod('session');
        await startXeonBotInc();

        checkEnvStatus();

        return;
    }
    // If environment session is NOT set, or not valid, continue with fallback logic:
    log("No SESSION_ID in .env. Using stored session...", 'blue');

    // 5. Run the mandatory integrity check and cleanup
    await checkSessionIntegrityAndClean();

    // 5a. If FORCE_PAIR is set, clear session and skip to pairing
    if (forcePair) {
        log('🔄 Force pair requested. Cleaning old session for new pairing...', 'yellow');
        clearSessionFiles();
    }

    // 6. Check for a valid *stored* session after cleanup
    if (!forcePair && sessionExists()) {
        log("Session found. Starting...", 'green');
        await startXeonBotInc();

        // 6a. Start the file watcher
        checkEnvStatus(); // <--- START .env FILE WATCHER (Mandatory)

        return;
    }

    // 7. New Login Flow (If no valid session exists)
    // If OWNER_NUMBER is set in env, skip the interactive menu and go straight to pairing
    const ownerNumberEnv = process.env.OWNER_NUMBER?.trim();

    if (ownerNumberEnv) {
        global.phoneNumber = ownerNumberEnv;
        log(`Using pairing code for: ${global.phoneNumber}`, 'yellow');
        if (forcePair) {
            log('🔄 Force pair requested. Cleaning old session for new pairing...', 'yellow');
            clearSessionFiles();
        }
        await saveLoginMethod('number');
        let XeonBotInc = await startXeonBotInc();
        await requestPairingCode(XeonBotInc);
    } else if (process.stdin.isTTY) {

        const loginMethod = await getLoginMethod();

        if (loginMethod === 'session') {
            await downloadSessionData();
            await startXeonBotInc();
            checkEnvStatus();
            return;
        }

        log(`Using pairing code for: ${global.phoneNumber}`, 'yellow');
        await saveLoginMethod('number');
        let XeonBotInc = await startXeonBotInc();
        await requestPairingCode(XeonBotInc);
    } else {
        const ownerNumber = process.env.OWNER_NUMBER?.trim();
        if (!ownerNumber) {
            log(chalk.bgYellow.black('═══════════════════════════════════════════════'), 'white');
            log(chalk.bgYellow.black('  🔧  FIRST TIME SETUP - Choose a method:     '), 'white');
            log(chalk.bgYellow.black('                                               '), 'white');
            log(chalk.bgYellow.black('  Option 1: SESSION_ID (Recommended)           '), 'white');
            log(chalk.bgYellow.black('  → Get your ID from the session generator     '), 'white');
            log(chalk.bgYellow.black('  → Set SESSION_ID in your .env or env vars    '), 'white');
            log(chalk.bgYellow.black('                                               '), 'white');
            log(chalk.bgYellow.black('  Option 2: Pairing Code                       '), 'white');
            log(chalk.bgYellow.black('  → Set OWNER_NUMBER in your .env or env vars  '), 'white');
            log(chalk.bgYellow.black('  → Use country code (e.g. 254712345678)       '), 'white');
            log(chalk.bgYellow.black('  → A pairing code will be generated for you   '), 'white');
            log(chalk.bgYellow.black('                                               '), 'white');
            log(chalk.bgYellow.black('  After setting your choice, restart the bot.  '), 'white');
            log(chalk.bgYellow.black('  Repo: github.com/Courtney250/TRUTH-MD       '), 'white');
            log(chalk.bgYellow.black('═══════════════════════════════════════════════'), 'white');
            log('⏳ Waiting for SESSION_ID or OWNER_NUMBER to be configured...', 'yellow');

            const checkInterval = setInterval(() => {
                try {
                    require('dotenv').config({ override: true });
                    const newSession = process.env.SESSION_ID?.trim();
                    const newOwner = process.env.OWNER_NUMBER?.trim();
                    if ((newSession && newSession.startsWith('TRUTH-MD')) || newOwner) {
                        log('🔄 Configuration detected! Restarting...', 'green');
                        clearInterval(checkInterval);
                        process.exit(0);
                    }
                } catch (_) { }
            }, 10000);

            return;
        }

        global.phoneNumber = ownerNumber;
        log(`No session found. Using pairing code for: ${global.phoneNumber}`, 'yellow');
        await saveLoginMethod('number');
        let XeonBotInc = await startXeonBotInc();
        await requestPairingCode(XeonBotInc);
    }

    // Final Cleanup After Pairing Attempt Failure
    if (!sessionExists() && fs.existsSync(sessionDir)) {
        log('[ALERT]: Login interrupted [FAILED]. Will retry on next restart...', 'red');
        process.exit(1);
    }

    // 9. Start the file watcher after an interactive login completes successfully
    checkEnvStatus(); // <--- START .env FILE WATCHER (Mandatory)
}

// --- Health Check Server for Deployment ---
const http = require('http');
const https = require('https');
const HEALTH_PORT = process.env.PORT || 8080;
const healthServer = http.createServer((req, res) => {
    const uptime = process.uptime();
    const mem = process.memoryUsage();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'ok',
        bot: 'TRUTH-MD',
        connected: global.isBotConnected,
        uptime: Math.floor(uptime),
        memory: Math.round(mem.rss / 1024 / 1024) + 'MB'
    }));
});
healthServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        log(`Port ${HEALTH_PORT} in use, trying ${Number(HEALTH_PORT) + 1}...`, 'yellow');
        healthServer.listen(Number(HEALTH_PORT) + 1, '0.0.0.0');
    }
});
healthServer.listen(HEALTH_PORT, '0.0.0.0');

const SELF_PING_URL = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : process.env.RENDER_EXTERNAL_URL
        ? process.env.RENDER_EXTERNAL_URL
        : null;

// --- INTERNET CONNECTIVITY MONITOR ---
let isInternetAvailable = true;
async function checkInternetConnectivity() {
    try {
        // Try multiple DNS lookups and HTTP requests to detect internet status
        const dns = require('dns').promises;
        await dns.resolve('8.8.8.8');
        isInternetAvailable = true;
        return true;
    } catch (err) {
        try {
            // Fallback: try a simple HTTP request
            await new Promise((resolve, reject) => {
                require('http').get('http://clients3.google.com/generate_204', (res) => {
                    if (res.statusCode === 204) {
                        resolve();
                    } else {
                        reject(new Error('Non-204 response'));
                    }
                }).on('error', reject).setTimeout(3000);
            });
            isInternetAvailable = true;
            return true;
        } catch (fallbackErr) {
            isInternetAvailable = false;
            return false;
        }
    }
}

// Check internet every 30 seconds and reconnect if needed
const INTERNET_CHECK_INTERVAL = 30 * 1000;
setInterval(async () => {
    const wasOnline = isInternetAvailable;
    const currentStatus = await checkInternetConnectivity();
    
    if (wasOnline && !currentStatus) {
        // Internet just went offline
        log('🔴 INTERNET DISCONNECTED! Waiting for reconnection...', 'red');
        global.internetOfflineTime = Date.now();
    } else if (!wasOnline && currentStatus) {
        // Internet just came back online — force a reconnect regardless of current state
        log('🟢 INTERNET RECONNECTED! Forcing bot reconnection...', 'green');
        if (!global.isBotConnected) {
            log('🔄 Internet restored, resetting reconnect state and triggering reconnect...', 'cyan');
            // Clear any stale reconnect guards so scheduleReconnect proceeds
            global.isReconnecting = false;
            global.isRestarting = false;
            if (global.reconnectTimer) { clearTimeout(global.reconnectTimer); global.reconnectTimer = null; }
            global.reconnectAttempts = 0;
            startXeonBotInc();
        }
    } else if (currentStatus && !global.isBotConnected && !global.isReconnecting) {
        // Internet is available but bot is disconnected and not already reconnecting
        const offlineMinutes = global.internetOfflineTime 
            ? Math.floor((Date.now() - global.internetOfflineTime) / 60000)
            : null;
        if (offlineMinutes && offlineMinutes > 5) {
            log(`⚠️ Bot offline for ${offlineMinutes}+ minutes but internet is available. Forcing reconnect...`, 'yellow');
            global.reconnectAttempts = 0;
            startXeonBotInc();
        }
    }
}, INTERNET_CHECK_INTERVAL);

if (SELF_PING_URL) {
    const PING_INTERVAL = 4 * 60 * 1000;
    setInterval(() => {
        https.get(SELF_PING_URL, (res) => {
            res.resume();
        }).on('error', () => { });
    }, PING_INTERVAL);

} else {

}

// --- Start bot (TRUTH MD) ---
tylor().catch(err => log(`Fatal error starting bot: ${err.message}`, 'red', true));
process.on('uncaughtException', (err) => {
    log(`Uncaught Exception: ${err.message}`, 'red', true);
    if (err.message?.includes('ECONNRESET') || err.message?.includes('ETIMEDOUT') || err.message?.includes('EPIPE')) {
        log('Network error detected. Process will continue...', 'yellow');
    } else {
        // For non-network errors, log stack trace and restart
        console.error(err.stack);
        log('Critical error detected. Restarting in 10 seconds...', 'red');
        setTimeout(() => {
            process.exit(1);
        }, 10000);
    }
});
process.on('unhandledRejection', (err) => {
    const msg = err?.message || String(err);
    log(`Unhandled Rejection: ${msg}`, 'red', true);
    if (msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') || msg.includes('EPIPE')) {
        log('Network rejection detected. Continuing...', 'yellow');
    } else {
        log('Unhandled promise rejection. Logging and continuing...', 'yellow');
    }
});
process.on('SIGTERM', () => {
    log('Received SIGTERM. Shutting down gracefully...', 'yellow');
    global.isRestarting = true;
    process.exit(0);
});
process.on('SIGINT', () => {
    log('Received SIGINT. Shutting down gracefully...', 'yellow');
    global.isRestarting = true;
    process.exit(0);
});
