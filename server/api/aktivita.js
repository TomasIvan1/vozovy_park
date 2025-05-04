const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/log', async (req, res) => {
  try {
    const { user_id, username, typ_akcie, popis, entita, entita_id, entita_detaily } = req.body;
    
    const headerUsername = req.headers['x-username'];
    const finalUsername = username || headerUsername || 'anonymous';
    
    const result = await db.pool.query(`
      INSERT INTO aktivita (user_id, username, typ_akcie, popis, entita, entita_id, entita_detaily)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [user_id, finalUsername, typ_akcie, popis, entita, entita_id, entita_detaily]);
    
    res.status(201).json({
      success: true,
      message: 'Aktivita bola úspešne zaznamenaná',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Chyba pri zaznamenávaní aktivity:', error);
    res.status(500).json({
      success: false,
      message: 'Chyba pri zaznamenávaní aktivity',
      error: error.message
    });
  }
});

router.get('/all', async (req, res) => {
  try {
    const result = await db.pool.query(`
      SELECT * FROM aktivita 
      ORDER BY vytvorene_datum DESC
    `);
    
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Chyba pri získavaní aktivít:', error);
    res.status(500).json({
      success: false,
      message: 'Chyba pri získavaní aktivít',
      error: error.message
    });
  }
});

router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const result = await db.pool.query(`
      SELECT * FROM aktivita 
      ORDER BY vytvorene_datum DESC
      LIMIT $1
    `, [limit]);
    
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Chyba pri získavaní posledných aktivít:', error);
    res.status(500).json({
      success: false,
      message: 'Chyba pri získavaní posledných aktivít',
      error: error.message
    });
  }
});

router.get('/user/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    
    const result = await db.pool.query(`
      SELECT * FROM aktivita 
      WHERE user_id = $1
      ORDER BY vytvorene_datum DESC
    `, [userId]);
    
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Chyba pri získavaní aktivít používateľa:', error);
    res.status(500).json({
      success: false,
      message: 'Chyba pri získavaní aktivít používateľa',
      error: error.message
    });
  }
});

router.get('/entita/:typ', async (req, res) => {
  try {
    const entitaTyp = req.params.typ;
    const limit = parseInt(req.query.limit) || 50;
    
    const result = await db.pool.query(`
      SELECT * FROM aktivita 
      WHERE entita = $1
      ORDER BY vytvorene_datum DESC
      LIMIT $2
    `, [entitaTyp, limit]);
    
    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Chyba pri získavaní aktivít entity:', error);
    res.status(500).json({
      success: false,
      message: 'Chyba pri získavaní aktivít entity',
      error: error.message
    });
  }
});

module.exports = router;
