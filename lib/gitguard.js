const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SENSITIVE_PATTERNS = [
    'session/',
    'sessions/',
    'auth_info_baileys/',
    '.env',
];

const SENSITIVE_DATA_PREFIX = 'data/';
const SAFE_DATA_PREFIX = 'data/defaults/';

function isSensitive(file) {
    if (SENSITIVE_PATTERNS.some(p => file === p || file.startsWith(p))) return true;
    if (file.startsWith(SENSITIVE_DATA_PREFIX) && !file.startsWith(SAFE_DATA_PREFIX)) return true;
    return false;
}

function isGitRepo() {
    try {
        execSync('git rev-parse --is-inside-work-tree', { cwd: process.cwd(), stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

function untrackSensitiveFiles() {
    const removed = [];
    if (!isGitRepo()) return removed;
    try {
        const tracked = execSync('git ls-files', { encoding: 'utf8', cwd: process.cwd() }).trim().split('\n');
        for (const file of tracked) {
            if (isSensitive(file)) {
                try {
                    execSync(`git rm --cached "${file}"`, { cwd: process.cwd(), stdio: 'pipe' });
                    removed.push(file);
                } catch {}
            }
        }
    } catch {}
    return removed;
}

function checkForLeaks() {
    const leaks = [];
    if (!isGitRepo()) return leaks;
    try {
        const tracked = execSync('git ls-files', { encoding: 'utf8', cwd: process.cwd() }).trim().split('\n');
        for (const file of tracked) {
            if (isSensitive(file)) {
                leaks.push(file);
            }
        }
    } catch {}
    return [...new Set(leaks)];
}

function runGuard() {
    const leaks = checkForLeaks();
    if (leaks.length > 0) {
        console.log(`[GitGuard] Found ${leaks.length} sensitive file(s) tracked in git, removing...`);
        const removed = untrackSensitiveFiles();
        if (removed.length > 0) {
            console.log(`[GitGuard] Untracked: ${removed.join(', ')}`);
        }
    }
    return leaks;
}

module.exports = { runGuard, checkForLeaks, untrackSensitiveFiles, isSensitive };
