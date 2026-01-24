# Skeye.AI Backend

A Node.js/Express backend with PostgreSQL for the Skeye.AI platform.

## Features

- **User Authentication**: JWT-based signup/signin
- **Video Upload & Streaming**: Upload videos with streaming support
- **Sightings API**: Map-based sightings with filtering
- **Classification System**: User voting on sightings
- **Comments & Likes**: Social features for videos
- **$SKEYE Rewards**: Token rewards for participation
- **Device Management**: Track user devices

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Installation

1. **Clone and install dependencies:**
   ```bash
   cd skeye-backend
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials and JWT secret
   ```

3. **Create PostgreSQL database:**
   ```sql
   CREATE DATABASE skeye_db;
   ```

4. **Initialize database tables:**
   ```bash
   npm run db:init
   ```

5. **Start the server:**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/signin` | Sign in |
| GET | `/api/auth/me` | Get current user |
| PUT | `/api/auth/profile` | Update profile |
| PUT | `/api/auth/password` | Change password |

### Videos
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/videos` | List videos (paginated) |
| GET | `/api/videos/:id` | Get video details |
| GET | `/api/videos/:id/stream` | Stream video |
| POST | `/api/videos/upload` | Upload video |
| POST | `/api/videos/:id/like` | Like/unlike video |
| POST | `/api/videos/:id/classify` | Classify video |
| GET | `/api/videos/:id/comments` | Get comments |
| POST | `/api/videos/:id/comments` | Add comment |
| DELETE | `/api/videos/:id` | Delete video |

### Sightings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sightings` | Get map sightings |
| GET | `/api/sightings/trending` | Get trending |
| GET | `/api/sightings/classify` | Get for classification |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/:username` | Get user profile |
| GET | `/api/users/:username/videos` | Get user's videos |
| POST | `/api/users/avatar` | Upload avatar |
| GET | `/api/users/:username/devices` | Get user's devices |
| POST | `/api/users/devices` | Add device |
| PUT | `/api/users/devices/:id` | Update device |
| DELETE | `/api/users/devices/:id` | Delete device |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | Get notifications |
| PUT | `/api/notifications/:id/read` | Mark as read |
| PUT | `/api/notifications/read-all` | Mark all as read |
| DELETE | `/api/notifications/:id` | Delete notification |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3001 |
| `NODE_ENV` | Environment | development |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `JWT_SECRET` | JWT signing secret | - |
| `JWT_EXPIRES_IN` | Token expiration | 7d |
| `MAX_VIDEO_SIZE` | Max upload size (bytes) | 500MB |
| `UPLOAD_PATH` | Upload directory | ./uploads |
| `FRONTEND_URL` | Frontend URL for CORS | http://localhost:5173 |

## Deployment

### Vercel/Railway/Render

1. Set environment variables in dashboard
2. Connect to PostgreSQL (Supabase, Neon, or Railway Postgres)
3. Run database migrations

### Docker (coming soon)

```bash
docker-compose up -d
```

## File Structure

```
skeye-backend/
├── config/
│   └── database.js       # PostgreSQL connection
├── src/
│   ├── db/
│   │   └── init.js       # Database initialization
│   ├── middleware/
│   │   ├── auth.js       # JWT authentication
│   │   └── upload.js     # File upload handling
│   ├── routes/
│   │   ├── auth.js       # Auth endpoints
│   │   ├── videos.js     # Video endpoints
│   │   ├── sightings.js  # Sightings endpoints
│   │   ├── users.js      # User endpoints
│   │   └── notifications.js
│   └── index.js          # Express app
├── uploads/
│   ├── videos/           # Video files
│   ├── thumbnails/       # Video thumbnails
│   └── avatars/          # User avatars
├── .env.example
├── package.json
└── README.md
```

## License

MIT
