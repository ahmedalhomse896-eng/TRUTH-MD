const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { proto } = require('@whiskeysockets/baileys');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

const DB_PATH = path.join(__dirname, '..', 'session', 'auth_state.db');
const SESSION_DIR = path.join(__dirname, '..', 'session');

function migrateFromJsonFiles(db, stmtSet) {
    const jsonFiles = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith('.json'));
    if (jsonFiles.length === 0) return false;

    let migrated = 0;
    const transaction = db.transaction(() => {
        for (const file of jsonFiles) {
            try {
                const filePath = path.join(SESSION_DIR, file);
                const raw = fs.readFileSync(filePath, 'utf8');
                const data = JSON.parse(raw, BufferJSON.reviver);
                const key = file.replace('.json', '');
                const value = JSON.stringify(data, BufferJSON.replacer);
                stmtSet.run(key, value);
                migrated++;
                fs.unlinkSync(filePath);
            } catch (_) {}
        }
    });
    transaction();
    return migrated > 0;
}

function useSQLiteAuthState() {
    fs.mkdirSync(SESSION_DIR, { recursive: true });

    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS auth_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);

    const stmtGet = db.prepare('SELECT value FROM auth_state WHERE key = ?');
    const stmtSet = db.prepare('INSERT OR REPLACE INTO auth_state (key, value) VALUES (?, ?)');
    const stmtDel = db.prepare('DELETE FROM auth_state WHERE key = ?');

    const rowCount = db.prepare('SELECT COUNT(*) as cnt FROM auth_state').get();
    let didMigrate = false;
    if (rowCount.cnt === 0) {
        didMigrate = migrateFromJsonFiles(db, stmtSet);
    }

    function readData(key) {
        const row = stmtGet.get(key);
        if (!row) return null;
        try {
            return JSON.parse(row.value, BufferJSON.reviver);
        } catch {
            return null;
        }
    }

    function writeData(key, data) {
        const value = JSON.stringify(data, BufferJSON.replacer);
        stmtSet.run(key, value);
    }

    function removeData(key) {
        stmtDel.run(key);
    }

    const creds = readData('creds') || initAuthCreds();

    const state = {
        creds,
        keys: {
            get: async (type, ids) => {
                const data = {};
                for (const id of ids) {
                    const value = readData(`${type}-${id}`);
                    if (value) {
                        if (type === 'app-state-sync-key') {
                            data[id] = proto.Message.AppStateSyncKeyData.fromObject(value);
                        } else {
                            data[id] = value;
                        }
                    }
                }
                return data;
            },
            set: async (data) => {
                const transaction = db.transaction(() => {
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            if (value) {
                                writeData(key, value);
                            } else {
                                removeData(key);
                            }
                        }
                    }
                });
                transaction();
            }
        }
    };

    const saveCreds = () => {
        writeData('creds', state.creds);
    };

    return { state, saveCreds, didMigrate, db };
}

module.exports = { useSQLiteAuthState };
