const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * API Fallback System for CypherX Bot
 * Provides fallback APIs when primary services fail
 */

class APIFallbackManager {
    constructor() {
        this.fallbacks = {
            // AI Chat APIs
            ai_chat: [
                {
                    name: 'GPT-5 (PrexzyVilla)',
                    endpoint: 'https://apis.prexzyvilla.site/ai/gpt-5?text=',
                    method: 'GET',
                    responsePath: 'response',
                    timeout: 30000
                },
                {
                    name: 'Claude AI (PrexzyVilla)',
                    endpoint: 'https://apis.prexzyvilla.site/ai/claude?text=',
                    method: 'GET',
                    responsePath: 'response',
                    timeout: 30000
                },
                {
                    name: 'DeepSeek Chat (PrexzyVilla)',
                    endpoint: 'https://apis.prexzyvilla.site/ai/deepseekchat?prompt=',
                    method: 'GET',
                    responsePath: 'response',
                    timeout: 30000
                },
                {
                    name: 'Copilot (PrexzyVilla)',
                    endpoint: 'https://apis.prexzyvilla.site/ai/copilot?text=',
                    method: 'GET',
                    responsePath: 'response',
                    timeout: 30000
                }
            ],

            // Image Generation APIs
            image_generation: [
                {
                    name: 'Stable Diffusion XL (PrexzyVilla)',
                    endpoint: 'https://apis.prexzyvilla.site/ai/image--cf-bytedance-stable-diffusion-xl-lightning?prompt=',
                    method: 'GET',
                    responseType: 'buffer',
                    timeout: 45000
                },
                {
                    name: 'Flux 1 Schnell (PrexzyVilla)',
                    endpoint: 'https://apis.prexzyvilla.site/ai/image--cf-black-forest-labs-flux-1-schnell?prompt=',
                    method: 'GET',
                    responseType: 'buffer',
                    timeout: 45000
                },
                {
                    name: 'DALL-E 3 XL (PrexzyVilla)',
                    endpoint: 'https://apis.prexzyvilla.site/ai/dalle?prompt=',
                    method: 'GET',
                    responseType: 'buffer',
                    timeout: 45000
                }
            ],

            // Text to Speech APIs
            tts: [
                {
                    name: 'TTS English (PrexzyVilla)',
                    endpoint: 'https://apis.prexzyvilla.site/tts/tts-en?text=',
                    method: 'GET',
                    responseType: 'audio',
                    timeout: 30000
                },
                {
                    name: 'TTS Indonesian (PrexzyVilla)',
                    endpoint: 'https://apis.prexzyvilla.site/tts/tts-id?text=',
                    method: 'GET',
                    responseType: 'audio',
                    timeout: 30000
                }
            ]
        };

        // Load custom APIs from file
        this.loadCustomAPIs();
    }

    /**
     * Try multiple APIs in sequence until one succeeds
     * @param {string} category - API category (ai_chat, image_generation, tts)
     * @param {string} query - The query/prompt to send
     * @param {Object} options - Additional options
     * @returns {Object} - {success: boolean, data: any, api: string, error?: string}
     */
    async tryFallbacks(category, query, options = {}) {
        const apis = this.fallbacks[category];
        if (!apis) {
            return {
                success: false,
                error: `No fallback APIs found for category: ${category}`
            };
        }

        for (const api of apis) {
            try {
                console.log(`🔄 Trying fallback API: ${api.name}`);

                const result = await this.callAPI(api, query, options);

                if (result.success) {
                    console.log(`✅ Fallback API succeeded: ${api.name}`);
                    return {
                        success: true,
                        data: result.data,
                        api: api.name
                    };
                }
            } catch (error) {
                console.log(`❌ Fallback API failed: ${api.name} - ${error.message}`);
                continue;
            }
        }

        return {
            success: false,
            error: `All fallback APIs failed for category: ${category}`
        };
    }

    /**
     * Call a specific API
     * @param {Object} api - API configuration
     * @param {string} query - The query to send
     * @param {Object} options - Additional options
     */
    async callAPI(api, query, options = {}) {
        const url = api.endpoint + encodeURIComponent(query);

        const config = {
            method: api.method,
            timeout: api.timeout,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                ...options.headers
            }
        };

        if (api.responseType === 'buffer') {
            config.responseType = 'arraybuffer';
        }

        try {
            const response = await axios(url, config);

            if (api.responseType === 'buffer') {
                return {
                    success: true,
                    data: Buffer.from(response.data)
                };
            }

            // Handle JSON responses
            const data = response.data;
            if (data && data.success !== false) {
                const result = api.responsePath ? data[api.responsePath] : data;
                if (result) {
                    return {
                        success: true,
                        data: result
                    };
                }
            }

            throw new Error('Invalid API response format');

        } catch (error) {
            throw new Error(`API call failed: ${error.message}`);
        }
    }

    /**
     * Load custom APIs from storage file
     */
    loadCustomAPIs() {
        try {
            const apiStoragePath = path.join(__dirname, '..', 'data', 'custom_apis.json');
            const dataDir = path.join(__dirname, '..', 'data');

            // Ensure data directory exists
            if (!fs.existsSync(dataDir)) {
                console.log('📁 Creating data directory...');
                fs.mkdirSync(dataDir, { recursive: true });
            }

            if (fs.existsSync(apiStoragePath)) {
                const customAPIs = JSON.parse(fs.readFileSync(apiStoragePath, 'utf8'));
                console.log('📂 Custom APIs file found. Loading...');
                for (const [category, apis] of Object.entries(customAPIs)) {
                    if (!this.fallbacks[category]) {
                        this.fallbacks[category] = [];
                    }
                    this.fallbacks[category].push(...apis);
                }
                console.log(`✅ Loaded custom APIs from storage - ${Object.keys(customAPIs).length} categories`);
            } else {
                console.log('ℹ️ No custom APIs file found. Using defaults only.');
            }
        } catch (error) {
            console.error('❌ Error loading custom APIs:', error.message);
        }
    }

    /**
     * Save custom APIs to storage file
     */
    saveCustomAPIs() {
        try {
            const dataDir = path.join(__dirname, '..', 'data');
            const apiStoragePath = path.join(dataDir, 'custom_apis.json');

            // Ensure data directory exists
            if (!fs.existsSync(dataDir)) {
                console.log('📁 Creating data directory for custom APIs...');
                fs.mkdirSync(dataDir, { recursive: true });
            }

            const customAPIs = {};

            // Extract only custom APIs (not the default ones)
            const defaultNames = {
                'ai_chat': ['GPT-5 (PrexzyVilla)', 'Claude AI (PrexzyVilla)', 'DeepSeek Chat (PrexzyVilla)', 'Copilot (PrexzyVilla)'],
                'image_generation': ['Stable Diffusion XL (PrexzyVilla)', 'Flux 1 Schnell (PrexzyVilla)', 'DALL-E 3 XL (PrexzyVilla)'],
                'tts': ['TTS English (PrexzyVilla)', 'TTS Indonesian (PrexzyVilla)']
            };

            for (const [category, apis] of Object.entries(this.fallbacks)) {
                const customOnes = apis.filter(api => !defaultNames[category]?.includes(api.name));
                if (customOnes.length > 0) {
                    customAPIs[category] = customOnes;
                }
            }

            fs.writeFileSync(apiStoragePath, JSON.stringify(customAPIs, null, 2));
            console.log(`💾 Custom APIs saved to ${apiStoragePath}`);
        } catch (error) {
            console.error('❌ Error saving custom APIs:', error.message);
        }
    }

    /**
     * Get default APIs for a category
     */
    getDefaultAPIs(category) {
        const defaults = {
            ai_chat: [
                { name: 'GPT-5 (PrexzyVilla)' },
                { name: 'Claude AI (PrexzyVilla)' },
                { name: 'DeepSeek Chat (PrexzyVilla)' },
                { name: 'Copilot (PrexzyVilla)' }
            ],
            image_generation: [
                { name: 'Stable Diffusion XL (PrexzyVilla)' },
                { name: 'Flux 1 Schnell (PrexzyVilla)' },
                { name: 'DALL-E 3 XL (PrexzyVilla)' }
            ],
            tts: [
                { name: 'TTS English (PrexzyVilla)' },
                { name: 'TTS Indonesian (PrexzyVilla)' }
            ]
        };
        return defaults[category] || [];
    }

    /**
     * Add a custom fallback API
     * @param {string} category - API category
     * @param {Object} apiConfig - API configuration
     */
    addFallback(category, apiConfig) {
        if (!this.fallbacks[category]) {
            this.fallbacks[category] = [];
        }
        this.fallbacks[category].push(apiConfig);
        this.saveCustomAPIs(); // Save after adding
    }

    /**
     * Get available fallback APIs for a category
     * @param {string} category - API category
     * @returns {Array} - List of API names
     */
    getAvailableAPIs(category) {
        return this.fallbacks[category]?.map(api => api.name) || [];
    }
}

// Export singleton instance
const fallbackManager = new APIFallbackManager();

module.exports = {
    APIFallbackManager,
    fallbackManager
};