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
    alivePlayers : string[],
    roundNo : number
}



export class RoomManager {
    private host : Host;
    private participants : Participant;
    public gameMode : string
    public roomId : string
    private roomState : RoomState
    private playerList : string[]
    private votingTimer : NodeJS.Timeout | null = null
    private speakingTimer : NodeJS.Timeout | null = null
    private countdownTimers : NodeJS.Timeout[] = []
    private currentSpeakerIndex : number = 0
    private onRoomEmptyCallback?: () => void
    
    constructor (Hostsocket :WebSocket, userId : string, roomId : string, gameMode : string, onRoomEmptyCallback?: () => void){
        this.host = {
            socket : Hostsocket,
            userId : userId
        }
        this.gameMode = gameMode
        this.roomId = roomId
        this.onRoomEmptyCallback = onRoomEmptyCallback
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
            alivePlayers : [],
            roundNo : 0
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
        let maxVotedPlayers: string[] = [];
        
        // Count votes for each player
        for (const [player, voters] of Object.entries(this.roomState.voting)) {
            const voteCount = voters.length;
            if (voteCount > maxVotes) {
                maxVotes = voteCount;
                maxVotedPlayers = [player];
            } else if (voteCount === maxVotes && voteCount > 0) {
                maxVotedPlayers.push(player);
            }
        }
        
        // Return null if no votes were cast or if there's a tie
        if (maxVotes === 0 || maxVotedPlayers.length > 1) {
            return null;
        }
        
        return { player: maxVotedPlayers[0], votes: maxVotes };
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
        this.roomState.roundNo = 0;
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
        if (this.speakingTimer) {
            clearTimeout(this.speakingTimer);
            this.speakingTimer = null;
        }
        // Clear all countdown timers
        this.countdownTimers.forEach(timer => clearTimeout(timer));
        this.countdownTimers = [];
    }

    cleanupDisconnectedPlayers() {
        const originalAlivePlayers = [...this.roomState.alivePlayers];
        const originalPlayerList = [...this.playerList];
        
        // Remove disconnected players from alivePlayers array
        this.roomState.alivePlayers = this.roomState.alivePlayers.filter(player => 
            this.participants[player] !== undefined
        );
        
        // Remove disconnected players from playerList
        this.playerList = this.playerList.filter(player => 
            this.participants[player] !== undefined
        );
        
        // Remove disconnected players from readyStatus
        Object.keys(this.roomState.readyStatus).forEach(player => {
            if (!this.participants[player]) {
                delete this.roomState.readyStatus[player];
            }
        });
        
        // Remove disconnected players from voting
        Object.keys(this.roomState.voting).forEach(player => {
            if (!this.participants[player]) {
                delete this.roomState.voting[player];
            }
        });
        
        // Log if any players were removed
        if (originalAlivePlayers.length !== this.roomState.alivePlayers.length) {
            console.log(`cleanupDisconnectedPlayers: Removed ${originalAlivePlayers.length - this.roomState.alivePlayers.length} players from alivePlayers`);
            console.log(`Original: [${originalAlivePlayers.join(', ')}]`);
            console.log(`After cleanup: [${this.roomState.alivePlayers.join(', ')}]`);
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
        // Clean up disconnected players before proceeding
        this.cleanupDisconnectedPlayers();
        
        // Calculate who got the most votes
        const maxVotesResult = this.calculateMaxVotes();
        
        this.playerList.forEach(player => {
            if (this.participants[player]) {
                this.participants[player].send(JSON.stringify({
                    type : "end_voting",
                    votingResults: this.roomState.voting,
                    maxVotes: maxVotesResult
                }))
            }
        })

        console.log(JSON.stringify({
            type : "end_voting",
            votingResults: this.roomState.voting,
            maxVotes: maxVotesResult
        }))

        // Wait 4 seconds before proceeding with game logic
        await delay(4000);

        // Check if spy was caught (civilian wins)
        if(maxVotesResult?.player === this.roomState.spy.player){
            this.playerList.forEach(player => {
                if (this.participants[player]) {
                    this.participants[player].send(JSON.stringify({type : "game_ended", winner: "civilians", spy : this.roomState.spy.player}))
                }
            })
            console.log(JSON.stringify({
                type : "game_ended",
                winner: "civilians",
                spy : this.roomState.spy.player
            }))
            this.clearAllTimers();
            this.resetGameState();
            return;
        }

        // Remove the voted player from alive players (only if there's a clear winner, not a tie)
        if(maxVotesResult?.player) {
            this.roomState.alivePlayers = this.roomState.alivePlayers.filter(player => player !== maxVotesResult.player);
        }
        // If maxVotesResult is null (tie or no votes), no one is eliminated and we continue the game

        this.playerList.forEach(player => {
            if (this.participants[player]) {
                this.participants[player].send(JSON.stringify({type : "alivePlayers", alivePlayers : this.roomState.alivePlayers}))
            }
        })

        // Check if spy wins (only 2 players left)
        if(this.roomState.alivePlayers.length === 2){
            this.playerList.forEach(player => {
                if (this.participants[player]) {
                    this.participants[player].send(JSON.stringify({type : "game_ended", winner: "spy", spy : this.roomState.spy.player}))
                }
            })
            console.log(JSON.stringify({
                type : "game_ended",
                winner: "spy",
                spy : this.roomState.spy.player
            }))
            this.clearAllTimers();
            this.resetGameState();
            return;
        }

        // Continue the game - reset voting and start new speaking round
        this.roomState.voting = {};
        this.roomState.roundNo++;
        
        // Send round number to all players
        this.playerList.forEach(player => {
            if (this.participants[player]) {
                this.participants[player].send(JSON.stringify({type : "round_started", roundNo : this.roomState.roundNo}))
            }
        })
        await delay(1000);
        // Start new speaking round
        await this.startSpeakingRound();
    }

    async startSpeakingRound() {
        // Wait 3 seconds before starting speaking phase
        await delay(3000);
        
        this.currentSpeakerIndex = 0;
        this.nextSpeaker();
    }

    nextSpeaker() {
        // Clean up disconnected players before proceeding
        this.cleanupDisconnectedPlayers();
        
        console.log(`nextSpeaker called - currentSpeakerIndex: ${this.currentSpeakerIndex}, alivePlayers.length: ${this.roomState.alivePlayers.length}, alivePlayers: [${this.roomState.alivePlayers.join(', ')}]`);
        
        // If no players are alive, end the game
        if (this.roomState.alivePlayers.length === 0) {
            console.log("No players alive, resetting game state");
            this.clearAllTimers();
            this.resetGameState();
            return;
        }
        
        // Check if all players have spoken (current speaker index is at or beyond the end)
        if (this.currentSpeakerIndex >= this.roomState.alivePlayers.length) {
            console.log("All players have spoken, starting voting phase");
            // All players have spoken, start voting
            this.roomState.alivePlayers.forEach(player => {
                if (this.participants[player]) {
                    this.participants[player].send(JSON.stringify({type : "start_voting"}))
                }
            })

            // Set timeout for voting and track it
            this.votingTimer = setTimeout(() => {
                this.handleVotingResults();
            }, 15000);
            return;
        }

        const currentSpeaker = this.roomState.alivePlayers[this.currentSpeakerIndex];
        
        // Notify all players about current speaker
        this.roomState.alivePlayers.forEach(player => {
            if (this.participants[player]) {
                this.participants[player].send(JSON.stringify({type : "speak_statement", currentSpeaker : currentSpeaker }))
            }
        })

        // Set timer for current speaker
        this.speakingTimer = setTimeout(() => {
            console.log(`Speaker timer expired, incrementing currentSpeakerIndex from ${this.currentSpeakerIndex} to ${this.currentSpeakerIndex + 1}`);
            this.currentSpeakerIndex++;
            this.nextSpeaker();
        }, 15000);
    }

    skipCurrentSpeaker() {
        if (this.speakingTimer) {
            clearTimeout(this.speakingTimer);
            this.speakingTimer = null;
        }
        console.log(`Speaker skipped, incrementing currentSpeakerIndex from ${this.currentSpeakerIndex} to ${this.currentSpeakerIndex + 1}`);
        this.currentSpeakerIndex++;
        this.nextSpeaker();
    }

    startGameCountdown() {
        // Send countdown messages to all players
        this.playerList.forEach(player => {
            if (this.participants[player]) {
                this.participants[player].send(JSON.stringify({type : "countdown", seconds: 3}))
            }
        })

        // Countdown from 3 to 1
        this.countdownTimers.push(setTimeout(() => {
            this.playerList.forEach(player => {
                if (this.participants[player]) {
                    this.participants[player].send(JSON.stringify({type : "countdown", seconds: 2}))
                }
            })
        }, 1000))

        this.countdownTimers.push(setTimeout(() => {
            this.playerList.forEach(player => {
                if (this.participants[player]) {
                    this.participants[player].send(JSON.stringify({type : "countdown", seconds: 1}))
                }
            })
        }, 2000))

        // After 3 seconds, start the actual game
        this.countdownTimers.push(setTimeout(async () => {
            this.playerList.forEach(player => {
                if (this.participants[player]) {
                    this.participants[player].send(JSON.stringify({type : "countdown", seconds: 0}))
                }
            })
            
            // Send spy/civilian words to players
            const spyPlayer = this.roomState.spy.player;
            if(this.participants[spyPlayer]){
                this.participants[spyPlayer].send(JSON.stringify({type : "spy", word : this.roomState.spy.word, player : spyPlayer}))
                this.playerList.forEach(player => {
                    if(player !== spyPlayer && this.participants[player]){
                        this.participants[player].send(JSON.stringify({type : "civilianWord", word : this.roomState.civilianWord, player : spyPlayer}))
                    }
                })
            }
            
            // Send round number for first round
            this.roomState.roundNo = 1;
            this.playerList.forEach(player => {
                if (this.participants[player]) {
                    this.participants[player].send(JSON.stringify({type : "round_started", roundNo : this.roomState.roundNo}))
                }
            })
            await delay(1000);
            // Start the first speaking round
            this.startSpeakingRound();
        }, 3000))
    }

    handleMessage(socket : WebSocket, message : any){
        if(message.type === "send_chat"){
            this.roomState.chats.push(message.chat)
            this.playerList.forEach(player => {
                if (this.participants[player]) {
                    this.participants[player].send(JSON.stringify({type : "chat", chat : message.chat, userId : message.userId}))
                }
            })
        }

        if(message.type === "join_room"){

            if(this.playerList.includes(message.userId)){
                this.participants[message.userId] = socket
                // socket.send(JSON.stringify({type : "player_already_in_room", roomState : this.roomState, playerList : this.playerList}))
                socket.send(JSON.stringify({type : "room_state", roomState : this.roomState}))
                socket.send(JSON.stringify({type : "game_mode", gameMode : this.gameMode}))

                this.playerList.forEach(player => {
                    if (this.participants[player]) {
                        this.participants[player].send(JSON.stringify({type : "playerList", playerList : this.playerList}))
                    }
                })
                return
            }

            if(this.playerList.length >= 6){
                socket.send(JSON.stringify({type : "room_full"}))
                return
            }
            socket.send(JSON.stringify({type : "room_seat_available", userId : message.userId}))

            this.participants[message.userId] = socket
            this.playerList.push(message.userId)
            this.roomState.readyStatus[message.userId] = false
            socket.send(JSON.stringify({type : "room_state", roomState : this.roomState}))

            this.playerList.forEach(player => {
                if (this.participants[player]) {
                    this.participants[player].send(JSON.stringify({type : "playerList", playerList : this.playerList}))
                }
            })
            console.log(this.playerList , this.roomState)
        }

        if(message.type === "ready"){
            this.roomState.readyStatus[message.userId] = true
            this.playerList.forEach(player => {
                if (this.participants[player]) {
                    this.participants[player].send(JSON.stringify({type : "player_ready", playerId : message.userId}))
                }
            })
            console.log("condition for game to start is :", (Object.values(this.roomState.readyStatus).every(status => status)) && (this.playerList.length >= 3))
            if(Object.values(this.roomState.readyStatus).every(status => status) && this.playerList.length >= 3){
                this.roomState.gameStarted = true
                this.playerList.forEach(player => {
                    if (this.participants[player]) {
                        this.participants[player].send(JSON.stringify({type : "gameStarted", gameStarted : true}))
                    }
                })
                this.roomState.alivePlayers = this.playerList
                const spyWord = this.pickRandomWord()
                const spyPlayer : string = this.pickRandomPlayer()
                
                // Store the spy player in room state
                this.roomState.spy.player = spyPlayer
                if(this.gameMode === "word_spy"){
                    this.roomState.spy.word = spyWord.spy
                }
                else{
                    this.roomState.spy.word = "Wordless"
                }
                this.roomState.civilianWord = spyWord.civilian
                
                // Start 3-second countdown before game begins
                this.startGameCountdown();
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
            
            // this.playerList.forEach(player => {
            //     if (this.participants[player]) {
            //         this.participants[player].send(JSON.stringify({type : "voting", voting : this.roomState.voting}))
            //     }
            // })
            console.log("votes for round :",this.roomState.roundNo, "are :", this.roomState.voting)
        }

        if(message.type === "notready"){
            this.roomState.readyStatus[message.userId] = false
            socket.send(JSON.stringify({type : "player_not_ready", playerId : message.userId}))
        }

        if(message.type === "leave_room"){

            if(message.userId === this.host.userId){
                delete this.participants[message.userId]
                this.playerList = this.playerList.filter(player => player !== message.userId)
                // this.host.socket.close()
                // Check if there are still players left to assign new host
                if (this.playerList.length > 0) {
                    this.host.userId = this.playerList[0]
                    this.host.socket = this.participants[this.host.userId]
                }
            }

            delete this.participants[message.userId]
            this.playerList = this.playerList.filter(player => player !== message.userId)
            delete this.roomState.readyStatus[message.userId]

            if(this.roomState.gameStarted && message.userId === this.roomState.spy.player){
                this.playerList.forEach(player => {
                    if (this.participants[player]) {
                        this.participants[player].send(JSON.stringify({type : "game_ended", winner: "civilians", spy : this.roomState.spy.player}))
                    }
                })
                this.clearAllTimers();
                this.resetGameState();
            }
            else if(this.roomState.gameStarted && message.userId !== this.roomState.spy.player){
                // Clear all timers if game is in progress
                // this.clearAllTimers();
                
                this.playerList.forEach(player => {
                    if (this.participants[player]) {
                        this.participants[player].send(JSON.stringify({type : "player_left", playerLeft : message.userId}))
                    }
                })
            }
            else {
                this.playerList.forEach(player => {
                    if (this.participants[player]) {
                        this.participants[player].send(JSON.stringify({type : "room_state", roomState : this.roomState}))
                    }
                })
            }

            // Check if room is empty and cleanup if needed
            this.checkAndCleanupRoom();
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


        if(message.type === "skip_speaking_statement"){
            // Check if the user is the current speaker
            const currentSpeaker = this.roomState.alivePlayers[this.currentSpeakerIndex];
            if(currentSpeaker === message.userId && this.roomState.gameStarted) {
                this.skipCurrentSpeaker();
            }
        }
    }

    isRoomEmpty(): boolean {
        return this.playerList.length === 0
    }

    checkAndCleanupRoom() {
        if (this.isRoomEmpty()) {
            console.log(`Room ${this.roomId} is empty, cleaning up...`)
            this.clearAllTimers()
            this.resetGameState()
            
            // Notify UserManager to remove this room
            if (this.onRoomEmptyCallback) {
                this.onRoomEmptyCallback()
            }
        }
    }

    closeRoom(){
        // this.host.socket.close()
        delete this.participants[this.host.userId]
        this.playerList = this.playerList.filter(player => player !== this.host.userId)
        delete this.roomState.readyStatus[this.host.userId]
        this.clearAllTimers()
        this.resetGameState()
    }
}

function delay(ms : number){
    return new Promise(resolve => setTimeout(resolve, ms))
}