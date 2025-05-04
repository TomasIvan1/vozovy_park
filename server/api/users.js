const express = require("express");
const router = express.Router();
const crypto = require("crypto-js");
const { pool } = require("../db");

// Získať všetkých používateľov
router.get("/read", async (req, res) => {
  try {
    console.log("API: Načítavam všetkých používateľov");
    const result = await pool.query("SELECT * FROM users");
    
    // Vrátime aj nezašifrované heslo v odpovedi (podľa požiadavky zobraziť heslo v nezakrytom tvare)
    const users = result.rows.map(user => {
      // Použijeme plain_password, alebo ak neexistuje, zobrazíme 'neznáme'
      
      // Pridáme predvolené hodnoty pre chýbajúce stĺpce
      return {
        ...user,
        email: user.email || '',
        role: user.role || 'user',
        status: user.status || 'active',
        // Použijeme explicitne nezašifrované heslo pre zobrazenie
        plain_password: user.plain_password || 'neznáme'  
      };
    });
    
    console.log(`API: Načítaných ${users.length} používateľov`);
    res.json(users);
  } catch (error) {
    console.error("Chyba pri získavaní používateľov:", error);
    res.status(500).json({ error: "Chyba pri získavaní používateľov" });
  }
});

// Získať jedného používateľa podľa ID
router.get("/read/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`API: Načítavam používateľa s ID ${id}`);
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    
    if (result.rows.length === 0) {
      console.log(`API: Používateľ s ID ${id} nebol nájdený`);
      return res.status(404).json({ error: "Používateľ nebol nájdený" });
    }
    
    // Vrátime aj heslo v odpovedi (podľa požiadavky zobraziť heslo v nezakrytom tvare)
    const userWithDefaults = {
      ...result.rows[0],
      email: result.rows[0].email || '',
      role: result.rows[0].role || 'user',
      status: result.rows[0].status || 'active',
      password: result.rows[0].password || ''
    };
    
    console.log(`API: Používateľ s ID ${id} bol nájdený`);
    res.json(userWithDefaults);
  } catch (error) {
    console.error("Chyba pri získavaní používateľa:", error);
    res.status(500).json({ error: "Chyba pri získavaní používateľa" });
  }
});

// Vytvoriť nového používateľa
router.post("/create", async (req, res) => {
  try {
    const { username, password, role = "user" } = req.body;
    console.log(`API: Vytváram nového používateľa ${username}`);
    
    // Kontrola, či používateľ už existuje
    const existingUser = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    if (existingUser.rows.length > 0) {
      console.log(`API: Používateľ ${username} už existuje`);
      return res.status(400).json({ error: "Používateľské meno už existuje" });
    }
    
    // Hashujeme heslo
    const hashedPassword = crypto.SHA256(password).toString();
    
    // Generujeme kryptografické ID
    const id = crypto.SHA256(username + Date.now()).toString();
    
    // Vytvoríme používateľa - uložíme aj nezašifrované heslo
    console.log(`API: Vytváram nového používateľa ${username} s ${role} právami`);
    const result = await pool.query(
      "INSERT INTO users (username, password, plain_password, role) VALUES ($1, $2, $3, $4) RETURNING *",
      [username, hashedPassword, password, role]
    );
    
    // Zaznamenáme aktivitu vytvorenia používateľa do novej tabuľky 'aktivita'
    try {
      // Zaznamenáme do novej tabuľky 'aktivita'
      await pool.query(
        "INSERT INTO aktivita (user_id, username, typ_akcie, popis, entita, entita_id, entita_detaily) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          result.rows[0].id, 
          username, 
          'vytvorenie', 
          `Vytvorenie používateľa ${username}`,
          'používateľ', 
          result.rows[0].id,
          JSON.stringify({
            id: result.rows[0].id,
            username: username,
            created_at: result.rows[0].created_at
          })
        ]
      );
      
      // Ponecháme aj pôvodný záznam pre spätnú kompatibilitu
      await pool.query(
        "INSERT INTO aktivity (user_id, username, akcia) VALUES ($1, $2, $3)",
        [result.rows[0].id, username, `Vytvorenie používateľa ${username}`]
      );
    } catch (logError) {
      console.log("Chyba pri zaznamenávaní aktivity:", logError.message);
    }
    
    console.log(`API: Používateľ ${username} bol úspešne vytvorený`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Chyba pri vytváraní používateľa:", error);
    res.status(500).json({ error: "Chyba pri vytváraní používateľa" });
  }
});

// Aktualizovať používateľa
router.post("/update", async (req, res) => {
  try {
    const { id } = req.query;
    const { username, password, role } = req.body;
    console.log(`API: Aktualizujem používateľa s ID ${id}`, req.body);
    
    // Kontrola, či používateľ existuje
    const existingUser = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    if (existingUser.rows.length === 0) {
      console.log(`API: Používateľ s ID ${id} nebol nájdený`);
      return res.status(404).json({ error: "Používateľ nebol nájdený" });
    }
    
    // Ak bolo zadané nové heslo, hashujeme ho
    let updateQuery;
    let updateParams;
    
    // Použijeme rôzne updat dotazy podľa toho, ktoré polia sa aktualizujú
    if (password && role) {
      console.log(`API: Aktualizujem heslo a rolu používateľa s ID ${id}`);
      const hashedPassword = crypto.SHA256(password).toString();
      
      // Aktualizujeme všetko vrátane role
      updateQuery = "UPDATE users SET username = $1, password = $2, plain_password = $3, role = $4 WHERE id = $5 RETURNING *";
      updateParams = [username, hashedPassword, password, role, id];
    } 
    else if (password) {
      console.log(`API: Aktualizujem len heslo používateľa s ID ${id}`);
      const hashedPassword = crypto.SHA256(password).toString();
      
      // Ak máme heslo, ale nemáme rolu
      updateQuery = "UPDATE users SET username = $1, password = $2, plain_password = $3 WHERE id = $4 RETURNING *";
      updateParams = [username, hashedPassword, password, id];
    }
    else if (role) {
      console.log(`API: Aktualizujem len rolu používateľa s ID ${id} na: ${role}`);
      
      // Ak máme len rolu, ale nie heslo
      updateQuery = "UPDATE users SET username = $1, role = $2 WHERE id = $3 RETURNING *";
      updateParams = [username, role, id];
    } 
    else {
      // Ak nemáme nič z toho, len username
      updateQuery = "UPDATE users SET username = $1 WHERE id = $2 RETURNING *";
      updateParams = [username, id];
    }
    
    // Aktualizujeme používateľa
    const result = await pool.query(updateQuery, updateParams);
    
    // Zaznamenáme aktivitu aktualizácie používateľa do novej tabuľky 'aktivita'
    try {
      // Zaznamenáme do novej tabuľky 'aktivita'
      await pool.query(
        "INSERT INTO aktivita (user_id, username, typ_akcie, popis, entita, entita_id, entita_detaily) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          id, 
          username, 
          'aktualizácia', 
          `Aktualizácia používateľa ${username}` + (password ? ' (vrátane hesla)' : ''),
          'používateľ', 
          id,
          JSON.stringify({
            id: id,
            username: username,
            password_changed: password ? true : false
          })
        ]
      );
      
      // Ponecháme aj pôvodný záznam pre spätnú kompatibilitu
      await pool.query(
        "INSERT INTO aktivity (user_id, username, akcia) VALUES ($1, $2, $3)",
        [id, username, `Úprava používateľa ${username}`]
      );
    } catch (logError) {
      console.log("Chyba pri zaznamenávaní aktivity:", logError.message);
    }
    
    console.log(`API: Používateľ s ID ${id} bol úspešne aktualizovaný`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Chyba pri aktualizácii používateľa:", error);
    res.status(500).json({ error: "Chyba pri aktualizácii používateľa" });
  }
});

// Vymazať používateľa
router.post("/delete", async (req, res) => {
  try {
    // Prijmeme ID z query parametra alebo z tela požiadavky
    let userId = req.query.id;
    
    // Ak príde ID aj v tele, použijeme ho ako zálohu
    if (!userId && req.body && req.body.id) {
      userId = req.body.id;
    }
    
    console.log(`API: Vymazávam používateľa s ID ${userId}, typ: ${typeof userId}`);
    
    // Kontrola, či používateľ existuje - skúsime nájsť podľa rôznych typov ID
    let existingUser;
    
    // Skúsime nájsť pomocou číselného ID
    try {
      const numericId = parseInt(userId);
      if (!isNaN(numericId)) {
        existingUser = await pool.query("SELECT * FROM users WHERE id = $1", [numericId]);
        if (existingUser.rows.length > 0) {
          userId = numericId; // Použijeme číselné ID pre vymazanie
        }
      }
    } catch (e) {
      console.log('Chyba pri parsovaní číselného ID:', e.message);
    }
    
    // Ak už máme používateľa, nepokračujeme ďalej
    if (!existingUser || existingUser.rows.length === 0) {
      // Skúsime nájsť aj pomocou reťazca (pre istotu)
      existingUser = await pool.query("SELECT * FROM users WHERE id::text = $1", [userId.toString()]);
    }
    
    // Ak sme stále nenašli používateľa, vrátime chybu
    if (!existingUser || existingUser.rows.length === 0) {
      console.log(`API: Používateľ s ID ${userId} nebol nájdený`);
      return res.status(404).json({ error: "Používateľ nebol nájdený" });
    }
    
    // Získame meno používateľa pred vymazaním
    const username = existingUser.rows[0].username;
    console.log(`API: Našiel som používateľa ${username} s ID ${userId}`);
    
    // OPRAVA: Najprv potrebujeme vymazať záznamy z tabuľky aktivita a aktivity, ktoré odkazujú na používateľa
    try {
      console.log(`API: Vymazanie záznamov aktivít pre používateľa: ${userId}`);
      // Vymažeme záznamy z tabuľky aktivita (používame CASCADE DELETE = NULL)
      await pool.query("UPDATE aktivita SET user_id = NULL WHERE user_id = $1", [userId]);
      
      // Vymažeme záznamy z tabuľky aktivity
      await pool.query("UPDATE aktivity SET user_id = NULL WHERE user_id = $1", [userId]);
      
      console.log('API: Záznamy aktivít úspešne odpojené');
    } catch (activityError) {
      console.error('Chyba pri odpojívaní aktivít:', activityError);
      // Pokračujeme aj keď sa odpojenie aktivít nezdarí
    }
    
    // Teraz môžeme vymazať používateľa
    try {
      const deleteResult = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [userId]);
      console.log(`API: Výsledok vymazania: ${deleteResult.rowCount} riadkov vymazaných`);
    } catch (deleteError) {
      console.error('Chyba pri vymazávaní používateľa:', deleteError);
      // Ak je tu problém s foreign key, skúsme drastickejší prístup
      try {
        console.log('API: Skúšam vymažeme priamo pomocou SQL...');
        await pool.query(
          "DO $$ BEGIN EXECUTE 'ALTER TABLE aktivita DROP CONSTRAINT IF EXISTS aktivita_user_id_fkey'; EXECUTE 'ALTER TABLE aktivity DROP CONSTRAINT IF EXISTS aktivity_user_id_fkey'; END $$;");
        await pool.query("DELETE FROM users WHERE id = $1", [userId]);
        console.log('API: Používateľ úspešne vymazaný alternatívnou metódou');
      } catch (finalError) {
        console.error('Finálna chyba pri vymazávaní:', finalError);
        throw new Error(`Nepodarilo sa vymazať používateľa: ${finalError.message}`);
      }
    }
    
    // Zaznamenáme aktivitu vymazania používateľa do konzoly ako náhradu za databázový záznam
    // (vyhýbame sa vkladaniu do tabuľky aktivita, keďže môže spôsobovať problémy s cudzími kľúčmi)
    console.log(`===== AKTIVITA: Vymazanie používateľa ${username} (ID: ${userId}) v čase ${new Date().toISOString()} =====`);
    
    console.log(`API: Používateľ s ID ${userId} bol úspešne vymazaný`);
    res.json({ message: "Používateľ bol úspešne vymazaný" });
  } catch (error) {
    console.error("Chyba pri vymazávaní používateľa:", error);
    res.status(500).json({ error: "Chyba pri vymazávaní používateľa" });
  }
});

// Prihlásenie používateľa a overenie hesla
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log(`API: Overujem prihlásenie používateľa: ${username}`);
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: "Chýbajúce používateľské meno alebo heslo" 
      });
    }
    
    // Hľadáme používateľa podľa mena
    const userResult = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    
    if (userResult.rows.length === 0) {
      console.log(`API: Používateľ ${username} nebol nájdený`);
      return res.status(401).json({ 
        success: false, 
        error: "Nesprávne používateľské meno alebo heslo" 
      });
    }
    
    const user = userResult.rows[0];
    
    // Overenie hesla - porovnáme zadané heslo s plain_password alebo so zahashovaným heslom
    const passwordMatches = user.plain_password === password || 
                          crypto.SHA256(password).toString() === user.password;
    
    if (!passwordMatches) {
      console.log(`API: Nesprávne heslo pre používateľa ${username}`);
      return res.status(401).json({ 
        success: false, 
        error: "Nesprávne používateľské meno alebo heslo" 
      });
    }
    
    // Prihlásenie úspešné
    console.log(`API: Používateľ ${username} úspešne prihlásený`);
    
    // Vytvoríme používateľský objekt bez hesla
    const { password: _, plain_password: __, ...userWithoutPasswords } = user;
    
    res.json({ 
      success: true, 
      user: {
        ...userWithoutPasswords,
        role: user.role || 'user'  // Defaultná rola je 'user' ak nie je určená
      }
    });
  } catch (error) {
    console.error('Chyba pri prihlasovaní používateľa:', error);
    res.status(500).json({ success: false, error: "Interná chyba servera" });
  }
});

module.exports = router;
