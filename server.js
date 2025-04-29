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

// Handle socket connections
let players = {};
let currentTurn = 'O';

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

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
const localIP = getLocalIP();
server.listen(3001, '0.0.0.0', () => {
    console.log(`Server running at http://${localIP}:3001`);
});