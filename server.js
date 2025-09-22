const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;
const SERVE_DIR = process.env.SERVE_DIR || './public';
const AUTH_KEY = process.env.AUTH_KEY || 'changeme123';
const REQUIRE_AUTH = process.env.REQUIRE_AUTH !== 'false';

// Ensure the serve directory exists
if (!fs.existsSync(SERVE_DIR)) {
  fs.mkdirSync(SERVE_DIR, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, SERVE_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, name + '-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|svg|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: fileFilter
});

// Enable CORS if needed
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  next();
});

// Parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple authentication middleware
const authenticate = (req, res, next) => {
  if (!REQUIRE_AUTH) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const providedKey = authHeader ? authHeader.replace('Bearer ', '') : req.query.key;

  if (!providedKey || providedKey !== AUTH_KEY) {
    return res.status(401).json({ error: 'Unauthorized. Please provide a valid auth key.' });
  }

  next();
};

// Auth check endpoint
app.post('/auth/check', (req, res) => {
  const { key } = req.body;
  if (!REQUIRE_AUTH || key === AUTH_KEY) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Invalid auth key' });
  }
});

// Serve static files with proper mime types
app.use(express.static(SERVE_DIR, {
  setHeaders: (res, path) => {
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
      res.set('Content-Type', 'image/jpeg');
    } else if (path.endsWith('.png')) {
      res.set('Content-Type', 'image/png');
    } else if (path.endsWith('.gif')) {
      res.set('Content-Type', 'image/gif');
    } else if (path.endsWith('.svg')) {
      res.set('Content-Type', 'image/svg+xml');
    } else if (path.endsWith('.webp')) {
      res.set('Content-Type', 'image/webp');
    }
  }
}));

// Serve the upload page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle single file upload
app.post('/upload', authenticate, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({
    success: true,
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    url: `/${req.file.filename}`
  });
});

// Handle multiple file uploads
app.post('/upload-multiple', authenticate, upload.array('images', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const uploadedFiles = req.files.map(file => ({
    filename: file.filename,
    originalName: file.originalname,
    size: file.size,
    url: `/${file.filename}`
  }));

  res.json({
    success: true,
    files: uploadedFiles
  });
});

// Delete an image
app.delete('/delete/:filename', authenticate, (req, res) => {
  const filepath = path.join(SERVE_DIR, req.params.filename);

  fs.unlink(filepath, (err) => {
    if (err) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.json({ success: true, message: 'File deleted successfully' });
  });
});

// Directory listing endpoint (optional)
app.get('/list', (req, res) => {
  const directoryPath = path.join(SERVE_DIR);

  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Unable to scan directory' });
    }

    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    });

    const fileList = imageFiles.map(file => {
      const filePath = path.join(directoryPath, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        isDirectory: stats.isDirectory(),
        modified: stats.mtime,
        url: `/${file}`
      };
    });

    res.json(fileList);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

// Error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Serving files from: ${path.resolve(SERVE_DIR)}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Process ID: ${process.pid}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
  }
});