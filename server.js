import { DurableObject } from "cloudflare:workers";

export class SignalingRoom extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.clients = new Set();
    }

    async fetch(request) {
        if (request.headers.get("Upgrade") !== "websocket") {
            return new Response("Signaling server OK");
        }

        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];

        server.accept();

        this.clients.add(server);

        server.addEventListener("message", event => {
            for (const peer of this.clients) {
                if (peer !== server) {
                    peer.send(event.data);
                }
            }
        });

        const remove = () => {
            this.clients.delete(server);
        };

        server.addEventListener("close", remove);
        server.addEventListener("error", remove);

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
            return new Response("Godot WebRTC signaling server OK");
        }

        const parts = url.pathname.split("/");

        if (parts[1] !== "room" || !parts[2]) {
            return new Response("Use /room/ROOM_CODE", {
                status: 400
            });
        }

        const roomCode = parts[2].toUpperCase();

        const id = env.SIGNALING.idFromName(roomCode);
        const room = env.SIGNALING.get(id);

        return room.fetch(request);
    }
};
