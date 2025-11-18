import { WebSocket } from "ws"

interface RoomState {
    strokes  : string
    messages : string[]
}

interface Users {
    [key : string] : WebSocket | null
}


interface Host {
    socket : WebSocket | null
    userId : string
}

interface GameSettings {
    timeSlot : number,
    diffuclty : "hard" | "easy" | "medium",
    noOfRounds : number
}

interface RoundOverScoreState {
    [key : string] : number
}

type GamePhase = "waiting" | "playing" | "roundTransition" | "gameEnd"

interface GameState {
    currentDrawing : WebSocket | null,
    indexOfUser : number
    wordToGuess : string
    currentRoundNo : number
    secondTimer: any
    secondTime : number
    reveledIndex : number[]
    roundOverScoreState : RoundOverScoreState
    gamePhase: GamePhase
    transitionTimer: any
    transitionCountdown: number
    activeTimeouts: NodeJS.Timeout[]  // Track all setTimeout calls to prevent leaks
}


interface Players {
    userId : string,
    name : string,
    score : number,
    wordGuessed : boolean,
    avatar : string
}

const WordList = [
    // Easy words
    "cat", "dog", "house", "car", "tree", "sun", "moon", "star", "bird", "fish",
    "apple", "banana", "book", "pencil", "chair", "table", "bed", "door", "window", "phone",
    "cake", "ice cream", "pizza", "hamburger", "sandwich", "cereal", "milk", "water", "coffee", "tea",
    "hat", "shoes", "shirt", "pants", "jacket", "glasses", "watch", "bag", "umbrella", "keys",
    "ball", "toy", "bike", "bicycle", "car", "bus", "train", "plane", "boat", "ship",
    "guitar", "piano", "drum", "violin", "trumpet", "flute", "microphone", "radio", "television", "camera",
    "flower", "garden", "beach", "mountain", "ocean", "river", "lake", "forest", "desert", "island",
    "doctor", "teacher", "police", "firefighter", "chef", "farmer", "artist", "musician", "athlete", "scientist",
    "elephant", "lion", "tiger", "bear", "rabbit", "mouse", "horse", "cow", "pig", "sheep",
    "butterfly", "bee", "spider", "ant", "ladybug", "dragonfly", "grasshopper", "cricket", "beetle", "worm",
    
    // Medium words
    "adventure", "journey", "vacation", "celebration", "party", "wedding", "birthday", "holiday", "festival", "parade",
    "library", "museum", "school", "hospital", "restaurant", "hotel", "airport", "station", "park", "zoo",
    "computer", "laptop", "keyboard", "mouse", "screen", "internet", "website", "email", "message", "download",
    "basketball", "football", "soccer", "tennis", "baseball", "volleyball", "swimming", "running", "cycling", "dancing",
    "butterfly", "dragon", "unicorn", "mermaid", "robot", "alien", "monster", "ghost", "witch", "wizard",
    "superhero", "princess", "knight", "pirate", "ninja", "samurai", "cowboy", "detective", "explorer", "astronaut",
    "mountain", "volcano", "waterfall", "cave", "bridge", "tunnel", "tower", "castle", "palace", "temple",
    "sunset", "sunrise", "rainbow", "storm", "thunder", "lightning", "rain", "snow", "cloud", "wind",
    "chocolate", "candy", "cookie", "bread", "butter", "cheese", "egg", "meat", "chicken", "rice",
    "backpack", "suitcase", "wallet", "purse", "bracelet", "necklace", "ring", "earring", "belt", "tie",
    
    // Hard words
    "philosophy", "mathematics", "architecture", "engineering", "psychology", "biology", "chemistry", "physics", "geography", "history",
    "transformation", "revolution", "evolution", "discovery", "invention", "innovation", "creation", "destruction", "construction", "demolition",
    "telescope", "microscope", "laboratory", "experiment", "hypothesis", "theory", "research", "study", "analysis", "investigation",
    "gymnastics", "archaeology", "paleontology", "geology", "meteorology", "astronomy", "navigation", "exploration", "expedition", "mission",
    "orchestra", "symphony", "opera", "ballet", "theater", "performance", "exhibition", "gallery", "sculpture", "painting",
    "technology", "automation", "artificial", "intelligence", "virtual", "reality", "simulation", "animation", "digital", "electronic",
    "photography", "cinematography", "documentary", "interview", "journalism", "reporting", "broadcasting", "streaming", "podcast", "vlog",
    "entrepreneur", "business", "corporation", "industry", "commerce", "trade", "economy", "market", "investment", "finance",
    "pharmaceutical", "medicine", "treatment", "therapy", "surgery", "diagnosis", "symptom", "disease", "recovery", "health",
    "environment", "ecosystem", "biodiversity", "conservation", "preservation", "pollution", "recycling", "sustainability", "renewable", "energy"
]


export class SkribbleRoomManager {
    public participants : Users
    public roomId : string
    private host : Host
    // private admin : WebSocket | null
    private GameState : GameState
    private Players : Players[]
    private GameSetting : GameSettings
    public gameStarted : boolean
    private onRoomEmptyCallback?: () => void


    constructor(roomId : string, userId : string, PlayerName : string,socket : WebSocket, onRoomEmptyCallback?: () => void){
        this.participants = {
            [userId] : socket
        }
        this.roomId = roomId
        this.host = {
            userId : userId,
            socket : socket
        }
        this.Players = [{
            userId : userId,
            name : PlayerName,
            score : 0,
            wordGuessed : false,
            avatar : ""
        }]
        this.GameState = {
            currentDrawing : null,
            wordToGuess : "",
            indexOfUser : 0,
            secondTime: 0,
            secondTimer: null,
            currentRoundNo : 0,
            reveledIndex : [],
            roundOverScoreState : {
                [userId] : 0
            },
            gamePhase: "waiting",
            transitionTimer: null,
            transitionCountdown: 0,
            activeTimeouts: []
        }
        this.GameSetting = {
            noOfRounds : 3,
            timeSlot : 80,
            diffuclty : "easy"
        }
        this.gameStarted = false
        this.onRoomEmptyCallback = onRoomEmptyCallback
    }

    gameSettings(socket : WebSocket, message : any){
        this.GameSetting = {
            ...this.GameSetting,
            timeSlot : message.settings.drawtime,
            noOfRounds : message.settings.rounds,
            diffuclty : message.settings.difficulty
        }
        console.log("this is the game settings", this.GameSetting)
        this.Players.forEach((user)=>{
            if(socket != this.participants[user.userId]){
                this.participants[user.userId]?.send(JSON.stringify(message))
            }
        })
    }

    sendJoinRoomEvents(socket: WebSocket, userId: string) {
        socket.send(JSON.stringify({type : "join_room_response", status : true, message : "You have joined the room successfully", roomId : this.roomId}))
        socket.send(JSON.stringify({type : "PLAYER_ROLE", host : false}))
        
        // Broadcast updated players list to all players
        this.Players.forEach((user) => {
            this.participants[user.userId]?.send(JSON.stringify({type : "PLAYERS", players : this.Players, userId : userId}))
        })
    }

    sendJoinRoomFailure(socket: WebSocket, reason: "not_found" | "full") {
        if (reason === "full") {
            socket.send(JSON.stringify({type : "join_room_response", status : false, message : "Room is full", roomId : this.roomId}))
        } else {
            socket.send(JSON.stringify({type : "join_room_response", status : false, message : "Room not found", roomId : this.roomId}))
        }
    }

    joinRoom(socket : WebSocket, message : any){
        this.Players.push({
            userId : message.userId,
            name : message.name,
            score : 0,
            wordGuessed: false,
            avatar  : message.avatar
        })
        this.participants = {
            ...this.participants,
            [message.userId] : socket
        }
        this.GameState.roundOverScoreState = {
            ...this.GameState.roundOverScoreState,
            [message.userId] : 0
        }
        console.log("this is the players in the room", this.Players)
    }

    getJoinEvents(socket: WebSocket, userId: string) {
        if(this.Players.some(p => p.userId === userId)){
            this.sendJoinRoomEvents(socket, userId)
        }
    }
    // randomizePlayers() {
    //     this.usernames = this.usernames.sort(function(){return 0.5 - Math.random()})
    // }

    sendPlayersList(){
        this.host.socket?.send(JSON.stringify({type : "PLAYERS", players : this.Players, userId : this.host.userId}))
    }

    startGame(socket : WebSocket, parsedMessage : any){
        if(socket === this.host.socket){
            // Set game settings
            // this.GameSetting = {
            //     ...this.GameSetting,
            //     timeSlot : parsedMessage.timeSlot,
            //     noOfRounds : parsedMessage.noOfRounds,
            //     diffuclty : parsedMessage.diffuclty
            // }

            // Initialize game state
            this.GameState.currentRoundNo = 1
            this.GameState.indexOfUser = 0
            this.GameState.gamePhase = "waiting"  // Reset game phase to allow new game to start

            // Notify all players that game is starting
            this.broadcastToAll({
                type: "START_GAME",
                payload: this.GameState,
                gameSetting: this.GameSetting
            });

            this.gameStarted = true

            // Start the first round with proper sequence
            this.startRoundSequence();
        }
    }

    gameState(socket : WebSocket, parsedMessage : any){

        this.GameState = {
            ...this.GameState,
            currentDrawing : this.participants[this.Players[this.GameState.indexOfUser].userId],
            wordToGuess : parsedMessage.word,
        }
    }

    getRandomWordFromList(): string {
        // Select random word from word list based on difficulty
        let filteredWords: string[] = [];
        
        if (this.GameSetting.diffuclty === "easy") {
            // First 100 words (0-99) are easy
            filteredWords = WordList.slice(0, 100);
        } else if (this.GameSetting.diffuclty === "medium") {
            // Next 100 words (100-199) are medium
            filteredWords = WordList.slice(100, 200);
        } else {
            // Last 100 words (200-299) are hard
            filteredWords = WordList.slice(200);
        }
        
        // Fallback to all words if filtered list is empty
        if (filteredWords.length === 0) {
            filteredWords = WordList;
        }
        
        // Pick random word from filtered list
        const randomIndex = Math.floor(Math.random() * filteredWords.length);
        return filteredWords[randomIndex];
    }

    getRandomWord(){
        // Select random word from word list based on difficulty
        this.GameState.wordToGuess = this.getRandomWordFromList();
        
        // Send word to all players
        this.Players.forEach((user) => {
            if (this.participants[user.userId]) {
                this.participants[user.userId]?.send(JSON.stringify({type : "GET_WORD", word : this.GameState.wordToGuess}))
            }
        })
    }


    


    // join( username : string, socket : WebSocket){
    //     if(this.host.username === username){
    //         this.host.socket = socket
    //     }
        
    //     this.participants = {
    //         ...this.participants,
    //         [username] : socket
    //     }
        

    //     this.usernames.forEach((user)=>{
    //         this.participants[user.name]?.send(JSON.stringify({type : "PLAYERS", players : this.usernames, username : username}))
    //     })
    // }

    private checkAllNonDrawersGuessed(): boolean {
        // Get the current drawer
        const currentDrawer = this.Players[this.GameState.indexOfUser];
        
        // Check if all players except the drawer have guessed
        const allNonDrawersGuessed = this.Players.every((user) => {
            // Drawer doesn't need to guess (they already know the word)
            if (user.userId === currentDrawer.userId) {
                return true;
            }
            // All non-drawers must have guessed
            return user.wordGuessed === true;
        });
        
        return allNonDrawersGuessed;
    }

    message(ws : WebSocket, parsedMessage : any){
        const word  = this.GameState.wordToGuess
        if(parsedMessage.message.toLowerCase()===this.GameState.wordToGuess.toLowerCase()){
            let score: number
            this.Players.forEach((user)=>{
                if(user.userId===parsedMessage.userId){
                    // Don't allow drawer to guess their own word
                    if(user.userId === this.Players[this.GameState.indexOfUser].userId){
                        return;
                    }
                    
                    // Don't allow multiple guesses from same player
                    if(user.wordGuessed){
                        return;
                    }
                    
                    user.wordGuessed = true
                    if(this.GameState.secondTime < this.GameSetting.timeSlot*0.20){
                        this.GameState.roundOverScoreState[user.userId] = 200
                        user.score = user.score + this.GameState.roundOverScoreState[user.userId]
                    }else if(this.GameState.secondTime < this.GameSetting.timeSlot*0.40){
                        this.GameState.roundOverScoreState[user.userId] = (0.80)*200
                        user.score = user.score + this.GameState.roundOverScoreState[user.userId]
                    }else if(this.GameState.secondTime < this.GameSetting.timeSlot*0.60){
                        this.GameState.roundOverScoreState[user.userId] = (0.60)*200
                        user.score = user.score + this.GameState.roundOverScoreState[user.userId]
                    }else if(this.GameState.secondTime < this.GameSetting.timeSlot*0.80){
                        this.GameState.roundOverScoreState[user.userId] = (0.40)*200
                        user.score = user.score + this.GameState.roundOverScoreState[user.userId]
                    }else {
                        this.GameState.roundOverScoreState[user.userId] = (0.20)*200
                        user.score = user.score + this.GameState.roundOverScoreState[user.userId]
                    }
                }
                this.participants[user.userId]?.send(JSON.stringify({type : "WORD_MATCHED", message: `${parsedMessage.name} : Guessed the word`, userId : parsedMessage.userId , word : this.GameState.wordToGuess}))
            })
            
            // Check if all non-drawers have guessed - if yes, end round immediately
            if(this.GameState.gamePhase === "playing" && this.checkAllNonDrawersGuessed()){
                this.endRound();
            }
        }else if(word.slice(0, this.GameState.wordToGuess.length-1).toLowerCase() === parsedMessage.message.toLowerCase()){
            this.Players.forEach((user)=>{
                this.participants[user.userId]?.send(JSON.stringify({type : "CLOSE_GUESS", message: `${parsedMessage.name} : Close guess`}))
            })
        }else {
            this.Players.forEach((user)=>{
                this.participants[user.userId]?.send(JSON.stringify({type : "MESSAGE", message: `${parsedMessage.name} : ${parsedMessage.message}`}))
            })
        }
        
    }

    // message(socket : WebSocket, message : any){
    //     this.Players.forEach((user)=>{
    //         if(socket != this.participants[user.userId]){
    //             this.participants[user.userId]?.send(JSON.stringify(message))
    //         }
    //     })
    // }

    getRoomState(socket: WebSocket){
        
    }

    drawEvent(socket: WebSocket, parsedMessage : any){
        this.Players.forEach((user)=>{
            if(socket != this.participants[user.userId]){
                this.participants[user.userId]?.send(JSON.stringify(parsedMessage))
            }
        })
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
            if (this.gameStarted) {
                this.clearAllTimers();
            }
            
            // Handle as leave
            this.leave(socket, disconnectedUserId);
        }
    }

    leave(socket : WebSocket , userId : string){
        // Check if the current drawer is leaving BEFORE removing them (for game state handling)
        const wasCurrentDrawer = this.gameStarted && 
                                 this.GameState.indexOfUser < this.Players.length && 
                                 this.Players[this.GameState.indexOfUser]?.userId === userId;
        
        // Find the index of the leaving player before removal (for index adjustment)
        const leavingPlayerIndex = this.Players.findIndex(p => p.userId === userId);

        // Handle host leaving
        if(userId === this.host.userId){
            delete this.participants[userId]
            this.Players = this.Players.filter(player => player.userId !== userId)
            delete this.GameState.roundOverScoreState[userId]
            
            // Check if there are still players left to assign new host
            if (this.Players.length > 0) {
                this.host.userId = this.Players[0].userId
                this.host.socket = this.participants[this.host.userId] || null
                
                // Notify new host
                if (this.host.socket) {
                    this.host.socket.send(JSON.stringify({type : "PLAYER_ROLE", host : true}))
                }
            }
        } else {
            // Regular player leaving
            delete this.participants[userId]
            this.Players = this.Players.filter(player => player.userId !== userId)
            delete this.GameState.roundOverScoreState[userId]
        }

        // Handle game state if game is in progress
        if(this.gameStarted){
            // If the current drawer left, end the round
            if (wasCurrentDrawer) {
                this.clearAllTimers();
                // Reset indexOfUser since the drawer left
                this.GameState.indexOfUser = 0;
                if (this.GameState.gamePhase === "playing") {
                    // End round but skip drawer score calculation since drawer left
                    this.endRoundAfterDrawerLeft();
                }
            } else if (leavingPlayerIndex !== -1 && leavingPlayerIndex < this.GameState.indexOfUser) {
                // If a player before the current drawer left, adjust the index
                this.GameState.indexOfUser--;
            }
            
            // Notify all remaining players
            this.broadcastToAll({
                type: "PLAYER_LEFT",
                userId: userId
            });
        } else {
            // Game not started, just update player list
            this.broadcastToAll({
                type: "PLAYERS",
                players: this.Players
            });
        }

        // Check if room is empty and cleanup if needed
        this.checkAndCleanupRoom();
    }

    isRoomEmpty(): boolean {
        return this.Players.length === 0
    }

    checkAndCleanupRoom() {
        if (this.isRoomEmpty()) {
            console.log(`SkribbleRoom ${this.roomId} is empty, cleaning up...`)
            this.clearAllTimers()
            this.resetGameState()
            
            // Notify UserManager to remove this room
            if (this.onRoomEmptyCallback) {
                this.onRoomEmptyCallback()
            }
        }
    }

    // Complete cleanup method - call this when room is destroyed or game needs to be fully reset
    cleanup() {
        this.resetGameState();
        // Clear any remaining references
        this.GameState.currentDrawing = null;
    }


    private getRandomNumberInRange(min: number, max: number, excluded: number[]): number {
            const numbers = Array.from({ length: max - min + 1 }, (_, i) => min + i).filter(n => !excluded.includes(n));
            if (numbers.length === 0) throw new Error("No numbers left to choose from");
            return numbers[Math.floor(Math.random() * numbers.length)];
        }

    private broadcastToAll(message: any) {
        this.Players.forEach((user) => {
            if (this.participants[user.userId]) {
                this.participants[user.userId]?.send(JSON.stringify(message));
            }
        });
    }

    private clearAllTimers() {
        // Clear all setInterval timers
        if (this.GameState.secondTimer) {
            clearInterval(this.GameState.secondTimer);
            this.GameState.secondTimer = null;
        }
        if (this.GameState.transitionTimer) {
            clearInterval(this.GameState.transitionTimer);
            this.GameState.transitionTimer = null;
        }

        // Clear all setTimeout timers
        this.GameState.activeTimeouts.forEach((timeout) => {
            clearTimeout(timeout);
        });
        this.GameState.activeTimeouts = [];
    }

    private trackTimeout(timeout: NodeJS.Timeout): NodeJS.Timeout {
        this.GameState.activeTimeouts.push(timeout);
        return timeout;
    }

    private startRoundTimer() {
        // Clear any existing timer to prevent duplicates
        if (this.GameState.secondTimer) {
            clearInterval(this.GameState.secondTimer);
            this.GameState.secondTimer = null;
        }

        // Reset round state
        this.GameState.secondTime = 0;
        this.GameState.reveledIndex = [];
        this.GameState.gamePhase = "playing";
        
        // Reset wordGuessed for all players
        this.Players.forEach((user) => {
            user.wordGuessed = false;
        });

        // Start the round timer
        this.GameState.secondTimer = setInterval(() => {
            // Safety check: only run if game is still in playing phase
            if (this.GameState.gamePhase !== "playing") {
                clearInterval(this.GameState.secondTimer);
                this.GameState.secondTimer = null;
                return;
            }

            this.GameState.secondTime += 1;

            // Check if time is up
            if (this.GameState.secondTime >= this.GameSetting.timeSlot) {
                this.endRound();
                return;
            }

            // Reveal letter at halfway point
            if (this.GameState.secondTime === Math.floor(this.GameSetting.timeSlot / 2) && this.GameState.reveledIndex.length === 0) {
                const randomNumber: number = this.getRandomNumberInRange(
                    0,
                    this.GameState.wordToGuess.length - 1,
                    this.GameState.reveledIndex
                );
                this.GameState.reveledIndex.push(randomNumber);
                this.broadcastToAll({
                    type: "SECOND_TIMER",
                    time: this.GameState.secondTime,
                    timeRemaining: this.GameSetting.timeSlot - this.GameState.secondTime,
                    reveledIndex: randomNumber,
                    letterReveled: this.GameState.wordToGuess[randomNumber]
                });
            } else {
                // Broadcast timer update
                this.broadcastToAll({
                    type: "SECOND_TIMER",
                    time: this.GameState.secondTime,
                    timeRemaining: this.GameSetting.timeSlot - this.GameState.secondTime
                });
            }
        }, 1000);
    }

    private endRound() {
        // Stop the round timer
        if (this.GameState.secondTimer) {
            clearInterval(this.GameState.secondTimer);
            this.GameState.secondTimer = null;
        }

        // Set phase to transition
        this.GameState.gamePhase = "roundTransition";
        
        // Check if current drawer still exists (in case they disconnected)
        const currentDrawer = this.Players[this.GameState.indexOfUser];
        if (currentDrawer) {
            // Update scores for players who didn't guess
            this.Players.forEach((user) => {
                if (!user.wordGuessed && (user.userId !== currentDrawer.userId)) {
                    this.GameState.roundOverScoreState[user.userId] = 0;
                }
            });

            this.calculateDrawerScore();
        } else {
            // Drawer left, reset scores for all remaining players
            this.Players.forEach((user) => {
                if (!user.wordGuessed) {
                    this.GameState.roundOverScoreState[user.userId] = 0;
                }
            });
        }

        // Broadcast round end
        this.broadcastToAll({
            type: "ROUND_END",
            time: this.GameState.secondTime,
            roundScore: this.GameState.roundOverScoreState
        });

        // Start transition countdown (4 seconds)
        this.GameState.transitionCountdown = 4;
        this.startTransitionCountdown();
    }

    private endRoundAfterDrawerLeft() {
        // Stop the round timer
        if (this.GameState.secondTimer) {
            clearInterval(this.GameState.secondTimer);
            this.GameState.secondTimer = null;
        }

        // Set phase to transition
        this.GameState.gamePhase = "roundTransition";
        
        // Reset scores for all remaining players since drawer left
        this.Players.forEach((user) => {
            if (!user.wordGuessed) {
                this.GameState.roundOverScoreState[user.userId] = 0;
            }
        });

        // Broadcast round end
        this.broadcastToAll({
            type: "ROUND_END",
            time: this.GameState.secondTime,
            roundScore: this.GameState.roundOverScoreState
        });

        // Start transition countdown (4 seconds)
        this.GameState.transitionCountdown = 4;
        this.startTransitionCountdown();
    }

    calculateDrawerScore(){
        const drawer = this.Players[this.GameState.indexOfUser];
        const guesserRoundScores = this.Players
            .filter((user) => user.userId !== drawer.userId && user.wordGuessed)
            .map((user) => this.GameState.roundOverScoreState[user.userId] || 0);
        const averageGuesserScore = guesserRoundScores.length > 0
            ? guesserRoundScores.reduce((sum, val) => sum + val, 0) / guesserRoundScores.length
            : 0;
        this.GameState.roundOverScoreState[drawer.userId] = averageGuesserScore;
        drawer.score += averageGuesserScore;
    }

    private startTransitionCountdown() {
        // Clear any existing transition timer
        if (this.GameState.transitionTimer) {
            clearInterval(this.GameState.transitionTimer);
            this.GameState.transitionTimer = null;
        }

        // Broadcast initial countdown
        this.broadcastToAll({
            type: "TRANSITION_COUNTDOWN",
            countdown: this.GameState.transitionCountdown
        });

        // Start countdown timer
        this.GameState.transitionTimer = setInterval(() => {
            // Safety check: only run if game is still in transition phase
            if (this.GameState.gamePhase !== "roundTransition") {
                clearInterval(this.GameState.transitionTimer);
                this.GameState.transitionTimer = null;
                return;
            }

            this.GameState.transitionCountdown -= 1;

            if (this.GameState.transitionCountdown > 0) {
                // Broadcast countdown update
                this.broadcastToAll({
                    type: "TRANSITION_COUNTDOWN",
                    countdown: this.GameState.transitionCountdown
                });
            } else {
                // Countdown finished, transition to next round/player
                clearInterval(this.GameState.transitionTimer);
                this.GameState.transitionTimer = null;
                this.transitionToNextRound();
            }
        }, 1000);
    }

    private transitionToNextRound() {
        // Reset round scores
        this.Players.forEach((user) => {
            this.GameState.roundOverScoreState[user.userId] = 0;
        });

        // Move to next player or next round
        if (this.GameState.indexOfUser < this.Players.length - 1) {
            // Next player in current round
            this.GameState.indexOfUser += 1;
        } else {
            // Last player, move to next round
            this.GameState.indexOfUser = 0;
            this.GameState.currentRoundNo += 1;

            // Check if game is over
            if (this.GameState.currentRoundNo > this.GameSetting.noOfRounds) {
                this.endGame();
                return;
            }
        }

        // Start the round sequence (round number → word → timer)
        this.startRoundSequence();
    }

    private startRoundSequence() {
        // Prevent overlapping sequences by clearing any existing timers first
        this.clearAllTimers();

        // Select new word
        this.GameState.wordToGuess = this.getRandomWordFromList();

        // Step 1: After 1 second, send round number to all players
        const timeout1 = this.trackTimeout(setTimeout(() => {
            // Remove from tracking after execution
            const index = this.GameState.activeTimeouts.indexOf(timeout1);
            if (index > -1) {
                this.GameState.activeTimeouts.splice(index, 1);
            }

            // Only proceed if game is still in a valid phase
            if (this.GameState.gamePhase === "waiting" || this.GameState.gamePhase === "roundTransition") {
                this.broadcastToAll({
                    type: "ROUND_NUMBER",
                    currentRoundNo: this.GameState.currentRoundNo,
                    currentUser: this.Players[this.GameState.indexOfUser].userId
                });

                // Step 2: After another 1 second (2 seconds total), send word/who's drawing
                const timeout2 = this.trackTimeout(setTimeout(() => {
                    // Remove from tracking after execution
                    const index2 = this.GameState.activeTimeouts.indexOf(timeout2);
                    if (index2 > -1) {
                        this.GameState.activeTimeouts.splice(index2, 1);
                    }

                    // Only proceed if game is still in a valid phase
                    if (this.GameState.gamePhase === "waiting" || this.GameState.gamePhase === "roundTransition") {
                this.Players.forEach((user) => {
                            if (user === this.Players[this.GameState.indexOfUser]) {
                                // Current drawer gets the word
                                this.participants[user.userId]?.send(JSON.stringify({
                                    type: "WORD",
                                    word: this.GameState.wordToGuess,
                                    currentRoundNo: this.GameState.currentRoundNo,
                                    currentUser: this.Players[this.GameState.indexOfUser].userId
                                }));
                            } else {
                                // Others get word length and who's drawing
                                this.participants[user.userId]?.send(JSON.stringify({
                                    type: "WORD_LENGTH",
                                    wordLength: this.GameState.wordToGuess.length,
                                    currentRoundNo: this.GameState.currentRoundNo,
                                    currentUser: this.Players[this.GameState.indexOfUser].userId,
                                    drawerName: this.Players[this.GameState.indexOfUser].name
                                }));
                            }
                        });

                        // Step 3: After 3 seconds from sending word, start the round timer
                        const timeout3 = this.trackTimeout(setTimeout(() => {
                            // Remove from tracking after execution
                            const index3 = this.GameState.activeTimeouts.indexOf(timeout3);
                            if (index3 > -1) {
                                this.GameState.activeTimeouts.splice(index3, 1);
                            }

                            // Only start timer if game is still in a valid phase
                            if (this.GameState.gamePhase === "waiting" || this.GameState.gamePhase === "roundTransition") {
                                this.startRoundTimer();
                            }
                        }, 3000));
                    }
                }, 1000));
            }
        }, 1000));
    }


    private endGame() {
        // Clear all timers first to prevent any new timer events
        this.clearAllTimers();

        // Set game phase to prevent any pending timeouts from executing
        this.GameState.gamePhase = "gameEnd";

        // Reset game state
        this.GameState.currentRoundNo = 0;
        this.GameState.indexOfUser = 0;
        this.GameState.wordToGuess = "";
        this.GameState.currentDrawing = null;
        this.GameState.secondTime = 0;
        this.GameState.reveledIndex = [];
        this.GameState.transitionCountdown = 0;

        // Reset round scores
        this.Players.forEach((user) => {
            this.GameState.roundOverScoreState[user.userId] = 0;
        });

        // Wait 2 seconds before sending game over (track this timeout)
        const gameOverTimeout = this.trackTimeout(setTimeout(() => {
            // Remove from tracking after execution
            const index = this.GameState.activeTimeouts.indexOf(gameOverTimeout);
            if (index > -1) {
                this.GameState.activeTimeouts.splice(index, 1);
            }

            // Only send if game is still ended (hasn't been reset)
            if (this.GameState.gamePhase === "gameEnd") {
                this.broadcastToAll({
                    type: "GAME_OVER",
                    time: 0,
                    ScoreCard: this.Players
                });
            }
        }, 2000));
    }

    private resetGameState() {
        // Clear all timers
        this.clearAllTimers();

        // Reset all game state
        this.GameState.gamePhase = "waiting";
        this.GameState.currentRoundNo = 0;
        this.GameState.indexOfUser = 0;
        this.GameState.wordToGuess = "";
        this.GameState.currentDrawing = null;
        this.GameState.secondTime = 0;
        this.GameState.reveledIndex = [];
        this.GameState.transitionCountdown = 0;

        // Reset player states
                        this.Players.forEach((user) => {
            user.wordGuessed = false;
            user.score = 0;
            this.GameState.roundOverScoreState[user.userId] = 0;
        });
    }

    // Legacy method - kept for backward compatibility but game flow now starts from startGame()
    async secondTimerOfGame(socket : WebSocket, message : any){
        // This method is no longer needed as startGame() handles everything
        // But kept for compatibility if client still sends GET_SKRIBBLE_WORD
        if (this.GameState.gamePhase === "waiting") {
            // If game hasn't started yet, initialize settings from message
            const gameSettings = message.gameSettings
            if (gameSettings) {
                this.GameSetting.diffuclty = gameSettings.diffuclty
                this.GameSetting.timeSlot = gameSettings.timeSlot
                this.GameSetting.noOfRounds = gameSettings.rounds
                this.GameState.currentRoundNo = 1
                this.GameState.indexOfUser = 0
                this.startRoundSequence();
            }
        }
    }

    // Stop the second timer manually (if needed by client, but server will auto-handle)
    async stopSecondTimer(socket: WebSocket) {
        // Manually trigger round end - server will handle the transition
        if (this.GameState.gamePhase === "playing") {
            this.endRound();
        }
    }

    // Start both timers (or individually if needed)
    

    // Reset both timers and game state
    resetTimers(socket: WebSocket) {
        this.resetGameState();
        this.broadcastToAll({type: "TIMER_RESET"});
    }

    gameOver(){
        this.endGame();
    }
    
}