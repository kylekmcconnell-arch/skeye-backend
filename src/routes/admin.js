const express = require('express');
const pool = require('../../config/database');
const { authenticate } = require('../middleware/auth');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// Initialize Supabase client for storage
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

// Middleware to check if user is admin
const requireAdmin = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Failed to verify admin status' });
  }
};

// Upload thumbnail for a sighting (receives base64 image from client)
router.post('/sightings/:id/thumbnail', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { thumbnailBase64 } = req.body;
    
    if (!thumbnailBase64) {
      return res.status(400).json({ error: 'Thumbnail data required' });
    }
    
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    // Convert base64 to buffer
    const base64Data = thumbnailBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Upload to Supabase Storage
    const fileName = `thumbnails/${id}_${Date.now()}.jpg`;
    const { data, error } = await supabase.storage
      .from('sightings')
      .upload(fileName, buffer, {
        contentType: 'image/jpeg',
        upsert: true
      });
    
    if (error) {
      console.error('Supabase upload error:', error);
      return res.status(500).json({ error: 'Failed to upload thumbnail' });
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('sightings')
      .getPublicUrl(fileName);
    
    const thumbnailUrl = urlData.publicUrl;
    
    // Update sighting with thumbnail URL
    await pool.query(
      'UPDATE sightings SET thumbnail_url = $1 WHERE id = $2',
      [thumbnailUrl, id]
    );
    
    res.json({ success: true, thumbnailUrl });
  } catch (error) {
    console.error('Upload thumbnail error:', error);
    res.status(500).json({ error: 'Failed to upload thumbnail' });
  }
});

// Get sightings without thumbnails (for batch processing)
router.get('/sightings/missing-thumbnails', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, video_url, location 
      FROM sightings 
      WHERE thumbnail_url IS NULL OR thumbnail_url = ''
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get missing thumbnails error:', error);
    res.status(500).json({ error: 'Failed to get sightings' });
  }
});

// Get all sightings (admin)
router.get('/sightings', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, u.username as uploader_username 
      FROM sightings s 
      LEFT JOIN users u ON s.user_id = u.id 
      ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get sightings error:', error);
    res.status(500).json({ error: 'Failed to get sightings' });
  }
});

// Create a new sighting (admin)
router.post('/sightings', authenticate, requireAdmin, async (req, res) => {
  try {
    const { 
      title, 
      videoUrl, 
      thumbnailUrl,
      location, 
      latitude, 
      longitude, 
      classification, 
      aiConfidence 
    } = req.body;

    // Validate required fields (title is optional)
    if (!videoUrl || !location || !latitude || !longitude || !classification) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await pool.query(`
      INSERT INTO sightings (
        user_id, title, video_url, thumbnail_url, location, latitude, longitude, 
        classification, ai_confidence, is_verified, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, CURRENT_TIMESTAMP)
      RETURNING *
    `, [
      req.user.id,
      title || null,
      videoUrl,
      thumbnailUrl || null,
      location,
      parseFloat(latitude),
      parseFloat(longitude),
      classification,
      parseInt(aiConfidence) || 85
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create sighting error:', error);
    res.status(500).json({ error: 'Failed to create sighting' });
  }
});

// Update a sighting (admin)
router.put('/sightings/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, 
      videoUrl, 
      thumbnailUrl,
      location, 
      latitude, 
      longitude, 
      classification, 
      aiConfidence 
    } = req.body;

    const result = await pool.query(`
      UPDATE sightings SET
        title = COALESCE($1, title),
        video_url = COALESCE($2, video_url),
        thumbnail_url = COALESCE($3, thumbnail_url),
        location = COALESCE($4, location),
        latitude = COALESCE($5, latitude),
        longitude = COALESCE($6, longitude),
        classification = COALESCE($7, classification),
        ai_confidence = COALESCE($8, ai_confidence)
      WHERE id = $9
      RETURNING *
    `, [
      title,
      videoUrl,
      thumbnailUrl,
      location,
      latitude ? parseFloat(latitude) : null,
      longitude ? parseFloat(longitude) : null,
      classification,
      aiConfidence ? parseInt(aiConfidence) : null,
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sighting not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update sighting error:', error);
    res.status(500).json({ error: 'Failed to update sighting' });
  }
});

// Delete a sighting (admin)
router.delete('/sightings/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM sightings WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sighting not found' });
    }

    res.json({ message: 'Sighting deleted successfully' });
  } catch (error) {
    console.error('Delete sighting error:', error);
    res.status(500).json({ error: 'Failed to delete sighting' });
  }
});

// Get all users (admin)
router.get('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, username, email, avatar_url, skeye_balance, role, created_at 
      FROM users 
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

module.exports = router;
