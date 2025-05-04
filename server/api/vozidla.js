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

// Vytvoriť nové vozidlo
router.post("/create", async (req, res) => {
  try {
    const { 
      znacka, model, rok, typ, SPZ, stav, cena,
      vykon, km, stk, palivo, prevodovka, farba,
      technicke_parametre, // Možnoť poslať ďalšie technické parametre ako objekt
      ...ostatneParametre // Zachytí všetky ostatné parametre, ktoré nie sú explicitne uvedené
    } = req.body;
    
    // Generovanie kryptografického ID
    const id = crypto.SHA256(znacka + model + SPZ + Date.now()).toString();
    
    // Príprava technických parametrov - bespečné spracovanie
    let techParams = {};
    try {
      // Ak je technicke_parametre už JSON string, neparsujeme ho znovu
      if (typeof technicke_parametre === 'string') {
        techParams = JSON.parse(technicke_parametre);
      } else if (technicke_parametre && typeof technicke_parametre === 'object') {
        techParams = technicke_parametre;
      }
    } catch (err) {
      console.warn('Chyba pri parsovaní technických parametrov:', err);
    }
    
    // Bezpečné pridanie ostatných parametrov
    if (ostatneParametre && typeof ostatneParametre === 'object') {
      Object.keys(ostatneParametre).forEach(key => {
        techParams[key] = ostatneParametre[key];
      });
    }
    
    // DBMS server môže mať lower_case_table_names nastavené, takže potrebujeme konzistentné názvy stĺpcov
    // Vozidla -> vozidla, SPZ -> spz
    
    // Vloženie vozidla do databázy - použijeme konzistentné názvy stĺpcov (všetko malé písmená)
    const result = await db.query(`
      INSERT INTO vozidla (
        id, znacka, model, rok, typ, spz, stav, cena,
        vykon, km, stk, palivo, prevodovka, farba, technicke_parametre
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) 
      RETURNING *
    `, [
      id, 
      znacka, 
      model, 
      typeof rok === 'string' ? parseInt(rok, 10) : rok, 
      typ || null, 
      SPZ, 
      typeof stav === 'string' ? parseInt(stav, 10) : stav, 
      typeof cena === 'string' && cena !== '' ? parseFloat(cena) : (cena || null),
      typeof vykon === 'string' && vykon !== '' ? parseInt(vykon, 10) : (vykon || null), 
      typeof km === 'string' && km !== '' ? parseInt(km, 10) : (km || null), 
      stk || null,
      palivo || null, 
      prevodovka || null, 
      farba || null,
      Object.keys(techParams).length > 0 ? JSON.stringify(techParams) : null
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Chyba pri vytváraní vozidla:", error);
    res.status(500).json({ error: "Chyba pri vytváraní vozidla" });
  }
});

// Aktualizovať vozidlo
router.post("/update", async (req, res) => {
  try {
    const { id } = req.query;
    const { 
      znacka, model, rok, typ, SPZ, stav, cena,
      vykon, km, stk, palivo, prevodovka, farba,
      technicke_parametre,
      ...ostatneParametre
    } = req.body;
    
    // Kontrola, či vozidlo existuje
    const existingVehicle = await db.query("SELECT * FROM vozidla WHERE id = $1", [id]);
    if (existingVehicle.rows.length === 0) {
      return res.status(404).json({ error: "Vozidlo nebolo nájdené" });
    }
    
    // Získanie a bezpečné spracovanie existujúcich technických parametrov
    let techParams = {};
    
    try {
      // Pokus o získanie existujúcich parametrov z databázy
      if (existingVehicle.rows[0].technicke_parametre) {
        if (typeof existingVehicle.rows[0].technicke_parametre === 'string') {
          techParams = JSON.parse(existingVehicle.rows[0].technicke_parametre);
        } else {
          techParams = existingVehicle.rows[0].technicke_parametre;
        }
      }
      
      // Pridanie nových technických parametrov
      if (technicke_parametre) {
        // Ak sú nové parametre ako string, skúsme ich parsovať
        if (typeof technicke_parametre === 'string') {
          const parsedParams = JSON.parse(technicke_parametre);
          techParams = { ...techParams, ...parsedParams };
        } else if (typeof technicke_parametre === 'object') {
          techParams = { ...techParams, ...technicke_parametre };
        }
      }
    } catch (err) {
      console.warn('Chyba pri spracovaní technických parametrov pri aktualizácii:', err);
      // Použijeme existujúce parametre alebo prázdny objekt ak parsovanie zlyhalo
      techParams = techParams || {};
    }
    
    // Bezpečné pridanie ostatných parametrov do technických parametrov
    if (ostatneParametre && typeof ostatneParametre === 'object') {
      Object.keys(ostatneParametre).forEach(key => {
        techParams[key] = ostatneParametre[key];
      });
    }
    
    // Aktualizácia vozidla - použijeme konzistentné názvy stĺpcov (všetko malé písmená)
    const result = await db.query(
      `UPDATE vozidla SET 
        znacka = $1, model = $2, rok = $3, typ = $4, spz = $5, stav = $6, cena = $7,
        vykon = $8, km = $9, stk = $10, palivo = $11, prevodovka = $12, farba = $13,
        technicke_parametre = $14
        WHERE id = $15 RETURNING *`,
      [
        znacka, 
        model, 
        typeof rok === 'string' ? parseInt(rok, 10) : rok, 
        typ || null, 
        SPZ, 
        typeof stav === 'string' ? parseInt(stav, 10) : stav, 
        typeof cena === 'string' && cena !== '' ? parseFloat(cena) : (cena || null),
        typeof vykon === 'string' && vykon !== '' ? parseInt(vykon, 10) : (vykon !== undefined ? vykon : existingVehicle.rows[0].vykon), 
        typeof km === 'string' && km !== '' ? parseInt(km, 10) : (km !== undefined ? km : existingVehicle.rows[0].km), 
        stk !== undefined ? stk : existingVehicle.rows[0].stk,
        palivo !== undefined ? palivo : existingVehicle.rows[0].palivo,
        prevodovka !== undefined ? prevodovka : existingVehicle.rows[0].prevodovka,
        farba !== undefined ? farba : existingVehicle.rows[0].farba,
        Object.keys(techParams).length > 0 ? JSON.stringify(techParams) : null,
        id
      ]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Chyba pri aktualizácii vozidla:", error);
    res.status(500).json({ error: "Chyba pri aktualizácii vozidla" });
  }
});

// Alternatívna metóda pre aktualizáciu vozidla (PUT)
router.put("/update", async (req, res) => {
  try {
    const { id } = req.query;
    const { znacka, model, rok, typ, SPZ, stav, cena } = req.body;
    
    // Kontrola, či vozidlo existuje
    const existingVehicle = await db.query("SELECT * FROM vozidla WHERE id = $1", [id]);
    if (existingVehicle.rows.length === 0) {
      return res.status(404).json({ error: "Vozidlo nebolo nájdené" });
    }
    
    // Aktualizácia vozidla
    const result = await db.query(
      "UPDATE vozidla SET znacka = $1, model = $2, rok = $3, typ = $4, SPZ = $5, stav = $6, cena = $7 WHERE id = $8 RETURNING *",
      [znacka, model, rok, typ, SPZ, stav, cena, id]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Chyba pri aktualizácii vozidla:", error);
    res.status(500).json({ error: "Chyba pri aktualizácii vozidla" });
  }
});

// Vymazať vozidlo
router.post("/delete", async (req, res) => {
  try {
    const { id } = req.query;
    
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
