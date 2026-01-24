const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// Check if running on Vercel (serverless)
const isVercel = process.env.VERCEL === '1';

// For Vercel, use /tmp directory (only writable location) or memory storage
// For local development, use ./uploads
const uploadDir = isVercel ? '/tmp' : (process.env.UPLOAD_PATH || './uploads');
const videoDir = path.join(uploadDir, 'videos');
const thumbnailDir = path.join(uploadDir, 'thumbnails');
const avatarDir = path.join(uploadDir, 'avatars');

// Only create directories in non-Vercel environments or in /tmp
if (!isVercel) {
  [videoDir, thumbnailDir, avatarDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// Use memory storage for Vercel (files will be uploaded to Supabase Storage)
// Use disk storage for local development
const videoStorage = isVercel 
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, videoDir);
      },
      filename: (req, file, cb) => {
        const uniqueId = uuidv4();
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${uniqueId}${ext}`);
      }
    });

// Avatar storage configuration
const avatarStorage = isVercel
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, avatarDir);
      },
      filename: (req, file, cb) => {
        const uniqueId = uuidv4();
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${uniqueId}${ext}`);
      }
    });

// File filter for videos
const videoFilter = (req, file, cb) => {
  const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only MP4, WebM, MOV, and AVI are allowed.'), false);
  }
};

// File filter for images
const imageFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'), false);
  }
};

// Video upload middleware
const uploadVideo = multer({
  storage: videoStorage,
  fileFilter: videoFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_VIDEO_SIZE) || 500 * 1024 * 1024 // 500MB default
  }
});

// Avatar upload middleware
const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

module.exports = { uploadVideo, uploadAvatar, videoDir, thumbnailDir, avatarDir };
