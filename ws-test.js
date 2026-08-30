const axios = require("axios");
const { io } = require("socket.io-client");

(async () => {
  // 1. Login en tant qu'agent
  let creds;
  try {
    creds = await axios.post("http://localhost:3000/auth/login", {
      username: "guichet1", password: "password", companyId: 1,
    });
  } catch (e) {
    console.log("LOGIN ERREUR:", JSON.stringify(e.response?.data ?? e.message));
    process.exit(1);
  }
  const token = creds.data.access_token;
  console.log("LOGIN OK, role:", creds.data.user.role);

  // 2. Connexion socket.io namespace /tickets
  const socket = io("http://localhost:3000/tickets", {
    auth: { token },
    transports: ["websocket"],
  });

  socket.on("connect", () => {
    console.log("SOCKET CONNECTE, id:", socket.id);
  });
  socket.on("ticket.created", (p) => console.log("EVENT ticket.created:", p.type));
  socket.on("ticket.called", (p) => console.log("EVENT ticket.called:", p.type));
  socket.on("connect_error", (err) => console.log("CONNECT_ERR:", err.message));

  setTimeout(async () => {
    // 3. Appeler le prochain ticket via l'API
    try {
      const next = await axios.post("http://localhost:3000/tickets/next", null, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log("CALL NEXT OK:", next.data.ticketNumber, "->", next.data.status);
    } catch (e) {
      console.log("CALL NEXT:", JSON.stringify(e.response?.data ?? e.message));
    }
    setTimeout(() => { socket.close(); process.exit(0); }, 2000);
  }, 1500);
})();