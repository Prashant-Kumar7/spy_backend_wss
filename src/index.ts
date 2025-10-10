import { WebSocketServer } from 'ws';
import express from 'express';
import { UserManager } from './manager/UserManager.js';

const app = express();

// Add JSON middleware
app.use(express.json());

// Ping route
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'WebSocket server is running',
        timestamp: new Date().toISOString(),
        connectedClients: wss.clients.size
    });
});

// Health check route
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        connectedClients: wss.clients.size
    });
});

const server = app.listen(3000, () => {
    console.log('HTTP server running on port 3000');
});

const wss = new WebSocketServer({ port: 8080 });
console.log('WebSocket server running on port 8080');

const userManger = new UserManager()

// Single global ping interval instead of per-connection intervals
const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({type : "ping"}))
        }
    })
}, 30000)

wss.on('connection', function connection(ws) {
    userManger.addUser(ws)
    
    // Handle connection cleanup when WebSocket closes
    ws.on('close', () => {
        userManger.removeUser(ws)
    })
    
    ws.on('error', () => {
        userManger.removeUser(ws)
    })
});

// Cleanup on server shutdown
process.on('SIGINT', () => {
    console.log('Shutting down servers...');
    clearInterval(pingInterval);
    wss.close();
    server.close();
    process.exit(0);
});