const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const settings = require('../settings');
const { rmSync } = require('fs');

// Import user settings system
let userSettings;
try {
    userSettings = require('../lib/userSettings');
} catch (e) {
    console.error('Failed to load user settings:', e.message);
}

function run(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, { windowsHide: true, timeout: 120000 }, (err, stdout, stderr) => {
            if (err) return reject(new Error((stderr || stdout || err.message || '').toString()));
            resolve((stdout || '').toString());
        });
    });
}

async function hasGitRepo() {
    const gitDir = path.join(process.cwd(), '.git');
    if (!fs.existsSync(gitDir)) return false;
    try {
        await run('git --version');
        return true;
    } catch {
        return false;
    }
}

const PROTECTED_PATHS = [
    'session', 'sessions', 'data', 'auth_info_baileys',
    '.env', 'baileys_store.json', 'settings.js',
    'message_backup.json', 'sessionErrorCount.json',
    'lib/userSettings.js', 'lib/sqliteAuthState.js', 'lib/cleanup.js'
];

// Critical files that must ALWAYS be preserved during updates
const CRITICAL_FILES = [
    'data/user_settings.db',       // User settings database
    'data/custom_apis.json',       // Custom fallback APIs
    'data/owner.json',             // Owner number
    'data/sudo.json',              // Sudo users list
    'data/prefix.json',            // Bot prefix
    'data/deployments.json'        // Deployment data
];

function backupProtected() {
    const backed = {};

    // Backup user settings if available
    if (userSettings) {
        try {
            console.log('📦 Backing up user settings...');
            backed['user_settings_data'] = {
                type: 'data',
                data: userSettings.exportSettings()
            };
        } catch (error) {
            console.error('❌ Failed to backup user settings:', error.message);
        }
    }

    for (const p of PROTECTED_PATHS) {
        const full = path.join(process.cwd(), p);
        if (!fs.existsSync(full)) continue;
        const stat = fs.lstatSync(full);
        if (stat.isDirectory()) {
            const tmpCopy = full + '_update_bak';
            try {
                if (fs.existsSync(tmpCopy)) fs.rmSync(tmpCopy, { recursive: true, force: true });
                fs.cpSync(full, tmpCopy, { recursive: true });
                backed[p] = { type: 'dir', backup: tmpCopy };
            } catch {}
        } else {
            const tmpCopy = full + '.update_bak';
            try {
                fs.copyFileSync(full, tmpCopy);
                backed[p] = { type: 'file', backup: tmpCopy };
            } catch {}
        }
    }
    return backed;
}

function restoreProtected(backed) {
    // Restore user settings first
    if (backed['user_settings_data'] && userSettings) {
        try {
            console.log('📦 Restoring user settings...');
            const success = userSettings.importSettings(backed['user_settings_data'].data);
            if (success) {
                console.log('✅ User settings restored successfully');
            } else {
                console.error('❌ Failed to restore user settings');
            }
        } catch (error) {
            console.error('❌ Error restoring user settings:', error.message);
        }
    }

    for (const [p, info] of Object.entries(backed)) {
        if (p === 'user_settings_data') continue; // Already handled above

        const full = path.join(process.cwd(), p);
        try {
            if (info.type === 'dir') {
                if (fs.existsSync(full)) fs.rmSync(full, { recursive: true, force: true });
                fs.cpSync(info.backup, full, { recursive: true });
                fs.rmSync(info.backup, { recursive: true, force: true });
            } else {
                fs.copyFileSync(info.backup, full);
                fs.unlinkSync(info.backup);
            }
        } catch {}
    }
}

async function updateViaGit() {
    const oldRev = (await run('git rev-parse HEAD').catch(() => 'unknown')).trim();
    await run('git fetch --depth 1 origin main').catch(() =>
        run('git fetch origin main')
    );
    const newRev = (await run('git rev-parse origin/main').catch(() => '')).trim();

    if (!newRev) {
        throw new Error('Could not fetch latest commit from origin/main');
    }

    const alreadyUpToDate = oldRev === newRev;
    let commits = '';
    let files = '';

    if (!alreadyUpToDate) {
        commits = await run(`git log --pretty=format:"%h %s (%an)" ${oldRev}..${newRev} 2>/dev/null`).catch(() => '');
        files = await run(`git diff --name-status ${oldRev} ${newRev} 2>/dev/null`).catch(() => '');

        let preserved = {};
        try {
            preserved.ownerNumber = settings.ownerNumber ? String(settings.ownerNumber) : null;
            preserved.botOwner = settings.botOwner ? String(settings.botOwner) : null;
            preserved.defaultPrefix = settings.defaultPrefix ? String(settings.defaultPrefix) : null;
            preserved.commandMode = settings.commandMode ? String(settings.commandMode) : null;
            preserved.defaultMenuStyle = settings.defaultMenuStyle ? String(settings.defaultMenuStyle) : null;
            preserved.packname = settings.packname ? String(settings.packname) : null;
            preserved.author = settings.author != null ? String(settings.author) : null;
            preserved.botName = settings.botName ? String(settings.botName) : null;
            // ADD MISSING SETTINGS PRESERVATION
            preserved.giphyApiKey = settings.giphyApiKey ? String(settings.giphyApiKey) : null;
            preserved.maxStoreMessages = settings.maxStoreMessages ? String(settings.maxStoreMessages) : null;
            preserved.storeWriteInterval = settings.storeWriteInterval ? String(settings.storeWriteInterval) : null;
            preserved.description = settings.description ? String(settings.description) : null;
            preserved.updateZipUrl = settings.updateZipUrl ? String(settings.updateZipUrl) : null;
            preserved.githubRepo = settings.githubRepo ? String(settings.githubRepo) : null;
        } catch {}

        // Backup critical files explicitly
        console.log('💾 Backing up critical files before update...');
        const criticalBackup = {};
        for (const filePath of CRITICAL_FILES) {
            const fullPath = path.join(process.cwd(), filePath);
            if (fs.existsSync(fullPath)) {
                try {
                    console.log(`  ✅ Backing up: ${filePath}`);
                    const backupPath = fullPath + '.critical_backup';
                    fs.copyFileSync(fullPath, backupPath);
                    criticalBackup[filePath] = backupPath;
                } catch (e) {
                    console.log(`  ⚠️ Failed to backup ${filePath}: ${e.message}`);
                }
            }
        }

        const backed = backupProtected();

        try {
            try {
                await run('git stash');
            } catch {}
            await run('git pull --rebase --no-tags origin main').catch(() =>
                run('git reset --hard origin/main')
            );
        } finally {
            restoreProtected(backed);
            
            // Restore critical files
            console.log('♻️ Restoring critical files after update...');
            for (const [filePath, backupPath] of Object.entries(criticalBackup)) {
                try {
                    const fullPath = path.join(process.cwd(), filePath);
                    // Ensure directory exists
                    const fileDir = path.dirname(fullPath);
                    if (!fs.existsSync(fileDir)) {
                        fs.mkdirSync(fileDir, { recursive: true });
                    }
                    fs.copyFileSync(backupPath, fullPath);
                    fs.unlinkSync(backupPath); // Remove backup after restore
                    console.log(`  ✅ Restored: ${filePath}`);
                } catch (e) {
                    console.log(`  ⚠️ Failed to restore ${filePath}: ${e.message}`);
                }
            }
        }

        try {
            const settingsPath = path.join(process.cwd(), 'settings.js');
            if (fs.existsSync(settingsPath)) {
                let text = fs.readFileSync(settingsPath, 'utf8');
                
                // MOST ROBUST: Replace settings one per line with exact matching
                const settingsToUpdate = [
                    { key: 'ownerNumber', value: preserved.ownerNumber, quote: "'" },
                    { key: 'botOwner', value: preserved.botOwner, quote: "'" },
                    { key: 'defaultPrefix', value: preserved.defaultPrefix, quote: '"' },
                    { key: 'commandMode', value: preserved.commandMode, quote: '"' },
                    { key: 'defaultMenuStyle', value: preserved.defaultMenuStyle, quote: '"' },
                    { key: 'packname', value: preserved.packname, quote: "'" },
                    { key: 'author', value: preserved.author, quote: "'" },
                    { key: 'botName', value: preserved.botName, quote: '"' },
                    { key: 'giphyApiKey', value: preserved.giphyApiKey, quote: "'" },
                    { key: 'description', value: preserved.description, quote: '"' },
                    { key: 'updateZipUrl', value: preserved.updateZipUrl, quote: '"' },
                    { key: 'githubRepo', value: preserved.githubRepo, quote: '"' }
                ];
                
                for (const { key, value, quote } of settingsToUpdate) {
                    if (!value) continue;
                    const esc = v => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'");
                    // Match the exact line with key: and any quote type, preserve formatting
                    const pattern = new RegExp(`(\\s*${key}:\\s*)['"\`]([^'"\`]*)['"\`]([,]?)`, 'm');
                    const replacement = `$1${quote}${esc(value)}${quote}$3`;
                    text = text.replace(pattern, replacement);
                    console.log(`[UPDATE] Setting ${key} = ${value}`);
                }
                
                // Handle numeric values separately (no quotes)
                if (preserved.maxStoreMessages) {
                    text = text.replace(/(\s*maxStoreMessages:\s*)\d+([,]?)/m, `$1${parseInt(preserved.maxStoreMessages)}$2`);
                    console.log(`[UPDATE] Setting maxStoreMessages = ${preserved.maxStoreMessages}`);
                }
                if (preserved.storeWriteInterval) {
                    text = text.replace(/(\s*storeWriteInterval:\s*)\d+([,]?)/m, `$1${parseInt(preserved.storeWriteInterval)}$2`);
                    console.log(`[UPDATE] Setting storeWriteInterval = ${preserved.storeWriteInterval}`);
                }
                
                fs.writeFileSync(settingsPath, text);
                console.log('[UPDATE] Settings file updated');
                
                // Verify syntax
                try {
                    delete require.cache[require.resolve(settingsPath)];
                    const restored = require(settingsPath);
                    console.log('[UPDATE] ✅ Settings syntax verified - prefix is now:', restored.defaultPrefix || '.');
                } catch (err) {
                    console.error('[UPDATE] ❌ settings.js syntax invalid after restore:', err.message);
                    if (backed && backed['settings.js']) {
                        try { 
                            fs.copyFileSync(backed['settings.js'].backup, settingsPath);
                            delete require.cache[require.resolve(settingsPath)];
                            console.log('[UPDATE] ✅ settings.js restored from backup due to syntax error'); 
                        } catch(e) {}
                    }
                }
            }
        } catch (e) {
            console.error('[UPDATE] ❌ Error restoring settings:', e.message);
            throw e;
        }
    }

    try {
        const { runGuard } = require('../lib/gitguard');
        runGuard();
    } catch {}

    return { oldRev, newRev, alreadyUpToDate, commits, files };
}

function downloadFile(url, dest, visited = new Set()) {
    return new Promise((resolve, reject) => {
        try {
            if (visited.has(url) || visited.size > 5) {
                return reject(new Error('Too many redirects'));
            }
            visited.add(url);

            const useHttps = url.startsWith('https://');
            const client = useHttps ? require('https') : require('http');
            const req = client.get(url, {
                headers: {
                    'User-Agent': 'truth-md-Updater/1.0',
                    'Accept': '*/*'
                }
            }, res => {
                if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                    const location = res.headers.location;
                    if (!location) return reject(new Error(`HTTP ${res.statusCode} without Location`));
                    const nextUrl = new URL(location, url).toString();
                    res.resume();
                    return downloadFile(nextUrl, dest, visited).then(resolve).catch(reject);
                }

                if (res.statusCode !== 200) {
                    return reject(new Error(`HTTP ${res.statusCode}`));
                }

                const file = fs.createWriteStream(dest);
                res.pipe(file);
                file.on('finish', () => file.close(resolve));
                file.on('error', err => {
                    try { file.close(() => {}); } catch {}
                    fs.unlink(dest, () => reject(err));
                });
            });
            req.on('error', err => {
                fs.unlink(dest, () => reject(err));
            });
            req.setTimeout(60000, () => {
                req.destroy(new Error('Download timeout'));
            });
        } catch (e) {
            reject(e);
        }
    });
}

async function extractZip(zipPath, outDir) {
    if (process.platform === 'win32') {
        const cmd = `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir.replace(/\\/g, '/')}' -Force"`;
        await run(cmd);
        return;
    }
    try {
        await run('command -v unzip');
        await run(`unzip -o '${zipPath}' -d '${outDir}'`);
        return;
    } catch {}
    try {
        await run('command -v 7z');
        await run(`7z x -y '${zipPath}' -o'${outDir}'`);
        return;
    } catch {}
    try {
        await run('busybox unzip -h');
        await run(`busybox unzip -o '${zipPath}' -d '${outDir}'`);
        return;
    } catch {}
    throw new Error("No system unzip tool found (unzip/7z/busybox). Git mode is recommended.");
}

function copyRecursive(src, dest, ignore = [], relative = '', outList = []) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
        if (ignore.includes(entry)) continue;
        const s = path.join(src, entry);
        const d = path.join(dest, entry);
        const stat = fs.lstatSync(s);
        if (stat.isDirectory()) {
            copyRecursive(s, d, ignore, path.join(relative, entry), outList);
        } else {
            fs.copyFileSync(s, d);
            if (outList) outList.push(path.join(relative, entry).replace(/\\/g, '/'));
        }
    }
}

async function updateViaZip(sock, chatId, message, zipOverride) {
    const zipUrl = (zipOverride || settings.updateZipUrl || process.env.UPDATE_ZIP_URL || '').trim();
    if (!zipUrl) {
        throw new Error('No ZIP URL configured. Set settings.updateZipUrl or UPDATE_ZIP_URL env.');
    }
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const zipPath = path.join(tmpDir, 'update.zip');
    await downloadFile(zipUrl, zipPath);
    const extractTo = path.join(tmpDir, 'update_extract');
    if (fs.existsSync(extractTo)) fs.rmSync(extractTo, { recursive: true, force: true });
    await extractZip(zipPath, extractTo);

    const entries = fs.readdirSync(extractTo).map(n => path.join(extractTo, n));
    const root = entries.find(e => fs.lstatSync(e).isDirectory()) || extractTo;

    const ignore = ['node_modules', '.git', 'session', 'sessions', 'auth_info_baileys', 'tmp', 'temp', 'data', 'baileys_store.json', '.env', '.replit', 'replit.nix', 'replit.md', 'settings.js'];
    const copied = [];

    // Backup critical files before ZIP extraction
    console.log('💾 Backing up critical files before ZIP update...');
    const criticalBackup = {};
    for (const filePath of CRITICAL_FILES) {
        const fullPath = path.join(process.cwd(), filePath);
        if (fs.existsSync(fullPath)) {
            try {
                console.log(`  ✅ Backing up: ${filePath}`);
                const backupPath = fullPath + '.critical_backup';
                fs.copyFileSync(fullPath, backupPath);
                criticalBackup[filePath] = backupPath;
            } catch (e) {
                console.log(`  ⚠️ Failed to backup ${filePath}: ${e.message}`);
            }
        }
    }

    let preserved = {};
    try {
        preserved.ownerNumber = settings.ownerNumber ? String(settings.ownerNumber) : null;
        preserved.botOwner = settings.botOwner ? String(settings.botOwner) : null;
        preserved.defaultPrefix = settings.defaultPrefix ? String(settings.defaultPrefix) : null;
        preserved.commandMode = settings.commandMode ? String(settings.commandMode) : null;
        preserved.defaultMenuStyle = settings.defaultMenuStyle ? String(settings.defaultMenuStyle) : null;
        preserved.packname = settings.packname ? String(settings.packname) : null;
        preserved.author = settings.author != null ? String(settings.author) : null;
        preserved.botName = settings.botName ? String(settings.botName) : null;
        // ADD MISSING SETTINGS PRESERVATION FOR ZIP UPDATE
        preserved.giphyApiKey = settings.giphyApiKey ? String(settings.giphyApiKey) : null;
        preserved.maxStoreMessages = settings.maxStoreMessages ? String(settings.maxStoreMessages) : null;
        preserved.storeWriteInterval = settings.storeWriteInterval ? String(settings.storeWriteInterval) : null;
        preserved.description = settings.description ? String(settings.description) : null;
        preserved.updateZipUrl = settings.updateZipUrl ? String(settings.updateZipUrl) : null;
        preserved.githubRepo = settings.githubRepo ? String(settings.githubRepo) : null;
    } catch {}

    const backedProtected = backupProtected();
    copyRecursive(root, process.cwd(), ignore, '', copied);
    restoreProtected(backedProtected);

    try {
        const settingsPath = path.join(process.cwd(), 'settings.js');
        if (fs.existsSync(settingsPath)) {
            let text = fs.readFileSync(settingsPath, 'utf8');
            
            // MOST ROBUST: Replace settings one per line with exact matching
            const settingsToUpdate = [
                { key: 'ownerNumber', value: preserved.ownerNumber, quote: "'" },
                { key: 'botOwner', value: preserved.botOwner, quote: "'" },
                { key: 'defaultPrefix', value: preserved.defaultPrefix, quote: '"' },
                { key: 'commandMode', value: preserved.commandMode, quote: '"' },
                { key: 'defaultMenuStyle', value: preserved.defaultMenuStyle, quote: '"' },
                { key: 'packname', value: preserved.packname, quote: "'" },
                { key: 'author', value: preserved.author, quote: "'" },
                { key: 'botName', value: preserved.botName, quote: '"' },
                { key: 'giphyApiKey', value: preserved.giphyApiKey, quote: "'" },
                { key: 'description', value: preserved.description, quote: '"' },
                { key: 'updateZipUrl', value: preserved.updateZipUrl, quote: '"' },
                { key: 'githubRepo', value: preserved.githubRepo, quote: '"' }
            ];
            
            for (const { key, value, quote } of settingsToUpdate) {
                if (!value) continue;
                const esc = v => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'");
                // Match the exact line with key: and any quote type, preserve formatting
                const pattern = new RegExp(`(\\s*${key}:\\s*)['"\`]([^'"\`]*)['"\`]([,]?)`, 'm');
                const replacement = `$1${quote}${esc(value)}${quote}$3`;
                text = text.replace(pattern, replacement);
                console.log(`[UPDATE] ZIP Setting ${key} = ${value}`);
            }
            
            // Handle numeric values separately (no quotes)
            if (preserved.maxStoreMessages) {
                text = text.replace(/(\s*maxStoreMessages:\s*)\d+([,]?)/m, `$1${parseInt(preserved.maxStoreMessages)}$2`);
                console.log(`[UPDATE] ZIP Setting maxStoreMessages = ${preserved.maxStoreMessages}`);
            }
            if (preserved.storeWriteInterval) {
                text = text.replace(/(\s*storeWriteInterval:\s*)\d+([,]?)/m, `$1${parseInt(preserved.storeWriteInterval)}$2`);
                console.log(`[UPDATE] ZIP Setting storeWriteInterval = ${preserved.storeWriteInterval}`);
            }
            
            fs.writeFileSync(settingsPath, text);
            console.log('[UPDATE] ZIP settings file updated');
            
            // Verify syntax
            try {
                delete require.cache[require.resolve(settingsPath)];
                const restored = require(settingsPath);
                console.log('[UPDATE] ✅ ZIP Settings syntax verified - prefix is now:', restored.defaultPrefix || '.');
            } catch (err) {
                console.error('[UPDATE] ❌ ZIP settings.js syntax invalid after restore:', err.message);
                if (backed && backed['settings.js']) {
                    try {
                        fs.copyFileSync(backed['settings.js'].backup, settingsPath);
                        delete require.cache[require.resolve(settingsPath)];
                        console.log('[UPDATE] ✅ ZIP settings.js restored from backup due to syntax error');
                    } catch(e) {}
                }
            }
        }
    } catch (e) {
        console.error('[UPDATE] ❌ Error restoring ZIP settings:', e.message);
        throw e;
    }

    // Restore critical files after ZIP update
    console.log('♻️ Restoring critical files after ZIP update...');
    for (const [filePath, backupPath] of Object.entries(criticalBackup)) {
        try {
            const fullPath = path.join(process.cwd(), filePath);
            // Ensure directory exists
            const fileDir = path.dirname(fullPath);
            if (!fs.existsSync(fileDir)) {
                fs.mkdirSync(fileDir, { recursive: true });
            }
            fs.copyFileSync(backupPath, fullPath);
            fs.unlinkSync(backupPath); // Remove backup after restore
            console.log(`  ✅ Restored: ${filePath}`);
        } catch (e) {
            console.log(`  ⚠️ Failed to restore ${filePath}: ${e.message}`);
        }
    }

    try { fs.rmSync(extractTo, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(zipPath, { force: true }); } catch {}
    return { copiedFiles: copied };
}

async function restartProcess(sock, chatId, message) {
    try {
        await sock.sendMessage(chatId, { text: '> *Truth md Updated completely! Restarting 🔄 and initializing bot data 🚀* ...' }, { quoted: message });
    } catch {}

    console.log('[RESTART] Exiting process for restart (session preserved)...');
    global.isRestarting = true;

    try {
        sock.ev?.removeAllListeners();
        sock.ws?.close();
    } catch (_) {}

    await new Promise(r => setTimeout(r, 2000));

    // Try different restart methods based on environment
    const isHeroku = !!process.env.DYNO;
    const isRailway = !!process.env.RAILWAY_STATIC_URL;
    const isRender = !!process.env.RENDER_EXTERNAL_URL;

    if (isHeroku) {
        console.log('[RESTART] Heroku detected, exiting for dyno restart');
        process.exit(0);
    } else if (isRailway || isRender) {
        console.log('[RESTART] Railway/Render detected, exiting for container restart');
        process.exit(0);
    } else {
        // Try PM2 restart for self-hosted
        try {
            await run('pm2 restart all');
            console.log('[RESTART] PM2 restart successful');
            return;
        } catch (e) {
            console.log('[RESTART] PM2 not available, using process exit');
            process.exit(0);
        }
    }
}

async function checkForUpdates() {
    if (!await hasGitRepo()) {
        const zipUrl = (settings.updateZipUrl || process.env.UPDATE_ZIP_URL || '').trim();
        if (zipUrl) {
            return { available: true, method: 'zip', note: 'ZIP update available (cannot pre-check changes)' };
        }
        return { available: false, method: 'none', error: 'No update source configured' };
    }

    try {
        const oldRev = (await run('git rev-parse HEAD').catch(() => '')).trim();
        if (!oldRev) return { available: false, method: 'git', error: 'Could not read current revision' };

        await run('git fetch --depth 1 origin main').catch(() =>
            run('git fetch origin main')
        );
        const newRev = (await run('git rev-parse origin/main').catch(() => '')).trim();

        if (!newRev) return { available: false, method: 'git', error: 'Could not reach remote repository' };

        if (oldRev === newRev) {
            return { available: false, method: 'git', currentRev: oldRev };
        }

        let commits = '';
        let fileCount = 0;
        try {
            commits = (await run(`git log --pretty=format:"• %s" ${oldRev}..${newRev}`)).trim();
            const files = (await run(`git diff --name-only ${oldRev} ${newRev}`)).trim();
            fileCount = files ? files.split('\n').length : 0;
        } catch {}

        return { available: true, method: 'git', oldRev, newRev, commits, fileCount };
    } catch (err) {
        return { available: false, method: 'git', error: err.message };
    }
}

async function updateCommand(sock, chatId, message, senderIsSudo, zipOverride) {
    const commandText = message.message?.extendedTextMessage?.text || message.message?.conversation || '';
    const isSimpleRestart = commandText.toLowerCase().includes('restart') && !commandText.toLowerCase().includes('update');

    if (!message.key.fromMe && !senderIsSudo) {
        await sock.sendMessage(chatId, { text: 'Only bot owner or sudo can use .restart or .update command' }, { quoted: message });
        return;
    }

    try {
        if (!isSimpleRestart) {
            await sock.sendMessage(chatId, { text: '*🔍 Checking for updates...*' }, { quoted: message });
            await sock.sendMessage(chatId, {
                react: { text: '🔍', key: message.key }
            });

            const check = await checkForUpdates();

            if (!check.available) {
                const noUpdateMsg = check.error
                    ? `❌ Update check failed: ${check.error}`
                    : `✅ *No updates available*\n\nYou're running the latest version (${(check.currentRev || '').substring(0, 7)}).`;
                await sock.sendMessage(chatId, { text: noUpdateMsg }, { quoted: message });
                await sock.sendMessage(chatId, {
                    react: { text: '✅', key: message.key }
                });
                return;
            }

            let updateNotice = '📦 *Update available!*\n\n';
            if (check.method === 'git') {
                updateNotice += `From: \`${check.oldRev.substring(0, 7)}\` → \`${check.newRev.substring(0, 7)}\`\n`;
                updateNotice += `Files changed: ${check.fileCount}\n`;
                if (check.commits) {
                    updateNotice += `\n*Changes:*\n${check.commits}\n`;
                }
            } else {
                updateNotice += check.note + '\n';
            }
            updateNotice += '\n⏳ *Installing update now...*';

            await sock.sendMessage(chatId, { text: updateNotice }, { quoted: message });
            await sock.sendMessage(chatId, {
                react: { text: '🆙', key: message.key }
            });

            let updateSummary = '';

            if (await hasGitRepo()) {
                try {
                    const { oldRev, newRev, alreadyUpToDate, commits, files } = await updateViaGit();
                    updateSummary = alreadyUpToDate
                        ? `✅ Already up to date (${newRev.substring(0, 7)})`
                        : `✅ Updated ${oldRev.substring(0, 7)} → ${newRev.substring(0, 7)}`;
                    console.log('[update] Git update:', updateSummary);
                } catch (gitErr) {
                    console.warn('[update] Git update failed, trying ZIP fallback:', gitErr.message);
                    const { copiedFiles } = await updateViaZip(sock, chatId, message, zipOverride);
                    updateSummary = `✅ Updated via ZIP (${copiedFiles.length} files)`;
                }
            } else {
                const { copiedFiles } = await updateViaZip(sock, chatId, message, zipOverride);
                updateSummary = `✅ Updated via ZIP (${copiedFiles.length} files)`;
            }

            await sock.sendMessage(chatId, { text: updateSummary }, { quoted: message });
        }

        try {
            const v = require('../settings').version || '';
            await sock.sendMessage(chatId, { text: `> *Initialization started ...🆙️*` }, { quoted: message });
            await sock.sendMessage(chatId, {
                react: { text: '💓', key: message.key }
            });
        } catch {
            await sock.sendMessage(chatId, { text: 'Restarted Successfully. Enjoy!' }, { quoted: message });
        }

        await restartProcess(sock, chatId, message);
    } catch (err) {
        console.error('Update failed:', err);
        await sock.sendMessage(chatId, { text: `❌ Update failed:\n${String(err.message || err)}` }, { quoted: message });
    }
}

module.exports = updateCommand;
