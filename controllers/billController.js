const user_collection = require('../models/userModel');
const society_collection = require('../models/societyModel');
const { ResidentBill } = require('../models/residentBillModel');
const { Payment } = require('../models/paymentModel');
const billingService = require('../services/billingService');
const { toMonthKey, monthKeyToDisplay } = require('../utils/monthUtils');
const mongoose = require('mongoose');
const { asyncHandler } = require('../middleware/asyncHandler');
const stripeSecretKey = process.env.SECRET_KEY || process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? require('stripe')(stripeSecretKey) : null;

const renderBill = asyncHandler(async (req, res) => {
    if (req.resolvedRole === 'guard') {
        return res.status(403).send('Billing is not available for guard accounts.');
    }

    const foundUser = await user_collection.User.findById(req.user.id);
    if (!foundUser) return res.status(500).send('User not found');
    if (!billingService.isBillingEligibleUser(foundUser)) {
        return res.status(403).send('Billing is not applicable for this account.');
    }

    const foundSociety = await society_collection.Society.findOne({ societyName: foundUser.societyName });
    if (!foundSociety) return res.status(500).send('Society not found');

    const now = new Date();
    const monthKey = toMonthKey(now);
    const config = await billingService.ensureMonthlyConfig(
        foundUser.societyName,
        monthKey,
        society_collection.Society
    );
    await billingService.cleanupGuardBillingData(foundUser.societyName, user_collection.User);
    await billingService.syncResidentBillsForMonth(
        foundUser.societyName,
        monthKey,
        user_collection.User,
        config.defaultAmount
    );

    const bill = await billingService.ensureBillForUser(foundUser, monthKey, config);
    const { monthName, year } = monthKeyToDisplay(monthKey);
    const latestPayment = await Payment.findOne({ billId: bill._id }).sort({ paidAt: -1 }).lean();
    const currentOverride = (foundUser.billOverrides || []).find(
        (o) => o && String(o.month) === String(monthName) && Number(o.year) === Number(year)
    );

    const foundUsers = await user_collection.User.find({
        $and: [{ societyName: req.user.societyName }, { validation: 'approved' }],
    });

    const todayStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

    res.render('bill', {
        resident: foundUser,
        society: foundSociety,
        residentBill: bill,
        monthlyConfig: config,
        totalAmount: bill.dueAmount,
        pendingDue: 0,
        creditBalance: 0,
        monthName,
        date: todayStr,
        year,
        monthKey,
        receipt: {
            invoice: latestPayment ? latestPayment._id.toString().slice(-8).toUpperCase() : '',
            date: latestPayment?.paidAt || bill.updatedAt || now,
            amount: latestPayment?.amount || bill.totalPaid || 0,
            month: monthName,
            year,
            billDetails: foundSociety?.maintenanceBill || {},
        },
        societyResidents: foundUsers,
        monthlyTotal: config.defaultAmount,
        useNewBilling: true,
        currentOverride,
        stripePublishableKey: process.env.PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || '',
        stripeEnabled: Boolean(stripe),
    });
});

const payOnline = asyncHandler(async (req, res) => {
    if (req.resolvedRole === 'guard') {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const foundUser = await user_collection.User.findById(req.user.id);
    if (!foundUser) return res.status(404).json({ success: false, message: 'User not found' });
    if (!billingService.isBillingEligibleUser(foundUser)) {
        return res.status(403).json({ success: false, message: 'Billing is not applicable for this account.' });
    }

    const monthKey = toMonthKey(new Date());
    const config = await billingService.ensureMonthlyConfig(
        foundUser.societyName,
        monthKey,
        society_collection.Society
    );
    await billingService.cleanupGuardBillingData(foundUser.societyName, user_collection.User);
    const bill = await billingService.ensureBillForUser(foundUser, monthKey, config);
    billingService.syncBillComputedFields(bill);
    await bill.save();

    if (bill.dueAmount <= 0) {
        if (req.accepts('html')) return res.redirect('/bill');
        return res.json({ success: true, message: 'Nothing due' });
    }

    const amount = bill.dueAmount;
    await billingService.recordPaymentOnBill(bill, {
        userId: foundUser._id,
        amount,
        method: 'online',
        receivedBy: null,
    });

    if (req.accepts('html')) return res.redirect('/payment-history?paid=1');
    return res.json({ success: true, amount });
});

const createOnlineCheckout = asyncHandler(async (req, res) => {
    if (!stripe) {
        return res.status(503).json({
            success: false,
            error: 'Payments are temporarily unavailable. Stripe secret key is not configured.',
        });
    }
    if (req.resolvedRole === 'guard') {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const foundUser = await user_collection.User.findById(req.user.id);
    if (!foundUser) return res.status(404).json({ success: false, error: 'User not found' });
    if (!billingService.isBillingEligibleUser(foundUser)) {
        return res.status(403).json({ success: false, error: 'Billing is not applicable for this account.' });
    }

    const monthKey = toMonthKey(new Date());
    const config = await billingService.ensureMonthlyConfig(foundUser.societyName, monthKey, society_collection.Society);
    await billingService.cleanupGuardBillingData(foundUser.societyName, user_collection.User);
    const bill = await billingService.ensureBillForUser(foundUser, monthKey, config);
    billingService.syncBillComputedFields(bill);
    await bill.save();

    if (bill.dueAmount <= 0) {
        return res.status(400).json({ success: false, error: 'No outstanding amount for this month.' });
    }

    const unitAmount = Math.round(Number(bill.dueAmount) * 100);
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
            {
                price_data: {
                    currency: 'inr',
                    product_data: {
                        name: `Maintenance Bill - ${monthKey}`,
                        description: `${foundUser.societyName} | Flat ${foundUser.flatNumber || '-'}`,
                    },
                    unit_amount: unitAmount,
                },
                quantity: 1,
            },
        ],
        mode: 'payment',
        success_url: `${req.protocol}://${req.get('host')}/billing/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.protocol}://${req.get('host')}/bill?payment=cancelled`,
        metadata: {
            billing_type: 'monthly_maintenance',
            userId: String(foundUser._id),
            billId: String(bill._id),
            monthKey,
        },
    });

    return res.json({ success: true, id: session.id });
});

const onlinePaymentSuccess = asyncHandler(async (req, res) => {
    if (!stripe) return res.redirect('/bill?payment=unavailable');
    const sessionId = String(req.query.session_id || '').trim();
    if (!sessionId) return res.redirect('/bill?payment=failed');

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session || session.payment_status !== 'paid') return res.redirect('/bill?payment=failed');

    const targetUserId = session.metadata?.userId;
    if (!targetUserId || String(targetUserId) !== String(req.user.id)) {
        return res.redirect('/bill?payment=forbidden');
    }

    const foundUser = await user_collection.User.findById(req.user.id);
    if (!foundUser) return res.redirect('/login');

    const monthKey = session.metadata?.monthKey || toMonthKey(new Date());
    const config = await billingService.ensureMonthlyConfig(foundUser.societyName, monthKey, society_collection.Society);
    await billingService.cleanupGuardBillingData(foundUser.societyName, user_collection.User);
    const bill = await billingService.ensureBillForUser(foundUser, monthKey, config);
    billingService.syncBillComputedFields(bill);
    await bill.save();

    if (bill.dueAmount <= 0) return res.redirect('/bill?payment=already-recorded');

    const paidAmount = Number(session.amount_total || 0) / 100;
    const amountToRecord = Math.min(bill.dueAmount, paidAmount);
    if (amountToRecord <= 0) return res.redirect('/bill?payment=failed');

    await billingService.recordPaymentOnBill(bill, {
        userId: foundUser._id,
        amount: amountToRecord,
        method: 'online',
        receivedBy: null,
    });

    return res.redirect('/bill?payment=success');
});

const renderPaymentHistory = asyncHandler(async (req, res) => {
    if (req.resolvedRole === 'guard') {
        return res.status(403).send('Not available for guard accounts.');
    }

    const foundUser = await user_collection.User.findById(req.user.id);
    if (!foundUser) return res.redirect('/login');

    const payments = await billingService.listPaymentsForUser(foundUser._id, 200);
    const totalPaidSum = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const unpaidCount = await ResidentBill.countDocuments({
        userId: foundUser._id,
        dueAmount: { $gt: 0 },
    });
    res.render('paymentHistory', {
        paidCount: payments.length,
        unpaidCount,
        totalPaid: totalPaidSum,
        isAdmin: foundUser.isAdmin,
        paymentHistory: payments.map((p) => {
            const mk = p.billId && p.billId.month;
            const disp = mk ? monthKeyToDisplay(mk) : { monthName: '-', year: '' };
            return {
                invoice: p._id.toString().slice(-8).toUpperCase(),
                amount: p.amount,
                date: p.paidAt,
                month: disp.monthName,
                year: disp.year,
                status: 'paid',
                method: p.method,
            };
        }),
        useNewBilling: true,
    });
});

const recordCashPayment = asyncHandler(async (req, res) => {
    const { userId, monthKey, amount } = req.body;
    if (!mongoose.isValidObjectId(userId)) {
        return res.redirect('/residents-data?error=' + encodeURIComponent('Invalid resident'));
    }
    const target = await user_collection.User.findById(userId);
    if (!target || target.societyName !== req.user.societyName) {
        return res.redirect('/residents-data?error=' + encodeURIComponent('Invalid resident'));
    }
    if (!billingService.isBillingEligibleUser(target)) {
        return res.redirect('/residents-data?error=' + encodeURIComponent('Billing is not applicable for guard users'));
    }

    const mk = String(monthKey || '').trim() || toMonthKey(new Date());
    if (!/^\d{4}-\d{2}$/.test(mk)) {
        return res.redirect('/residents-data?error=' + encodeURIComponent('Invalid month'));
    }

    const payAmt = Number(amount);
    if (!Number.isFinite(payAmt) || payAmt <= 0) {
        return res.redirect('/residents-data?error=' + encodeURIComponent('Invalid amount'));
    }

    const config = await billingService.ensureMonthlyConfig(
        target.societyName,
        mk,
        society_collection.Society
    );
    await billingService.cleanupGuardBillingData(target.societyName, user_collection.User);
    await billingService.syncResidentBillsForMonth(
        target.societyName,
        mk,
        user_collection.User,
        config.defaultAmount
    );
    const bill = await billingService.ensureBillForUser(target, mk, config);

    await billingService.recordPaymentOnBill(bill, {
        userId: target._id,
        amount: payAmt,
        method: 'cash',
        receivedBy: req.user._id,
    });

    res.redirect('/residents-data?cashPaid=1');
});

module.exports = {
    renderBill,
    payOnline,
    createOnlineCheckout,
    onlinePaymentSuccess,
    renderPaymentHistory,
    recordCashPayment,
};
