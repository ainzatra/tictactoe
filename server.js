const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve the static HTML file
app.use(express.static(path.join(__dirname, 'public')));


app.get("/chat", (req, res) => {
    return res.sendFile(path.join(__dirname, "public", "chat-room.html"));
});

app.get("/gc", (req, res) => {
    return res.sendFile(path.join(__dirname, "public", "group-chat.html"));
});
app.get("/tictactoe", (req, res) => {
    return res.sendFile(path.join(__dirname, "public", "index.html"));
});

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (let iface in interfaces) {
        for (let config of interfaces[iface]) {
            if (config.family === 'IPv4' && !config.internal) {
                return config.address;
            }
        }
    }
    return 'localhost';
}


let gameNamespaceIPs = {};  // Store IPs for the game namespace
let chatNamespaceIPs = {};  // Store IPs for the chat namespace
let gcNamespaceIPs = {};    // Store IPs for the group chat namespace

const gameNameSpace = io.of('/game');
let players = {};
let currentTurn = 'O';

gameNameSpace.on('connection', (socket) => {
    console.log('Game user connected:', socket.id);

    const userIP = socket.handshake.address;
    if (gameNamespaceIPs[userIP] && gameNamespaceIPs[userIP] !== socket.id) {
        socket.emit('ip-blocked', 'You are already in a game room.');
        return;
    }
    gameNamespaceIPs[userIP] = socket.id;

    if (Object.keys(players).length < 2) {
        players[socket.id] = Object.keys(players).length === 0 ? 'O' : 'X';
        socket.emit('player-assigned', players[socket.id]);
        gameNameSpace.emit('player-count', Object.keys(players).length);
    } else {
        socket.emit('room-full');
    }

    socket.on('tile-clicked', (index) => {
        gameNameSpace.emit('update-tile', { index, value: players[socket.id] });
        currentTurn = currentTurn === 'O' ? 'X' : 'O';
        gameNameSpace.emit('turn-changed', currentTurn);
    });

    socket.on('reset', () => {
        currentTurn = 'O';
        gameNameSpace.emit('reset-board');
    });

    socket.on('disconnect', () => {
        delete gameNamespaceIPs[userIP];
        delete players[socket.id];
        gameNameSpace.emit('player-count', Object.keys(players).length);
        console.log('A user disconnected:', socket.id);
    });
});

const chatNameSpace = io.of('/chat');
let waitingUser = null;
let rooms = {};

chatNameSpace.on('connection', (socket) => {
    console.log('Chat user connected:', socket.id);

    const userIP = socket.handshake.address;
    if (chatNamespaceIPs[userIP] && chatNamespaceIPs[userIP] !== socket.id) {
        socket.emit('ip-blocked', 'You are already in a chat room.');
        return;
    }
    chatNamespaceIPs[userIP] = socket.id;

    if (waitingUser) {
        const roomId = `room-${socket.id}-${waitingUser.id}`;
        socket.join(roomId);
        waitingUser.join(roomId);

        rooms[roomId] = [socket.id, waitingUser.id];

        // Notify both users
        chatNameSpace.to(roomId).emit('match-found', { roomId });

        console.log(`Matched ${socket.id} with ${waitingUser.id} in ${roomId}`);
        waitingUser = null;
    } else {
        waitingUser = socket;
        socket.emit('waiting');
        console.log(`${socket.id} is waiting...`);
    }

    socket.on('message', ({ roomId, text }) => {
        socket.to(roomId).emit('message', text);
    });

    socket.on('disconnect', () => {
        delete chatNamespaceIPs[userIP];
        console.log('User disconnected:', socket.id);
        if (waitingUser?.id === socket.id) {
            waitingUser = null;
        }

        for (const roomId in rooms) {
            if (rooms[roomId].includes(socket.id)) {
                const otherSocketId = rooms[roomId].find(id => id !== socket.id);
                chatNameSpace.to(otherSocketId).emit('partner-disconnected');
                delete rooms[roomId];
                break;
            }
        }
    });
});

const gcNameSpace = io.of('/group-chat');
const GLOBAL_ROOM = 'global-room';
const usernames = {};

// Helper to generate a random username
const generateUsername = () => {
    const adjectives = ['Red', 'Blue', 'Fast', 'Sneaky', 'Loud', 'Cool', 'Brave'];
    const animals = ['Fox', 'Panda', 'Tiger', 'Wolf', 'Eagle', 'Koala'];
    const random = Math.floor(Math.random() * 100);
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const animal = animals[Math.floor(Math.random() * animals.length)];
    return `${adj}${animal}${random}`;
};

gcNameSpace.on('connection', (socket) => {
    const userIP = socket.handshake.address;
    if (gcNamespaceIPs[userIP] && gcNamespaceIPs[userIP] !== socket.id) {
        socket.emit('ip-blocked', 'You are already in a chat room.');
        return;
    }
    gcNamespaceIPs[userIP] = socket.id;

    const username = generateUsername();
    usernames[socket.id] = username;

    socket.join(GLOBAL_ROOM);
    socket.emit('joined-room', { username });
    gcNameSpace.to(GLOBAL_ROOM).emit('user-joined', username);

    socket.on('message', (text) => {
        gcNameSpace.to(GLOBAL_ROOM).emit('message', {
            sender: username,
            text
        });
    });

    socket.on('disconnect', () => {
        delete gcNamespaceIPs[userIP];
        const name = usernames[socket.id];
        gcNameSpace.to(GLOBAL_ROOM).emit('user-left', name);
        delete usernames[socket.id];
    });
});





const localIP = getLocalIP();
server.listen(3001, '0.0.0.0', () => {
    process.stdout.write("\x1Bc");
    console.log(`Server running at http://${localIP}:3001`);
});