const express = require('express');
const authController = require('../controllers/authController');
const { validateInput, userValidation } = require('../middleware/validation');

const router = express.Router();

router.get('/', authController.renderIndex);

router.get('/login', authController.renderLogin);
router.post('/login', authController.login);
router.get('/loginFailure', authController.renderLoginFailure);
router.get('/logout', authController.logout);

router.get('/forgot-password', authController.renderForgotPassword);
router.post(
    '/forgot-password',
    validateInput(userValidation.forgotPassword, '/forgot-password'),
    authController.submitForgotPassword
);

router.get('/signup', authController.renderSignup);
router.post('/signup', validateInput(userValidation.registration, '/signup'), authController.submitSignup);

router.get('/register', authController.renderRegister);
router.post(
    '/register-preview',
    validateInput(userValidation.registerPreview, '/register'),
    authController.renderRegisterPreview
);
router.post('/create-registration-checkout', authController.createRegistrationCheckout);
router.get('/registration-success', authController.registrationSuccess);
router.get('/registration-failed', authController.registrationFailed);

router.get('/home', authController.renderHome);
router.get('/newRequest', authController.renderNewRequest);
router.post('/newRequest', validateInput(userValidation.newRequest, '/newRequest'), authController.submitNewRequest);

router.get('/health', authController.health);

module.exports = router;

