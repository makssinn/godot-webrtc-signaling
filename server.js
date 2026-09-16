import { DurableObject } from "cloudflare:workers";

export class SignalingRoom extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);

        this.peers = new Map();
        this.nextPeerId = 1;
    }

    send(ws, data) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    }

    broadcast(data, except = null) {
        for (const ws of this.peers.values()) {
            if (ws !== except) {
                this.send(ws, data);
            }
        }
    }

    async fetch(request) {
        if (request.headers.get("Upgrade") !== "websocket") {
            return new Response("WebSocket required", {
                status: 426
            });
        }

        const pair = new WebSocketPair();

        const client = pair[0];
        const ws = pair[1];

        ws.accept();

        const peerId = this.nextPeerId++;
        this.peers.set(ws, peerId);

        console.log("PLAYER JOINED:", peerId);

        this.send(ws, {
            type: "hosted",
            peer_id: peerId
        });

        const existingPeers = [];

        for (const id of this.peers.values()) {
            if (id !== peerId) {
                existingPeers.push(id);
            }
        }

        if (existingPeers.length > 0) {
            this.send(ws, {
                type: "peer_list",
                peers: existingPeers
            });

            this.broadcast({
                type: "peer_joined",
                peer_id: peerId
            }, ws);
        }

        ws.addEventListener("message", event => {
            let message;

            try {
                message = JSON.parse(event.data);
            } catch {
                return;
            }

            const senderId = this.peers.get(ws);

            if (!senderId) {
                return;
            }

            if (
                message.type !== "sdp" &&
                message.type !== "ice"
            ) {
                return;
            }

            const targetId = Number(message.peer_id);

            let targetSocket = null;

            for (const [socket, id] of this.peers) {
                if (id === targetId) {
                    targetSocket = socket;
                    break;
                }
            }

            if (!targetSocket) {
                return;
            }

            message.peer_id = senderId;

            this.send(targetSocket, message);
        });

        ws.addEventListener("close", () => {
            const id = this.peers.get(ws);

            if (!id) {
                return;
            }

            this.peers.delete(ws);

            console.log("PLAYER LEFT:", id);

            this.broadcast({
                type: "peer_left",
                peer_id: id
            });
        });

        return new Response(null, {
            status: 101,
            webSocket: client
        });
    }
}


export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === "/") {
            return new Response(
                "Godot WebRTC signaling server OK"
            );
        }

        const parts = url.pathname.split("/");

        if (parts[1] !== "room" || !parts[2]) {
            return new Response(
                "Use /room/ROOM_CODE",
                {
                    status: 400
                }
            );
        }

        const roomCode = parts[2].toUpperCase();

        const id = env.SIGNALING.idFromName(roomCode);
        const room = env.SIGNALING.get(id);

        return room.fetch(request);
    }
};
