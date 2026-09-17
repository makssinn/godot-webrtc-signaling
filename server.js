export default {
    async fetch(request) {
        const upgrade = request.headers.get("Upgrade");

        console.log("REQUEST:", request.method, request.url);
        console.log("UPGRADE:", upgrade);

        if (!upgrade || upgrade.toLowerCase() !== "websocket") {
            return new Response("WebSocket required", {
                status: 426
            });
        }

        const pair = new WebSocketPair();

        const client = pair[0];
        const server = pair[1];

        server.accept();

        server.send(JSON.stringify({
            type: "welcome",
            peer_id: 1
        }));

        console.log("WEBSOCKET ACCEPTED");

        return new Response(null, {
            status: 101,
            webSocket: client
        });
    }
};
