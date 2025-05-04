const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const { vehicleDao, createUsersTable, registerUser, findUserByUsername, pool } = require('./db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto-js');

// Import API routerov
const usersRouter = require('./api/users');
const activityRouter = require('./api/activity');
const aktivitaRouter = require('./api/aktivita');

dotenv.config();

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb', strict: false }));
app.use(bodyParser.urlencoded({ extended: true }));

const vehicleStatusMap = {
  1: 'Dostupné',
  2: 'V použití',
  3: 'V servise',
  4: 'Vyradené'
};

function formatVehicleData(vehicle) {
  if (!vehicle) return null;
  
  return {
    id: vehicle.id,
    znacka: vehicle.znacka,
    model: vehicle.model,
    rok: vehicle.rok,
    typ: vehicle.typ,
    spz: vehicle.spz,
    stav: vehicle.stav,
    stav_text: vehicleStatusMap[vehicle.stav],
    cena: vehicle.cena,
    vykon: vehicle.vykon,
    km: vehicle.km,
    stk: vehicle.stk,
    palivo: vehicle.palivo,
    prevodovka: vehicle.prevodovka,
    farba: vehicle.farba,
    technicke_parametre: vehicle.technicke_parametre
  };
}

// --- INIT USERS TABLE ---
createUsersTable();

// --- AUTH ENDPOINTS ---
app.post('/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Vyplňte meno a heslo' });
  const exists = await findUserByUsername(username);
  if (exists) return res.status(409).json({ message: 'Používateľ už existuje' });
  const user = await registerUser(username, password);
  res.status(201).json({ id: user.id, username: user.username, created_at: user.created_at });
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Vyplňte meno a heslo' });
  const user = await findUserByUsername(username);
  if (!user) return res.status(401).json({ message: 'Nesprávne meno alebo heslo' });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ message: 'Nesprávne meno alebo heslo' });
  // JWT demo
  const token = jwt.sign({ id: user.id, username: user.username }, 'tajnykluc', { expiresIn: '2h' });
  res.json({ token, username: user.username });
});

const authenticate = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Chýba token' });
  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, 'tajnykluc');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Neplatný token' });
  }
};

app.delete('/auth/delete', authenticate, async (req, res) => {
  const userId = req.user.id;
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ message: 'Účet bol vymazaný.' });
  } catch {
    res.status(500).json({ message: 'Chyba pri vymazávaní účtu.' });
  }
});

app.post('/auth/change-password', authenticate, async (req, res) => {
  const { password } = req.body;
  const userId = req.user.id;
  if (!password) return res.status(400).json({ message: 'Chýba nové heslo' });
  try {
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, userId]);
    res.json({ message: 'Heslo bolo zmenené.' });
  } catch {
    res.status(500).json({ message: 'Chyba pri zmene hesla.' });
  }
});

// --- VOZIDLÁ ENDPOINTS (OPRAVENÁ VERZIA) ---

// Získať vozidlá
app.get('/vozidla/read', async (req, res) => {
  try {
    const cryptoId = req.query.id;
    
    if (cryptoId) {
      // Získanie jedného vozidla podľa ID
      const result = await pool.query("SELECT * FROM vozidla WHERE id = $1", [cryptoId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Vozidlo nebolo nájdené" });
      }
      
      return res.json(formatVehicleData(result.rows[0]));
    }
    
    // Získanie všetkých vozidiel
    const result = await pool.query("SELECT * FROM vozidla ORDER BY id_vozidla");
    res.json(result.rows.map(formatVehicleData));
  } catch (error) {
    console.error("Chyba pri získavaní vozidiel:", error);
    res.status(500).json({ message: 'Nastala chyba pri získavaní zoznamu vozidiel', error: error.message });
  }
});

// Alias pre získanie všetkých vozidiel
app.get('/vozidla/list', async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM vozidla ORDER BY id_vozidla");
    res.json(result.rows.map(formatVehicleData));
  } catch (error) {
    console.error("Chyba pri získavaní vozidiel:", error);
    res.status(500).json({ message: 'Nastala chyba pri získavaní zoznamu vozidiel', error: error.message });
  }
});

// Vytvorenie nového vozidla - zjednodušená a robustná verzia
app.post('/vozidla/create', async (req, res) => {
  try {
    console.log("Prijatý payload:", JSON.stringify(req.body));
    
    // Extrakcia a validácia hlavných parametrov
    const { 
      znacka, model, rok, typ, SPZ, spz, stav, cena,
      vykon, km, stk, palivo, prevodovka, farba, technicke_parametre, ...ostatneParametre 
    } = req.body;
    
    // Kontrola povinných polí
    if (!znacka || !model || !rok || !(SPZ || spz) || !stav) {
      return res.status(400).json({ 
        error: "Chýbajú povinné polia", 
        required: ["znacka", "model", "rok", "SPZ/spz", "stav"],
        received: req.body
      });
    }
    
    // Používame SPZ alebo spz, ktorákoľvek existuje
    const pouziteSPZ = SPZ || spz;
    
    // Generovanie kryptografického ID
    const idString = `${znacka}-${model}-${pouziteSPZ}-${Date.now()}`;
    const id = crypto.SHA256(idString).toString();
    
    // Spracovanie technických parametrov
    let technickeParametreJSON = null;
    if (technicke_parametre) {
      try {
        // Ak je to string, skúsime ho parsovať
        if (typeof technicke_parametre === 'string') {
          const parsedParams = JSON.parse(technicke_parametre);
          technickeParametreJSON = JSON.stringify(parsedParams);
        } 
        // Ak je to objekt, konvertujeme na JSON string
        else if (typeof technicke_parametre === 'object') {
          technickeParametreJSON = JSON.stringify(technicke_parametre);
        }
      } catch (err) {
        console.warn("Chyba pri spracovaní technických parametrov:", err);
        // Necháme null ak nastane chyba
      }
    }
    
    // Robustnejšie konverzie typov - zabezpečujú, že čísla sa konvertujú správne
    const safeNum = (val, defaultVal = null) => {
      if (val === null || val === undefined || val === '') return defaultVal;
      const num = Number(val);
      return isNaN(num) ? defaultVal : num;
    };
    
    // Vloženie vozidla do databázy
    const query = `
      INSERT INTO vozidla (
        id, znacka, model, rok, typ, spz, stav, cena,
        vykon, km, stk, palivo, prevodovka, farba, technicke_parametre
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) 
      RETURNING *
    `;
    
    const values = [
      id,                           // $1 - id
      znacka,                       // $2 - znacka
      model,                        // $3 - model
      safeNum(rok),                 // $4 - rok
      typ || null,                  // $5 - typ
      pouziteSPZ,                   // $6 - spz
      safeNum(stav),                // $7 - stav
      safeNum(cena),                // $8 - cena
      safeNum(vykon),               // $9 - vykon
      safeNum(km),                  // $10 - km
      stk || null,                  // $11 - stk
      palivo || null,               // $12 - palivo
      prevodovka || null,           // $13 - prevodovka
      farba || null,                // $14 - farba
      technickeParametreJSON        // $15 - technicke_parametre
    ];
    
    console.log("SQL query:", query);
    console.log("Hodnoty:", values);
    
    const result = await pool.query(query, values);
    console.log("Výsledok vytvorenia vozidla:", result.rows[0]);
    
    // Zaznamenáme aktivitu vytvorenia vozidla
    try {
      const vehicleInfo = `${result.rows[0].znacka} ${result.rows[0].model} (${result.rows[0].spz})`;
      await pool.query(
        "INSERT INTO aktivita (username, typ_akcie, popis, entita, entita_id, entita_detaily) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          req.headers['x-username'] || 'system', 
          'vytvorenie', 
          `Vytvorenie vozidla ${vehicleInfo}`,
          'vozidlo',
          result.rows[0].id_vozidla,
          JSON.stringify(formatVehicleData(result.rows[0]))
        ]
      );
      
      // Ponecháme aj pôvodný záznam pre spätnú kompatibilitu
      await pool.query(
        "INSERT INTO aktivity (username, akcia) VALUES ($1, $2)",
        [req.headers['x-username'] || 'system', `Vytvorenie vozidla ${vehicleInfo}`]
      );
    } catch (logError) {
      console.warn("Chyba pri zaznamenávaní aktivity:", logError);
    }
    
    res.status(201).json(formatVehicleData(result.rows[0]));
  } catch (error) {
    console.error("Chyba pri vytváraní vozidla:", error);
    res.status(500).json({ 
      message: 'Nastala chyba pri vytváraní vozidla', 
      error: error.message,
      detail: error.detail || error.stack
    });
  }
});

// Aktualizácia vozidla - zjednodušená a robustná verzia
app.post('/vozidla/update', async (req, res) => {
  try {
    console.log("Update payload:", JSON.stringify(req.body));
    const cryptoId = req.query.id;
    
    if (!cryptoId) {
      return res.status(400).json({ message: 'Chýba ID vozidla' });
    }
    
    // Kontrola, či vozidlo existuje
    const existingVehicle = await pool.query("SELECT * FROM vozidla WHERE id = $1", [cryptoId]);
    if (existingVehicle.rows.length === 0) {
      return res.status(404).json({ message: 'Vozidlo na aktualizáciu nebolo nájdené' });
    }
    
    const vehicle = existingVehicle.rows[0];
    
    // Extrahujeme všetky parametre z requestu
    const { 
      znacka, model, rok, typ, SPZ, spz, stav, cena,
      vykon, km, stk, palivo, prevodovka, farba, technicke_parametre 
    } = req.body;
    
    // Používame SPZ alebo spz, ktorákoľvek existuje v requeste alebo ostávame pri pôvodnej
    const pouziteSPZ = SPZ || spz || vehicle.spz;
    
    // Spracovanie technických parametrov 
    let technickeParametreJSON = null;
    try {
      // Najprv získame existujúce technické parametre
      let existingParams = {};
      if (vehicle.technicke_parametre) {
        if (typeof vehicle.technicke_parametre === 'string') {
          existingParams = JSON.parse(vehicle.technicke_parametre);
        } else {
          existingParams = vehicle.technicke_parametre;
        }
      }
      
      // Potom spracujeme nové technické parametre
      if (technicke_parametre) {
        let newParams = {};
        if (typeof technicke_parametre === 'string') {
          newParams = JSON.parse(technicke_parametre);
        } else if (typeof technicke_parametre === 'object') {
          newParams = technicke_parametre;
        }
        
        // Zlúčiť existujúce s novými parametrami
        const mergedParams = { ...existingParams, ...newParams };
        technickeParametreJSON = JSON.stringify(mergedParams);
      } else {
        // Ak nie sú nové, použijeme existujúce
        technickeParametreJSON = 
          typeof existingParams === 'object' && Object.keys(existingParams).length > 0 
            ? JSON.stringify(existingParams) 
            : null;
      }
    } catch (err) {
      console.warn("Chyba pri spracovaní technických parametrov:", err);
    }
    
    // Robustná konverzia čísel
    const safeNum = (val, defaultVal = null) => {
      if (val === undefined) return defaultVal;
      if (val === null || val === '') return null;
      const num = Number(val);
      return isNaN(num) ? defaultVal : num;
    };
    
    // Pripravíme dáta na aktualizáciu (iba existujúce polia)
    const updateData = [
      znacka !== undefined ? znacka : vehicle.znacka,                // $1 - znacka
      model !== undefined ? model : vehicle.model,                   // $2 - model
      safeNum(rok, vehicle.rok),                                     // $3 - rok
      typ !== undefined ? typ : vehicle.typ,                         // $4 - typ
      pouziteSPZ,                                                    // $5 - spz
      safeNum(stav, vehicle.stav),                                   // $6 - stav
      safeNum(cena, vehicle.cena),                                   // $7 - cena
      safeNum(vykon, vehicle.vykon),                                 // $8 - vykon
      safeNum(km, vehicle.km),                                       // $9 - km
      stk !== undefined ? stk : vehicle.stk,                         // $10 - stk
      palivo !== undefined ? palivo : vehicle.palivo,                // $11 - palivo
      prevodovka !== undefined ? prevodovka : vehicle.prevodovka,    // $12 - prevodovka
      farba !== undefined ? farba : vehicle.farba,                   // $13 - farba
      technickeParametreJSON,                                        // $14 - technicke_parametre
      cryptoId                                                       // $15 - id
    ];
    
    // Vykonanie aktualizácie
    const result = await pool.query(`
      UPDATE vozidla SET 
        znacka = $1, model = $2, rok = $3, typ = $4, spz = $5, stav = $6, cena = $7,
        vykon = $8, km = $9, stk = $10, palivo = $11, prevodovka = $12, farba = $13, 
        technicke_parametre = $14
      WHERE id = $15 
      RETURNING *
    `, updateData);
    
    // Zaznamenáme aktivitu aktualizácie vozidla
    try {
      const vehicleInfo = `${result.rows[0].znacka} ${result.rows[0].model} (${result.rows[0].spz})`;
      await pool.query(
        "INSERT INTO aktivita (username, typ_akcie, popis, entita, entita_id, entita_detaily) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          req.headers['x-username'] || 'system', 
          'aktualizácia', 
          `Aktualizácia vozidla ${vehicleInfo}`,
          'vozidlo',
          result.rows[0].id_vozidla,
          JSON.stringify(formatVehicleData(result.rows[0]))
        ]
      );
      
      // Ponecháme aj pôvodný záznam pre spätnú kompatibilitu
      await pool.query(
        "INSERT INTO aktivity (username, akcia) VALUES ($1, $2)",
        [req.headers['x-username'] || 'system', `Aktualizácia vozidla ${vehicleInfo}`]
      );
    } catch (logError) {
      console.warn("Chyba pri zaznamenávaní aktivity:", logError);
    }
    
    res.json(formatVehicleData(result.rows[0]));
  } catch (error) {
    console.error("Chyba pri aktualizácii vozidla:", error);
    res.status(500).json({ 
      message: 'Nastala chyba pri aktualizácii vozidla', 
      error: error.message,
      detail: error.detail || error.stack
    });
  }
});

// Vymazať vozidlo
app.post('/vozidla/delete', async (req, res) => {
  try {
    const cryptoId = req.query.id;
    
    if (!cryptoId) {
      return res.status(400).json({ message: 'Chýba ID vozidla' });
    }
    
    // Kontrola, či vozidlo existuje
    const existingVehicle = await pool.query("SELECT * FROM vozidla WHERE id = $1", [cryptoId]);
    if (existingVehicle.rows.length === 0) {
      return res.status(404).json({ message: 'Vozidlo na vymazanie nebolo nájdené' });
    }
    
    const vehicle = existingVehicle.rows[0];
    
    // Vymazanie vozidla
    await pool.query("DELETE FROM vozidla WHERE id = $1", [cryptoId]);
    
    // Zaznamenáme aktivitu vymazania vozidla
    try {
      const vehicleInfo = `${vehicle.znacka} ${vehicle.model} (${vehicle.spz})`;
      await pool.query(
        "INSERT INTO aktivita (username, typ_akcie, popis, entita, entita_id, entita_detaily) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          req.headers['x-username'] || 'system', 
          'vymazanie', 
          `Vymazanie vozidla ${vehicleInfo}`,
          'vozidlo',
          vehicle.id_vozidla,
          JSON.stringify(formatVehicleData(vehicle))
        ]
      );
      
      // Ponecháme aj pôvodný záznam pre spätnú kompatibilitu
      await pool.query(
        "INSERT INTO aktivity (username, akcia) VALUES ($1, $2)",
        [req.headers['x-username'] || 'system', `Vymazanie vozidla ${vehicleInfo}`]
      );
    } catch (logError) {
      console.warn("Chyba pri zaznamenávaní aktivity:", logError);
    }
    
    res.json({ message: 'Vozidlo bolo úspešne vymazané' });
  } catch (error) {
    console.error("Chyba pri vymazávaní vozidla:", error);
    res.status(500).json({ 
      message: 'Nastala chyba pri vymazávaní vozidla', 
      error: error.message,
      detail: error.detail || error.stack
    });
  }
});

// Použitie API routerov
app.use('/users', usersRouter);
app.use('/activity', activityRouter);
app.use('/aktivita', aktivitaRouter);

// Základná route
app.get('/', (req, res) => {
  res.send('API vozového parku je aktívne');
});

async function startServer() {
  try {
    await vehicleDao.initializeDatabase();
    app.listen(port, () => {
      console.log(`Server beží na porte ${port}`);
      console.log(`http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Chyba pri inicializácii servera:', error.message);
    process.exit(1);
  }
}

startServer();
