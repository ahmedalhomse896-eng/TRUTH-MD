const fs = require('fs');
const path = require('path');

const WATERMARK_FILE = path.join(__dirname, '..', 'data', 'water.json');
const DEFAULT_WATERMARK = 'Truth MD is on fire 🔥🚒';

function getWatermarkText() {
    try {
        if (fs.existsSync(WATERMARK_FILE)) {
            const text = fs.readFileSync(WATERMARK_FILE, 'utf8').trim();
            if (text) return text;
        }
    } catch (_) {}
    return DEFAULT_WATERMARK;
}

async function addImageWatermark(inputBuffer) {
    return inputBuffer;
}

function addVideoWatermark(inputPath) {
    return Promise.resolve(inputPath);
}

function appendWatermark(caption) {
    const wm = getWatermarkText();
    if (!caption) return `\n> ${wm}`;
    return `${caption}\n\n> ${wm}`;
}

module.exports = { addImageWatermark, addVideoWatermark, getWatermarkText, appendWatermark };
