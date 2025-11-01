import axios from "axios"
import { WebSocket } from "ws"
import { options } from "../index.js"

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

interface GameState {
    currentDrawing : WebSocket | null,
    indexOfUser : number
    wordToGuess : string
    currentRoundNo : number
    secondTimer: any
    secondTime : number
    reveledIndex : number[]
    roundOverScoreState : RoundOverScoreState
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


    constructor(roomId : string, userId : string, PlayerName : string,socket : WebSocket){
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
            }
        }
        this.GameSetting = {
            noOfRounds : 0,
            timeSlot : 0,
            diffuclty : "easy"
        }
    }

    // joinHttp(username : string,avatar : string){
    //     this.usernames.push({
    //         name : username,
    //         score : 0,
    //         wordGuessed: false,
    //         avatar  : avatar
    //     })
    //     this.participants = {
    //         ...this.participants,
    //         [username] : null
    //     }
    //     this.GameState.roundOverScoreState = {
    //         ...this.GameState.roundOverScoreState,
    //         [username] : 0
    //     }
    // }

    joinRoom(socket : WebSocket, message : any){
        this.Players.push({
            userId : message.userId,
            name : message.username,
            score : 0,
            wordGuessed: false,
            avatar  : message.avatar
        })
        this.participants = {
            ...this.participants,
            [message.username] : socket
        }
        this.GameState.roundOverScoreState = {
            ...this.GameState.roundOverScoreState,
            [message.username] : 0
        }
        this.Players.forEach((user)=>{
            this.participants[user.userId]?.send(JSON.stringify({type : "PLAYERS", players : this.Players, userId : message.userId}))
        })

        console.log("this is the players in the room", this.Players)
    }
    // randomizePlayers() {
    //     this.usernames = this.usernames.sort(function(){return 0.5 - Math.random()})
    // }

    sendPlayersList(){
        this.host.socket?.send(JSON.stringify({type : "PLAYERS", players : this.Players, userId : this.host.userId}))
    }

    startGame(socket : WebSocket, parsedMessage : any){
        if(socket === this.host.socket){
            // this.randomizePlayers()
            this.GameSetting = {
                ...this.GameSetting,
                timeSlot : parsedMessage.timeSlot,
                noOfRounds : parsedMessage.noOfRounds,
                diffuclty : parsedMessage.diffuclty
            }

            // this.gameState(socket, parsedMessage)
            this.Players.forEach((user)=>{
                if(socket != this.participants[user.name]){
                    this.participants[user.name]?.send(JSON.stringify({type : "START_GAME", payload : this.GameState}))
                }
            })
        }
    }

    gameState(socket : WebSocket, parsedMessage : any){

        this.GameState = {
            ...this.GameState,
            currentDrawing : this.participants[this.Players[this.GameState.indexOfUser].name],
            wordToGuess : parsedMessage.word,
        }
    }

    getRandomWord(){
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
        this.GameState.wordToGuess = filteredWords[randomIndex];
        
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

    message(ws : WebSocket, parsedMessage : any){
        const word  = this.GameState.wordToGuess
        if(parsedMessage.message===this.GameState.wordToGuess){
            let score: number
            this.Players.forEach((user)=>{
                if(user.userId===parsedMessage.userId){
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
                this.participants[user.userId]?.send(JSON.stringify({type : "WORD_MATCHED", message: `${parsedMessage.userId} : Guessed the word`, userId : parsedMessage.userId}))
            })
        }else if(word.slice(0, this.GameState.wordToGuess.length-1) === parsedMessage.message){
            this.Players.forEach((user)=>{
                this.participants[user.userId]?.send(JSON.stringify({type : "MESSAGE", message: `${parsedMessage.userId} : Close guess`}))
            })
        }else {
            this.Players.forEach((user)=>{
                this.participants[user.userId]?.send(JSON.stringify({type : "MESSAGE", message: `${parsedMessage.userId} : ${parsedMessage.message}`}))
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

    
    
    leave(socket : WebSocket , username : string){
        // const index = this.participants.indexOf({socket : socket , username : username})
        // this.participants.splice(index, 1);
        // socket.close(1000 , "you left the room")
    }


    async secondTimerOfGame(socket : WebSocket, message : any){
        // this.usernames = this.usernames.sort(function(){return 0.5 - Math.random()})
        const gameSettings = message.gameSettings
        this.GameSetting.diffuclty = gameSettings.diffuclty
        this.GameSetting.timeSlot = gameSettings.timeSlot
        this.GameSetting.noOfRounds = gameSettings.rounds
        this.GameState.currentRoundNo =  1
        
        function getRandomNumberInRange(min: number, max: number, excluded: number[]): number {
            const numbers = Array.from({ length: max - min + 1 }, (_, i) => min + i).filter(n => !excluded.includes(n));
            if (numbers.length === 0) throw new Error("No numbers left to choose from");
            return numbers[Math.floor(Math.random() * numbers.length)];
        }

        

        const result = await axios.request(options)
        this.GameState.wordToGuess = result.data.word
        this.Players.forEach((user)=>{
            if(user===this.Players[this.GameState.indexOfUser]){
                this.participants[user.userId]?.send(JSON.stringify({type : "GET_WORD", word : this.GameState.wordToGuess, gameSetting : this.GameSetting, currentRoundNo : this.GameState.currentRoundNo, currentUser : this.Players[this.GameState.indexOfUser].userId}))
            }else{
                this.participants[user.userId]?.send(JSON.stringify({type : "WORD_LENGTH", wordLength : this.GameState.wordToGuess.length, gameSetting : this.GameSetting, currentRoundNo : this.GameState.currentRoundNo, currentUser : this.Players[this.GameState.indexOfUser].userId}))
            }
        })
        this.GameState.secondTimer = setInterval(() => {
            this.GameState.secondTime = this.GameState.secondTime + 1
            if(this.GameState.secondTime > this.GameSetting.timeSlot/2 && this.GameState.reveledIndex.length===0){
                const randomNumber: number = getRandomNumberInRange(0,this.GameState.wordToGuess.length-1, this.GameState.reveledIndex)
                this.GameState.reveledIndex.push(randomNumber)
                this.Players.forEach((user)=>{
                    this.participants[user.userId]?.send(JSON.stringify({type : "SECOND_TIMER", time: this.GameState.secondTime, reveledIndex : randomNumber, letterReveled : this.GameState.wordToGuess[randomNumber]}))
                })
            }else {
                this.Players.forEach((user)=>{
                    this.participants[user.userId]?.send(JSON.stringify({type : "SECOND_TIMER", time: this.GameState.secondTime}))
                })
            } 
            
        }, 1000);
    }

    // Stop the second timer if needed
    async stopSecondTimer(socket: WebSocket) {
        function getRandomNumberInRange(min: number, max: number, excluded: number[]): number {
            const numbers = Array.from({ length: max - min + 1 }, (_, i) => min + i).filter(n => !excluded.includes(n));
            if (numbers.length === 0) throw new Error("No numbers left to choose from");
            return numbers[Math.floor(Math.random() * numbers.length)];
        }
        this.GameState.reveledIndex.pop()
        if (this.GameState.secondTimer) {
            console.log("Time stopped");
            clearInterval(this.GameState.secondTimer);
            this.GameState.secondTimer = null;
            this.GameState.secondTime = 0;
            // Notify clients that the timer has stopped

            this.Players.forEach((user) => {
                if(!user.wordGuessed){
                    user.score = user.score + 0
                }
                this.participants[user.userId]?.send(
                    JSON.stringify({ type: "SECOND_TIMER_STOPPED", time: 0, roundScore : this.GameState.roundOverScoreState })
                );
            });


            
            if(this.GameState.indexOfUser < this.Players.length - 1){
                this.GameState.indexOfUser = this.GameState.indexOfUser + 1 
            }else {
                this.GameState.indexOfUser = 0
                this.GameState.currentRoundNo = this.GameState.currentRoundNo + 1
                if(this.GameState.currentRoundNo > this.GameSetting.noOfRounds){
                    console.log("game Over")
                    this.GameState.currentRoundNo = 0
                    this.GameState.indexOfUser=0
                    this.GameState.wordToGuess = ""
                    this.GameState.currentDrawing = null
                    this.GameState.reveledIndex.pop()
                    clearInterval(this.GameState.secondTimer);
                    this.GameState.secondTimer = null;
                    this.GameState.secondTime = 0;
                    setTimeout(()=>{
                        this.Players.forEach((user)=>{
                            this.GameState.roundOverScoreState[user.userId] = 0
                            this.participants[user.userId]?.send(JSON.stringify({type: "GAME_OVER", time: 0, ScoreCard : this.Players}))
                        })
                    },5000)
                    
                    return
                }
            }

            const result = await axios.request(options)
            this.GameState.wordToGuess = result.data.word
            setTimeout(()=>{
                this.Players.forEach((user) => {
                    this.GameState.roundOverScoreState[user.userId] = 0
                    if(user===this.Players[this.GameState.indexOfUser]){
                        this.participants[user.userId]?.send(JSON.stringify({ type: "WORD", word : this.GameState.wordToGuess, currentRoundNo : this.GameState.currentRoundNo, currentUser : this.Players[this.GameState.indexOfUser].userId }));
                    }else{
                        this.participants[user.userId]?.send(JSON.stringify({ type: "WORD_LENGTH", wordLength : this.GameState.wordToGuess.length, currentRoundNo : this.GameState.currentRoundNo, currentUser : this.Players[this.GameState.indexOfUser].userId }));
                    }
                });
            },4000)

            // Restart the timer after a 2-second delay
            setTimeout(() => {
                console.log("Restarting timer...");
                this.GameState.secondTimer = setInterval(() => {
                    this.GameState.secondTime += 1;
                    if(this.GameState.secondTime > this.GameSetting.timeSlot/2 && this.GameState.reveledIndex.length===0){

                        const randomNumber: number = getRandomNumberInRange(0,this.GameState.wordToGuess.length-1, this.GameState.reveledIndex)
                        this.GameState.reveledIndex.push(randomNumber)
                        this.Players.forEach((user)=>{
                            this.participants[user.userId]?.send(JSON.stringify({type : "SECOND_TIMER", time: this.GameState.secondTime, reveledIndex : randomNumber, letterReveled : this.GameState.wordToGuess[randomNumber],word : this.GameState.wordToGuess}))
                        })
                    }else {
                        this.Players.forEach((user) => {
                            this.participants[user.userId]?.send(
                                JSON.stringify({ type: "SECOND_TIMER", time: this.GameState.secondTime, word : this.GameState.wordToGuess })
                            );
                        });
                    }
                }, 1000);
            }, 10000); // 2-second delay before restarting
        }
    }

    // Start both timers (or individually if needed)
    

    // Reset both timers
    resetTimers(socket: WebSocket) {
        
        if (this.GameState.secondTimer) {
            clearInterval(this.GameState.secondTimer);
            this.GameState.secondTimer = null;
            this.GameState.secondTime = 0;
        }
        socket.send(JSON.stringify({type: "TIMER_RESET"}));
    }

    gameOver(){
        if (this.GameState.secondTimer) {
            console.log("game Over")
            clearInterval(this.GameState.secondTimer);
            this.GameState.secondTimer = null;
            this.GameState.secondTime = 0;
            this.Players.forEach((user)=>{
            this.participants[user.userId]?.send(JSON.stringify({type: "GAME_OVER", time: 0}))
            })
        }
    }
    
}