require("dotenv").config();
const express = require("express");
const cors = require("cors");
const campaignsRouter = require("./routes/campaigns");
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const { initializeUserStore } = require("./services/userStore");

const app = express();
const port = process.env.PORT || 4000;
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : undefined,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/users", usersRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

initializeUserStore()
  .then(() => {
    app.listen(port, () => {
      console.log(`API Mastercard dashboard escuchando en puerto ${port}`);
    });
  })
  .catch((error) => {
    console.error("[startup] Error inicializando el store de usuarios", error);
    process.exit(1);
  });
