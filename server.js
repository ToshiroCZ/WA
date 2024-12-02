const express = require("express");
const WebSocket = require("ws");

const app = express();
const PORT = 8080;

// Hostování statických souborů (klientské části)
app.use(express.static("public"));

// WebSocket server
const wss = new WebSocket.Server({ noServer: true });

let documentContent = ""; // Sdílený text v dokumentu
const clients = new Map(); // Map uživatelů a jejich kurzorů

// Funkce pro rozesílání zpráv všem klientům
const broadcast = (data, sender) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client !== sender) {
            client.send(JSON.stringify(data));
        }
    });
};

// Při připojení nového klienta
wss.on("connection", (ws) => {
    const clientId = Date.now(); // Generování unikátního ID klienta
    clients.set(ws, { id: clientId, cursorPosition: null });

    // Poslání inicializační zprávy novému klientovi
    ws.send(JSON.stringify({ type: "init", content: documentContent, users: [...clients.values()] }));

    // Příjem zpráv od klienta
    ws.on("message", (message) => {
        const data = JSON.parse(message);

        if (data.type === "update") {
            documentContent = data.content;
            broadcast({ type: "update", content: data.content }, ws);
        } else if (data.type === "cursor") {
            clients.get(ws).cursorPosition = data.cursor;
            broadcast({ type: "cursor", userId: clientId, cursor: data.cursor }, ws);
        } else if (data.type === "selection") {
            broadcast({ type: "selection", userId: clientId, selection: data.selection }, ws);
        }
    });

    // Odpojení klienta
    ws.on("close", () => {
        clients.delete(ws);
        broadcast({ type: "user_disconnect", userId: clientId }, null);
    });
});

// Propojení HTTP serveru a WebSocket serveru
const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
    });
});