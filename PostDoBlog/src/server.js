/**
 * Main server entry point for the Blog Review Factory application
 * @module src/server
 */
const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const jobsRoutes = require('./routes/jobs.routes');
const productsRoutes = require('./routes/products.routes');
const promptsRoutes = require('./routes/prompts.routes');
const publishRoutes = require('./routes/publish.routes');
const assistantRoutes = require('./routes/assistant.routes');

// Load environment variables
dotenv.config();

// Validate critical environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error('FATAL ERROR: OPENAI_API_KEY is not defined in environment variables');
  process.exit(1);
}

if (!process.env.PORT) {
  console.warn('WARNING: PORT not set, defaulting to 3000');
}

/**
 * Create Express application instance
 * @type {express.Application}
 */
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration (adjust for production)
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : true, // allow all in dev
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate limiting - general API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiting for auth endpoints (if any)
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many requests, please try again later.',
});

app.use('/api/', apiLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * Health check endpoint for monitoring
 * @route GET /health
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * Serve static files from the public directory
 */
app.use(express.static(path.join(__dirname, '..', 'public')));

/**
 * API route definitions
 */
app.use('/api/jobs', jobsRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/prompts', promptsRoutes);
app.use('/api/publish', publishRoutes);
app.use('/api/assistant', assistantRoutes);

/**
 * Basic route for testing - serves the main dashboard
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

/**
 * 404 handler for undefined routes
 */
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

/**
 * Centralized error handling middleware
 */
app.use((err, req, res, next) => {
  console.error('Error:', err);

  // Default error status
  const statusCode = err.statusCode || 500;

  // Don't leak error details in production
  const errorMessage = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({
    error: errorMessage,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

/**
 * Start the HTTP server
 */
const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

/**
 * Handle uncaught exceptions gracefully
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  server.close(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;