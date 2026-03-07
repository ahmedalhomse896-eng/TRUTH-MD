#!/bin/bash

# Health Check Script for Truth MD Bot
# Run this periodically to check bot status

echo "🔍 Truth MD Bot Health Check"
echo "============================"

# Check if PM2 is running
if command -v pm2 &> /dev/null; then
    echo "📊 PM2 Status:"
    pm2 status truth-md 2>/dev/null || echo "   Bot not found in PM2"
else
    echo "⚠️  PM2 not available"
fi

# Check if Node.js process is running
if pgrep -f "index.js" > /dev/null; then
    echo "✅ Node.js process is running"
else
    echo "❌ Node.js process not found"
fi

# Check memory usage
if command -v pm2 &> /dev/null; then
    echo "🧠 Memory Usage:"
    pm2 monit truth-md 2>/dev/null | grep -E "(memory|cpu)" | head -2 || echo "   Unable to get memory info"
fi

# Check if port is listening
if command -v netstat &> /dev/null; then
    PORT=${PORT:-8080}
    if netstat -tln 2>/dev/null | grep ":$PORT " > /dev/null; then
        echo "🌐 Port $PORT is listening"
    else
        echo "⚠️  Port $PORT not listening"
    fi
fi

# Check internet connectivity
if ping -c 1 8.8.8.8 &> /dev/null; then
    echo "🌐 Internet connectivity: ✅ OK"
else
    echo "🌐 Internet connectivity: ❌ DOWN"
fi

# Check disk space
echo "💾 Disk Usage:"
df -h . | tail -1

echo ""
echo "✅ Health check complete"</content>
<parameter name="filePath">c:\Users\sam\CypherX\Maintaining\health-check.sh