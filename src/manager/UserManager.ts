import { WebSocket } from "ws";
import { RoomManager } from "./RoomManager.js";
import { SkribbleRoomManager } from "./SkribbleRoom.js";



export class UserManager {
    // private rooms : 
    private rooms : Map<string, RoomManager | SkribbleRoomManager>;
    private socketToUserId : Map<string, WebSocket>;

    constructor(){
        this.rooms = new Map();
        this.socketToUserId = new Map<string, WebSocket>();
    }


    addUser(socket : WebSocket){
        this.addHandler(socket)
    }

    removeUser(socket : WebSocket){
        // Find and handle user leaving from all rooms
        this.rooms.forEach(room => {
            if (room instanceof RoomManager) {
                room.handleDisconnection(socket);
            }
        });
        
        // Remove from mapping
        this.socketToUserId.forEach((socketValue, userId) => {
            if(socketValue === socket){
                this.socketToUserId.delete(userId);
            }
        })
    }

    removeRoom(roomId: string) {
        console.log(`Removing room ${roomId} from rooms list`);
        this.rooms.delete(roomId);
        console.log(`Remaining rooms: ${this.rooms.size}`);
    }


    SpyGameEventHandler(socket : WebSocket, message : any){
        if(message.type === "CREATE_ROOM"){
            const room = new RoomManager(socket, message.userId, message.name || "", message.roomId, message.gameMode = "word_spy", () => {
                this.removeRoom(room.roomId)
            })
            this.rooms.set(message.roomId, room)
            console.log("this is the room created", room)
        }

        if(message.type === "QUICK_JOIN_WORD_SPY"){
            const roomGameModeList = Array.from(this.rooms.values())
                .filter(room => room instanceof RoomManager && room.gameMode === "word_spy") as RoomManager[]
            const randomRoom = roomGameModeList[Math.floor(Math.random() * roomGameModeList.length)]
            if(randomRoom){
                socket.send(JSON.stringify({type : "quick_join_response", roomId : randomRoom.roomId, gameMode : "word_spy"}))
            }
        }

        if(message.type === "QUICK_JOIN_WORDLESS_SPY"){
            const roomGameModeList = Array.from(this.rooms.values())
                .filter(room => room instanceof RoomManager && room.gameMode === "wordless_spy") as RoomManager[]
            const randomRoom = roomGameModeList[Math.floor(Math.random() * roomGameModeList.length)]
            if(randomRoom){
                socket.send(JSON.stringify({type : "quick_join_response", roomId : randomRoom.roomId, gameMode : "wordless_spy"}))
            }
        }

        const room = this.rooms.get(message.roomId);
        if(!room || !(room instanceof RoomManager)){
            socket.send(JSON.stringify({type : "spy_room_not_found"}))
        }
        else{
            room.handleMessage(socket, message)
        }
    }


    SkribbleGameEventHandler(socket : WebSocket, message : any){
        // const userId = message.userId
        const room = this.rooms.get(message.roomId);
        const skribbleRoom = room instanceof SkribbleRoomManager ? room : null;
        
        switch (message.type) {
            case "CREATE_SKRIBBLE_ROOM":
                const newRoom = new SkribbleRoomManager(message.roomId, message.userId, message.PlayerName = "host",socket as WebSocket)
                this.rooms.set(message.roomId, newRoom)
                this.joinResponse(socket, true, "You have created the room successfully")
                newRoom.sendPlayersList()
                console.log("this is the skribble room created", newRoom)
                break;
            case "JOIN_SKRIBBLE_ROOM":
                if(skribbleRoom){
                    skribbleRoom.joinRoom(socket as WebSocket, message);
                    this.joinResponse(socket, true, "You have joined the room successfully")
                }
                else{
                    this.joinResponse(socket, false, "Room not found")
                }
                break;
            case "SKRIBBLE_TOOL_CHANGE":
                skribbleRoom?.drawEvent(socket as WebSocket, message)
                break;
            case "SKRIBBLE_COLOR_CHANGE":
                skribbleRoom?.drawEvent(socket as WebSocket, message)
                break;
            case "SKRIBBLE_WIDTH_CHANGE":
                skribbleRoom?.drawEvent(socket as WebSocket, message)
                break;
            case "SKRIBBLE_STROKE":
                skribbleRoom?.drawEvent(socket as WebSocket, message)
                break;
            case "SKRIBBLE_POINT":
                skribbleRoom?.drawEvent(socket as WebSocket, message)
                break;
            case "SKRIBBLE_UNDO":
                skribbleRoom?.drawEvent(socket as WebSocket, message)
                break;
            case "SKRIBBLE_REDO":
                skribbleRoom?.drawEvent(socket as WebSocket, message)
                break;
            
            case "GET_SKRIBBLE_ROOM_STATE":
                skribbleRoom?.getRoomState(socket);
                break;
            case "SKRIBBLE_MESSAGE" : 
                skribbleRoom?.message(socket as WebSocket, message)
                break;
            case "START_SKRIBBLE_DRAWING" : 
                skribbleRoom?.drawEvent(socket as WebSocket, message)
                break;
            case "STOP_SKRIBBLE_DRAWING" :
                skribbleRoom?.drawEvent(socket as WebSocket, message)
                break;
            case "SKRIBBLE_DRAW":
                skribbleRoom?.drawEvent(socket as WebSocket, message)
                break;
            case  "SKRIBBLE_CLEAR" : 
                skribbleRoom?.drawEvent(socket as WebSocket, message)
                break;
            case "START_SKRIBBLE_GAME" : 
                skribbleRoom?.startGame(socket as WebSocket, message)
                break;
            case "GET_SKRIBBLE_WORD":
                skribbleRoom?.secondTimerOfGame(socket as WebSocket, message)
                
                break;
            case "SKRIBBLE_TIMER":
                // room?.secondTimerOfGame(socket)
                break;
            case "SKRIBBLE_ROUND_END":
                skribbleRoom?.stopSecondTimer(socket as WebSocket)
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
                this.socketToUserId.set(message.userId, socket);
            }

            if(message.EventFrom === "SpyGame"){
                this.SpyGameEventHandler(socket, message)
            }
            else if(message.EventFrom === "SkribbleGame"){
                this.SkribbleGameEventHandler(socket, message)
            }else if(message.EventFrom === "AppChatMessaging"){
                this.socketToUserId.get(message.reciverUserId)?.send(JSON.stringify(message))
            }

            
        })

        socket.on("close", ()=>{
            console.log("socket closed")
            this.removeUser(socket)
            
            console.log("user removed")
        })

    }

    joinResponse(socket : WebSocket, status : boolean, message : string){
        socket.send(JSON.stringify({type : "join_response", status : status, message : message}))
    }

}