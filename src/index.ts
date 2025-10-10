import { WebSocketServer } from 'ws';
import { UserManager } from './manager/UserManager.js';

const wss = new WebSocketServer({ port: 8080 });
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
    clearInterval(pingInterval)
    wss.close()
})