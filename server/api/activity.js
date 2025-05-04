const express = require("express");
const router = express.Router();
const { pool } = require("../db");

// Zaznamenáť novú aktivitu
router.post("/log", async (req, res) => {
  try {
    const { user_id, username, akcia, typ_akcie, popis, entita, entita_id, entita_detaily } = req.body;
    console.log(`API: Zaznamenávam aktivitu: ${akcia || popis} (${username})`);
    
    // Ak máme špecifické parametre pre novú tabuľku aktivita, použijeme ich
    if (typ_akcie && popis && entita) {
      const result = await pool.query(
        "INSERT INTO aktivita (user_id, username, typ_akcie, popis, entita, entita_id, entita_detaily, vytvorene_datum) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP) RETURNING *",
        [user_id, username, typ_akcie, popis, entita, entita_id || null, entita_detaily || null]
      );
      
      console.log(`API: Aktivita úspešne zaznamenaná do tabuľky 'aktivita'`);
      return res.json(result.rows[0]);
    }
    
    // Inak sa pokúsime použiť novú tabuľku s obmedzenými údajmi
    try {
      const result = await pool.query(
        "INSERT INTO aktivita (user_id, username, typ_akcie, popis, entita, vytvorene_datum) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) RETURNING *",
        [user_id, username, 'vseobecna', akcia, 'system']
      );
      
      console.log(`API: Aktivita úspešne zaznamenaná do tabuľky 'aktivita'`);
      res.json(result.rows[0]);
    } catch (innerError) {
      console.error("Chyba pri zaznamenávaní do aktivita:", innerError);
      res.status(500).json({ error: "Chyba pri zaznamenávaní aktivity" });
    }
  } catch (error) {
    console.error("Chyba pri zaznamenávaní aktivity:", error);
    res.status(500).json({ error: "Chyba pri zaznamenávaní aktivity" });
  }
});

// Získať zoznam posledných aktivít
router.get("/recent", async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    console.log(`API: Získavam posledných ${limit} aktivít`);
    
    // Pokúsime sa použiť novú tabuľku 'aktivita'
    try {
      const result = await pool.query(
        "SELECT id, user_id, username, typ_akcie, popis as akcia, vytvorene_datum as datum, entita, entita_id FROM aktivita ORDER BY vytvorene_datum DESC LIMIT $1",
        [limit]
      );
      
      console.log(`API: Získaných ${result.rows.length} aktivít z tabuľky 'aktivita'`);
      return res.json(result.rows);
    } catch (innerError) {
      console.error("Chyba pri získavaní z aktivita:", innerError);
      // Ak sa pokús použiť pôvodnú tabuľku, môže to zlyhať, ale to správame v hlavnom catch bloku
      throw innerError;
    }
  } catch (error) {
    console.error("Chyba pri získavaní aktivít:", error);
    res.status(500).json({ error: "Chyba pri získavaní aktivít", details: error.message });
  }
});

// Získať zoznam posledných aktivít konkrétneho používateľa
router.get("/user/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;
    console.log(`API: Získavam posledných ${limit} aktivít používateľa ${id}`);
    
    try {
      const result = await pool.query(
        "SELECT id, user_id, username, typ_akcie, popis as akcia, vytvorene_datum as datum, entita, entita_id FROM aktivita WHERE user_id = $1 ORDER BY vytvorene_datum DESC LIMIT $2",
        [id, limit]
      );
      
      console.log(`API: Získaných ${result.rows.length} aktivít používateľa ${id} z tabuľky 'aktivita'`);
      return res.json(result.rows);
    } catch (innerError) {
      console.error("Chyba pri získavaní z aktivita pre používateľa:", innerError);
      throw innerError;
    }
  } catch (error) {
    console.error("Chyba pri získavaní aktivít používateľa:", error);
    res.status(500).json({ error: "Chyba pri získavaní aktivít používateľa", details: error.message });
  }
});

// Získať aktivity podľa typu entity
router.get("/entity/:type", async (req, res) => {
  try {
    const { type } = req.params;
    const { limit = 10 } = req.query;
    console.log(`API: Získavam posledných ${limit} aktivít pre entitu ${type}`);
    
    const result = await pool.query(
      "SELECT id, user_id, username, typ_akcie, popis as akcia, vytvorene_datum as datum, entita, entita_id, entita_detaily FROM aktivita WHERE entita = $1 ORDER BY vytvorene_datum DESC LIMIT $2",
      [type, limit]
    );
    
    console.log(`API: Získaných ${result.rows.length} aktivít pre entitu ${type}`);
    res.json(result.rows);
  } catch (error) {
    console.error("Chyba pri získavaní aktivít pre entitu:", error);
    res.status(500).json({ error: "Chyba pri získavaní aktivít pre entitu", details: error.message });
  }
});

module.exports = router;
