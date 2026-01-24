const express = require('express');
const path = require('path');
const fs = require('fs');
const pool = require('../../config/database');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { uploadVideo, videoDir } = require('../middleware/upload');

const router = express.Router();

// Upload a video
router.post('/upload', authenticate, uploadVideo.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const { title, description, location, latitude, longitude, deviceId, classification } = req.body;

    if (!title) {
      // Delete uploaded file if validation fails
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Title is required' });
    }

    const result = await pool.query(
      `INSERT INTO videos (
        user_id, device_id, title, description, filename, file_path, 
        file_size, location, latitude, longitude, classification, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        req.user.id,
        deviceId || null,
        title,
        description || null,
        req.file.filename,
        req.file.path,
        req.file.size,
        location || null,
        latitude || null,
        longitude || null,
        classification || null,
        'ready' // For now, skip processing
      ]
    );

    const video = result.rows[0];

    // Award $SKEYE for uploading
    await pool.query(
      'UPDATE users SET skeye_balance = skeye_balance + 10 WHERE id = $1',
      [req.user.id]
    );

    res.status(201).json({
      message: 'Video uploaded successfully',
      video: {
        id: video.id,
        title: video.title,
        description: video.description,
        filename: video.filename,
        location: video.location,
        classification: video.classification,
        status: video.status,
        createdAt: video.created_at
      },
      reward: 10
    });
  } catch (error) {
    console.error('Video upload error:', error);
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to upload video' });
  }
});

// Get all videos (with pagination)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, classification, location, sort = 'recent' } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE v.status = 'ready'";
    const params = [];
    let paramCount = 1;

    if (classification) {
      whereClause += ` AND v.classification = $${paramCount++}`;
      params.push(classification);
    }

    if (location) {
      whereClause += ` AND v.location ILIKE $${paramCount++}`;
      params.push(`%${location}%`);
    }

    let orderClause = 'ORDER BY v.created_at DESC';
    if (sort === 'popular') {
      orderClause = 'ORDER BY v.views DESC, v.created_at DESC';
    } else if (sort === 'trending') {
      orderClause = 'ORDER BY (SELECT COUNT(*) FROM likes WHERE video_id = v.id AND created_at > NOW() - INTERVAL \'24 hours\') DESC';
    }

    params.push(limit, offset);

    const result = await pool.query(
      `SELECT v.*, u.username, u.avatar_url,
        (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE video_id = v.id) as comments_count
        ${req.user ? `, (SELECT COUNT(*) > 0 FROM likes WHERE video_id = v.id AND user_id = '${req.user.id}') as is_liked` : ''}
       FROM videos v
       JOIN users u ON v.user_id = u.id
       ${whereClause}
       ${orderClause}
       LIMIT $${paramCount++} OFFSET $${paramCount}`,
      params
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM videos v ${whereClause}`,
      params.slice(0, -2)
    );

    res.json({
      videos: result.rows.map(v => ({
        id: v.id,
        title: v.title,
        description: v.description,
        filename: v.filename,
        thumbnailUrl: v.thumbnail_url,
        location: v.location,
        latitude: v.latitude,
        longitude: v.longitude,
        classification: v.classification,
        aiConfidence: v.ai_confidence,
        views: v.views,
        likesCount: parseInt(v.likes_count),
        commentsCount: parseInt(v.comments_count),
        isLiked: v.is_liked || false,
        createdAt: v.created_at,
        user: {
          id: v.user_id,
          username: v.username,
          avatarUrl: v.avatar_url
        }
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        totalPages: Math.ceil(countResult.rows[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Get videos error:', error);
    res.status(500).json({ error: 'Failed to get videos' });
  }
});

// Get single video
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Increment view count
    await pool.query('UPDATE videos SET views = views + 1 WHERE id = $1', [id]);

    const result = await pool.query(
      `SELECT v.*, u.username, u.avatar_url,
        (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as likes_count,
        (SELECT COUNT(*) FROM comments WHERE video_id = v.id) as comments_count
        ${req.user ? `, (SELECT COUNT(*) > 0 FROM likes WHERE video_id = v.id AND user_id = '${req.user.id}') as is_liked` : ''}
       FROM videos v
       JOIN users u ON v.user_id = u.id
       WHERE v.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const v = result.rows[0];
    res.json({
      id: v.id,
      title: v.title,
      description: v.description,
      filename: v.filename,
      thumbnailUrl: v.thumbnail_url,
      location: v.location,
      latitude: v.latitude,
      longitude: v.longitude,
      classification: v.classification,
      aiConfidence: v.ai_confidence,
      views: v.views,
      likesCount: parseInt(v.likes_count),
      commentsCount: parseInt(v.comments_count),
      isLiked: v.is_liked || false,
      createdAt: v.created_at,
      user: {
        id: v.user_id,
        username: v.username,
        avatarUrl: v.avatar_url
      }
    });
  } catch (error) {
    console.error('Get video error:', error);
    res.status(500).json({ error: 'Failed to get video' });
  }
});

// Stream video
router.get('/:id/stream', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT filename, file_path FROM videos WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const video = result.rows[0];
    const videoPath = video.file_path;

    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ error: 'Video file not found' });
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(videoPath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(200, head);
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (error) {
    console.error('Stream video error:', error);
    res.status(500).json({ error: 'Failed to stream video' });
  }
});

// Like/unlike video
router.post('/:id/like', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if already liked
    const existing = await pool.query(
      'SELECT id FROM likes WHERE user_id = $1 AND video_id = $2',
      [req.user.id, id]
    );

    if (existing.rows.length > 0) {
      // Unlike
      await pool.query(
        'DELETE FROM likes WHERE user_id = $1 AND video_id = $2',
        [req.user.id, id]
      );
      res.json({ liked: false, message: 'Video unliked' });
    } else {
      // Like
      await pool.query(
        'INSERT INTO likes (user_id, video_id) VALUES ($1, $2)',
        [req.user.id, id]
      );
      res.json({ liked: true, message: 'Video liked' });
    }
  } catch (error) {
    console.error('Like video error:', error);
    res.status(500).json({ error: 'Failed to like video' });
  }
});

// Classify video
router.post('/:id/classify', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { classification } = req.body;

    const validClassifications = ['UAP', 'Drone', 'Aircraft', 'Bird', 'Weather'];
    if (!validClassifications.includes(classification)) {
      return res.status(400).json({ error: 'Invalid classification' });
    }

    // Check if already classified by this user
    const existing = await pool.query(
      'SELECT id FROM classifications WHERE user_id = $1 AND video_id = $2',
      [req.user.id, id]
    );

    if (existing.rows.length > 0) {
      // Update existing classification
      await pool.query(
        'UPDATE classifications SET classification = $1 WHERE user_id = $2 AND video_id = $3',
        [classification, req.user.id, id]
      );
    } else {
      // Create new classification
      await pool.query(
        'INSERT INTO classifications (user_id, video_id, classification) VALUES ($1, $2, $3)',
        [req.user.id, id, classification]
      );

      // Award $SKEYE for classifying
      await pool.query(
        'UPDATE users SET skeye_balance = skeye_balance + 50 WHERE id = $1',
        [req.user.id]
      );
    }

    res.json({ 
      message: 'Classification recorded',
      classification,
      reward: existing.rows.length > 0 ? 0 : 50
    });
  } catch (error) {
    console.error('Classify video error:', error);
    res.status(500).json({ error: 'Failed to classify video' });
  }
});

// Get video comments
router.get('/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT c.*, u.username, u.avatar_url
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.video_id = $1 AND c.parent_id IS NULL
       ORDER BY c.created_at DESC`,
      [id]
    );

    // Get replies for each comment
    const comments = await Promise.all(result.rows.map(async (comment) => {
      const replies = await pool.query(
        `SELECT c.*, u.username, u.avatar_url
         FROM comments c
         JOIN users u ON c.user_id = u.id
         WHERE c.parent_id = $1
         ORDER BY c.created_at ASC`,
        [comment.id]
      );

      return {
        id: comment.id,
        content: comment.content,
        likesCount: comment.likes_count,
        createdAt: comment.created_at,
        user: {
          id: comment.user_id,
          username: comment.username,
          avatarUrl: comment.avatar_url
        },
        replies: replies.rows.map(r => ({
          id: r.id,
          content: r.content,
          likesCount: r.likes_count,
          createdAt: r.created_at,
          user: {
            id: r.user_id,
            username: r.username,
            avatarUrl: r.avatar_url
          }
        }))
      };
    }));

    res.json({ comments });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Failed to get comments' });
  }
});

// Add comment
router.post('/:id/comments', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, parentId } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    const result = await pool.query(
      `INSERT INTO comments (user_id, video_id, parent_id, content)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, id, parentId || null, content.trim()]
    );

    res.status(201).json({
      id: result.rows[0].id,
      content: result.rows[0].content,
      likesCount: 0,
      createdAt: result.rows[0].created_at,
      user: {
        id: req.user.id,
        username: req.user.username,
        avatarUrl: req.user.avatar_url
      }
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Delete video (owner only)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Check ownership
    const video = await pool.query(
      'SELECT user_id, file_path FROM videos WHERE id = $1',
      [id]
    );

    if (video.rows.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }

    if (video.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to delete this video' });
    }

    // Delete file
    if (fs.existsSync(video.rows[0].file_path)) {
      fs.unlinkSync(video.rows[0].file_path);
    }

    // Delete from database
    await pool.query('DELETE FROM videos WHERE id = $1', [id]);

    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Delete video error:', error);
    res.status(500).json({ error: 'Failed to delete video' });
  }
});

module.exports = router;
