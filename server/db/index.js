const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// Inicializácia databázy
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "db_vozovy_park",
  password: "postgres",
  port: 5432,
});

// Funkcia pre vykonanie SQL dotazov
const query = (text, params) => pool.query(text, params);

// Inicializácia databázy pri spustení
const initDb = async () => {
  try {
    // Načítanie SQL skriptu pre inicializáciu
    const initSql = fs.readFileSync(path.join(__dirname, "init.sql"), "utf8");
    
    // Vykonanie SQL skriptu
    await pool.query(initSql);
    console.log("Databáza bola úspešne inicializovaná");
  } catch (error) {
    console.error("Chyba pri inicializácii databázy:", error);
  }
};

// Inicializácia databázy pri spustení servera
initDb();

module.exports = {
  query,
  pool
};
