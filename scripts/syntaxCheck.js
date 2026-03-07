const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'commands');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
let ok = true;
for (const file of files) {
    const full = path.join(dir, file);
    try {
        const code = fs.readFileSync(full, 'utf8');
        new Function(code);
        console.log(`${file}: syntax OK`);
    } catch (e) {
        console.error(`${file}: syntax ERROR - ${e.message}`);
        ok = false;
    }
}
process.exit(ok ? 0 : 1);
