import express from "express";
import airlineRouter from "./routes/airline.js";

const app = express();
const PORT = 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello from Express with ES Modules");
});

// Use airline routes
app.use("/api", airlineRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
