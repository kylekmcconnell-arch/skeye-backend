const express = require('express');
const pool = require('../../config/database');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { uploadAvatar } = require('../middleware/upload');

const router = express.Router();

// Get user profile by username
router.get('/:username', optionalAuth, async (req, res) => {
  try {
    const { username } = req.params;

    const result = await pool.query(
      `SELECT id, username, avatar_url, bio, location, skeye_balance, created_at
       FROM users WHERE username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Get user stats
    const stats = await pool.query(
      `SELECT 
        (SELECT COUNT(*) FROM sightings WHERE user_id = $1) as clips_count,
        (SELECT COUNT(*) FROM devices WHERE user_id = $1) as devices_count,
        (SELECT COUNT(*) FROM user_classifications WHERE user_id = $1) as classifications_count`,
      [user.id]
    );

    // Get user rank (position based on skeye_balance)
    const rankResult = await pool.query(
      `SELECT COUNT(*) + 1 as rank FROM users WHERE skeye_balance > $1`,
      [user.skeye_balance || 0]
    );

    res.json({
      id: user.id,
      username: user.username,
      avatarUrl: user.avatar_url,
      bio: user.bio,
      location: user.location,
      skeyeBalance: user.skeye_balance || 0,
      rank: parseInt(rankResult.rows[0].rank),
      createdAt: user.created_at,
      stats: {
        clipsCount: parseInt(stats.rows[0].clips_count) || 0,
        devicesCount: parseInt(stats.rows[0].devices_count) || 0,
        classificationsCount: parseInt(stats.rows[0].classifications_count) || 0
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Get user's public clips (sightings they uploaded)
router.get('/:username/clips', async (req, res) => {
  try {
    const { username } = req.params;
    const { page = 1, limit = 500 } = req.query;
    const offset = (page - 1) * limit;

    // Get user ID
    const userResult = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;

    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM sightings WHERE user_id = $1',
      [userId]
    );
    const totalClips = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT s.*, 
        (SELECT COUNT(*) FROM sighting_likes WHERE sighting_id = s.id) as likes_count,
        (SELECT COUNT(*) FROM sighting_comments WHERE sighting_id = s.id) as comments_count
       FROM sightings s
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    res.json({
      total: totalClips,
      clips: result.rows.map(s => ({
        id: s.id,
        location: s.location,
        videoUrl: s.video_url,
        thumbnailUrl: s.thumbnail_url,
        classification: s.classification,
        confidence: s.ai_confidence,
        latitude: parseFloat(s.latitude),
        longitude: parseFloat(s.longitude),
        likesCount: parseInt(s.likes_count) || 0,
        commentsCount: parseInt(s.comments_count) || 0,
        createdAt: s.created_at
      }))
    });
  } catch (error) {
    console.error('Get user clips error:', error);
    res.status(500).json({ error: 'Failed to get user clips' });
  }
});

// Get user's videos
router.get('/:username/videos', async (req, res) => {
  try {
    const { username } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Get user ID
    const userResult = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;

    const result = await pool.query(
      `SELECT v.*, 
        (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE video_id = v.id) as comments_count
       FROM videos v
       WHERE v.user_id = $1 AND v.status = 'ready'
       ORDER BY v.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    res.json({
      videos: result.rows.map(v => ({
        id: v.id,
        title: v.title,
        filename: v.filename,
        thumbnailUrl: v.thumbnail_url,
        location: v.location,
        classification: v.classification,
        aiConfidence: v.ai_confidence,
        views: v.views,
        likesCount: parseInt(v.likes_count),
        commentsCount: parseInt(v.comments_count),
        createdAt: v.created_at
      }))
    });
  } catch (error) {
    console.error('Get user videos error:', error);
    res.status(500).json({ error: 'Failed to get user videos' });
  }
});

// Upload avatar
router.post('/avatar', authenticate, uploadAvatar.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    await pool.query(
      'UPDATE users SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [avatarUrl, req.user.id]
    );

    res.json({ 
      message: 'Avatar updated successfully',
      avatarUrl 
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// Get user's devices
router.get('/:username/devices', authenticate, async (req, res) => {
  try {
    // Only allow users to view their own devices
    if (req.params.username !== req.user.username && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const result = await pool.query(
      `SELECT * FROM devices WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({
      devices: result.rows.map(d => ({
        id: d.id,
        name: d.name,
        location: d.location,
        latitude: d.latitude,
        longitude: d.longitude,
        status: d.status,
        lastSeen: d.last_seen,
        createdAt: d.created_at
      }))
    });
  } catch (error) {
    console.error('Get devices error:', error);
    res.status(500).json({ error: 'Failed to get devices' });
  }
});

// Add device
router.post('/devices', authenticate, async (req, res) => {
  try {
    const { name, location, latitude, longitude } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Device name is required' });
    }

    const result = await pool.query(
      `INSERT INTO devices (user_id, name, location, latitude, longitude, status)
       VALUES ($1, $2, $3, $4, $5, 'offline')
       RETURNING *`,
      [req.user.id, name, location, latitude, longitude]
    );

    res.status(201).json({
      message: 'Device added successfully',
      device: {
        id: result.rows[0].id,
        name: result.rows[0].name,
        location: result.rows[0].location,
        latitude: result.rows[0].latitude,
        longitude: result.rows[0].longitude,
        status: result.rows[0].status,
        createdAt: result.rows[0].created_at
      }
    });
  } catch (error) {
    console.error('Add device error:', error);
    res.status(500).json({ error: 'Failed to add device' });
  }
});

// Update device
router.put('/devices/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, location, latitude, longitude, status } = req.body;

    // Check ownership
    const device = await pool.query(
      'SELECT user_id FROM devices WHERE id = $1',
      [id]
    );

    if (device.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    if (device.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name) { updates.push(`name = $${paramCount++}`); values.push(name); }
    if (location !== undefined) { updates.push(`location = $${paramCount++}`); values.push(location); }
    if (latitude !== undefined) { updates.push(`latitude = $${paramCount++}`); values.push(latitude); }
    if (longitude !== undefined) { updates.push(`longitude = $${paramCount++}`); values.push(longitude); }
    if (status) { updates.push(`status = $${paramCount++}`); values.push(status); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE devices SET ${updates.join(', ')}, last_seen = CURRENT_TIMESTAMP 
       WHERE id = $${paramCount} RETURNING *`,
      values
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update device error:', error);
    res.status(500).json({ error: 'Failed to update device' });
  }
});

// Delete device
router.delete('/devices/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Check ownership
    const device = await pool.query(
      'SELECT user_id FROM devices WHERE id = $1',
      [id]
    );

    if (device.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    if (device.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await pool.query('DELETE FROM devices WHERE id = $1', [id]);

    res.json({ message: 'Device deleted successfully' });
  } catch (error) {
    console.error('Delete device error:', error);
    res.status(500).json({ error: 'Failed to delete device' });
  }
});

// Get user's notification settings
router.get('/me/notifications', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT notification_settings FROM users WHERE id = $1',
      [req.user.id]
    );
    
    // Return saved settings or empty object
    const settings = result.rows[0]?.notification_settings || {};
    res.json(settings);
  } catch (error) {
    console.error('Get notification settings error:', error);
    res.status(500).json({ error: 'Failed to get notification settings' });
  }
});

// Update user's notification settings
router.put('/me/notifications', authenticate, async (req, res) => {
  try {
    const { notifications } = req.body;
    
    await pool.query(
      'UPDATE users SET notification_settings = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [JSON.stringify(notifications), req.user.id]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update notification settings error:', error);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
});

module.exports = router;
