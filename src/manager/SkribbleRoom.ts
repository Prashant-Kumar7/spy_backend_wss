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
    username : string
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
    name : string,
    score : number,
    wordGuessed : boolean,
    avatar : string
}


export class SkribbleRoomManager {
    public participants : Users
    public roomId : string
    private host : Host
    // private admin : WebSocket | null
    private GameState : GameState
    private usernames : Players[]
    private GameSetting : GameSettings


    constructor(roomId : string, username : string){
        this.participants = {}
        this.roomId = roomId
        this.host = {
            username : username,
            socket : null
        }
        this.usernames = []
        this.GameState = {
            currentDrawing : null,
            wordToGuess : "",
            indexOfUser : 0,
            secondTime: 0,
            secondTimer: null,
            currentRoundNo : 0,
            reveledIndex : [],
            roundOverScoreState : {}
        }
        this.GameSetting = {
            noOfRounds : 0,
            timeSlot : 0,
            diffuclty : "easy"
        }
    }

    joinHttp(username : string,avatar : string){
        this.usernames.push({
            name : username,
            score : 0,
            wordGuessed: false,
            avatar  : avatar
        })
        this.participants = {
            ...this.participants,
            [username] : null
        }
        this.GameState.roundOverScoreState = {
            ...this.GameState.roundOverScoreState,
            [username] : 0
        }
    }

    // randomizePlayers() {
    //     this.usernames = this.usernames.sort(function(){return 0.5 - Math.random()})
    // }

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
            this.usernames.forEach((user)=>{
                if(socket != this.participants[user.name]){
                    this.participants[user.name]?.send(JSON.stringify({type : "START_GAME", payload : this.GameState}))
                }
            })
        }
    }

    gameState(socket : WebSocket, parsedMessage : any){

        this.GameState = {
            ...this.GameState,
            currentDrawing : this.participants[this.usernames[this.GameState.indexOfUser].name],
            wordToGuess : parsedMessage.word,
        }
    }

    async getRandomWord(){
        const options = {
            method: 'GET',
            url: 'https://pictionary-charades-word-generator.p.rapidapi.com/pictionary',
            params: {difficulty: 'easy'},
            headers: {
              'x-rapidapi-key': '3db60b20b3mshda7fd392c482e24p164e0fjsnc133203e3533',
              'x-rapidapi-host': 'pictionary-charades-word-generator.p.rapidapi.com'
            }
        };

        try {
            const response = await axios.request(options);
            this.GameState.wordToGuess = response.data.word
            
            this.usernames.forEach((user)=>{
                this.participants[user.name]?.send(JSON.stringify({type : "GET_WORD", word : this.GameState}))
            })
        } catch (error) {
            console.error(error);
        }
        
    }


    


    join( username : string, socket : WebSocket){
        if(this.host.username === username){
            this.host.socket = socket
        }
        
        this.participants = {
            ...this.participants,
            [username] : socket
        }

        this.usernames.forEach((user)=>{
            this.participants[user.name]?.send(JSON.stringify({type : "PLAYERS", players : this.usernames, username : username}))
        })
    }

    message(ws : WebSocket, parsedMessage : any){

        

        const word  = this.GameState.wordToGuess
        if(parsedMessage.message===this.GameState.wordToGuess){
            let score: number
            this.usernames.forEach((user)=>{
                if(user.name===parsedMessage.username){
                    user.wordGuessed = true
                    if(this.GameState.secondTime < this.GameSetting.timeSlot*0.20){
                        this.GameState.roundOverScoreState[user.name] = 200
                        user.score = user.score + this.GameState.roundOverScoreState[user.name]
                    }else if(this.GameState.secondTime < this.GameSetting.timeSlot*0.40){
                        this.GameState.roundOverScoreState[user.name] = (0.80)*200
                        user.score = user.score + this.GameState.roundOverScoreState[user.name]
                    }else if(this.GameState.secondTime < this.GameSetting.timeSlot*0.60){
                        this.GameState.roundOverScoreState[user.name] = (0.60)*200
                        user.score = user.score + this.GameState.roundOverScoreState[user.name]
                    }else if(this.GameState.secondTime < this.GameSetting.timeSlot*0.80){
                        this.GameState.roundOverScoreState[user.name] = (0.40)*200
                        user.score = user.score + this.GameState.roundOverScoreState[user.name]
                    }else {
                        this.GameState.roundOverScoreState[user.name] = (0.20)*200
                        user.score = user.score + this.GameState.roundOverScoreState[user.name]
                    }
                }
                this.participants[user.name]?.send(JSON.stringify({type : "WORD_MATCHED", message: `${parsedMessage.username} : Guessed the word`, username : parsedMessage.username}))
            })
        }else if(word.slice(0, this.GameState.wordToGuess.length-1) === parsedMessage.message){
            this.usernames.forEach((user)=>{
                this.participants[user.name]?.send(JSON.stringify({type : "MESSAGE", message: `${parsedMessage.username} : Close guess`}))
            })
        }else {
            this.usernames.forEach((user)=>{
                this.participants[user.name]?.send(JSON.stringify({type : "MESSAGE", message: `${parsedMessage.username} : ${parsedMessage.message}`}))
            })
        }
        
    }

    

    getRoomState(socket: WebSocket){
        
    }

    drawEvent(socket: WebSocket, parsedMessage : any){
        
        this.usernames.forEach((user)=>{
            if(socket != this.participants[user.name]){
                this.participants[user.name]?.send(JSON.stringify(parsedMessage))
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
        this.usernames.forEach((user)=>{
            if(user===this.usernames[this.GameState.indexOfUser]){
                this.participants[user.name]?.send(JSON.stringify({type : "GET_WORD", word : this.GameState.wordToGuess, gameSetting : this.GameSetting, currentRoundNo : this.GameState.currentRoundNo, currentUser : this.usernames[this.GameState.indexOfUser].name}))
            }else{
                this.participants[user.name]?.send(JSON.stringify({type : "WORD_LENGTH", wordLength : this.GameState.wordToGuess.length, gameSetting : this.GameSetting, currentRoundNo : this.GameState.currentRoundNo, currentUser : this.usernames[this.GameState.indexOfUser].name}))
            }
        })
        this.GameState.secondTimer = setInterval(() => {
            this.GameState.secondTime = this.GameState.secondTime + 1
            if(this.GameState.secondTime > this.GameSetting.timeSlot/2 && this.GameState.reveledIndex.length===0){
                const randomNumber: number = getRandomNumberInRange(0,this.GameState.wordToGuess.length-1, this.GameState.reveledIndex)
                this.GameState.reveledIndex.push(randomNumber)
                this.usernames.forEach((user)=>{
                    this.participants[user.name]?.send(JSON.stringify({type : "SECOND_TIMER", time: this.GameState.secondTime, reveledIndex : randomNumber, letterReveled : this.GameState.wordToGuess[randomNumber]}))
                })
            }else {
                this.usernames.forEach((user)=>{
                    this.participants[user.name]?.send(JSON.stringify({type : "SECOND_TIMER", time: this.GameState.secondTime}))
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

            this.usernames.forEach((user) => {
                if(!user.wordGuessed){
                    user.score = user.score + 0
                }
                this.participants[user.name]?.send(
                    JSON.stringify({ type: "SECOND_TIMER_STOPPED", time: 0, roundScore : this.GameState.roundOverScoreState })
                );
            });


            
            if(this.GameState.indexOfUser < this.usernames.length - 1){
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
                        this.usernames.forEach((user)=>{
                            this.GameState.roundOverScoreState[user.name] = 0
                            this.participants[user.name]?.send(JSON.stringify({type: "GAME_OVER", time: 0, ScoreCard : this.usernames}))
                        })
                    },5000)
                    
                    return
                }
            }

            const result = await axios.request(options)
            this.GameState.wordToGuess = result.data.word
            setTimeout(()=>{
                this.usernames.forEach((user) => {
                    this.GameState.roundOverScoreState[user.name] = 0
                    if(user===this.usernames[this.GameState.indexOfUser]){
                        this.participants[user.name]?.send(JSON.stringify({ type: "WORD", word : this.GameState.wordToGuess, currentRoundNo : this.GameState.currentRoundNo, currentUser : this.usernames[this.GameState.indexOfUser].name }));
                    }else{
                        this.participants[user.name]?.send(JSON.stringify({ type: "WORD_LENGTH", wordLength : this.GameState.wordToGuess.length, currentRoundNo : this.GameState.currentRoundNo, currentUser : this.usernames[this.GameState.indexOfUser].name }));
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
                        this.usernames.forEach((user)=>{
                            this.participants[user.name]?.send(JSON.stringify({type : "SECOND_TIMER", time: this.GameState.secondTime, reveledIndex : randomNumber, letterReveled : this.GameState.wordToGuess[randomNumber],word : this.GameState.wordToGuess}))
                        })
                    }else {
                        this.usernames.forEach((user) => {
                            this.participants[user.name]?.send(
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
            this.usernames.forEach((user)=>{
                this.participants[user.name]?.send(JSON.stringify({type: "GAME_OVER", time: 0}))
            })
        }
    }
    
}