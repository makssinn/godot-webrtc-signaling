import { DurableObject } from "cloudflare:workers";


export class SignalingRoom extends DurableObject {

    constructor(ctx, env) {
        super(ctx, env);

        this.peers = new Map();
        this.nextPeerId = 1;
    }


    send(ws, data) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    }


    broadcast(data, except = null) {
        for (const ws of this.peers.keys()) {
            if (ws !== except) {
                this.send(ws, data);
            }
        }
    }


    async fetch(request) {

        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
            return new Response("WebSocket required", {
                status: 426
            });
        }


        const pair = new WebSocketPair();

        const client = pair[0];
        const server = pair[1];

        server.accept();


        const peerId = this.nextPeerId++;

        this.peers.set(server, peerId);

        console.log("PLAYER JOINED:", peerId);


        this.send(server, {
            type: "welcome",
            peer_id: peerId
        });


        const existingPeers = [];

        for (const id of this.peers.values()) {
            if (id !== peerId) {
                existingPeers.push(id);
            }
        }


        this.send(server, {
            type: "peer_list",
            peers: existingPeers
        });


        this.broadcast({
            type: "peer_joined",
            peer_id: peerId
        }, server);


        server.addEventListener("message", event => {

            const senderId = this.peers.get(server);

            if (!senderId) {
                return;
            }


            let message;

            try {
                message = JSON.parse(event.data);
            } catch {
                console.log("INVALID JSON:", senderId);
                return;
            }


            console.log(
                "MESSAGE:",
                senderId,
                message.type
            );


            if (
                message.type !== "sdp" &&
                message.type !== "ice"
            ) {
                return;
            }


            const forwarded = {
                ...message,
                peer_id: senderId
            };


            console.log(
                "BROADCAST SIGNAL:",
                senderId,
                message.type
            );


            this.broadcast(
                forwarded,
                server
            );
        });


        server.addEventListener("close", () => {

            const id = this.peers.get(server);

            if (!id) {
                return;
            }


            this.peers.delete(server);

            console.log(
                "PLAYER LEFT:",
                id
            );


            this.broadcast({
                type: "peer_left",
                peer_id: id
            });
        });


        server.addEventListener("error", error => {
            console.log(
                "WEBSOCKET ERROR:",
                peerId,
                error
            );
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


        if (
            parts[1] !== "room" ||
            !parts[2]
        ) {
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
