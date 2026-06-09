const path = require('path');
const fs = require('fs');
const passport = require('passport');
const PDFDocument = require('pdfkit');
const user_collection = require('../models/userModel');
const society_collection = require('../models/societyModel');
const visit_collection = require('../models/visitModel');
const { asyncHandler } = require('../middleware/asyncHandler');

const stripeSecretKey = process.env.SECRET_KEY || process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? require('stripe')(stripeSecretKey) : null;

const renderIndex = asyncHandler(async (req, res) => {
    let pageVisit = await visit_collection.Visit.findOne();
    if (!pageVisit) pageVisit = new visit_collection.Visit({ count: 0 });
    if (process.env.NODE_ENV === 'production') pageVisit.count += 1;
    await pageVisit.save();

    const [societyCount, userCount, distinctCities] = await Promise.all([
        society_collection.Society.countDocuments({}),
        user_collection.User.countDocuments({}),
        society_collection.Society.distinct('societyAddress.city'),
    ]);
    const cityCount = (distinctCities || []).filter(Boolean).length;

    res.render('index', { city: cityCount, society: societyCount, user: userCount });
});

const renderLogin = (req, res) => res.render('login');
const renderForgotPassword = (req, res) => res.render('forgot-password');
const submitForgotPassword = (req, res) =>
    res.render('forgot-password', {
        success: true,
        message: 'Password reset link has been sent to your email!',
    });

const renderSignup = asyncHandler(async (req, res) => {
    const societies = await society_collection.Society.find();
    res.render('signup', { societies });
});

const renderRegister = (req, res) => res.render('register');

const renderHome = (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/login');
    if (req.user.validation === 'approved') {
        return res.render('home', { isAdmin: req.user.isAdmin, pageActive: 'home' });
    }
    if (req.user.validation === 'applied') {
        return res.render('homeStandby', {
            icon: 'fa-user-clock',
            title: 'Account pending for approval',
            content:
                'Your account will be active as soon as it is approved by your community.' +
                'It usually takes 1-2 days for approval. If it is taking longer to get approval, ' +
                'contact your society admin.',
        });
    }
    return res.render('homeStandby', {
        icon: 'fa-user-lock',
        title: 'Account approval declined',
        content:
            'Your account registration has been declined. ' +
            'Please contact the society administrator for more details.' +
            'You can edit the request and apply again.',
    });
};

const renderNewRequest = asyncHandler(async (req, res) => {
    if (!req.isAuthenticated() || req.user.validation === 'approved') return res.redirect('/home');
    const societies = await society_collection.Society.find();
    res.render('signupEdit', { user: req.user, societies });
});

const submitNewRequest = asyncHandler(async (req, res) => {
    const foundSociety = await society_collection.Society.findOne({ societyName: req.body.societyName });
    if (!foundSociety) {
        return res.render('failure', {
            message: 'Sorry, society is not registered, Please double-check society name.',
            href: '/newRequest',
            messageSecondary: 'Account not created?',
            hrefSecondary: '/signup',
            buttonSecondary: 'Create Account',
        });
    }

    await user_collection.User.updateOne(
        { _id: req.user.id },
        {
            $set: {
                firstName: req.body.firstName,
                lastName: req.body.lastName,
                phoneNumber: req.body.phoneNumber,
                societyName: req.body.societyName,
                flatNumber: req.body.flatNumber,
                occupancyStatus: req.body.occupancyStatus || 'Owner',
                role: (req.body.occupancyStatus || 'Owner') === 'Rented' ? 'tenant' : 'owner',
                validation: 'applied',
            },
        }
    );

    res.redirect('/home');
});

const submitSignup = asyncHandler(async (req, res) => {
    const foundSociety = await society_collection.Society.findOne({ societyName: req.body.societyName });
    if (!foundSociety) {
        return res.render('failure', {
            message: 'Sorry, society is not registered, Please double-check society name.',
            href: '/signup',
            messageSecondary: 'Society not registered?',
            hrefSecondary: '/register',
            buttonSecondary: 'Register Society',
        });
    }

    try {
        const user = await user_collection.User.register(
            {
                username: req.body.username,
                societyName: req.body.societyName,
                flatNumber: req.body.flatNumber,
                firstName: req.body.firstName,
                lastName: req.body.lastName,
                phoneNumber: req.body.phoneNumber,
                occupancyStatus: req.body.occupancyStatus || 'Owner',
                role: (req.body.occupancyStatus || 'Owner') === 'Rented' ? 'tenant' : 'owner',
            },
            req.body.password
        );

        await new Promise((resolve, reject) => {
            req.login(user, (err) => (err ? reject(err) : resolve()));
        });

        res.redirect('/home');
    } catch (err) {
        console.error(err);
        res.render('failure', {
            message: 'Sorry, this email address is not available. Please choose a different address.',
            href: '/signup',
            messageSecondary: 'Society not registered?',
            hrefSecondary: '/register',
            buttonSecondary: 'Register Society',
        });
    }
});

const renderLoginFailure = (req, res) =>
    res.render('failure', {
        message: 'Sorry, entered password was incorrect, Please double-check.',
        href: '/login',
        messageSecondary: 'Account not created?',
        hrefSecondary: '/signup',
        buttonSecondary: 'Create Account',
    });

const login = passport.authenticate('local', {
    successRedirect: '/home',
    failureRedirect: '/loginFailure',
});

const logout = (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/');
    });
};

const health = (req, res) => res.status(200).send('Server is running');

const renderRegisterPreview = (req, res) => {
    req.session.registrationData = {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        phoneNumber: req.body.phoneNumber,
        flatNumber: req.body.flatNumber,
        societyName: req.body.societyName,
        address: req.body.address,
        city: req.body.city,
        state: req.body.state,
        postalCode: req.body.postalCode,
        username: req.body.username,
        password: req.body.password,
    };

    res.render('register-preview', {
        registrationData: req.session.registrationData,
        registrationFee: 1000,
        stripePublishableKey: process.env.PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || '',
    });
};

const createRegistrationCheckout = asyncHandler(async (req, res) => {
    if (!req.session.registrationData) return res.redirect('/register');
    if (!stripe) {
        return res.status(503).json({
            error: 'Payments are temporarily unavailable. Stripe secret key is not configured.',
            code: 'STRIPE_NOT_CONFIGURED',
        });
    }

    const registrationFee = 1000;
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
            {
                price_data: {
                    currency: 'inr',
                    product_data: {
                        name: 'Society Registration Fee',
                        description: `Registration fee for ${req.session.registrationData.societyName}`,
                        images: [
                            'https://www.flaticon.com/svg/vstatic/svg/3800/3800518.svg?token=exp=1615226542~hmac=7b5bcc7eceab928716515ebf044f16cd',
                        ],
                    },
                    unit_amount: registrationFee * 100,
                },
                quantity: 1,
            },
        ],
        mode: 'payment',
        success_url: `${req.protocol}://${req.get('host')}/registration-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.protocol}://${req.get('host')}/registration-failed`,
        metadata: { registration_type: 'society_registration' },
    });

    res.json({ id: session.id });
});

const registrationSuccess = asyncHandler(async (req, res) => {
    if (!req.session.registrationData) return res.redirect('/register');
    if (!stripe) {
        return res.redirect('/registration-failed');
    }
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
    if (session.payment_status !== 'paid') return res.redirect('/registration-failed');

    const registrationData = req.session.registrationData;
    const existingSociety = await society_collection.Society.findOne({ societyName: registrationData.societyName });

    if (existingSociety) {
        delete req.session.registrationData;
        return res.render('failure', {
            message: 'Society registration failed - society already exists.',
            href: '/register',
            messageSecondary: 'Try again',
            hrefSecondary: '/register',
            buttonSecondary: 'Register Again',
        });
    }

    let user;
    try {
        user = await user_collection.User.register(
            {
                validation: 'approved',
                isAdmin: true,
                role: 'admin',
                username: registrationData.username,
                societyName: registrationData.societyName,
                flatNumber: registrationData.flatNumber,
                firstName: registrationData.firstName,
                lastName: registrationData.lastName,
                phoneNumber: registrationData.phoneNumber,
            },
            registrationData.password
        );
    } catch (error) {
        if (
            (error.message && error.message.includes('already registered')) ||
            error.name === 'UserExistsError' ||
            error.constructor.name === 'UserExistsError'
        ) {
            user = await user_collection.User.findOne({ username: registrationData.username });
            if (!user) throw new Error('User registration conflict');
        } else {
            throw error;
        }
    }

    const society = new society_collection.Society({
        societyName: user.societyName,
        societyAddress: {
            address: registrationData.address,
            city: registrationData.city,
            district: registrationData.state,
            postalCode:
                registrationData.postalCode === 'Unknown'
                    ? null
                    : Number(registrationData.postalCode) || null,
        },
        admin: user.username,
    });

    await society.save();

    const invoiceNumber = 'REG' + Date.now().toString().slice(-8);
    const receiptsDir = path.join(__dirname, '..', 'receipts');
    if (!fs.existsSync(receiptsDir)) fs.mkdirSync(receiptsDir);
    const pdfPath = path.join(receiptsDir, `${invoiceNumber}.pdf`);

    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(pdfPath));
    doc.fontSize(20).text('E-Society Registration Receipt', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12);
    doc.text(`Invoice Number: ${invoiceNumber}`);
    doc.text(`Date: ${new Date().toLocaleDateString()}`);
    doc.text(`Transaction ID: ${session.id}`);
    doc.moveDown();
    doc.fontSize(14).text('Society Registration Details:', { underline: true });
    doc.fontSize(12);
    doc.text(`Society Name: ${registrationData.societyName}`);
    doc.text(
        `Address: ${registrationData.address}, ${registrationData.city}, ${registrationData.state} - ${registrationData.postalCode}`
    );
    doc.moveDown();
    doc.fontSize(14).text('Administrator Details:', { underline: true });
    doc.fontSize(12);
    doc.text(`Name: ${registrationData.firstName} ${registrationData.lastName}`);
    doc.text(`Email: ${registrationData.username}`);
    doc.text(`Phone: ${registrationData.phoneNumber}`);
    doc.text(`Flat Number: ${registrationData.flatNumber}`);
    doc.moveDown();
    doc.fontSize(14).text('Payment Details:', { underline: true });
    doc.fontSize(12);
    doc.text(`Amount Paid: ₹${session.amount_total / 100}`);
    doc.text(`Payment Method: ${session.payment_method_types[0]}`);
    doc.text('Payment Status: Successful');
    doc.moveDown();
    doc.fontSize(10).text('Thank you for registering with E-Society!', { align: 'center' });
    doc.text('This receipt serves as proof of your society registration.', { align: 'center' });
    doc.end();

    delete req.session.registrationData;
    res.render('registration-success', {
        invoiceNumber,
        amount: session.amount_total / 100,
        societyName: registrationData.societyName,
        adminName: `${registrationData.firstName} ${registrationData.lastName}`,
        transactionDate: new Date(session.created * 1000).toLocaleString(),
        pdfPath: `/receipts/${invoiceNumber}.pdf`,
    });
});

const registrationFailed = (req, res) => {
    delete req.session.registrationData;
    res.render('failure', {
        message: 'Payment failed. Your society registration could not be completed.',
        href: '/register',
        messageSecondary: 'Try again',
        hrefSecondary: '/register',
        buttonSecondary: 'Register Again',
    });
};

module.exports = {
    renderIndex,
    renderLogin,
    renderForgotPassword,
    submitForgotPassword,
    renderSignup,
    submitSignup,
    renderRegister,
    renderHome,
    renderNewRequest,
    submitNewRequest,
    renderLoginFailure,
    login,
    logout,
    health,
    renderRegisterPreview,
    createRegistrationCheckout,
    registrationSuccess,
    registrationFailed,
};

