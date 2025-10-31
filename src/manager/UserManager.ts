import { WebSocket } from "ws";
import { RoomManager } from "./RoomManager.js";
import { SkribbleRoomManager } from "./SkribbleRoom.js";



export class UserManager {
    // private rooms : 
    private spyRooms : RoomManager[]
    private users : WebSocket[];
    private skribbleRooms : SkribbleRoomManager[]
    private socketToUserId : Map<WebSocket, string>;

    constructor(){
        this.spyRooms = []
        this.users = [];
        this.skribbleRooms = [];
        this.socketToUserId = new Map();
    }


    addUser(socket : WebSocket){
        this.users.push(socket);
        this.addHandler(socket)
    }

    removeUser(socket : WebSocket){
        this.users = this.users.filter(user => user !== socket);
        
        // Find and handle user leaving from all rooms
        this.spyRooms.forEach(room => {
            room.handleDisconnection(socket);
        });
        
        // Remove from mapping
        this.socketToUserId.delete(socket);
    }

    removeSpyRoom(roomToRemove: RoomManager) {
        console.log(`Removing room ${roomToRemove.roomId} from rooms list`);
        this.spyRooms = this.spyRooms.filter(room => room !== roomToRemove);
        console.log(`Remaining rooms: ${this.spyRooms.length}`);
    }


    SpyGameEventHandler(socket : WebSocket, message : any){
        if(message.type === "CREATE_ROOM"){
            const room = new RoomManager(socket, message.userId, message.roomId, message.gameMode = "word_spy", () => {
                this.removeSpyRoom(room)
            })
            this.spyRooms.push(room)
            console.log("this is the room created", room)
        }

        if(message.type === "QUICK_JOIN_WORD_SPY"){
            const roomGameModeList = this.spyRooms.filter(room => room.gameMode === "word_spy")
            const randomRoom = roomGameModeList[Math.floor(Math.random() * roomGameModeList.length)]
            socket.send(JSON.stringify({type : "quick_join_response", roomId : randomRoom.roomId, gameMode : "word_spy"}))
        }

        if(message.type === "QUICK_JOIN_WORDLESS_SPY"){
            const roomGameModeList = this.spyRooms.filter(room => room.gameMode === "wordless_spy")
            const randomRoom = roomGameModeList[Math.floor(Math.random() * roomGameModeList.length)]
            socket.send(JSON.stringify({type : "quick_join_response", roomId : randomRoom.roomId, gameMode : "wordless_spy"}))
        }

        const room = this.spyRooms.find((room: RoomManager) => room.roomId === message.roomId);

        if(!room){
            socket.send(JSON.stringify({type : "spy_room_not_found"}))
        }
        else{
            room.handleMessage(socket, message)
        }
    }


    SkribbleGameEventHandler(socket : WebSocket, message : any){
        // const userId = message.userId
        const room = this.skribbleRooms.find((rm: SkribbleRoomManager) => rm.roomId === message.roomId);
        switch (message.type) {
            case "CREATE_SKRIBBLE_ROOM":
                const newRoom = new SkribbleRoomManager(message.roomId, message.userId, message.PlayerName = "host",socket as WebSocket)
                this.skribbleRooms.push(newRoom)
                newRoom.sendPlayersList()
                console.log("this is the skribble room created", newRoom)
                break;
            case "JOIN_SKRIBBLE_ROOM":
                room?.joinRoom(socket as WebSocket, message);
                break;
            case "SKRIBBLE_TOOL_CHANGE":
                room?.drawEvent(socket as WebSocket, message)
                break;
            case "SKRIBBLE_COLOR_CHANGE":
                room?.drawEvent(socket as WebSocket, message)
                break;
            case "SKRIBBLE_WIDTH_CHANGE":
                room?.drawEvent(socket as WebSocket, message)
                break;
            case "SKRIBBLE_STROKE":
                room?.drawEvent(socket as WebSocket, message)
                break;
            case "SKRIBBLE_UNDO":
                room?.drawEvent(socket as WebSocket, message)
                break;
            case "SKRIBBLE_REDO":
                room?.drawEvent(socket as WebSocket, message)
                break;
            
            case "GET_SKRIBBLE_ROOM_STATE":
                room?.getRoomState(socket);
                break;
            case "SKRIBBLE_MESSAGE" : 
                room?.message(socket as WebSocket, message)
                break;
            case "START_SKRIBBLE_DRAWING" : 
                room?.drawEvent(socket as WebSocket, message)
                break;
            case "STOP_SKRIBBLE_DRAWING" :
                room?.drawEvent(socket as WebSocket, message)
                break;
            case "SKRIBBLE_DRAW":
                room?.drawEvent(socket as WebSocket, message)
                break;
            case  "SKRIBBLE_CLEAR" : 
                room?.drawEvent(socket as WebSocket, message)
                break;
            case "START_SKRIBBLE_GAME" : 
                room?.startGame(socket as WebSocket, message)
                break;
            case "GET_SKRIBBLE_WORD":
                room?.secondTimerOfGame(socket as WebSocket, message)
                
                break;
            case "SKRIBBLE_TIMER":
                // room?.secondTimerOfGame(socket)
                break;
            case "SKRIBBLE_ROUND_END":
                room?.stopSecondTimer(socket as WebSocket)
                break;
            default:
                console.warn("Unhandled message type:", message.type);
                break;
        }
    }

    addHandler(socket : WebSocket){
        socket.on("message" , (data)=>{

            const message = JSON.parse(data.toString())
            console.log("message is :", message)
            // Store socket to userId mapping for any message that contains userId
            if (message.userId) {
                this.socketToUserId.set(socket, message.userId);
            }

            if(message.EventFrom === "SpyGame"){
                this.SpyGameEventHandler(socket, message)
            }
            else if(message.EventFrom === "SkribbleGame"){
                this.SkribbleGameEventHandler(socket, message)
            }

            
        })

        socket.on("close", ()=>{
            console.log("socket closed")
            this.removeUser(socket)
            
            console.log("user removed")
        })

    }
}