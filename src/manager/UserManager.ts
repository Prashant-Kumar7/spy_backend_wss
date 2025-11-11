import { WebSocket } from "ws";
import { RoomManager } from "./RoomManager.js";
import { SkribbleRoomManager } from "./SkribbleRoom.js";
import { redisClient } from "../index.js";



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

    /**
     * Ensures unique mapping between userId and socket
     * - If userId already mapped to different socket: removes old mapping
     * - If socket already mapped to different userId: removes old mapping
     * - Then sets the new mapping
     */
    private setUserIdSocketMapping(userId: string, socket: WebSocket): void {
        // Validate socket is still open before mapping
        if (socket.readyState !== WebSocket.OPEN) {
            console.warn(`Cannot map userId ${userId} to closed socket`);
            return;
        }

        // Check if userId is already mapped to a different socket
        const existingSocket = this.socketToUserId.get(userId);
        if (existingSocket && existingSocket !== socket) {
            console.log(`User ${userId} reconnected with new socket. Cleaning up old socket mapping.`);
            // Find and remove any userId that was mapped to the old socket
            this.socketToUserId.forEach((socketValue, mappedUserId) => {
                if (socketValue === existingSocket) {
                    this.socketToUserId.delete(mappedUserId);
                }
            });
        }

        // Check if socket is already mapped to a different userId
        this.socketToUserId.forEach((socketValue, mappedUserId) => {
            if (socketValue === socket && mappedUserId !== userId) {
                console.log(`Socket reassigned from user ${mappedUserId} to ${userId}. Removing old mapping.`);
                this.socketToUserId.delete(mappedUserId);
            }
        });

        // Set the new mapping
        this.socketToUserId.set(userId, socket);
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


    AppEventHandler(socket : WebSocket, message : any){
        if(message.type === "app_opened"){
            console.log(`App opened by user: ${message.userId}`);
            // The userId is already stored in socketToUserId mapping above
            
            // Check for pending messages in Redis and deliver all of them
            if(message.userId){
                const messageKey = `messages:${message.userId}`;
                redisClient.lRange(messageKey, 0, -1)
                    .then((pendingMessages) => {
                        if(pendingMessages && pendingMessages.length > 0){
                            console.log(`Delivering ${pendingMessages.length} pending message(s) to user ${message.userId}`);
                            console.log("pendingMessages is :", pendingMessages)
                            // Send all pending messages in order
                            pendingMessages.forEach((msg) => {

                                socket.send(msg);
                            });
                            // Delete the list after delivering all messages
                            redisClient.del(messageKey).catch((error) => {
                                console.error(`Error deleting message list for user ${message.userId}:`, error);
                            });
                        }
                    })
                    .catch((error) => {
                        console.error(`Error retrieving pending messages for user ${message.userId}:`, error);
                    });
            }
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

    FriendEventHandler(socket : WebSocket, message : any){
        if(message.type === "request"){
            this.socketToUserId.get(message.reciverUserId)?.send(JSON.stringify({type : "friend_request", senderUserId : message.senderUserId, senderName : message.senderName}))
        }else if(message.type === "accept"){
            this.socketToUserId.get(message.senderUserId)?.send(JSON.stringify({type : "friend_accept", reciverUserId : message.reciverUserId, reciverName : message.reciverName}))
        }
    }

    addHandler(socket : WebSocket){
        socket.on("message" , (data)=>{

            const message = JSON.parse(data.toString())
            console.log("message is :", message)
            // Store socket to userId mapping for any message that contains userId
            // This ensures uniqueness: one userId -> one socket, one socket -> one userId
            if (message.userId) {
                this.setUserIdSocketMapping(message.userId, socket);
            }

            if(message.EventFrom === "SpyGame"){
                this.SpyGameEventHandler(socket, message)
            }
            else if(message.EventFrom === "SkribbleGame"){
                this.SkribbleGameEventHandler(socket, message)
            }else if(message.EventFrom === "AppChatMessaging"){
                if(this.socketToUserId.get(message.receiverID)){
                    this.socketToUserId.get(message.receiverID)?.send(JSON.stringify(message))
                }else {
                    // Store message in Redis list for offline delivery
                    const messageKey = `messages:${message.receiverID}`;
                    const payload = {
                        ...message,
                        type : "queued_message"
                    }
                    redisClient.rPush(messageKey, JSON.stringify(payload))
                        .then(() => {
                            // Set expiration for the list (30 days)
                            redisClient.expire(messageKey, 60 * 60 * 24 * 30);
                        })
                        .catch((error) => {
                            console.error(`Error storing offline message for user ${message.receiverID}:`, error);
                        });
                }

                // socket.send(JSON.stringify(message))
            }else if(message.EventFrom === "App"){
                this.AppEventHandler(socket, message)
            }else if(message.EventFrom === "Friend"){
                this.FriendEventHandler(socket, message)
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

    // sendFriendRequest(socket : WebSocket, message : any){
    //     const receiverSocket = this.socketToUserId.get(message.targetUserId);
    //     if(receiverSocket){
    //         receiverSocket.send(JSON.stringify({type : "friend_request", senderUserId : message.senderUserId, senderName : message.senderName}))
    //         socket.send(JSON.stringify({type : "send_friend_request_response", status : true, message : "friend request sent successfully"}))
    //     } else {
    //         fetch("http://localhost:3000/api/friend-request", {
    //             method : "POST",
    //             body : JSON.stringify({
    //                 senderUserId : message.senderUserId,
    //                 senderName : message.senderName,
    //                 targetUserId : message.targetUserId,
    //                 targetName : message.targetName
    //             })
    //         })
    //         .then(response => response.json())
    //         .then(data => {
    //             console.log(data)
    //             if(data.status){
    //                 socket.send(JSON.stringify({type : "send_friend_request_response", status : true, message : "Friend request sent successfully"}))
    //             } else {
    //                 socket.send(JSON.stringify({type : "send_friend_request_response", status : false, message : "failed to send friend request"}))
    //             }
                
    //         })
    //         .catch(error => {
    //             console.error(error)
    //             socket.send(JSON.stringify({type : "send_friend_request_response", status : false, message : "failed to send friend request"}))
    //         })
    //     }

        
    // }

}