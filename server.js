import { DurableObject } from "cloudflare:workers";

export class SignalingRoom extends DurableObject {
    async fetch(request) {
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
            return new Response("WebSocket required", {
                status: 426
            });
        }

        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];

        this.ctx.acceptWebSocket(server);

        console.log("WEBSOCKET ACCEPTED");

        server.send(JSON.stringify({
            type: "welcome",
            peer_id: 1
        }));

        return new Response(null, {
            status: 101,
            webSocket: client
        });
    }

    webSocketMessage(ws, message) {
        console.log("MESSAGE:", message);

        ws.send(JSON.stringify({
            type: "echo",
            message: message
        }));
    }

    webSocketClose(ws, code, reason, wasClean) {
        console.log("WEBSOCKET CLOSED:", code, reason, wasClean);
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

        if (
            request.headers.get("Upgrade")?.toLowerCase() !== "websocket"
        ) {
            return new Response(
                "WebSocket required",
                {
                    status: 426
                }
            );
        }

        const roomCode = parts[2].toUpperCase();

        console.log("ROOM:", roomCode);

        const id = env.SIGNALING.idFromName(roomCode);
        const room = env.SIGNALING.get(id);

        return room.fetch(request);
    }
};
