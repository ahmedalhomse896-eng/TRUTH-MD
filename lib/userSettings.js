const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'user_settings.db');

let db;
function getDb() {
    if (!db) {
        // Ensure data directory exists
        const dataDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');

        // Create user settings table
        db.exec(`
            CREATE TABLE IF NOT EXISTS user_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_jid TEXT NOT NULL,
                setting_key TEXT NOT NULL,
                setting_value TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_jid, setting_key)
            );

            CREATE TABLE IF NOT EXISTS global_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                setting_key TEXT NOT NULL UNIQUE,
                setting_value TEXT,
                setting_type TEXT DEFAULT 'string',
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_user_settings_jid_key ON user_settings(user_jid, setting_key);
            CREATE INDEX IF NOT EXISTS idx_global_settings_key ON global_settings(setting_key);
        `);

        // Migrate existing settings to database (only once)
        const alreadyMigrated = db.prepare("SELECT setting_value FROM global_settings WHERE setting_key = 'MIGRATION_V1_DONE'").get();
        if (!alreadyMigrated) {
            migrateExistingSettings();
        }
    }
    return db;
}

function migrateExistingSettings() {
    try {
        const dataDir = path.join(__dirname, '..', 'data');

        // Migrate global settings from JSON files
        const migrations = [
            { file: 'prefix.json', key: 'PREFIX', default: '.' },
            { file: 'owner.json', key: 'OWNER_INFO', parse: true },
            { file: 'sudo.json', key: 'SUDO_USERS', parse: true },
            { file: 'banned.json', key: 'BANNED_USERS', parse: true },
            { file: 'premium.json', key: 'PREMIUM_USERS', parse: true },
            { file: 'warnings.json', key: 'WARNINGS', parse: true },
            { file: 'autoread.json', key: 'AUTOREAD', parse: true },
            { file: 'autotyping.json', key: 'AUTOTYPING_USERS', parse: true },
            { file: 'pmblocker.json', key: 'PM_BLOCKER', parse: true },
            { file: 'welcome.json', key: 'WELCOME_SETTINGS', parse: true },
            { file: 'goodbye.json', key: 'GOODBYE_SETTINGS', parse: true },
            { file: 'menuSettings.json', key: 'MENU_SETTINGS', parse: true },
            { file: 'water.json', key: 'WATERMARK_SETTINGS', parse: true },
            { file: 'payments.json', key: 'PAYMENT_SETTINGS', parse: true },
            { file: 'userGroupData.json', key: 'USER_GROUP_DATA', parse: true },
            { file: 'custom_apis.json', key: 'CUSTOM_APIS', parse: true },
            { file: 'autolike.json', key: 'AUTOLIKE_SETTINGS', parse: true },
            { file: 'autoview.json', key: 'AUTOVIEW_SETTINGS', parse: true }
        ];

        for (const migration of migrations) {
            const filePath = path.join(dataDir, migration.file);
            if (fs.existsSync(filePath)) {
                try {
                    let value;
                    if (migration.parse) {
                        const content = fs.readFileSync(filePath, 'utf8');
                        value = JSON.parse(content);
                    } else {
                        value = fs.readFileSync(filePath, 'utf8').trim();
                    }

                    if (value !== null && value !== undefined) {
                        setGlobalSetting(migration.key, value);
                        console.log(`✅ Migrated ${migration.file} to database`);
                    }
                } catch (error) {
                    console.error(`❌ Failed to migrate ${migration.file}:`, error.message);
                }
            }
        }

        // Migrate config.db settings to global_settings
        try {
            const configDbPath = path.join(dataDir, 'config.db');
            if (fs.existsSync(configDbPath)) {
                const configDb = new Database(configDbPath);
                const configRows = configDb.prepare('SELECT key, value FROM config').all();

                for (const row of configRows) {
                    setGlobalSetting(row.key, row.value);
                }

                console.log(`✅ Migrated ${configRows.length} config settings to user settings database`);
                configDb.close();
            }
        } catch (error) {
            console.error('❌ Failed to migrate config.db:', error.message);
        }

        // Mark migration as complete so it never runs again on future restarts
        setGlobalSetting('MIGRATION_V1_DONE', 'true', 'One-time migration flag');
        console.log('✅ Migration complete — settings are now fully managed by SQLite database');

    } catch (error) {
        console.error('❌ Migration error:', error.message);
    }
}

// User-specific settings
function getUserSetting(userJid, key, defaultValue = null) {
    try {
        const row = getDb().prepare('SELECT setting_value FROM user_settings WHERE user_jid = ? AND setting_key = ?').get(userJid, key);
        if (row && row.setting_value !== null && row.setting_value !== undefined) {
            try {
                return JSON.parse(row.setting_value);
            } catch {
                return row.setting_value;
            }
        }
        return defaultValue;
    } catch (e) {
        console.error('getUserSetting error:', e.message);
        return defaultValue;
    }
}

function setUserSetting(userJid, key, value) {
    try {
        const serializedValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        getDb().prepare(`
            INSERT OR REPLACE INTO user_settings (user_jid, setting_key, setting_value, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `).run(userJid, key, serializedValue);
        return true;
    } catch (e) {
        console.error('setUserSetting error:', e.message);
        return false;
    }
}

function deleteUserSetting(userJid, key) {
    try {
        getDb().prepare('DELETE FROM user_settings WHERE user_jid = ? AND setting_key = ?').run(userJid, key);
        return true;
    } catch (e) {
        console.error('deleteUserSetting error:', e.message);
        return false;
    }
}

function getAllUserSettings(userJid) {
    try {
        const rows = getDb().prepare('SELECT setting_key, setting_value FROM user_settings WHERE user_jid = ?').all(userJid);
        const settings = {};
        for (const row of rows) {
            try {
                settings[row.setting_key] = JSON.parse(row.setting_value);
            } catch {
                settings[row.setting_key] = row.setting_value;
            }
        }
        return settings;
    } catch (e) {
        console.error('getAllUserSettings error:', e.message);
        return {};
    }
}

// Global settings
function getGlobalSetting(key, defaultValue = null) {
    try {
        const row = getDb().prepare('SELECT setting_value FROM global_settings WHERE setting_key = ?').get(key);
        if (row && row.setting_value !== null && row.setting_value !== undefined) {
            try {
                return JSON.parse(row.setting_value);
            } catch {
                return row.setting_value;
            }
        }
        return defaultValue;
    } catch (e) {
        console.error('getGlobalSetting error:', e.message);
        return defaultValue;
    }
}

function setGlobalSetting(key, value, description = '') {
    try {
        const serializedValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        getDb().prepare(`
            INSERT OR REPLACE INTO global_settings (setting_key, setting_value, setting_type, description, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(key, serializedValue, typeof value, description);
        return true;
    } catch (e) {
        console.error('setGlobalSetting error:', e.message);
        return false;
    }
}

function deleteGlobalSetting(key) {
    try {
        getDb().prepare('DELETE FROM global_settings WHERE setting_key = ?').run(key);
        return true;
    } catch (e) {
        console.error('deleteGlobalSetting error:', e.message);
        return false;
    }
}

function getAllGlobalSettings() {
    try {
        const rows = getDb().prepare('SELECT setting_key, setting_value, setting_type, description FROM global_settings').all();
        const settings = {};
        for (const row of rows) {
            try {
                settings[row.setting_key] = {
                    value: JSON.parse(row.setting_value),
                    type: row.setting_type,
                    description: row.description
                };
            } catch {
                settings[row.setting_key] = {
                    value: row.setting_value,
                    type: row.setting_type,
                    description: row.description
                };
            }
        }
        return settings;
    } catch (e) {
        console.error('getAllGlobalSettings error:', e.message);
        return {};
    }
}

// Backup and restore functions for updates
function exportSettings() {
    try {
        const allSettings = {
            global: getAllGlobalSettings(),
            users: {}
        };

        // Get all users and their settings
        const userRows = getDb().prepare('SELECT DISTINCT user_jid FROM user_settings').all();
        for (const row of userRows) {
            allSettings.users[row.user_jid] = getAllUserSettings(row.user_jid);
        }

        return allSettings;
    } catch (e) {
        console.error('exportSettings error:', e.message);
        return null;
    }
}

function importSettings(settingsData) {
    try {
        if (!settingsData) return false;

        // Import global settings
        if (settingsData.global) {
            for (const [key, data] of Object.entries(settingsData.global)) {
                setGlobalSetting(key, data.value, data.description);
            }
        }

        // Import user settings
        if (settingsData.users) {
            for (const [userJid, userSettings] of Object.entries(settingsData.users)) {
                for (const [key, value] of Object.entries(userSettings)) {
                    setUserSetting(userJid, key, value);
                }
            }
        }

        return true;
    } catch (e) {
        console.error('importSettings error:', e.message);
        return false;
    }
}

// Cleanup old JSON files after successful migration
function cleanupOldFiles() {
    try {
        const dataDir = path.join(__dirname, '..', 'data');
        const oldFiles = [
            'prefix.json', 'owner.json', 'sudo.json', 'banned.json',
            'premium.json', 'warnings.json', 'autoread.json', 'autotyping.json',
            'pmblocker.json', 'welcome.json', 'goodbye.json', 'menuSettings.json',
            'water.json', 'payments.json', 'userGroupData.json', 'custom_apis.json',
            'autolike.json', 'autoview.json', 'config.db'
        ];

        for (const file of oldFiles) {
            const filePath = path.join(dataDir, file);
            if (fs.existsSync(filePath)) {
                try {
                    fs.renameSync(filePath, filePath + '.backup');
                    console.log(`✅ Backed up ${file} to ${file}.backup`);
                } catch (error) {
                    console.error(`❌ Failed to backup ${file}:`, error.message);
                }
            }
        }
    } catch (error) {
        console.error('❌ Cleanup error:', error.message);
    }
}

module.exports = {
    getUserSetting,
    setUserSetting,
    deleteUserSetting,
    getAllUserSettings,
    getGlobalSetting,
    setGlobalSetting,
    deleteGlobalSetting,
    getAllGlobalSettings,
    exportSettings,
    importSettings,
    cleanupOldFiles,
    migrateExistingSettings
};