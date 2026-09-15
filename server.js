import { DurableObject } from "cloudflare:workers";

export class SignalingRoom extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.host = null;
        this.client = null;
    }

    send(ws, data) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(data));
        }
    }

    async fetch(request) {
        if (request.headers.get("Upgrade") !== "websocket") {
            return new Response("WebSocket required", { status: 426 });
        }

        const pair = new WebSocketPair();
        const browser = pair[0];
        const ws = pair[1];

        ws.accept();

        if (!this.host) {
            this.host = ws;
            this.send(ws, {
                type: "hosted"
            });
        } else if (!this.client) {
            this.client = ws;

            this.send(ws, {
                type: "joined"
            });

            this.send(this.host, {
                type: "peer_joined"
            });
        } else {
            this.send(ws, {
                type: "error",
                message: "Room is full"
            });

            ws.close();
        }

        ws.addEventListener("message", event => {
            let message;

            try {
                message = JSON.parse(event.data);
            } catch {
                return;
            }

            const other = ws === this.host
                ? this.client
                : this.host;

            if (!other) {
                return;
            }

            if (message.type === "sdp" || message.type === "ice") {
                this.send(other, message);
            }
        });

        ws.addEventListener("close", () => {
            if (ws === this.host) {
                this.send(this.client, {
                    type: "peer_left"
                });

                this.host = null;
                this.client = null;
            } else if (ws === this.client) {
                this.send(this.host, {
                    type: "peer_left"
                });

                this.client = null;
            }
        });

        return new Response(null, {
            status: 101,
            webSocket: browser
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
