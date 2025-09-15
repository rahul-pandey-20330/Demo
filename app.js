const express = require('express');
const app = express();
const path = require('path');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const server = http.createServer(app);
const socketio = require('socket.io');
const io = socketio(server);

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Home route → redirect to unique room
app.get('/', (req, res) => {
    res.redirect(`/${uuidv4()}`);
});

// Room route → render room.ejs
app.get('/:room', (req, res) => {
    const candidateName = req.query.name || "John Doe";
    res.render('room', { roomId: req.params.room, candidateName });
});

// Socket.io connection
io.on('connection', socket => {
    socket.on('join-room', (roomId, userId) => {
        socket.join(roomId);

        // Notify others in room
        socket.to(roomId).emit('user-connected', userId);

        // Handle disconnect
        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-disconnected', userId);
        });
    });
});

// Server start
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
