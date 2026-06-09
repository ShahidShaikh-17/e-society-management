const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const nameRegex = /^[a-zA-Z\s.'-]+$/;
const flatRegex = /^[a-zA-Z0-9\-\/\s]{1,20}$/;
const phoneRegex = /^(\+91[\-\s]?)?\d{10}$/;
const contactPhoneRegex = /^(\+?\d[\d\s-]{2,14})$/;
const pinRegex = /^\d{6}$/;

// Validation middleware — optional `redirectOnError` for HTML forms (string path or (req) => path)
const validateInput = (validations, redirectOnError) => {
    return async (req, res, next) => {
        await Promise.all(validations.map(validation => validation.run(req)));

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            let path = null;
            if (redirectOnError) {
                path = typeof redirectOnError === 'function' ? redirectOnError(req) : redirectOnError;
            }
            if (path) {
                const msg = errors.array().map(e => e.msg).join(' ');
                const base = String(path).split('#')[0];
                const sep = base.includes('?') ? '&' : '?';
                return res.redirect(`${base}${sep}error=${encodeURIComponent(msg)}`);
            }
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        next();
    };
};

// Common validation rules
const userValidation = {
    registration: [
        body('firstName')
            .trim()
            .isLength({ min: 2, max: 50 })
            .withMessage('First name must be between 2 and 50 characters')
            .matches(/^[a-zA-Z\s]+$/)
            .withMessage('First name can only contain letters and spaces'),
        
        body('lastName')
            .trim()
            .isLength({ min: 2, max: 50 })
            .withMessage('Last name must be between 2 and 50 characters')
            .matches(/^[a-zA-Z\s]+$/)
            .withMessage('Last name can only contain letters and spaces'),
        
        body('username')
            .trim()
            .isLength({ min: 3, max: 50 })
            .withMessage('Username must be between 3 and 50 characters')
            .matches(/^[a-zA-Z0-9_@.]+$/)
            .withMessage('Username can only contain letters, numbers, underscores, @, and dots'),
        
        body('password')
            .isLength({ min: 6 })
            .withMessage('Password must be at least 6 characters long'),
        
        body('phoneNumber')
            .trim()
            .matches(phoneRegex)
            .withMessage('Phone number must be 10 digits (optional +91)'),
        
        body('societyName')
            .trim()
            .notEmpty()
            .withMessage('Society name is required'),
        
        body('flatNumber')
            .trim()
            .notEmpty()
            .withMessage('Flat number is required')
            .matches(flatRegex)
            .withMessage('Flat number is invalid'),
        body('occupancyStatus')
            .optional()
            .isIn(['Owner', 'Rented'])
            .withMessage('Occupancy status must be Owner or Rented')
    ],

    profileUpdate: [
        body('firstName')
            .trim()
            .notEmpty()
            .withMessage('First name is required')
            .isLength({ min: 2, max: 50 })
            .withMessage('First name must be between 2 and 50 characters')
            .matches(nameRegex)
            .withMessage('First name can only contain letters and spaces'),
        
        body('lastName')
            .trim()
            .notEmpty()
            .withMessage('Last name is required')
            .isLength({ min: 2, max: 50 })
            .withMessage('Last name must be between 2 and 50 characters')
            .matches(nameRegex)
            .withMessage('Last name can only contain letters and spaces'),
        
        body('phoneNumber')
            .trim()
            .matches(phoneRegex)
            .withMessage('Phone number must be 10 digits (optional +91)'),
        body('flatNumber')
            .trim()
            .notEmpty()
            .withMessage('Flat number is required')
            .matches(flatRegex)
            .withMessage('Flat number is invalid'),
        body('occupancyStatus')
            .optional()
            .isIn(['Owner', 'Rented'])
            .withMessage('Occupancy status must be Owner or Rented')
    ],
    newRequest: [
        body('firstName').trim().isLength({ min: 2, max: 50 }).matches(nameRegex),
        body('lastName').trim().isLength({ min: 2, max: 50 }).matches(nameRegex),
        body('phoneNumber').trim().matches(phoneRegex),
        body('societyName').trim().isLength({ min: 2, max: 120 }),
        body('flatNumber').trim().matches(flatRegex),
        body('occupancyStatus')
            .optional()
            .isIn(['Owner', 'Rented'])
            .withMessage('Occupancy status must be Owner or Rented')
    ],
    forgotPassword: [
        body('username')
            .trim()
            .isEmail()
            .withMessage('Valid email is required')
            .isLength({ max: 120 })
            .withMessage('Email is too long')
    ],
    registerPreview: [
        body('firstName').trim().isLength({ min: 2, max: 50 }).matches(nameRegex),
        body('lastName').trim().isLength({ min: 2, max: 50 }).matches(nameRegex),
        body('phoneNumber').trim().matches(phoneRegex),
        body('flatNumber').trim().matches(flatRegex),
        body('societyName').trim().isLength({ min: 3, max: 120 }),
        body('address').trim().isLength({ min: 5, max: 200 }),
        body('city').trim().isLength({ min: 2, max: 60 }).matches(nameRegex),
        body('state').trim().isLength({ min: 2, max: 60 }).matches(nameRegex),
        body('postalCode').trim().matches(pinRegex).withMessage('Postal code must be 6 digits'),
        body('username').trim().isEmail().isLength({ max: 120 }),
        body('password').isLength({ min: 6, max: 128 })
    ]
};

const billAmountFieldNames = [
    'societyCharges',
    'repairsAndMaintenance',
    'sinkingFund',
    'waterCharges',
    'insuranceCharges',
    'parkingCharges',
    'electricityCharges',
    'gasCharges',
    'liftCharges',
    'otherCharges'
];

const billValidation = {
    editBill: billAmountFieldNames.map((field) =>
        body(field)
            .notEmpty()
            .withMessage(`${field} is required`)
            .isFloat({ min: 0 })
            .withMessage(`${field} must be a non-negative number`)
    )
};

const miscValidation = {
    noticeCreate: [
        body('subject').trim().isLength({ min: 3, max: 120 }).withMessage('Subject must be 3–120 characters'),
        body('details').trim().isLength({ min: 5, max: 2000 }).withMessage('Details must be 5–2000 characters')
    ],
    indexBodyKey: (key) => [
        body(key)
            .trim()
            .notEmpty()
            .withMessage(`${key} is required`)
            .isInt({ min: 0 })
            .withMessage(`${key} must be a valid index`)
    ],
    userDelete: [
        body('userId').trim().isMongoId().withMessage('Invalid userId')
    ],
    userApproval: [
        body('userId').optional({ values: 'falsy' }).trim().isMongoId().withMessage('Invalid userId'),
        body('userIds').optional({ values: 'falsy' }).isArray({ min: 1 }),
        body('userIds.*').optional({ values: 'falsy' }).trim().isMongoId()
    ],
    editCommittee: [
        body('members')
            .optional()
            .custom((value) => {
                if (value == null) return true;
                if (Array.isArray(value)) return true;
                if (typeof value === 'object' && !Array.isArray(value)) return true;
                throw new Error('Invalid committee members format');
            }),
        body('members')
            .optional()
            .custom((value) => {
                if (!value || typeof value !== 'object') return true;
                const members = Object.values(value);
                for (const m of members) {
                    if (!m || typeof m !== 'object') continue;
                    const name = String(m.name || '').trim();
                    const role = String(m.role || '').trim();
                    const phone = String(m.phone || '').trim();
                    const email = String(m.email || '').trim();
                    const flat = String(m.flatNumber || '').trim();

                    if (name && (!nameRegex.test(name) || name.length < 2 || name.length > 60)) {
                        throw new Error('Committee member name must be 2-60 valid characters');
                    }
                    if (role && role.length > 50) {
                        throw new Error('Committee member role is too long');
                    }
                    if (phone && !phoneRegex.test(phone)) {
                        throw new Error('Committee member phone must be valid 10-digit number');
                    }
                    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                        throw new Error('Committee member email is invalid');
                    }
                    if (flat && !flatRegex.test(flat)) {
                        throw new Error('Committee member flat number is invalid');
                    }
                }
                return true;
            }),
    ],
    editContacts: [
        body('plumbingServiceName')
            .optional({ checkFalsy: true })
            .trim()
            .isLength({ min: 2, max: 60 })
            .withMessage('Plumbing Service name must be 2–60 characters')
            .matches(nameRegex)
            .withMessage('Plumbing Service name contains invalid characters'),
        body('plumbingService').trim().matches(contactPhoneRegex).withMessage('Plumbing Service number is invalid'),

        body('medicineShopName')
            .optional({ checkFalsy: true })
            .trim()
            .isLength({ min: 2, max: 60 })
            .withMessage('Pharmacy name must be 2–60 characters')
            .matches(nameRegex)
            .withMessage('Pharmacy name contains invalid characters'),
        body('medicineShop').trim().matches(contactPhoneRegex).withMessage('Pharmacy number is invalid'),

        body('ambulanceName')
            .optional({ checkFalsy: true })
            .trim()
            .isLength({ min: 2, max: 60 })
            .withMessage('Ambulance name must be 2–60 characters')
            .matches(nameRegex)
            .withMessage('Ambulance name contains invalid characters'),
        body('ambulance').trim().matches(contactPhoneRegex).withMessage('Ambulance number is invalid'),

        body('doctorName')
            .optional({ checkFalsy: true })
            .trim()
            .isLength({ min: 2, max: 60 })
            .withMessage('Doctor name must be 2–60 characters')
            .matches(nameRegex)
            .withMessage('Doctor name contains invalid characters'),
        body('doctor').trim().matches(contactPhoneRegex).withMessage('Doctor number is invalid'),

        body('fireStationName')
            .optional({ checkFalsy: true })
            .trim()
            .isLength({ min: 2, max: 60 })
            .withMessage('Fire Station name must be 2–60 characters')
            .matches(nameRegex)
            .withMessage('Fire Station name contains invalid characters'),
        body('fireStation').trim().matches(contactPhoneRegex).withMessage('Fire Station number is invalid'),

        body('policeStationName')
            .optional({ checkFalsy: true })
            .trim()
            .isLength({ min: 2, max: 60 })
            .withMessage('Police Station name must be 2–60 characters')
            .matches(nameRegex)
            .withMessage('Police Station name contains invalid characters'),
        body('policeStation').trim().matches(contactPhoneRegex).withMessage('Police Station number is invalid'),

        body('guardName')
            .optional({ checkFalsy: true })
            .trim()
            .isLength({ min: 2, max: 60 })
            .withMessage('Guard name must be 2–60 characters')
            .matches(nameRegex)
            .withMessage('Guard name contains invalid characters'),
        body('guard').trim().matches(contactPhoneRegex).withMessage('Guard number is invalid'),

        body('electricianName')
            .optional({ checkFalsy: true })
            .trim()
            .isLength({ min: 2, max: 60 })
            .withMessage('Electrician name must be 2–60 characters')
            .matches(nameRegex)
            .withMessage('Electrician name contains invalid characters'),
        body('electrician').trim().matches(contactPhoneRegex).withMessage('Electrician number is invalid')
    ],
    overrideBill: [
        body('userId').trim().isMongoId().withMessage('Invalid userId'),
        body('amount').optional({ checkFalsy: true }).isFloat({ min: 0 }),
        body('note').optional({ checkFalsy: true }).trim().isLength({ max: 250 })
    ],
    createGuard: [
        body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters'),
        body('email').trim().isEmail().withMessage('Valid email is required').isLength({ max: 120 }),
        body('password').isLength({ min: 6, max: 128 }).withMessage('Password must be 6–128 characters'),
    ],
    visitorCreate: [
        body('name')
            .trim()
            .isLength({ min: 2, max: 80 })
            .withMessage('Visitor name must be 2–80 characters')
            .matches(/^[a-zA-Z][a-zA-Z\s.'-]*$/)
            .withMessage('Visitor name contains invalid characters'),
        body('phone').trim().matches(/^\d{10}$/).withMessage('Phone number must be exactly 10 digits'),
        body('flatNumber')
            .trim()
            .matches(flatRegex)
            .withMessage('Flat number is invalid'),
        body('vehicleNumber')
            .optional({ checkFalsy: true })
            .trim()
            .isLength({ max: 15 })
            .withMessage('Vehicle number is too long'),
        body('purpose')
            .optional({ checkFalsy: true })
            .trim()
            .isLength({ max: 120 })
            .withMessage('Purpose must be at most 120 characters')
    ]
};

const complaintValidation = {
    create: [
        body('category')
            .trim()
            .notEmpty()
            .withMessage('Category is required')
            .isIn(['Plumbing', 'Electrical', 'Carpentry', 'Cleaning', 'Security', 'Other'])
            .withMessage('Invalid category'),
        
        body('type')
            .trim()
            .notEmpty()
            .withMessage('Type is required')
            .isIn(['Community', 'Personal'])
            .withMessage('Type must be Community or Personal'),
        
        body('description')
            .trim()
            .isLength({ min: 10, max: 3000 })
            .withMessage('Description must be between 10 and 3000 characters')
    ]
};

// Sanitization middleware
const sanitizeInput = (req, res, next) => {
    // Sanitize body
    if (req.body) {
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string') {
                req.body[key] = req.body[key].trim();
            }
        });
    }

    // Sanitize params
    if (req.params) {
        Object.keys(req.params).forEach(key => {
            if (typeof req.params[key] === 'string') {
                req.params[key] = req.params[key].trim();
            }
        });
    }

    // Sanitize query
    if (req.query) {
        Object.keys(req.query).forEach(key => {
            if (typeof req.query[key] === 'string') {
                req.query[key] = req.query[key].trim();
            }
        });
    }

    next();
};

module.exports = {
    validateInput,
    sanitizeInput,
    userValidation,
    billValidation,
    complaintValidation,
    miscValidation
};
