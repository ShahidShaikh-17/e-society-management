const express = require('express');
const dotenv = require('dotenv');
const session = require('express-session');
const passport = require('passport');
const MongoStore = require('connect-mongo');
const db = require(__dirname + '/config/db');
const path = require('path');
const { sanitizeInput } = require('./middleware/validation');
const { attachRole } = require('./middleware/authRoles');

// Access environment variables
dotenv.config();
const authRoutes = require('./routes/auth.routes');
const billingRoutes = require('./routes/billing.routes');
const visitorRoutes = require('./routes/visitor.routes');
const helpdeskRoutes = require('./routes/helpdesk.routes');
const societyRoutes = require('./routes/society.routes');
const adminRoutes = require('./routes/admin.routes');
const app = express()
app.set('view engine','ejs');
app.use(express.static('public'));

// Expose uploaded complaint attachments
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Middleware to parse JSON bodies (used by fetch() calls)
app.use(express.json());

// Favicon route
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'images', 'favicon.ico'));
});

// Middleware to handle HTTP post requests
app.use(express.urlencoded({extended: true}));

// Apply input sanitization to all routes
app.use(sanitizeInput);
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
    }),
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(attachRole);
app.use(authRoutes);
app.use(billingRoutes);
app.use(visitorRoutes);
app.use(helpdeskRoutes);
app.use(societyRoutes);
app.use(adminRoutes);
db.connectDB()

// Request Logging Middleware
app.use((req, res, next) => {
    const start = Date.now();
    
    // Optional: Log errors only
    res.on('finish', () => {
        if (res.statusCode >= 400 && req.url !== '/.well-known/appspecific/com.chrome.devtools.json') {
            const duration = Date.now() - start;
            console.error(`Error ${res.statusCode} on ${req.method} ${req.url} - ${duration}ms`);
        }
    });
    
    next();
});

// Structured Error Handling Middleware
const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    // Log error for debugging
    console.error('Error:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString(),
        user: req.user ? req.user.id : 'anonymous'
    });

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        const message = 'Resource not found';
        error = { message, statusCode: 404 };
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        const message = 'Duplicate field value entered';
        error = { message, statusCode: 400 };
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map(val => val.message).join(', ');
        error = { message, statusCode: 400 };
    }

    // Default error response
    res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

// Admin billing endpoints moved to routes/admin.routes.js (legacy endpoints disabled there)

// Auth routes moved to routes/auth.routes.js

app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.status(204).end();
});


// Society routes moved to routes/society.routes.js

// Admin routes moved to routes/admin.routes.js

// Helpdesk routes moved to routes/helpdesk.routes.js



// Admin routes moved to routes/admin.routes.js; debug/test routes removed

// Legacy maintenance Stripe endpoints removed (new system uses POST /billing/pay-online)

// Society registration checkout routes moved to routes/auth.routes.js

// Resident approval/export/overrides/editBill/receipts moved to routes/admin.routes.js

// 404 Handler - must be after all routes but before error handler
app.use((req, res, next) => {
    if (req.accepts('html')) {
        return res.redirect('/');
    }
    res.status(404).json({
        success: false,
        error: 'Page not found'
    });
});

// Apply error handler (must be after all routes)
app.use(errorHandler);

const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
    console.log("Server started");
});

server.on('error', (err) => {
    if(err && err.code === 'EADDRINUSE'){
        console.error(`Port ${port} is already in use. Close the existing node process (or change PORT) and try again.`);
        return;
    }
    console.error('Server error:', err);
});