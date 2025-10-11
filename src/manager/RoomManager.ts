import { WebSocket } from "ws";

interface Host{
    socket : WebSocket,
    userId : string
}

interface Participant{
    [key : string] : WebSocket
}

interface ReadyStatus{
    [key : string] : boolean
}


interface Voting{
    [key : string] : string[]
}

interface RoomState{
    chats : string[],
    readyStatus : ReadyStatus,
    gameStarted : boolean,
    spy : {
        word : string,
        player : string
    }
    voting : Voting,
    civilianWord : string,
    alivePlayers : string[]
}



export class RoomManager {
    private host : Host;
    private participants : Participant;

    public roomId : string
    private roomState : RoomState
    private playerList : string[]
    private votingTimer : NodeJS.Timeout | null = null
    constructor (Hostsocket :WebSocket, userId : string, roomId : string){
        this.host = {
            socket : Hostsocket,
            userId : userId
        }

        this.roomId = roomId
        this.participants = {
            [this.host.userId] : this.host.socket
        }
        this.playerList = [this.host.userId]
        this.roomState = {
            chats : [],
            readyStatus : {
                [this.host.userId] : false
            },
            gameStarted : false,
            spy : {
                word : "",
                player : ""
            },
            voting : {},
            civilianWord : "",
            alivePlayers : []
        }
    }


    pickRandomPlayer(){
        return this.playerList[Math.floor(Math.random() * this.playerList.length)]
    }

    pickRandomWord(){
        const wordPairs = [
            { civilian: "Pizza", spy: "Burger" },
            { civilian: "Beach", spy: "Mountain" },
            { civilian: "Library", spy: "Museum" },
            { civilian: "Guitar", spy: "Piano" },
            { civilian: "Coffee", spy: "Tea" },
            { civilian: "Dance", spy: "Sing" },
            { civilian: "Ocean", spy: "Lake" },
            { civilian: "Book", spy: "Movie" },
            { civilian: "Sunset", spy: "Sunrise" },
            { civilian: "Music", spy: "Art" },
            { civilian: "Forest", spy: "Desert" },
            { civilian: "Camera", spy: "Phone" },
            { civilian: "Adventure", spy: "Journey" },
            { civilian: "Friends", spy: "Family" },
            { civilian: "Dream", spy: "Goal" }
        ];
        return wordPairs[Math.floor(Math.random() * wordPairs.length)]
    }

    calculateMaxVotes(): { player: string; votes: number } | null {
        let maxVotes = 0;
        let maxVotedPlayer = '';
        
        // Count votes for each player
        for (const [player, voters] of Object.entries(this.roomState.voting)) {
            const voteCount = voters.length;
            if (voteCount > maxVotes) {
                maxVotes = voteCount;
                maxVotedPlayer = player;
            }
        }
        
        // Return null if no votes were cast
        if (maxVotes === 0) {
            return null;
        }
        
        return { player: maxVotedPlayer, votes: maxVotes };
    }

    resetGameState() {
        this.roomState.gameStarted = false;
        this.roomState.spy = {
            word: "",
            player: ""
        };
        this.roomState.voting = {};
        this.roomState.civilianWord = "";
        this.roomState.alivePlayers = [];
        
        // Reset ready status for all players
        for (const playerId of this.playerList) {
            this.roomState.readyStatus[playerId] = false;
        }
        
        // Clear any active timers
        this.clearAllTimers();
    }

    clearAllTimers() {
        if (this.votingTimer) {
            clearTimeout(this.votingTimer);
            this.votingTimer = null;
        }
    }

    clearVotingTimer() {
        if (this.votingTimer) {
            clearTimeout(this.votingTimer);
            this.votingTimer = null;
        }
    }

    handleDisconnection(socket: WebSocket) {
        // Find the userId for this socket
        let disconnectedUserId: string | null = null;
        for (const [userId, userSocket] of Object.entries(this.participants)) {
            if (userSocket === socket) {
                disconnectedUserId = userId;
                break;
            }
        }

        if (disconnectedUserId) {
            // Clear timers if game is in progress
            if (this.roomState.gameStarted) {
                this.clearVotingTimer();
            }
            
            // Handle as leave_room
            this.handleMessage(socket, { type: "leave_room", userId: disconnectedUserId });
        }
    }

    async handleVotingResults() {
        // Calculate who got the most votes
        const maxVotesResult = this.calculateMaxVotes();
        
        this.playerList.forEach(player => {
            this.participants[player].send(JSON.stringify({
                type : "end_voting",
                votingResults: this.roomState.voting,
                maxVotes: maxVotesResult
            }))
        })

        // Check if spy was caught (civilian wins)
        if(maxVotesResult?.player === this.roomState.spy.player){
            this.playerList.forEach(player => {
                this.participants[player].send(JSON.stringify({type : "game_ended", winner: "civilians", spy : this.roomState.spy.player}))
            })
            this.resetGameState();
            return;
        }

        // Remove the voted player from alive players
        if(maxVotesResult?.player) {
            this.roomState.alivePlayers = this.roomState.alivePlayers.filter(player => player !== maxVotesResult.player);
        }

        this.playerList.forEach(player => {
            this.participants[player].send(JSON.stringify({type : "alivePlayers", alivePlayers : this.roomState.alivePlayers}))
        })

        // Check if spy wins (only 2 players left)
        if(this.roomState.alivePlayers.length === 2){
            this.playerList.forEach(player => {
                this.participants[player].send(JSON.stringify({type : "game_ended", winner: "spy", spy : this.roomState.spy.player}))
            })
            this.resetGameState();
            return;
        }

        // Continue the game - reset voting and start new speaking round
        this.roomState.voting = {};
        
        // Start new speaking round
        await this.startSpeakingRound();
    }

    async startSpeakingRound() {
        for (const speaker of this.roomState.alivePlayers) {
            this.roomState.alivePlayers.forEach(player => {
                this.participants[player].send(JSON.stringify({type : "speak_statement", currentSpeaker : speaker }))
            })
            await delay(15000);
        }

        // Start voting after speaking round
        this.roomState.alivePlayers.forEach(player => {
            this.participants[player].send(JSON.stringify({type : "start_voting"}))
        })

        // Set timeout for voting and track it
        this.votingTimer = setTimeout(() => {
            this.handleVotingResults();
        }, 10000);
    }

    handleMessage(socket : WebSocket, message : any){
        if(message.type === "send_chat"){
            this.roomState.chats.push(message.chat)
            this.playerList.forEach(player => {
                if(player !== message.userId){
                    this.participants[player].send(JSON.stringify({type : "chat", chat : message.chat, userId : message.userId}))
                }
            })
        }

        if(message.type === "join_room"){

            if(this.playerList.includes(message.userId)){
                socket.send(JSON.stringify({type : "player_already_in_room", roomState : this.roomState, playerList : this.playerList}))
                return
            }

            this.participants[message.userId] = socket
            this.playerList.push(message.userId)
            this.roomState.readyStatus[message.userId] = false
            socket.send(JSON.stringify({type : "room_state", roomState : this.roomState}))

            this.playerList.forEach(player => {
                this.participants[player].send(JSON.stringify({type : "playerList", playerList : this.playerList}))
            })
            console.log(this.playerList , this.roomState)
        }

        if(message.type === "ready"){
            this.roomState.readyStatus[message.userId] = true
            this.playerList.forEach(player => {
                this.participants[player].send(JSON.stringify({type : "room_state", roomState : this.roomState}))
            })

            if(Object.values(this.roomState.readyStatus).every(status => status) && this.playerList.length >= 3){
                this.roomState.gameStarted = true
                this.playerList.forEach(player => {
                    this.participants[player].send(JSON.stringify({type : "gameStarted", gameStarted : true}))
                })
                this.roomState.alivePlayers = this.playerList
                const spyWord = this.pickRandomWord()
                const spyPlayer : string = this.pickRandomPlayer()
                
                // Store the spy player in room state
                this.roomState.spy.player = spyPlayer
                this.roomState.spy.word = spyWord.spy
                this.roomState.civilianWord = spyWord.civilian

                if(this.participants[spyPlayer]){
                    this.participants[spyPlayer].send(JSON.stringify({type : "spy", word : spyWord.spy, player : spyPlayer}))
                    this.playerList.forEach(player => {
                        if(player !== spyPlayer){
                            this.participants[player].send(JSON.stringify({type : "civilianWord", word : spyWord.civilian, player : spyPlayer}))
                        }
                    })
                }
                
                // Start the first speaking round
                this.startSpeakingRound();
            }
        }

        if(message.type === "vote"){
            // Validate that the voted player is alive
            if (!this.roomState.alivePlayers.includes(message.votedPlayer)) {
                socket.send(JSON.stringify({type : "error", message : "Cannot vote for a player who is not alive"}))
                return;
            }
            
            // Validate that the voter is alive
            if (!this.roomState.alivePlayers.includes(message.userId)) {
                socket.send(JSON.stringify({type : "error", message : "You cannot vote as you are not alive"}))
                return;
            }
            
            // Remove user's previous vote if they voted for someone else
            for (const [player, voters] of Object.entries(this.roomState.voting)) {
                if (voters.includes(message.userId) && player !== message.votedPlayer) {
                    this.roomState.voting[player] = voters.filter(voter => voter !== message.userId);
                }
            }
            
            // Initialize voting array for the player if it doesn't exist
            if (!this.roomState.voting[message.votedPlayer]) {
                this.roomState.voting[message.votedPlayer] = [];
            }
            
            // Add vote if user hasn't voted for this player yet
            if (!this.roomState.voting[message.votedPlayer].includes(message.userId)) {
                this.roomState.voting[message.votedPlayer].push(message.userId);
            }
            
            this.playerList.forEach(player => {
                this.participants[player].send(JSON.stringify({type : "room_state", roomState : this.roomState}))
            })
        }

        if(message.type === "notready"){
            this.roomState.readyStatus[message.userId] = false
            socket.send(JSON.stringify({type : "room_state", roomState : this.roomState}))
        }

        if(message.type === "leave_room"){

            if(message.userId === this.host.userId){
                delete this.participants[message.userId]
                this.playerList = this.playerList.filter(player => player !== message.userId)
                this.host.socket.close()
                this.host.userId = this.playerList[0]
                this.host.socket = this.participants[this.host.userId]
            }

            delete this.participants[message.userId]
            this.playerList = this.playerList.filter(player => player !== message.userId)
            delete this.roomState.readyStatus[message.userId]

            if(this.roomState.gameStarted && message.userId === this.roomState.spy.player){
                this.playerList.forEach(player => {
                    this.participants[player].send(JSON.stringify({type : "game_ended", winner: "civilians", spy : this.roomState.spy.player}))
                })
                this.resetGameState();
            }
            else if(this.roomState.gameStarted && message.userId !== this.roomState.spy.player){
                // Clear voting timer if game is in progress
                this.clearVotingTimer();
                
                this.playerList.forEach(player => {
                    this.participants[player].send(JSON.stringify({type : "player_left", playerLeft : message.userId}))
                })
            }
            else {
                this.playerList.forEach(player => {
                    this.participants[player].send(JSON.stringify({type : "room_state", roomState : this.roomState}))
                })
            }

            
        }

        // if(message.type === "leave_room"){
        //     this.participants = this.participants.filter(participant => participant.socket !== socket)

        //     this.participants.forEach(participant => {
        //         if(participant.socket !== socket){
        //             participant.socket.send(JSON.stringify({type : "participants", participants : this.participants}))
        //         }
        //     })

        //     if(this.participants.length === 0){
        //         this.roomState.chats = []
        //     }
        // }
    }
}

function delay(ms : number){
    return new Promise(resolve => setTimeout(resolve, ms))
}