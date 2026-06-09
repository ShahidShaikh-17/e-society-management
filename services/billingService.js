const { MonthlyConfig } = require('../models/monthlyConfigModel');
const { ResidentBill } = require('../models/residentBillModel');
const { Payment } = require('../models/paymentModel');
const { isMonthStarted } = require('../utils/monthUtils');
const { resolveRole } = require('../utils/resolveRole');

const BILLING_ROLES = ['admin', 'owner', 'tenant'];

function isBillingEligibleRole(role) {
    return BILLING_ROLES.includes(role);
}

function isBillingEligibleUser(user) {
    return isBillingEligibleRole(resolveRole(user));
}

function sumMaintenanceBill(maintenanceBill) {
    if (!maintenanceBill) return 0;
    return Object.values(maintenanceBill)
        .filter((v) => typeof v === 'number')
        .reduce((s, v) => s + v, 0);
}

function syncBillComputedFields(bill) {
    const amt = Number(bill.amount) || 0;
    const paid = Number(bill.totalPaid) || 0;
    const due = Math.max(0, amt - paid);
    bill.dueAmount = due;
    if (amt <= 0 || paid >= amt) bill.status = 'paid';
    else if (paid > 0) bill.status = 'partial';
    else bill.status = 'unpaid';
}

/**
 * @param {string} societyName
 * @param {string} monthKey YYYY-MM
 * @param {import('mongoose').Model} SocietyModel
 */
async function ensureMonthlyConfig(societyName, monthKey, SocietyModel) {
    let doc = await MonthlyConfig.findOne({ societyName, month: monthKey });
    const shouldLock = isMonthStarted(monthKey);

    if (doc) {
        if (shouldLock && !doc.isLocked) {
            doc.isLocked = true;
            await doc.save();
        }
        return doc;
    }

    const society = await SocietyModel.findOne({ societyName });
    const defaultAmount = sumMaintenanceBill(society?.maintenanceBill);

    doc = await MonthlyConfig.create({
        societyName,
        month: monthKey,
        defaultAmount: defaultAmount || 0,
        isLocked: shouldLock,
    });
    return doc;
}

/**
 * Create missing resident bills for an existing config (skips users who already have a bill).
 */
async function syncResidentBillsForMonth(societyName, monthKey, UserModel, defaultAmount) {
    const users = await UserModel.find({
        societyName,
        validation: 'approved',
        role: { $in: BILLING_ROLES },
    });
    for (const u of users) {
        const existing = await ResidentBill.findOne({ userId: u._id, month: monthKey });
        if (existing) continue;
        const amt = Number(defaultAmount) || 0;
        await ResidentBill.create({
            userId: u._id,
            societyName,
            month: monthKey,
            amount: amt,
            totalPaid: 0,
            dueAmount: amt,
            status: amt <= 0 ? 'paid' : 'unpaid',
            override: false,
        });
    }
}

/**
 * @param {import('mongoose').Document} user
 * @param {string} monthKey
 * @param {import('mongoose').Document} config MonthlyConfig doc
 */
async function ensureBillForUser(user, monthKey, config) {
    if (!isBillingEligibleUser(user)) {
        throw new Error('Billing is not applicable for this user role');
    }

    let bill = await ResidentBill.findOne({ userId: user._id, month: monthKey });
    if (bill) {
        syncBillComputedFields(bill);
        await bill.save();
        return bill;
    }
    const amt = Number(config.defaultAmount) || 0;
    bill = await ResidentBill.create({
        userId: user._id,
        societyName: user.societyName,
        month: monthKey,
        amount: amt,
        totalPaid: 0,
        dueAmount: amt,
        status: amt <= 0 ? 'paid' : 'unpaid',
        override: false,
    });
    return bill;
}

async function cleanupGuardBillingData(societyName, UserModel) {
    const guards = await UserModel.find({
        societyName,
        role: 'guard',
    }).select('_id');

    if (!guards.length) return { deletedBills: 0, deletedPayments: 0 };

    const guardUserIds = guards.map((g) => g._id);
    const guardBills = await ResidentBill.find({ societyName, userId: { $in: guardUserIds } }).select('_id');
    const guardBillIds = guardBills.map((b) => b._id);

    const paymentWhere = guardBillIds.length
        ? { $or: [{ userId: { $in: guardUserIds } }, { billId: { $in: guardBillIds } }] }
        : { userId: { $in: guardUserIds } };

    const paymentDeleteResult = await Payment.deleteMany(paymentWhere);
    const billDeleteResult = await ResidentBill.deleteMany({ societyName, userId: { $in: guardUserIds } });

    return {
        deletedBills: billDeleteResult.deletedCount || 0,
        deletedPayments: paymentDeleteResult.deletedCount || 0,
    };
}

async function setBillOverride(userId, societyName, monthKey, newAmount, SocietyModel) {
    const config = await ensureMonthlyConfig(societyName, monthKey, SocietyModel);
    let bill = await ResidentBill.findOne({ userId, month: monthKey });
    const amt = Number(newAmount);
    if (!Number.isFinite(amt) || amt < 0) throw new Error('Invalid bill amount');

    if (!bill) {
        bill = await ResidentBill.create({
            userId,
            societyName,
            month: monthKey,
            amount: amt,
            totalPaid: 0,
            override: true,
        });
    } else {
        bill.amount = amt;
        bill.override = true;
    }
    syncBillComputedFields(bill);
    await bill.save();
    return { bill, config };
}

async function recordPaymentOnBill(bill, { userId, amount, method, receivedBy }) {
    const payAmt = Number(amount);
    if (!Number.isFinite(payAmt) || payAmt <= 0) throw new Error('Invalid payment amount');

    syncBillComputedFields(bill);
    if (payAmt > bill.dueAmount + 0.0001) throw new Error('Amount exceeds outstanding due');

    if (method === 'cash' && !receivedBy) throw new Error('Cash payment requires admin receiver');

    await Payment.create({
        billId: bill._id,
        userId,
        amount: payAmt,
        method,
        receivedBy: method === 'cash' ? receivedBy : null,
        paidAt: new Date(),
    });

    bill.totalPaid = (Number(bill.totalPaid) || 0) + payAmt;
    syncBillComputedFields(bill);
    await bill.save();
    return bill;
}

async function clearBillOverride(userId, societyName, monthKey, SocietyModel) {
    const config = await ensureMonthlyConfig(societyName, monthKey, SocietyModel);
    const bill = await ResidentBill.findOne({ userId, month: monthKey });
    if (!bill) return { bill: null, config };

    bill.amount = Number(config.defaultAmount) || 0;
    bill.override = false;
    syncBillComputedFields(bill);
    await bill.save();
    return { bill, config };
}

async function listPaymentsForUser(userId, limit = 100) {
    return Payment.find({ userId })
        .sort({ paidAt: -1 })
        .limit(limit)
        .populate('billId', 'month amount status')
        .lean();
}

async function getDueForUserMonth(userId, monthKey) {
    const bill = await ResidentBill.findOne({ userId, month: monthKey });
    if (!bill) return 0;
    syncBillComputedFields(bill);
    await bill.save();
    return bill.dueAmount;
}

module.exports = {
    BILLING_ROLES,
    isBillingEligibleRole,
    isBillingEligibleUser,
    sumMaintenanceBill,
    syncBillComputedFields,
    ensureMonthlyConfig,
    syncResidentBillsForMonth,
    cleanupGuardBillingData,
    ensureBillForUser,
    setBillOverride,
    clearBillOverride,
    recordPaymentOnBill,
    listPaymentsForUser,
    getDueForUserMonth,
};
