# Pterodactyl Panel Deployment Guide for Truth MD Bot

## 🚀 Quick Setup

### 1. Upload Files to Pterodactyl
- Upload your entire bot folder to the Pterodactyl panel
- Or use Git clone: `git clone https://github.com/mzeeemzimanjejeje/Maintaining.git`

### 2. Environment Variables
Set these in your Pterodactyl server settings:

```
SESSION_ID=your_session_id_here
OWNER_NUMBER=254101150748
DATABASE_URL=postgresql://user:pass@host:5432/db (optional)
```

### 3. Startup Command
Use one of these startup commands:

**For PM2 (Recommended):**
```
npm run start:pm2
```

**For Direct Node:**
```
node --max-old-space-size=512 --optimize-for-size --gc-interval=100 index.js
```

**For Docker:**
```
docker build -t truth-md . && docker run -e SESSION_ID=$SESSION_ID truth-md
```

## 📋 Server Requirements

### Minimum Specs:
- **RAM:** 512MB (1GB recommended)
- **CPU:** 0.5 cores
- **Storage:** 2GB
- **Node.js:** 18+ (20 recommended)

### Recommended Specs:
- **RAM:** 1GB
- **CPU:** 1 core
- **Storage:** 5GB
- **Node.js:** 20 LTS

## 🔧 Pterodactyl Configuration

### Egg Configuration (if creating custom egg):
```json
{
  "name": "Truth MD WhatsApp Bot",
  "description": "Node.js WhatsApp Bot with PM2",
  "docker_image": "ghcr.io/pterodactyl/yolks:nodejs_20",
  "startup": "npm run start:pm2",
  "environment": {
    "NODE_ENV": "production"
  }
}
```

## 📊 Monitoring & Management

### PM2 Commands (in console):
```bash
# Check status
pm2 status

# View logs
pm2 logs truth-md

# Restart bot
pm2 restart truth-md

# Stop bot
pm2 stop truth-md
```

### Health Check
The bot includes a health check endpoint at `http://your-server:port/health`

## 🔄 Auto-Restart Features

✅ **Internet Monitoring** - Detects connection drops  
✅ **Auto-Reconnect** - Reconnects when internet returns  
✅ **PM2 Process Management** - Restarts on crashes  
✅ **Memory Limits** - Prevents memory leaks  
✅ **Error Recovery** - Handles various failure scenarios  

## 🚨 Troubleshooting

### Common Issues:

**"Cannot find module" errors:**
```bash
npm install --legacy-peer-deps
```

**Memory issues:**
```bash
pm2 restart truth-md --max-memory-restart 512M
```

**Session issues:**
```bash
rm -rf session/
npm run reset-session
```

**Port conflicts:**
- Check if port 8080 is available
- Change PORT environment variable if needed

## 📞 Support

If you encounter issues:
1. Check PM2 logs: `pm2 logs truth-md`
2. Check bot logs in the console
3. Verify environment variables are set
4. Ensure Node.js version is 18+

## 🎯 Benefits of Pterodactyl Hosting

✅ **24/7 Uptime** (server's internet, not yours)  
✅ **Remote Management** via web panel  
✅ **Auto-restart** on crashes  
✅ **Resource Monitoring**  
✅ **Backup & Restore**  
✅ **Scalable** (upgrade server specs anytime)  

Your bot will now run independently of your local internet! 🌐</content>
<parameter name="filePath">c:\Users\sam\CypherX\Maintaining\PTERODACTYL_DEPLOY.md