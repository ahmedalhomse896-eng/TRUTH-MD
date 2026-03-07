const fs = require('fs');
const path = require('path');
let axios;
try {
    axios = require('axios');
} catch (e) {
    console.warn('[HEROKU] axios module not found, skipping Heroku API calls');
    axios = null;
}

const isHeroku = !!process.env.DYNO;
const SESSION_DIR = path.join(__dirname, '..', 'session');
const CREDS_PATH = path.join(SESSION_DIR, 'creds.json');

let saveTimeout = null;
let isSaving = false;

function log(msg, color = 'white') {
    try {
        const chalk = require('chalk');
        const prefix = chalk.magenta.bold('[ TRUTH - MD ]');
        console.log(`${prefix} ${chalk[color] ? chalk[color](msg) : msg}`);
    } catch {
        console.log(`[ TRUTH - MD ] ${msg}`);
    }
}

async function saveSessionToHeroku() {
    if (!isHeroku) return;

    const apiKey = process.env.HEROKU_API_KEY;
    const appName = process.env.HEROKU_APP_NAME;

    if (!apiKey || !appName) {
        return;
    }

    if (isSaving) return;
    isSaving = true;

    try {
        if (!fs.existsSync(CREDS_PATH)) {
            isSaving = false;
            return;
        }

        const credsData = fs.readFileSync(CREDS_PATH, 'utf-8');
        const encoded = Buffer.from(credsData).toString('base64');
        const newSessionId = `TRUTH-MD:~${encoded}`;

        const currentSessionId = process.env.SESSION_ID;
        if (currentSessionId === newSessionId) {
            isSaving = false;
            return;
        }

        await axios.patch(
            `https://api.heroku.com/apps/${appName}/config-vars`,
            { SESSION_ID: newSessionId },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.heroku+json; version=3',
                    'Authorization': `Bearer ${apiKey}`
                },
                timeout: 15000
            }
        );

        process.env.SESSION_ID = newSessionId;
        log('[HEROKU] Session saved to config vars successfully.', 'green');
    } catch (err) {
        log(`[HEROKU] Failed to save session: ${err.message}`, 'red');
    } finally {
        isSaving = false;
    }
}

function debouncedSave() {
    if (!isHeroku) return;
    if (!process.env.HEROKU_API_KEY || !process.env.HEROKU_APP_NAME) return;

    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveSessionToHeroku();
    }, 30000);
}

function setupHerokuShutdownHandler() {
    if (!isHeroku) return;

    process.on('SIGTERM', async () => {
        log('[HEROKU] SIGTERM received. Saving session before shutdown...', 'yellow');
        if (saveTimeout) clearTimeout(saveTimeout);
        await saveSessionToHeroku();
        log('[HEROKU] Graceful shutdown complete.', 'green');
        process.exit(0);
    });

    log('[HEROKU] Shutdown handler registered.', 'cyan');
}

function getChromiumPath() {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    if (isHeroku) {
        const herokuChromePaths = [
            '/app/.apt/usr/bin/google-chrome-stable',
            '/app/.apt/usr/bin/google-chrome',
            '/app/.chrome/opt/google/chrome/google-chrome'
        ];
        for (const p of herokuChromePaths) {
            if (fs.existsSync(p)) return p;
        }
    }

    const commonPaths = [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
    ];
    for (const p of commonPaths) {
        if (fs.existsSync(p)) return p;
    }

    return null;
}

function getFfmpegPath() {
    if (isHeroku) {
        const herokuFfmpegPaths = [
            '/app/vendor/ffmpeg/ffmpeg',
            '/app/.heroku/vendor/ffmpeg',
            '/usr/bin/ffmpeg'
        ];
        for (const p of herokuFfmpegPaths) {
            if (fs.existsSync(p)) return p;
        }
    }
    return 'ffmpeg';
}

function configureHerokuEnvironment() {
    if (!isHeroku) return;

    const chromePath = getChromiumPath();
    if (chromePath) {
        process.env.PUPPETEER_EXECUTABLE_PATH = chromePath;
        process.env.PUPPETEER_SKIP_DOWNLOAD = 'true';
        log(`[HEROKU] Chromium path: ${chromePath}`, 'cyan');
    }

    const ffmpegPath = getFfmpegPath();
    if (ffmpegPath !== 'ffmpeg') {
        process.env.FFMPEG_PATH = ffmpegPath;
        log(`[HEROKU] FFmpeg path: ${ffmpegPath}`, 'cyan');
    }

    process.env.PUPPETEER_SKIP_DOWNLOAD = 'true';

    setupHerokuShutdownHandler();

    log('[HEROKU] Environment configured successfully.', 'green');
}

module.exports = {
    isHeroku,
    saveSessionToHeroku,
    debouncedSave,
    setupHerokuShutdownHandler,
    configureHerokuEnvironment,
    getChromiumPath,
    getFfmpegPath
};
