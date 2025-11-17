import express from 'express';
import cors from 'cors';
import {createServer} from 'http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server,{
    cors:{
        origin:"http://localhost:5174",
        methods:["GET","POST"]
    }
})

io.on("connection",(socket)=>{
    console.log("Socket connected with an id of :",socket.id);

    socket.on('message',(message)=>{
        console.log(message);

        io.emit("message",message)
    })

    socket.on("error",(error)=>{
        console.error("Socket failed, Error!",error)
    })

    socket.on("disconnect",()=>{
        console.log("Socket Disconected")
    })
})

server.listen(5000,()=>{
    console.log("Server + Socket server running on port 5000")
})