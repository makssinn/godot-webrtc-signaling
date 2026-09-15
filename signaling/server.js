const http = require("http");
const { WebSocketServer } = require("ws");

const port = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Godot signaling server");
});

const wss = new WebSocketServer({ server });

const rooms = new Map();

function send(ws, data) {
    if (ws && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function otherPeer(room, ws) {
    if (!room) return null;

    if (room.host === ws)
        return room.client;

    if (room.client === ws)
        return room.host;

    return null;
}

wss.on("connection", (ws) => {

    ws.roomCode = null;
    ws.role = null;

    ws.on("message", raw => {
        let msg;

        try {
            msg = JSON.parse(raw.toString());
        } catch {
            return;
        }

        if (msg.type === "host") {

            const code = String(msg.room).toUpperCase();

            if (rooms.has(code)) {
                send(ws, {
                    type: "error",
                    message: "Room already exists"
                });
                return;
            }

            rooms.set(code, {
                host: ws,
                client: null
            });

            ws.roomCode = code;
            ws.role = "host";

            send(ws, {
                type: "hosted",
                room: code
            });

            return;
        }


        if (msg.type === "join") {

            const code = String(msg.room).toUpperCase();
            const room = rooms.get(code);

            if (!room) {
                send(ws, {
                    type: "error",
                    message: "Room not found"
                });
                return;
            }

            if (room.client) {
                send(ws, {
                    type: "error",
                    message: "Room full"
                });
                return;
            }

            room.client = ws;

            ws.roomCode = code;
            ws.role = "client";

            send(ws, {
                type: "joined",
                id: 2
            });

            send(room.host, {
                type: "peer_joined",
                id: 2
            });

            return;
        }


        if (
            msg.type === "sdp" ||
            msg.type === "ice"
        ) {
            const room = rooms.get(ws.roomCode);
            const other = otherPeer(room, ws);

            send(other, msg);
        }
    });


    ws.on("close", () => {

        if (!ws.roomCode)
            return;

        const room = rooms.get(ws.roomCode);

        if (!room)
            return;

        if (room.host === ws) {

            send(room.client, {
                type: "peer_left"
            });

            rooms.delete(ws.roomCode);

        } else if (room.client === ws) {

            room.client = null;

            send(room.host, {
                type: "peer_left"
            });
        }
    });
});

server.listen(port, "0.0.0.0", () => {
    console.log("Signaling server running on", port);
});