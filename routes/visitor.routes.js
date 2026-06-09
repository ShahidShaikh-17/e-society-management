const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { requireApproved, authorizeRoles, requireGuard } = require('../middleware/authRoles');
const { validateInput, miscValidation } = require('../middleware/validation');
const visitorController = require('../controllers/visitorController');

const dir = path.join(__dirname, '..', 'uploads', 'visitors');
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, dir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname || '').toLowerCase();
            const safe = ext === '.png' || ext === '.jpeg' || ext === '.jpg' ? ext : '.jpg';
            cb(null, `${Date.now()}_${Math.round(Math.random() * 1e9)}${safe}`);
        },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok =
            file.mimetype === 'image/jpeg' ||
            file.mimetype === 'image/png' ||
            file.mimetype === 'image/webp';
        cb(ok ? null : new Error('Only JPEG, PNG, or WEBP images are allowed'), ok);
    },
});

const router = express.Router();

router.get('/visitor-log', requireApproved, authorizeRoles('admin', 'guard'), visitorController.listLog);
router.get('/visitor-register', requireGuard, visitorController.registerForm);
router.post(
    '/visitor-register',
    requireGuard,
    (req, res, next) => {
        upload.single('photo')(req, res, (err) => {
            if (err) {
                return res.redirect(
                    '/visitor-register?error=' + encodeURIComponent(err.message || 'Upload failed')
                );
            }
            next();
        });
    },
    validateInput(miscValidation.visitorCreate, '/visitor-register'),
    visitorController.createVisitor
);
router.post('/visitor-exit/:id', requireApproved, authorizeRoles('admin', 'guard'), visitorController.markExit);

module.exports = router;
