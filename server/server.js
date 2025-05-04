const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const crypto = require("crypto-js");

// Inicializácia Express aplikácie
const app = express();
const port = 8000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Inicializácia databázy
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "db_vozovy_park",
  password: "postgres",
  port: 5432,
});


module.exports = pool;


const vozidlaRouter = require("./api/vozidla_new"); 
const usersRouter = require("./api/users");
const authRouter = require("./api/auth");


app.use("/vozidla", vozidlaRouter);
app.use("/users", usersRouter);
app.use("/auth", authRouter);

// Základná route
app.get("/", (req, res) => {
  res.send("API vozového parku je aktívne");
});

// Spustenie servera
app.listen(port, () => {
  console.log(`Server beží na porte ${port}`);
  console.log(`http://localhost:${port}`);
});
