const express = require('express');
const pool = require('../../config/database');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Get all sightings (for map)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { 
      timeRange = '24h', 
      classification,
      minLat, maxLat, minLng, maxLng,
      limit = 100 
    } = req.query;

    let whereClause = "WHERE v.status = 'ready'";
    const params = [];
    let paramCount = 1;

    // Time filter
    const timeFilters = {
      '24h': '24 hours',
      '7d': '7 days',
      '30d': '30 days'
    };
    if (timeFilters[timeRange]) {
      whereClause += ` AND v.created_at > NOW() - INTERVAL '${timeFilters[timeRange]}'`;
    }

    // Classification filter
    if (classification) {
      const classifications = classification.split(',');
      whereClause += ` AND v.classification IN (${classifications.map((_, i) => `$${paramCount++}`).join(',')})`;
      params.push(...classifications);
    }

    // Bounding box filter
    if (minLat && maxLat && minLng && maxLng) {
      whereClause += ` AND v.latitude BETWEEN $${paramCount++} AND $${paramCount++}`;
      whereClause += ` AND v.longitude BETWEEN $${paramCount++} AND $${paramCount++}`;
      params.push(minLat, maxLat, minLng, maxLng);
    }

    params.push(limit);

    const result = await pool.query(
      `SELECT v.id, v.title, v.filename, v.location, v.latitude, v.longitude,
        v.classification, v.ai_confidence, v.created_at,
        u.id as user_id, u.username, u.avatar_url,
        (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE video_id = v.id) as comments_count
       FROM videos v
       JOIN users u ON v.user_id = u.id
       ${whereClause}
       AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
       ORDER BY v.created_at DESC
       LIMIT $${paramCount}`,
      params
    );

    res.json({
      sightings: result.rows.map(s => ({
        id: s.id,
        title: s.title,
        filename: s.filename,
        location: s.location,
        lat: parseFloat(s.latitude),
        lng: parseFloat(s.longitude),
        classification: s.classification,
        aiConfidence: s.ai_confidence,
        likesCount: parseInt(s.likes_count),
        commentsCount: parseInt(s.comments_count),
        createdAt: s.created_at,
        user: {
          id: s.user_id,
          username: s.username,
          avatarUrl: s.avatar_url
        }
      }))
    });
  } catch (error) {
    console.error('Get sightings error:', error);
    res.status(500).json({ error: 'Failed to get sightings' });
  }
});

// Get trending sightings
router.get('/trending', optionalAuth, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const result = await pool.query(
      `SELECT v.*, u.username, u.avatar_url,
        (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE video_id = v.id) as comments_count,
        (SELECT COUNT(*) FROM likes WHERE video_id = v.id AND created_at > NOW() - INTERVAL '24 hours') as recent_likes
       FROM videos v
       JOIN users u ON v.user_id = u.id
       WHERE v.status = 'ready'
       ORDER BY recent_likes DESC, v.views DESC, v.created_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      sightings: result.rows.map(s => ({
        id: s.id,
        title: s.title,
        filename: s.filename,
        location: s.location,
        lat: s.latitude ? parseFloat(s.latitude) : null,
        lng: s.longitude ? parseFloat(s.longitude) : null,
        classification: s.classification,
        aiConfidence: s.ai_confidence,
        views: s.views,
        likesCount: parseInt(s.likes_count),
        commentsCount: parseInt(s.comments_count),
        createdAt: s.created_at,
        user: {
          id: s.user_id,
          username: s.username,
          avatarUrl: s.avatar_url
        }
      }))
    });
  } catch (error) {
    console.error('Get trending error:', error);
    res.status(500).json({ error: 'Failed to get trending sightings' });
  }
});

// Get sightings needing classification
router.get('/classify', optionalAuth, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    let excludeClause = '';
    if (req.user) {
      excludeClause = `AND v.id NOT IN (SELECT video_id FROM classifications WHERE user_id = '${req.user.id}')`;
    }

    const result = await pool.query(
      `SELECT v.*, u.username, u.avatar_url,
        (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE video_id = v.id) as comments_count,
        (SELECT COUNT(*) FROM classifications WHERE video_id = v.id) as classification_count
       FROM videos v
       JOIN users u ON v.user_id = u.id
       WHERE v.status = 'ready' ${excludeClause}
       ORDER BY classification_count ASC, v.created_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      sightings: result.rows.map(s => ({
        id: s.id,
        title: s.title,
        filename: s.filename,
        location: s.location,
        lat: s.latitude ? parseFloat(s.latitude) : null,
        lng: s.longitude ? parseFloat(s.longitude) : null,
        classification: s.classification,
        aiConfidence: s.ai_confidence,
        likesCount: parseInt(s.likes_count),
        commentsCount: parseInt(s.comments_count),
        classificationCount: parseInt(s.classification_count),
        createdAt: s.created_at,
        user: {
          id: s.user_id,
          username: s.username,
          avatarUrl: s.avatar_url
        }
      }))
    });
  } catch (error) {
    console.error('Get classify error:', error);
    res.status(500).json({ error: 'Failed to get sightings for classification' });
  }
});

module.exports = router;
