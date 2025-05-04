const express = require("express");
const router = express.Router();
const crypto = require("crypto-js");
const db = require("../db");

// Získať všetky vozidlá
router.get("/read", async (req, res) => {
  try {
    const { id } = req.query;
    
    if (id) {
      // Získanie jedného vozidla podľa ID
      const result = await db.query("SELECT * FROM vozidla WHERE id = $1", [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Vozidlo nebolo nájdené" });
      }
      
      return res.json(result.rows[0]);
    }
    
    // Získanie všetkých vozidiel
    const result = await db.query("SELECT * FROM vozidla ORDER BY id_vozidla");
    res.json(result.rows);
  } catch (error) {
    console.error("Chyba pri získavaní vozidiel:", error);
    res.status(500).json({ error: "Chyba pri získavaní vozidiel" });
  }
});

// Alias pre získanie všetkých vozidiel
router.get("/list", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM vozidla ORDER BY id_vozidla");
    res.json(result.rows);
  } catch (error) {
    console.error("Chyba pri získavaní vozidiel:", error);
    res.status(500).json({ error: "Chyba pri získavaní vozidiel" });
  }
});

// Vytvorenie nového vozidla - zjednodušená a robustná verzia
router.post("/create", async (req, res) => {
  try {
    // Extrakcia a validácia hlavných parametrov
    const { znacka, model, rok, typ, SPZ, stav, cena } = req.body;
    
    // Validácia povinných polí
    if (!znacka || !model || !rok || !SPZ || !stav) {
      return res.status(400).json({ 
        error: "Chýbajú povinné polia", 
        required: ["znacka", "model", "rok", "SPZ", "stav"]
      });
    }
    
    // Generovanie kryptografického ID
    const idString = `${znacka}-${model}-${SPZ}-${Date.now()}`;
    const id = crypto.SHA256(idString).toString();
    
    // Základné SQL atribúty
    const baseParams = [
      id,                 // $1 - id
      znacka,             // $2 - znacka
      model,              // $3 - model
      Number(rok),        // $4 - rok
      typ || null,        // $5 - typ
      SPZ,                // $6 - spz
      Number(stav),       // $7 - stav
      cena ? Number(cena) : null  // $8 - cena
    ];
    
    // Základný SQL dotaz
    const baseSql = `
      INSERT INTO vozidla (id, znacka, model, rok, typ, spz, stav, cena) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    
    // Vykonanie dotazu
    const result = await db.query(baseSql + " RETURNING *", baseParams);
    
    // Úspešná odpoveď
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Chyba pri vytváraní vozidla:", error);
    res.status(500).json({ 
      error: "Chyba pri vytváraní vozidla", 
      message: error.message,
      detail: error.detail
    });
  }
});

// Aktualizácia vozidla - zjednodušená a robustná verzia
router.post("/update", async (req, res) => {
  try {
    const { id } = req.query;
    const { znacka, model, rok, typ, SPZ, stav, cena } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: "Chýba ID vozidla" });
    }
    
    // Kontrola, či vozidlo existuje
    const existingVehicle = await db.query("SELECT * FROM vozidla WHERE id = $1", [id]);
    if (existingVehicle.rows.length === 0) {
      return res.status(404).json({ error: "Vozidlo nebolo nájdené" });
    }
    
    // Vytvorenie polí pre parametre a hodnoty
    const updates = [];
    const values = [];
    
    // Funkcia na pridanie parametra ak existuje
    function addParam(paramName, dbField, value, converter = (x) => x) {
      if (value !== undefined) {
        updates.push(`${dbField} = $${values.length + 1}`);
        values.push(converter(value));
      }
    }
    
    // Pridanie všetkých parametrov
    addParam('znacka', 'znacka', znacka);
    addParam('model', 'model', model);
    addParam('rok', 'rok', rok, (v) => Number(v));
    addParam('typ', 'typ', typ);
    addParam('SPZ', 'spz', SPZ);
    addParam('stav', 'stav', stav, (v) => Number(v));
    addParam('cena', 'cena', cena, (v) => v !== null ? Number(v) : null);
    
    // Ak nie sú žiadne aktualizácie, vrátime existujúce vozidlo
    if (updates.length === 0) {
      return res.json(existingVehicle.rows[0]);
    }
    
    // Vytvorenie dotazu
    const sql = `UPDATE vozidla SET ${updates.join(', ')} WHERE id = $${values.length + 1} RETURNING *`;
    values.push(id);
    
    // Vykonanie dotazu
    const result = await db.query(sql, values);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Chyba pri aktualizácii vozidla:", error);
    res.status(500).json({ 
      error: "Chyba pri aktualizácii vozidla", 
      message: error.message,
      detail: error.detail
    });
  }
});

// Alias pre aktualizáciu vozidla (PUT)
router.put("/update", async (req, res) => {
  try {
    const { id } = req.query;
    const { znacka, model, rok, typ, SPZ, stav, cena } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: "Chýba ID vozidla" });
    }
    
    // Kontrola, či vozidlo existuje
    const existingVehicle = await db.query("SELECT * FROM vozidla WHERE id = $1", [id]);
    if (existingVehicle.rows.length === 0) {
      return res.status(404).json({ error: "Vozidlo nebolo nájdené" });
    }
    
    // Vytvorenie polí pre parametre a hodnoty
    const updates = [];
    const values = [];
    
    // Funkcia na pridanie parametra ak existuje
    function addParam(paramName, dbField, value, converter = (x) => x) {
      if (value !== undefined) {
        updates.push(`${dbField} = $${values.length + 1}`);
        values.push(converter(value));
      }
    }
    
    // Pridanie všetkých parametrov
    addParam('znacka', 'znacka', znacka);
    addParam('model', 'model', model);
    addParam('rok', 'rok', rok, (v) => Number(v));
    addParam('typ', 'typ', typ);
    addParam('SPZ', 'spz', SPZ);
    addParam('stav', 'stav', stav, (v) => Number(v));
    addParam('cena', 'cena', cena, (v) => v !== null ? Number(v) : null);
    
    // Ak nie sú žiadne aktualizácie, vrátime existujúce vozidlo
    if (updates.length === 0) {
      return res.json(existingVehicle.rows[0]);
    }
    
    // Vytvorenie dotazu
    const sql = `UPDATE vozidla SET ${updates.join(', ')} WHERE id = $${values.length + 1} RETURNING *`;
    values.push(id);
    
    // Vykonanie dotazu
    const result = await db.query(sql, values);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Chyba pri aktualizácii vozidla:", error);
    res.status(500).json({ 
      error: "Chyba pri aktualizácii vozidla", 
      message: error.message,
      detail: error.detail
    });
  }
});

// Vymazať vozidlo
router.post("/delete", async (req, res) => {
  try {
    const { id } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: "Chýba ID vozidla" });
    }
    
    // Kontrola, či vozidlo existuje
    const existingVehicle = await db.query("SELECT * FROM vozidla WHERE id = $1", [id]);
    if (existingVehicle.rows.length === 0) {
      return res.status(404).json({ error: "Vozidlo nebolo nájdené" });
    }
    
    // Vymazanie vozidla
    await db.query("DELETE FROM vozidla WHERE id = $1", [id]);
    
    res.json({ message: "Vozidlo bolo úspešne vymazané" });
  } catch (error) {
    console.error("Chyba pri vymazávaní vozidla:", error);
    res.status(500).json({ error: "Chyba pri vymazávaní vozidla" });
  }
});

module.exports = router;
