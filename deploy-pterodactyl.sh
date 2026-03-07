#!/bin/bash

# Pterodactyl Panel Deployment Script for Truth MD Bot
# Run this script in your Pterodactyl server console

echo "🚀 Truth MD Bot - Pterodactyl Deployment Script"
echo "=============================================="

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please ensure you're using a Node.js egg in Pterodactyl."
    exit 1
fi

echo "✅ Node.js version: $(node -v)"
echo "✅ NPM version: $(npm -v)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install --legacy-peer-deps

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Run postinstall script (patches Baileys)
echo "🔧 Running postinstall patches..."
npm run postinstall

# Check if SESSION_ID is set
if [ -z "$SESSION_ID" ]; then
    echo "⚠️  WARNING: SESSION_ID environment variable not set!"
    echo "   Please set it in your Pterodactyl server variables."
    echo "   You can get it after first running the bot locally."
fi

# Check if OWNER_NUMBER is set
if [ -z "$OWNER_NUMBER" ]; then
    echo "⚠️  WARNING: OWNER_NUMBER environment variable not set!"
    echo "   Please set OWNER_NUMBER=254101150748 in server variables."
fi

echo "🎯 Starting Truth MD Bot with PM2..."
echo "======================================"

# Start with PM2
npm run start:pm2

if [ $? -eq 0 ]; then
    echo "✅ Bot started successfully!"
    echo ""
    echo "📊 Check status: pm2 status"
    echo "📋 View logs: pm2 logs truth-md"
    echo "🔄 Restart: pm2 restart truth-md"
    echo "🛑 Stop: pm2 stop truth-md"
    echo ""
    echo "🌐 Your bot is now running 24/7 on this server!"
    echo "   It will survive internet outages on your local machine."
else
    echo "❌ Failed to start bot. Check logs for errors."
    exit 1
fi</content>
<parameter name="filePath">c:\Users\sam\CypherX\Maintaining\deploy-pterodactyl.sh