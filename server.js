const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const router = express.Router();
const server = http.createServer(app);
const io = new Server(server);

// Serve the static HTML file
app.use(express.static(path.join(__dirname, 'public')));


app.get("/chat", (req, res) => {
    return res.sendFile(path.join(__dirname, "public", "chat-room.html"));
});
app.get("/tictactoe", (req, res) => {
    return res.sendFile(path.join(__dirname, "public", "index.html"));
});
// Tic-Tac-Toe variables
let players = {};
let currentTurn = 'O';
let waitingUser = null; // Store one waiting user for chat
let rooms = {}; // key: roomId, value: [socket.id, socket.id]

// Function to get local IP
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

// Tic-Tac-Toe Game Handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Game handling logic
    if (Object.keys(players).length < 2) {
        players[socket.id] = Object.keys(players).length === 0 ? 'O' : 'X';
        socket.emit('player-assigned', players[socket.id]);
        io.emit('player-count', Object.keys(players).length);
    } else {
        socket.emit('room-full');
    }

    socket.on('tile-clicked', (index) => {
        io.emit('update-tile', { index, value: players[socket.id] });
        currentTurn = currentTurn === 'O' ? 'X' : 'O';
        io.emit('turn-changed', currentTurn);
    });

    socket.on('reset', () => {
        currentTurn = 'O';
        io.emit('reset-board');
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('player-count', Object.keys(players).length);
        console.log('A user disconnected:', socket.id);
    });

    // Chatroom matching logic
    if (waitingUser) {
        const roomId = `room-${socket.id}-${waitingUser.id}`;
        socket.join(roomId);
        waitingUser.join(roomId);

        rooms[roomId] = [socket.id, waitingUser.id];

        // Notify both users
        io.to(roomId).emit('match-found', { roomId });

        console.log(`Matched ${socket.id} with ${waitingUser.id} in ${roomId}`);
        waitingUser = null;
    } else {
        waitingUser = socket;
        socket.emit('waiting');
        console.log(`${socket.id} is waiting...`);
    }

    // Chat message handling
    socket.on('message', ({ roomId, text }) => {
        socket.to(roomId).emit('message', text);
    });

    // Disconnecting logic in chat
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        if (waitingUser?.id === socket.id) {
            waitingUser = null;
        }

        for (const roomId in rooms) {
            if (rooms[roomId].includes(socket.id)) {
                const otherSocketId = rooms[roomId].find(id => id !== socket.id);
                io.to(otherSocketId).emit('partner-disconnected');
                delete rooms[roomId];
                break;
            }
        }
    });
})

const localIP = getLocalIP();
server.listen(3001, '0.0.0.0', () => {
    process.stdout.write("\x1Bc"); // Clears the console and resets the cursor position
    console.log(`Server running at http://${localIP}:3001`);
});