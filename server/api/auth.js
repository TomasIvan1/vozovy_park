const express = require("express");
const router = express.Router();
const crypto = require("crypto-js");
const db = require("../db");

// Prihlásenie používateľa
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log("Pokus o prihlásenie:", username);
    
    // Najprv skúsime nájsť používateľa podľa mena
    const userResult = await db.pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );
    
    if (userResult.rows.length === 0) {
      console.log("Používateľ neexistuje:", username);
      return res.status(401).json({ error: "Nesprávne používateľské meno alebo heslo" });
    }
    
    const user = userResult.rows[0];
    console.log("Používateľ nájdený:", user.username);
    console.log("Uložené heslo:", user.password);
    
    // Hashujeme heslo pre porovnanie
    const hashedPassword = crypto.SHA256(password).toString();
    console.log("Zadané heslo po hashovaní:", hashedPassword);
    
    // Porovnáme heslá
    if (user.password !== hashedPassword) {
      console.log("Nesprávne heslo");
      return res.status(401).json({ error: "Nesprávne používateľské meno alebo heslo" });
    }
    
    console.log("Prihlásenie úspešné");
    
    // Aktualizujeme čas posledného prihlásenia, ak stĺpec existuje
    try {
      await db.pool.query(
        "UPDATE users SET last_login = $1 WHERE id = $2",
        [new Date(), user.id]
      );
    } catch (error) {
      console.log("Stĺpec last_login neexistuje, ignorujem:", error.message);
    }
    
    // Zaznamenáme aktivitu prihlásenia
    try {
      await db.pool.query(
        "INSERT INTO aktivity (user_id, username, akcia) VALUES ($1, $2, $3)",
        [user.id, user.username, 'Prihlásenie do systému']
      );
      console.log("Aktivita prihlásenia zaznamenaná");
    } catch (logError) {
      console.log("Chyba pri zaznamenávaní aktivity:", logError.message);
    }
    
    // Odstránime heslo z odpovede
    const { password: _, ...userWithoutPassword } = user;
    
    // Pridáme predvolené hodnoty pre chýbajúce stĺpce
    const userWithDefaults = {
      ...userWithoutPassword,
      email: '',
      role: 'user',
      status: 'active'
    };
    
    res.json({
      message: "Prihlásenie úspešné",
      user: userWithDefaults
    });
  } catch (error) {
    console.error("Chyba pri prihlasovaní:", error);
    res.status(500).json({ error: "Chyba pri prihlasovaní" });
  }
});

// Registrácia nového používateľa
router.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log("Pokus o registráciu:", username);
    
    // Kontrola, či používateľ už existuje
    const existingUser = await db.pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );
    
    if (existingUser.rows.length > 0) {
      console.log("Používateľ už existuje:", username);
      return res.status(400).json({ error: "Používateľské meno už existuje" });
    }
    
    // Hashujeme heslo
    const hashedPassword = crypto.SHA256(password).toString();
    console.log("Heslo po hashovaní:", hashedPassword);
    
    // Vytvoríme používateľa
    const result = await db.pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *",
      [username, hashedPassword]
    );
    
    console.log("Používateľ bol úspešne vytvorený:", username);
    
    // Odstránime heslo z odpovede
    const { password: _, ...userWithoutPassword } = result.rows[0];
    
    // Pridáme predvolené hodnoty pre chýbajúce stĺpce
    const userWithDefaults = {
      ...userWithoutPassword,
      email: '',
      role: 'user',
      status: 'active'
    };
    
    res.status(201).json({
      message: "Registrácia úspešná",
      user: userWithDefaults
    });
  } catch (error) {
    console.error("Chyba pri registrácii:", error);
    res.status(500).json({ error: "Chyba pri registrácii" });
  }
});

// Kontrola, či je používateľ prihlásený
router.get("/check", async (req, res) => {
  try {
    // Tu by normálne bola implementácia JWT alebo session
    // Pre jednoduchosť vrátime len správu
    res.json({ message: "Autentifikácia je aktívna" });
  } catch (error) {
    console.error("Chyba pri kontrole autentifikácie:", error);
    res.status(500).json({ error: "Chyba pri kontrole autentifikácie" });
  }
});

module.exports = router;
