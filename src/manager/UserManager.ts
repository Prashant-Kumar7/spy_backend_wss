import { WebSocket } from "ws";
import { RoomManager } from "./RoomManager.js";




export class UserManager {
    // private rooms : 
    private rooms : RoomManager[]
    private users : WebSocket[];
    private socketToUserId : Map<WebSocket, string>;

    constructor(){
        this.rooms = []
        this.users = [];
        this.socketToUserId = new Map();
    }


    addUser(socket : WebSocket){
        this.users.push(socket);
        this.addHandler(socket)
    }

    removeUser(socket : WebSocket){
        this.users = this.users.filter(user => user !== socket);
        
        // Find and handle user leaving from all rooms
        this.rooms.forEach(room => {
            room.handleDisconnection(socket);
        });
        
        // Remove from mapping
        this.socketToUserId.delete(socket);
    }

    removeRoom(roomToRemove: RoomManager) {
        console.log(`Removing room ${roomToRemove.roomId} from rooms list`);
        this.rooms = this.rooms.filter(room => room !== roomToRemove);
        console.log(`Remaining rooms: ${this.rooms.length}`);
    }


    addHandler(socket : WebSocket){
        socket.on("message" , (data)=>{

            const message = JSON.parse(data.toString())
            console.log("message is :", message)
            // Store socket to userId mapping for any message that contains userId
            if (message.userId) {
                this.socketToUserId.set(socket, message.userId);
            }

            if(message.type === "CREATE_ROOM"){
                const room = new RoomManager(socket, message.userId, message.roomId, message.gameMode = "", () => {
                    this.removeRoom(room)
                })
                this.rooms.push(room)
                console.log("this is the room created", room)
            }

            if(message.type === "QUICK_JOIN"){
                const randomRoom = this.rooms[Math.floor(Math.random() * this.rooms.length)]
                socket.send(JSON.stringify({type : "quick_join_response", roomId : randomRoom.roomId}))
            }

            const room = this.rooms.find(room=> room.roomId === message.roomId);

            if(!room){
                socket.send(JSON.stringify({type : "room_not_found"}))
            }
            else{
                room.handleMessage(socket, message)
            }
        })

        socket.on("close", ()=>{
            console.log("socket closed")
            this.removeUser(socket)
            
            console.log("user removed")
        })

    }
}