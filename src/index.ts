import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { UserManager } from "./manager/UserManager.js";


const app = express();

app.get("/",(_,res)=>{
    res.json("hello from word spy websocket server")
})

export const options = {
    method: 'GET',
    url: 'https://pictionary-charades-word-generator.p.rapidapi.com/charades',
    params: {difficulty: 'easy'},
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': 'pictionary-charades-word-generator.p.rapidapi.com'
    }
};

const httpServer = app.listen(8080);
const wss = new WebSocketServer({ server: httpServer });
const userManger = new UserManager();


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
    httpServer.close();
    process.exit(0);
});