// script to require core modules and report any errors
const path = require('path');

const modules = ['./settings', './config.js', './main', './lib/myfunc'];
for (const mod of modules) {
    try {
        require(mod);
        console.log(`module ${mod} loaded OK`);
    } catch (e) {
        console.error(`error loading ${mod}:`, e.message);
    }
}
