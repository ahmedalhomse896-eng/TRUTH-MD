const fs = require('fs');
const path = require('path');
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");

class DeployManager {
    constructor() {
        this.deployedBots = new Map();
        this.userDeployments = new Map();
        this.deploymentDataFile = path.join(__dirname, 'data', 'deployments.json');
        this.loadDeployments();
    }

    loadDeployments() {
        try {
            if (fs.existsSync(this.deploymentDataFile)) {
                const data = JSON.parse(fs.readFileSync(this.deploymentDataFile, 'utf8'));
                this.userDeployments = new Map(Object.entries(data.userDeployments || {}));
                console.log('✅ Deployments loaded');
            }
        } catch (error) {
            console.error('❌ Error loading deployments:', error);
        }
    }

    saveDeployments() {
        try {
            const data = {
                userDeployments: Object.fromEntries(this.userDeployments),
                timestamp: Date.now()
            };
            
            const dataDir = path.dirname(this.deploymentDataFile);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            
            fs.writeFileSync(this.deploymentDataFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('❌ Error saving deployments:', error);
        }
    }

    async deployBot(sessionString, userJid, userInfo) {
        console.log('🚀 Starting deployment for:', userJid);
        
        // Check user limit
        const userBots = this.userDeployments.get(userJid) || [];
        if (userBots.length >= 10) {
            return { success: false, message: '❌ You can only deploy up to 10 bots' };
        }

        // Validate session string
        if (!sessionString.startsWith('TRUTH-MD:~')) {
            return { success: false, message: '❌ Session must start with TRUTH-MD:~' };
        }

        try {
            // Generate deployment ID
            const deploymentId = this.generateDeploymentId();
            
            // Create session directory
            const sessionDir = path.join(__dirname, 'sessions', deploymentId);
            if (!fs.existsSync(sessionDir)) {
                fs.mkdirSync(sessionDir, { recursive: true });
            }

            // Extract base64 data
            const base64Data = sessionString.substring(9);
            
            console.log('📁 Processing session data...');
            
            try {
                // Decode the base64 data
                const decodedData = Buffer.from(base64Data, 'base64').toString('utf8');
                console.log('✅ Base64 decoded successfully');
                
                // Parse as JSON
                const sessionData = JSON.parse(decodedData);
                console.log('✅ JSON parsed successfully');
                
                // Save the raw session data as creds.json
                const credsPath = path.join(sessionDir, 'creds.json');
                fs.writeFileSync(credsPath, JSON.stringify(sessionData, null, 2));
                console.log('✅ Session data saved');

            } catch (error) {
                console.error('❌ Session processing failed:', error.message);
                return { 
                    success: false, 
                    message: '❌ Invalid session format. Please get a fresh session ID.' 
                };
            }

            // Initialize the bot
            console.log('🔗 Initializing bot connection...');
            const botResult = await this.initializeBot(deploymentId, sessionDir);
            
            if (!botResult.success) {
                this.cleanupFailedDeployment(deploymentId, userJid);
                return botResult;
            }

            // Store deployment info
            this.deployedBots.set(deploymentId, {
                socket: botResult.socket,
                userJid: userJid,
                deployedAt: Date.now(),
                sessionDir: sessionDir,
                isActive: true,
                userInfo: userInfo || {}
            });

            // Update user deployments
            userBots.push(deploymentId);
            this.userDeployments.set(userJid, userBots);
            this.saveDeployments();

            return { 
                success: true, 
                message: `✅ Bot deployed successfully!\n\n🔑 Deployment ID: ${deploymentId}\n🤖 Your bot is now active on your account\n📱 You can use all bot features!`,
                deploymentId: deploymentId
            };

        } catch (error) {
            console.error('Error deploying bot:', error);
            return { 
                success: false, 
                message: '❌ Deployment failed: ' + error.message 
            };
        }
    }

    async initializeBot(deploymentId, sessionDir) {
        return new Promise(async (resolve) => {
            let botSocket;
            
            try {
                console.log(`🔧 Initializing bot ${deploymentId}...`);
                
                let state, saveCreds;
                try {
                    ({ state, saveCreds } = await useMultiFileAuthState(sessionDir));
                    console.log(`✅ Auth state loaded for ${deploymentId}`);
                } catch (authError) {
                    console.error(`❌ Auth state error:`, authError.message);
                    resolve({ 
                        success: false, 
                        message: '❌ Session authentication failed. Please use a fresh session ID.' 
                    });
                    return;
                }

                const { version } = await fetchLatestBaileysVersion();
                console.log(`📱 Using WA version: ${version.join('.')}`);

                // Create a proper logger object that has the child method
                const logger = {
                    level: 'silent',
                    trace: () => {},
                    debug: () => {},
                    info: () => {},
                    warn: () => {},
                    error: () => {},
                    fatal: () => {},
                    child: () => logger // Add the child method that returns itself
                };

                // Create socket with proper configuration
                botSocket = makeWASocket({
                    version,
                    logger: logger,
                    printQRInTerminal: false,
                    auth: {
                        creds: state.creds,
                        keys: state.keys,
                    },
                    browser: ['Ubuntu', 'Chrome', '20.0.04'],
                    markOnlineOnConnect: true,
                    connectTimeoutMs: 60000,
                    keepAliveIntervalMs: 10000,
                });

                let connectionEstablished = false;

                // Set connection timeout
                const connectionTimeout = setTimeout(() => {
                    if (!connectionEstablished) {
                        console.log(`❌ Connection timeout for ${deploymentId}`);
                        try {
                            if (botSocket && botSocket.ws) {
                                botSocket.ws.close();
                            }
                        } catch (e) {
                            console.error('Error closing socket:', e);
                        }
                        resolve({ 
                            success: false, 
                            message: '❌ Connection timeout. Please check your session ID and try again.' 
                        });
                    }
                }, 60000);

                // Handle connection events
                botSocket.ev.on('connection.update', (update) => {
                    const { connection, lastDisconnect, qr } = update;
                    
                    console.log(`🔗 ${deploymentId} connection:`, connection);
                    
                    if (connection === 'open') {
                        console.log(`✅ ${deploymentId} connected successfully!`);
                        connectionEstablished = true;
                        clearTimeout(connectionTimeout);
                        
                        // Send welcome message
                        this.sendDeploymentWelcome(botSocket, deploymentId);
                        resolve({ success: true, socket: botSocket });
                    } 
                    else if (connection === 'close') {
                        console.log(`❌ ${deploymentId} disconnected`);
                        const statusCode = lastDisconnect?.error?.output?.statusCode;
                        
                        if (!connectionEstablished) {
                            clearTimeout(connectionTimeout);
                            let errorMsg = '❌ Connection failed. ';
                            
                            if (statusCode === 401) {
                                errorMsg += 'Session revoked or expired.';
                            } else if (statusCode === 403) {
                                errorMsg += 'Session banned or blocked.';
                            } else {
                                errorMsg += 'Please check your session ID.';
                            }
                            
                            resolve({ success: false, message: errorMsg });
                        }
                    }
                    else if (qr) {
                        console.log(`📱 ${deploymentId} requires QR scan`);
                        if (!connectionEstablished) {
                            clearTimeout(connectionTimeout);
                            resolve({ 
                                success: false, 
                                message: '❌ Session requires QR authentication. Please use a fully authenticated session ID.' 
                            });
                        }
                    }
                });

                botSocket.ev.on('creds.update', saveCreds);

            } catch (error) {
                console.error(`❌ Error initializing ${deploymentId}:`, error.message);
                resolve({ 
                    success: false, 
                    message: '❌ Bot initialization failed: ' + error.message 
                });
            }
        });
    }

    async sendDeploymentWelcome(botSocket, deploymentId) {
        try {
            if (!botSocket.user) return;

            const userNumber = botSocket.user.id.split(':')[0] + '@s.whatsapp.net';
            
            await botSocket.sendMessage(userNumber, {
                text: `🎉 *BOT DEPLOYMENT SUCCESSFUL!*\n\n` +
                      `✅ Your bot is now active on your account\n` +
                      `🔑 Deployment ID: ${deploymentId}\n` +
                      `📱 Connected as: ${botSocket.user.name || 'User'}\n` +
                      `🕒 Connected: ${new Date().toLocaleString()}\n\n` +
                      `✨ *All bot features are now available!*\n\n` +
                      `Use .help to see all commands\n` +
                      `Use .connect list to manage deployments`
            });
            
            console.log(`✅ Welcome sent to ${deploymentId}`);
        } catch (error) {
            console.error(`Error sending welcome:`, error);
        }
    }

    cleanupFailedDeployment(deploymentId, userJid) {
        try {
            const userBots = this.userDeployments.get(userJid) || [];
            const updatedBots = userBots.filter(id => id !== deploymentId);
            this.userDeployments.set(userJid, updatedBots);
            
            const sessionDir = path.join(__dirname, 'sessions', deploymentId);
            if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
            }
            
            this.saveDeployments();
        } catch (error) {
            console.error('Error cleaning up:', error);
        }
    }

    stopDeployment(deploymentId, userJid) {
        const deployment = this.deployedBots.get(deploymentId);
        if (!deployment) {
            return { success: false, message: '❌ Deployment not found' };
        }

        if (deployment.userJid !== userJid) {
            return { success: false, message: '❌ You are not the owner of this deployment' };
        }

        try {
            if (deployment.socket) {
                deployment.socket.ws.close();
            }

            this.deployedBots.delete(deploymentId);
            
            const userBots = this.userDeployments.get(userJid) || [];
            const updatedBots = userBots.filter(id => id !== deploymentId);
            this.userDeployments.set(userJid, updatedBots);
            
            // Clean up session directory
            try {
                if (fs.existsSync(deployment.sessionDir)) {
                    fs.rmSync(deployment.sessionDir, { recursive: true, force: true });
                }
            } catch (cleanupError) {
                console.error('Error cleaning session dir:', cleanupError);
            }
            
            this.saveDeployments();

            return { success: true, message: '✅ Bot deployment stopped successfully' };

        } catch (error) {
            console.error('Error stopping deployment:', error);
            return { success: false, message: '❌ Failed to stop deployment' };
        }
    }

    listUserDeployments(userJid) {
        return this.userDeployments.get(userJid) || [];
    }

    listAllDeployments() {
        const allDeployments = [];
        for (let [deploymentId, info] of this.deployedBots) {
            allDeployments.push({
                deploymentId,
                userJid: info.userJid,
                deployedAt: info.deployedAt,
                isActive: info.isActive,
                userInfo: info.userInfo
            });
        }
        return allDeployments;
    }

    getDeploymentStatus(deploymentId) {
        const deployment = this.deployedBots.get(deploymentId);
        if (!deployment) return null;
        
        return {
            deploymentId,
            userJid: deployment.userJid,
            deployedAt: deployment.deployedAt,
            isActive: deployment.isActive,
            uptime: deployment.isActive ? Date.now() - deployment.deployedAt : 0
        };
    }

    getUserDeploymentCount(userJid) {
        const userBots = this.userDeployments.get(userJid) || [];
        return userBots.length;
    }

    generateDeploymentId() {
        return 'BOT_' + Math.random().toString(36).substring(2, 8).toUpperCase();
    }
}

module.exports = new DeployManager();
