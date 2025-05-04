const { Pool } = require('pg');
const CryptoJS = require('crypto-js');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');

dotenv.config();

// Podporujeme DATABASE_URL (používané ElephantSQL a inými cloudovými poskytovateľmi) alebo individuálne parametre
let poolConfig;
let dbSource = 'local';

if (process.env.DATABASE_URL) {
  // Ak je k dispozícii DATABASE_URL, použijeme ho priamo
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Potrebné pre cloudové databázy
  };
  
  // Extrahujeme názov hostiteľa z URL pre logovanie
  const dbUrl = new URL(process.env.DATABASE_URL);
  dbSource = dbUrl.hostname;
  console.log(`Používam cloudovú databázu: ${dbSource}`);
} else {
  // Inak použijeme individuálne parametre
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'db_vozovy_park',
    port: process.env.DB_PORT || 5432
  };
  console.log(`Používam lokálnu databázu: ${process.env.DB_HOST || 'localhost'}`);
}

const pool = new Pool(poolConfig);

// Otestovanie pripojenia k databáze
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Chyba pri pripojení k databáze:', err);
  } else {
    console.log(`Databázové pripojenie úspešné! Aktuálny čas servera: ${res.rows[0].now}`);
    console.log(`Pripojený na databázu: ${dbSource}`);
  }
});

function generateCryptoId(vehicleData) {
  const spzValue = vehicleData.spz || vehicleData.SPZ;
  const dataString = `${vehicleData.znacka}-${vehicleData.model}-${spzValue}-${Date.now()}`;
  return CryptoJS.SHA256(dataString).toString(CryptoJS.enc.Hex).substring(0, 64);
}

const vehicleDao = {
  async initializeDatabase() {
    try {
      await pool.query('SELECT NOW()');
      
      await pool.query(`
        CREATE TABLE IF NOT EXISTS Vozidla (
          id_vozidla SERIAL PRIMARY KEY,
          id VARCHAR(64) NOT NULL,
          znacka VARCHAR(100) NOT NULL,
          model VARCHAR(100) NOT NULL,
          rok INTEGER NOT NULL,
          typ VARCHAR(100),
          spz VARCHAR(20) NOT NULL,
          stav INTEGER NOT NULL,
          cena NUMERIC(10,2),
          vykon INTEGER,
          km INTEGER,
          stk VARCHAR(20),
          palivo VARCHAR(50),
          prevodovka VARCHAR(50),
          farba VARCHAR(50),
          technicke_parametre JSONB
        )
      `);
      
      // Kontrola existencie stĺpcov (ak už tabuľka existuje)
      try {
        await pool.query(`ALTER TABLE Vozidla ADD COLUMN IF NOT EXISTS vykon INTEGER`);
        await pool.query(`ALTER TABLE Vozidla ADD COLUMN IF NOT EXISTS km INTEGER`);
        await pool.query(`ALTER TABLE Vozidla ADD COLUMN IF NOT EXISTS stk VARCHAR(20)`);
        await pool.query(`ALTER TABLE Vozidla ADD COLUMN IF NOT EXISTS palivo VARCHAR(50)`);
        await pool.query(`ALTER TABLE Vozidla ADD COLUMN IF NOT EXISTS prevodovka VARCHAR(50)`);
        await pool.query(`ALTER TABLE Vozidla ADD COLUMN IF NOT EXISTS farba VARCHAR(50)`);
        await pool.query(`ALTER TABLE Vozidla ADD COLUMN IF NOT EXISTS technicke_parametre JSONB`);
      } catch (err) {
        console.log('Upozornenie pri pridávaní stĺpcov:', err.message);
      }
      
      return true;
    } catch (error) {
      throw error;
    }
  },
  
  async getAllVehicles() {
    try {
      const result = await pool.query('SELECT * FROM Vozidla ORDER BY id_vozidla');
      return result.rows;
    } catch (error) {
      throw error;
    }
  },
  
  async getVehicleById(id) {
    try {
      const result = await pool.query('SELECT * FROM Vozidla WHERE id_vozidla = $1', [id]);
      
      if (result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      throw error;
    }
  },
  
  async createVehicle(vehicleData) {
    try {
      const cryptoId = generateCryptoId(vehicleData);
      
      const spzValue = vehicleData.spz || vehicleData.SPZ;
      
      // Spracovanie technických parametrov
      const technickeParametre = {};
      
      // Ak sú k dispozícii dodatočné parametre, ktoré nie sú v priamych stĺpcoch
      if (vehicleData.technicke_parametre) {
        Object.assign(technickeParametre, vehicleData.technicke_parametre);
      }
      
      // Pridať vlastnosti, ktoré by mohli prísť ako dodatočné polia
      ['pocet_dveri', 'objem_motora', 'emisna_norma', 'metalicka', 'klimatizacia', 'esp', 'abs'].forEach(param => {
        if (vehicleData[param] !== undefined) {
          technickeParametre[param] = vehicleData[param];
        }
      });
      
      const result = await pool.query(`
        INSERT INTO Vozidla (
          id, znacka, model, rok, typ, spz, stav, cena, 
          vykon, km, stk, palivo, prevodovka, farba, technicke_parametre
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id_vozidla
      `, [
        cryptoId,
        vehicleData.znacka,
        vehicleData.model,
        vehicleData.rok,
        vehicleData.typ || null,
        spzValue,
        vehicleData.stav,
        vehicleData.cena || null,
        vehicleData.vykon || null,
        vehicleData.km || null,
        vehicleData.stk || null,
        vehicleData.palivo || null,
        vehicleData.prevodovka || null,
        vehicleData.farba || null,
        Object.keys(technickeParametre).length > 0 ? JSON.stringify(technickeParametre) : null
      ]);
      
      if (result.rows.length > 0) {
        const id = result.rows[0].id_vozidla;
        return this.getVehicleById(id);
      }
      return null;
    } catch (error) {
      throw error;
    }
  },
  
  async updateVehicle(id, vehicleData) {
    try {
      const existingVehicle = await this.getVehicleById(id);
      if (!existingVehicle) {
        throw new Error('Vozidlo na aktualizáciu nebolo nájdené');
      }
      
      const updatedData = {
        znacka: vehicleData.znacka !== undefined ? vehicleData.znacka : existingVehicle.znacka,
        model: vehicleData.model !== undefined ? vehicleData.model : existingVehicle.model,
        rok: vehicleData.rok !== undefined ? vehicleData.rok : existingVehicle.rok,
        typ: vehicleData.typ !== undefined ? vehicleData.typ : existingVehicle.typ,
        spz: vehicleData.spz !== undefined ? vehicleData.spz : (vehicleData.SPZ !== undefined ? vehicleData.SPZ : existingVehicle.spz),
        stav: vehicleData.stav !== undefined ? vehicleData.stav : existingVehicle.stav,
        cena: vehicleData.cena !== undefined ? vehicleData.cena : existingVehicle.cena,
        vykon: vehicleData.vykon !== undefined ? vehicleData.vykon : existingVehicle.vykon,
        km: vehicleData.km !== undefined ? vehicleData.km : existingVehicle.km,
        stk: vehicleData.stk !== undefined ? vehicleData.stk : existingVehicle.stk,
        palivo: vehicleData.palivo !== undefined ? vehicleData.palivo : existingVehicle.palivo,
        prevodovka: vehicleData.prevodovka !== undefined ? vehicleData.prevodovka : existingVehicle.prevodovka,
        farba: vehicleData.farba !== undefined ? vehicleData.farba : existingVehicle.farba
      };
      
      // Spracovanie technických parametrov
      let technickeParametre = existingVehicle.technicke_parametre || {};
      
      // Ak sú odovzdané nové technické parametre, zlúčiť ich s existujúcimi
      if (vehicleData.technicke_parametre) {
        technickeParametre = { ...technickeParametre, ...vehicleData.technicke_parametre };
      }
      
      // Aktualizácia jednotlivých technických parametrov (ak nie sú v objekte technicke_parametre)
      ['pocet_dveri', 'objem_motora', 'emisna_norma', 'metalicka', 'klimatizacia', 'esp', 'abs'].forEach(param => {
        if (vehicleData[param] !== undefined) {
          technickeParametre[param] = vehicleData[param];
        }
      });
      
      try {
        const updateResult = await pool.query(`
          UPDATE Vozidla
          SET znacka = $1, model = $2, rok = $3, typ = $4, spz = $5, stav = $6, cena = $7,
              vykon = $8, km = $9, stk = $10, palivo = $11, prevodovka = $12, farba = $13,
              technicke_parametre = $14
          WHERE id_vozidla = $15
          RETURNING *
        `, [
          updatedData.znacka,
          updatedData.model,
          updatedData.rok,
          updatedData.typ || null,
          updatedData.spz,
          updatedData.stav,
          updatedData.cena || null,
          updatedData.vykon || null,
          updatedData.km || null,
          updatedData.stk || null,
          updatedData.palivo || null,
          updatedData.prevodovka || null,
          updatedData.farba || null,
          Object.keys(technickeParametre).length > 0 ? JSON.stringify(technickeParametre) : null,
          id
        ]);
        
        if (updateResult.rowCount > 0) {
          return updateResult.rows[0];
        }
        
        return null;
      } catch (sqlError) {
        throw sqlError;
      }
    } catch (error) {
      throw error;
    }
  },
  
  async deleteVehicle(id) {
    try {
      const result = await pool.query('DELETE FROM Vozidla WHERE id_vozidla = $1', [id]);
      
      if (result.rowCount === 0) {
        throw new Error('Vozidlo na vymazanie nebolo nájdené');
      }
      
      return true;
    } catch (error) {
      throw error;
    }
  }
};

async function createUsersTable() {
  // Vytvorenie tabuľky users s novými stĺpcami
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      plain_password VARCHAR(255),
      role VARCHAR(50) DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Pridať potrebné stĺpce ak neexistujú
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plain_password VARCHAR(255)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user'`);
    
    // Aktualizujú sa existujúci používatelia, ak nie je definovaná rola
    await pool.query(`UPDATE users SET role = 'user' WHERE role IS NULL`);
  } catch (err) {
    console.log('Upozornenie pri pridávaní stĺpcov do users:', err.message);
  }

  // Vytvorenie tabuľky aktivít, ak neexistuje
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aktivity (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      username VARCHAR(100),
      akcia VARCHAR(255) NOT NULL,
      datum TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Vytvorenie novej tabuľky aktivita v jednotnom čísle s rozšírenými stĺpcami
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aktivita (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      username VARCHAR(100),
      typ_akcie VARCHAR(50) NOT NULL,
      popis VARCHAR(255) NOT NULL,
      entita VARCHAR(50) NOT NULL,  -- vozidlo, používateľ, atď.
      entita_id INTEGER,             -- ID entity, ktorá bola upravená
      entita_detaily JSONB,          -- Detaily o entite vo formáte JSON
      vytvorene_datum TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function registerUser(username, password, role = 'user') {
  // Použijeme crypto.SHA256 namiesto bcrypt pre konzistentnosť s auth.js
  const hashedPassword = CryptoJS.SHA256(password).toString();
  
  // Uložíme aj heslo v nešifrovanej podobe a rolu používateľa
  const result = await pool.query(
    'INSERT INTO users (username, password, plain_password, role) VALUES ($1, $2, $3, $4) RETURNING id, username, role, created_at, plain_password',
    [username, hashedPassword, password, role]
  );
  return result.rows[0];
}

async function findUserByUsername(username) {
  const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  return result.rows[0];
}

// --- EXPORTUJ POOL PRE PRIAMY PRÍSTUP Z app.js ---
module.exports = {
  vehicleDao,
  createUsersTable,
  registerUser,
  findUserByUsername,
  pool
};
