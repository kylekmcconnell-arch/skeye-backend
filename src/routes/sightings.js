const express = require('express');
const pool = require('../../config/database');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Get all sightings (for map) - queries from sightings table
router.get('/', async (req, res) => {
  try {
    const { 
      timeRange = 'all', 
      classification,
      limit = 100 
    } = req.query;

    let whereClause = "WHERE 1=1";
    const params = [];
    let paramCount = 1;

    // Time filter
    const timeFilters = {
      '24h': '24 hours',
      '7d': '7 days',
      '30d': '30 days'
    };
    if (timeFilters[timeRange]) {
      whereClause += ` AND s.created_at > NOW() - INTERVAL '${timeFilters[timeRange]}'`;
    }

    // Classification filter
    if (classification) {
      const classifications = classification.split(',');
      whereClause += ` AND s.classification IN (${classifications.map((_, i) => `$${paramCount++}`).join(',')})`;
      params.push(...classifications);
    }

    params.push(limit);

    const result = await pool.query(
      `SELECT s.*, u.username as uploader_username, u.avatar_url as uploader_avatar,
        (SELECT COUNT(*) FROM sighting_likes WHERE sighting_id = s.id) as likes_count,
        (SELECT COUNT(*) FROM sighting_comments WHERE sighting_id = s.id) as comments_count
       FROM sightings s
       LEFT JOIN users u ON s.user_id = u.id
       ${whereClause}
       AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL
       ORDER BY s.created_at DESC
       LIMIT $${paramCount}`,
      params
    );

    res.json(result.rows.map(r => ({
      ...r,
      likes_count: parseInt(r.likes_count) || 0,
      comments_count: parseInt(r.comments_count) || 0
    })));
  } catch (error) {
    console.error('Get sightings error:', error);
    res.status(500).json({ error: 'Failed to get sightings' });
  }
});

// Get user's classifications for sightings
router.get('/my-classifications', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sighting_id, classification FROM user_classifications WHERE user_id = $1`,
      [req.user.id]
    );
    
    // Return as object { sighting_id: classification }
    const classifications = {};
    result.rows.forEach(r => {
      classifications[r.sighting_id] = r.classification;
    });
    
    res.json(classifications);
  } catch (error) {
    console.error('Get classifications error:', error);
    res.status(500).json({ error: 'Failed to get classifications' });
  }
});

// Submit a classification
router.post('/:id/classify', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { classification } = req.body;
    
    if (!classification) {
      return res.status(400).json({ error: 'Classification required' });
    }
    
    // Upsert classification
    await pool.query(
      `INSERT INTO user_classifications (user_id, sighting_id, classification)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, sighting_id) 
       DO UPDATE SET classification = $3, created_at = CURRENT_TIMESTAMP`,
      [req.user.id, id, classification]
    );
    
    res.json({ success: true, classification });
  } catch (error) {
    console.error('Submit classification error:', error);
    res.status(500).json({ error: 'Failed to submit classification' });
  }
});

// Get comments for a sighting
router.get('/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT c.*, u.username, u.avatar_url
       FROM sighting_comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.sighting_id = $1
       ORDER BY c.created_at DESC
       LIMIT 50`,
      [id]
    );
    
    res.json(result.rows.map(r => ({
      id: r.id,
      text: r.text,
      createdAt: r.created_at,
      user: {
        username: r.username,
        avatar: r.username[0].toUpperCase(),
        avatarUrl: r.avatar_url
      }
    })));
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Failed to get comments' });
  }
});

// Post a comment
router.post('/:id/comments', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Comment text required' });
    }
    
    const result = await pool.query(
      `INSERT INTO sighting_comments (user_id, sighting_id, text)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.user.id, id, text.trim()]
    );
    
    // Get user info
    const userResult = await pool.query(
      `SELECT username, avatar_url FROM users WHERE id = $1`,
      [req.user.id]
    );
    
    res.json({
      id: result.rows[0].id,
      text: result.rows[0].text,
      createdAt: result.rows[0].created_at,
      user: {
        username: userResult.rows[0].username,
        avatar: userResult.rows[0].username[0].toUpperCase(),
        avatarUrl: userResult.rows[0].avatar_url
      }
    });
  } catch (error) {
    console.error('Post comment error:', error);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

// Like a sighting
router.post('/:id/like', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Toggle like
    const existing = await pool.query(
      `SELECT id FROM sighting_likes WHERE user_id = $1 AND sighting_id = $2`,
      [req.user.id, id]
    );
    
    if (existing.rows.length > 0) {
      // Unlike
      await pool.query(
        `DELETE FROM sighting_likes WHERE user_id = $1 AND sighting_id = $2`,
        [req.user.id, id]
      );
      res.json({ liked: false });
    } else {
      // Like
      await pool.query(
        `INSERT INTO sighting_likes (user_id, sighting_id) VALUES ($1, $2)`,
        [req.user.id, id]
      );
      res.json({ liked: true });
    }
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

// Get user's likes
router.get('/my-likes', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sighting_id FROM sighting_likes WHERE user_id = $1`,
      [req.user.id]
    );
    
    res.json(result.rows.map(r => r.sighting_id));
  } catch (error) {
    console.error('Get likes error:', error);
    res.status(500).json({ error: 'Failed to get likes' });
  }
});

module.exports = router;
