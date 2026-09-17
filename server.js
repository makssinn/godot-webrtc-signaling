export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("Godot WebRTC Signaling Server OK");
    }

    if (!url.pathname.startsWith("/room/")) {
      return new Response("Not found", { status: 404 });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const roomCode = decodeURIComponent(
      url.pathname.substring("/room/".length)
    );

    if (!roomCode) {
      return new Response("Room code required", { status: 400 });
    }

    const id = env.SIGNALING.idFromName(roomCode);
    const room = env.SIGNALING.get(id);

    return room.fetch(request);
  }
};


export class SignalingRoom extends DurableObject {

  constructor(ctx, env) {
    super(ctx, env);

    this.peers = new Map();
    this.nextPeerId = 1;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();

    const client = pair[0];
    const server = pair[1];

    const peerId = this.nextPeerId++;
    this.peers.set(peerId, server);

    server.accept();

    console.log("PLAYER CONNECTED:", peerId);
    console.log("PLAYERS:", [...this.peers.keys()]);

    server.send(JSON.stringify({
      type: "welcome",
      peer_id: peerId
    }));

    const existingPeers = [...this.peers.keys()]
      .filter(id => id !== peerId);

    if (existingPeers.length > 0) {
      server.send(JSON.stringify({
        type: "peer_list",
        peers: existingPeers
      }));

      for (const otherId of existingPeers) {
        const other = this.peers.get(otherId);

        if (other) {
          other.send(JSON.stringify({
            type: "peer_joined",
            peer_id: peerId
          }));
        }
      }
    }

    server.addEventListener("message", event => {
      this.handleMessage(peerId, event.data);
    });

    server.addEventListener("close", () => {
      this.handleClose(peerId);
    });

    server.addEventListener("error", () => {
      this.handleClose(peerId);
    });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  handleMessage(senderId, data) {
    let message;

    try {
      message = JSON.parse(data);
    } catch (error) {
      console.log("INVALID JSON FROM:", senderId);
      return;
    }

    console.log("MESSAGE FROM:", senderId, message);

    const targetId = Number(message.peer_id);

    if (!Number.isInteger(targetId)) {
      console.log("MESSAGE WITHOUT TARGET:", senderId);
      return;
    }

    const target = this.peers.get(targetId);

    if (!target) {
      console.log("TARGET NOT FOUND:", targetId);
      return;
    }

    message.peer_id = senderId;

    try {
      target.send(JSON.stringify(message));

      console.log(
        "FORWARDED:",
        senderId,
        "->",
        targetId,
        message.type
      );
    } catch (error) {
      console.log("SEND ERROR:", error);
    }
  }

  handleClose(peerId) {
    if (!this.peers.has(peerId)) {
      return;
    }

    this.peers.delete(peerId);

    console.log("PLAYER LEFT:", peerId);
    console.log("PLAYERS:", [...this.peers.keys()]);

    const message = JSON.stringify({
      type: "peer_left",
      peer_id: peerId
    });

    for (const [otherId, socket] of this.peers) {
      try {
        socket.send(message);
      } catch (error) {
        console.log("ERROR NOTIFYING:", otherId);
      }
    }
  }
}
