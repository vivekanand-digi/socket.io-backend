import { Server } from 'socket.io';
import { createServer } from 'http';
import SessionStore from './SessionStore';
const { instrument } = require("@socket.io/admin-ui");
const crypto = require('crypto');

const store = new SessionStore();
const httpServer = createServer();
const port = process.env.PORT || 4000;
const io = new Server(httpServer, {
    cors: {
origin: ['https://socket-io-frontend-khaki.vercel.app/', 'https://admin.socket.io'],
    }
});      
instrument(io, {
    auth: false,
    mode: "development",
});

io.use((socket: any, next) => {
    const sessionID = socket.handshake.auth.sessionID;
    if (sessionID) {
        const session = store.findSession(sessionID);
        if (session) {
            socket.sessionID = sessionID;
            socket.userID = session.userID;
            socket.username = session.username;
        }
        return next();
    }
    const username = socket.handshake.auth.username;
    if (!username) {
        return next(new Error('invalid username'));
    }
    socket.username = username;
    socket.userID = crypto.randomBytes(8).toString('hex');
    socket.sessionID = crypto.randomBytes(8).toString('hex');
    store.saveSession(socket.sessionID, {
        userID: socket.userID,
        username: socket.username,
    });
    next();
})

io.on('connection', (socket: any) => {
    const users: any = [];
    store.findAllSessions().forEach((session: any) => {
        users.push({
            userID: session.userID,
            username: session.username,
        });
    });
    socket.join(socket.userID);
    socket.emit('users', users);

    socket.broadcast.emit("user connected", {
        userID: socket.userID,
        username: socket.username,
        connected: true,
    });

    socket.emit("session", {
        sessionID: socket.sessionID,
        userID: socket.userID,
    });

    socket.on("private message", ({ content, to }: any) => {
        socket.to(to).to(socket.userID).emit("private message", {
            content,
            from: socket.userID,
            to
        });
    });

    socket.on('disconnect', async () => {
        const matchingSockets = await io.in(socket.userID).allSockets();
        const isDisconnected = matchingSockets.size === 0;
        if (isDisconnected) {
            socket.broadcast.emit('user disconnected', socket.userID);
            store.saveSession(socket.sessionID, {
                userID: socket.userID,
                username: socket.username,
                connected: false,
            });
        }
    })
})



httpServer.listen(port);
