import express from "express";
import cors from "cors";
import { MongoClient, ObjectId} from "mongodb";
import dotenv from "dotenv";
dotenv.config();
import joi from "joi";
import dayjs from "dayjs";

const app = express();

app.use(cors());
app.use(express.json());

const participantsSchema = joi.object({
    name: joi.string().trim().required()
});
const messagesSchema = joi.object({
    to: joi.string().trim().required(),
    text: joi.string().trim().required(),
    type: joi.string().valid("message", "private_message"),
    
});

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;
await mongoClient.connect().then(()=>{
    db = mongoClient.db("batePapoUol");
})
.catch((err) => console.log(err));

app.post("/participants", async(req, res) => {
    const participant = req.body;
    const verify = participantsSchema.validate(participant, {abortEarly: false});
    
    const users = await db.collection("participants").find().toArray();

    if(users.find(user => user.name === participant.name)){
        res.status(422).send("Usuário já cadastrado!");
        return;
    }
    if(verify.error){
        const errors = verify.error.details.map(detail => detail.message);
        res.status(422).send(errors);
        return;
    }
    
    participant["lastStatus"] = Date.now();
    const hour = dayjs().locale("pt-br").format("HH:mm:ss");
    
    try{
        await db.collection("participants").insertOne(participant);
        await db.collection("messages").insertOne({
            from: participant.name,
            to: "Todos",
            text: "entra na sala...",
            type: "status",
            time: hour
        });
        res.sendStatus(201);
    }catch(err){
        console.log(err);
        res.sendStatus(500);
    }
});

app.get("/participants", async (req, res) =>{
    try{
        const participants = await db.collection("participants").find().toArray();
        res.send(participants);
    }catch(err){
        console.log(err);
        res.sendStatus(500);
    }      
});

app.post("/messages", async(req, res) => {
    const usuario = req.headers.user;
    const usuarios = await db.collection("participants").find().toArray();
    
    if(!usuarios.find(user => user.name === usuario)){
        res.sendStatus(422);
        return;
    }
    const message = req.body;
    const verify = messagesSchema.validate(message, {abortEarly:false});
    
    if(verify.error){
        const errors = verify.error.details.map(detail => detail.message);
        res.status(422).send(errors);
        return;
    }    
    message["from"] = usuario;
    const hour = dayjs().locale("pt-br").format("HH:mm:ss");
    message["time"] = hour;
    
    try{
        await db.collection("messages").insertOne(message);
        res.sendStatus(201);
    }catch(err){
        console.log(err);
        res.sendStatus(500);
    }
})

app.get("/messages", async (req,res) => {
    const user = req.headers.user;
    const limit = parseInt(req.query.limit);
    
    try{
        const messages = await db.collection("messages").find().toArray();
        const isOnline = (message, type) => message  === type;
        const isPublic = (message, type) => message  === type;
        const isForMe = (message, user) => message === user;
        const fromMe = (message, user) => message === user;
        const myMessages = message => isOnline(message.type, "status") || isPublic(message.type, "message") 
        || isForMe(message.to, user) || fromMe(message.from, user);
        
        const filtered = messages.filter(myMessages);

        res.send(!limit ? filtered : filtered.slice(-limit));
        
    }catch(err){
        console.log(err);
        res.sendStatus(500);
    }
});

app.post("/status", async(req, res) =>{
    const user = req.headers.user;
    const usuarios = await db.collection("participants").find().toArray()
    if(!usuarios.find(usuario => usuario.name === user)){
        res.sendStatus(404);
        return;
    }    
    try{
        await db.collection("participants").updateOne({name: user}, {$set: {lastStatus: Date.now()}})
        res.sendStatus(200);
    }catch(err){
        console.log(err);
        res.sendStatus(500);
    }  
});

setInterval(async()=>{
    try{
        const users =  await db.collection("participants").find().toArray();
        const arrUsers = users.filter(user => user.lastStatus < (Date.now() - (10 * 1000)));
        const hour = dayjs().locale("pt-br").format("HH:mm:ss");
        if(arrUsers.length > 0){
            const outMessages = arrUsers.map(outMessage => {
                return{
                from: outMessage.name,
                to: "Todos",
                text: "sai da sala...",
                type: "status",
                time: hour
            }});
            await db.collection("messages").insertMany(outMessages);
            await db.collection("participants").deleteMany({lastStatus: {$lte:(Date.now() - (10 * 1000))}});
            console.log(arrUsers)
        }
    }catch(err){
        console.log(err);
        console.log(500);
    }    
},15000);
    

app.listen(5000, () => {
    console.log("Server running in port: 5000")
});