const XLSX = require('xlsx');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const user_collection = require('../models/userModel');
const society_collection = require('../models/societyModel');
const { ResidentBill } = require('../models/residentBillModel');
const { Payment } = require('../models/paymentModel');

const billingService = require('../services/billingService');
const { toMonthKey, monthKeyToDisplay, monthNameYearToKey } = require('../utils/monthUtils');
const { asyncHandler } = require('../middleware/asyncHandler');

const deprecated = (msg) => (req, res) =>
    res.status(410).json({ success: false, message: msg || 'Deprecated endpoint' });

const renderResidentsData = asyncHandler(async (req, res) => {
    const societyName = req.user.societyName;
    await billingService.cleanupGuardBillingData(societyName, user_collection.User);
    const residents = await user_collection.User.find({ societyName })
        .select('firstName lastName email username phoneNumber flatNumber occupancyStatus validation isAdmin role')
        .sort({ flatNumber: 1 })
        .lean();

    const now = new Date();
    const mk = toMonthKey(now);

    const config = await billingService.ensureMonthlyConfig(societyName, mk, society_collection.Society);
    await billingService.syncResidentBillsForMonth(societyName, mk, user_collection.User, config.defaultAmount);

    const residentBills = await ResidentBill.find({ societyName, month: mk }).lean();
    const byUserId = new Map(residentBills.map((b) => [b.userId.toString(), b]));

    const enriched = residents
        .filter((r) => (r.role || '').toLowerCase() !== 'guard')
        .map((r) => {
        const role = r.role || (r.isAdmin ? 'admin' : r.occupancyStatus === 'Rented' ? 'tenant' : 'owner');
        const isBillingApplicable = billingService.isBillingEligibleRole(role);
        const bill = byUserId.get(r._id.toString()) || null;
        const due = bill ? Number(bill.dueAmount || 0) : 0;
        return {
            ...r,
            role,
            isBillingApplicable,
            currentDue: r.validation === 'approved' && isBillingApplicable ? due : null,
            billStatus: isBillingApplicable ? bill?.status || null : null,
        };
    });

    const approved = enriched.filter((r) => r.validation === 'approved');
    const totalResidents = approved.length;
    const approvedResidents = approved.length;
    const overdueBills = approved.filter((r) => r.isBillingApplicable && (r.currentDue || 0) > 0).length;

    res.render('residentsData', {
        residents: enriched,
        totalResidents,
        approvedResidents,
        overdueBills,
        isAdmin: req.user.isAdmin,
        currentUser: req.user,
        currentMonthKey: mk,
        monthLabel: monthKeyToDisplay(mk),
    });
});

const approveResident = asyncHandler(async (req, res) => {
    const payloadUserIds = Array.isArray(req.body.userIds) ? req.body.userIds : null;
    const payloadUserId = req.body.userId;
    const legacyValidate = req.body.validate;

    let userIds = [];
    let validate_state = 'approved';

    if (payloadUserIds && payloadUserIds.length) userIds = payloadUserIds;
    else if (payloadUserId) userIds = [payloadUserId];
    else if (legacyValidate && typeof legacyValidate === 'object') {
        userIds = [Object.keys(legacyValidate)[0]];
        validate_state = Object.values(legacyValidate)[0] || 'approved';
    }

    if (!userIds.length) return res.status(400).json({ success: false, message: 'Missing userId(s)' });
    if (validate_state !== 'approved' && validate_state !== 'declined') validate_state = 'approved';

    await user_collection.User.updateMany(
        { _id: { $in: userIds }, societyName: req.user.societyName },
        { $set: { validation: validate_state } }
    );

    if (validate_state === 'approved') {
        const now = new Date();
        const mk = toMonthKey(now);
        const cfg = await billingService.ensureMonthlyConfig(req.user.societyName, mk, society_collection.Society);
        await billingService.syncResidentBillsForMonth(req.user.societyName, mk, user_collection.User, cfg.defaultAmount);

        // Set correct role for approved users (no legacy billing fields touched)
        const users = await user_collection.User.find({ _id: { $in: userIds }, societyName: req.user.societyName });
        for (const u of users) {
            if (u.role !== 'guard') {
                u.role = u.occupancyStatus === 'Rented' ? 'tenant' : 'owner';
            }
            await u.save();
        }
    }

    return res.json({ success: true, updated: userIds.length, validation: validate_state });
});

const rejectResident = asyncHandler(async (req, res) => {
    const userIds = Array.isArray(req.body.userIds) ? req.body.userIds : req.body.userId ? [req.body.userId] : [];
    if (!userIds.length) return res.status(400).json({ success: false, message: 'Missing userId(s)' });

    await user_collection.User.updateMany(
        { _id: { $in: userIds }, societyName: req.user.societyName },
        { $set: { validation: 'declined' } }
    );
    return res.json({ success: true, updated: userIds.length, validation: 'declined' });
});

const deleteResident = asyncHandler(async (req, res) => {
    const { userId } = req.body;
    if (String(userId) === String(req.user.id)) {
        return res.json({ success: false, message: 'You cannot delete your own account.' });
    }
    const userToDelete = await user_collection.User.findById(userId);
    if (!userToDelete) return res.json({ success: false, message: 'User not found.' });
    if (userToDelete.societyName !== req.user.societyName) {
        return res.json({ success: false, message: 'You can only delete users from your society.' });
    }
    await user_collection.User.findByIdAndDelete(userId);
    res.json({ success: true, message: 'Resident deleted successfully.' });
});

const exportResidents = asyncHandler(async (req, res) => {
    const { format, status, payment, search } = req.query;
    const societyName = req.user.societyName;

    const now = new Date();
    const mk = toMonthKey(now);
    const cfg = await billingService.ensureMonthlyConfig(societyName, mk, society_collection.Society);
    await billingService.cleanupGuardBillingData(societyName, user_collection.User);
    await billingService.syncResidentBillsForMonth(societyName, mk, user_collection.User, cfg.defaultAmount);

    const bills = await ResidentBill.find({ societyName, month: mk }).lean();
    const dueByUserId = new Map(bills.map((b) => [b.userId.toString(), Number(b.dueAmount || 0)]));

    let residents = await user_collection.User.find({
        societyName,
        role: { $ne: 'guard' },
    })
        .sort({ flatNumber: 1 })
        .lean();

    if (status) residents = residents.filter((r) => r.validation === status);
    if (payment) {
        residents = residents.filter((r) => {
            const role = r.role || (r.isAdmin ? 'admin' : r.occupancyStatus === 'Rented' ? 'tenant' : 'owner');
            const isBillingApplicable = billingService.isBillingEligibleRole(role);
            if (!isBillingApplicable) return payment === '';
            const due = r.validation === 'approved' ? (dueByUserId.get(r._id.toString()) ?? 0) : null;
            if (payment === 'paid') return due === 0;
            if (payment === 'unpaid') return (due || 0) > 0;
            return true;
        });
    }
    if (search) {
        const searchLower = String(search).toLowerCase();
        residents = residents.filter(
            (r) =>
                String(r.firstName || '').toLowerCase().includes(searchLower) ||
                String(r.lastName || '').toLowerCase().includes(searchLower) ||
                String(r.flatNumber || '').toLowerCase().includes(searchLower) ||
                String(r.email || '').toLowerCase().includes(searchLower)
        );
    }

    const exportData = residents.map((resident) => {
        const role = resident.role || (resident.isAdmin ? 'admin' : resident.occupancyStatus === 'Rented' ? 'tenant' : 'owner');
        const isBillingApplicable = billingService.isBillingEligibleRole(role);
        const due = resident.validation === 'approved' && isBillingApplicable ? (dueByUserId.get(resident._id.toString()) ?? 0) : 'N/A';
        const paymentStatus =
            !isBillingApplicable || resident.validation !== 'approved'
                ? 'N/A'
                : due > 0
                ? 'Unpaid'
                : 'Paid';
        return {
            'First Name': resident.firstName || '',
            'Last Name': resident.lastName || '',
            Email: resident.email || resident.username || '',
            'Mobile Number': resident.phoneNumber || '',
            'Flat Number': resident.flatNumber || '',
            'Society Name': resident.societyName || '',
            'Validation Status': resident.validation || '',
            Role: role || '',
            'Is Admin': resident.isAdmin ? 'Yes' : 'No',
            'Current Due': due,
            'Payment Status': paymentStatus,
            'Created Date': resident.createdAt ? new Date(resident.createdAt).toLocaleDateString() : '',
        };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [
        { wch: 15 },
        { wch: 15 },
        { wch: 25 },
        { wch: 15 },
        { wch: 12 },
        { wch: 20 },
        { wch: 15 },
        { wch: 10 },
        { wch: 12 },
        { wch: 14 },
        { wch: 15 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Residents');

    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `residents_${String(societyName).replace(/\s+/g, '_')}_${timestamp}`;

    if (format === 'csv') {
        const csv = XLSX.utils.sheet_to_csv(ws);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        return res.send(csv);
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    return res.send(buffer);
});

const renderEditBill = asyncHandler(async (req, res) => {
    const foundSociety = await society_collection.Society.findOne(
        { societyName: req.user.societyName },
        { maintenanceBill: 1 }
    );
    res.render('editBill', { maintenanceBill: foundSociety?.maintenanceBill || {} });
});

const saveEditBill = asyncHandler(async (req, res) => {
    await society_collection.Society.updateOne(
        { societyName: req.user.societyName },
        {
            $set: {
                maintenanceBill: {
                    societyCharges: req.body.societyCharges,
                    repairsAndMaintenance: req.body.repairsAndMaintenance,
                    sinkingFund: req.body.sinkingFund,
                    waterCharges: req.body.waterCharges,
                    insuranceCharges: req.body.insuranceCharges,
                    parkingCharges: req.body.parkingCharges,
                    electricityCharges: req.body.electricityCharges,
                    gasCharges: req.body.gasCharges,
                    liftCharges: req.body.liftCharges,
                    otherCharges: req.body.otherCharges,
                },
            },
        }
    );
    res.redirect('/billOverrides');
});

const renderBillOverrides = asyncHandler(async (req, res) => {
    const [users, foundSociety] = await Promise.all([
        user_collection.User.find({
            societyName: req.user.societyName,
            validation: 'approved',
            role: { $in: billingService.BILLING_ROLES },
        }),
        society_collection.Society.findOne({ societyName: req.user.societyName }),
    ]);
    const now = new Date();
    res.render('billOverrides', {
        users,
        societyBill: foundSociety ? foundSociety.maintenanceBill : {},
        isAdmin: req.user.isAdmin,
        currentMonth: now.toLocaleString('default', { month: 'long' }),
        currentYear: now.getFullYear(),
    });
});

const removeOverride = asyncHandler(async (req, res) => {
    const { userId } = req.query;
    const now = new Date();
    const currentMonth = now.toLocaleString('default', { month: 'long' });
    const currentYear = now.getFullYear();

    const foundUser = await user_collection.User.findById(userId);
    if (foundUser && foundUser.societyName === req.user.societyName) {
        const matchOverride = (o) => o && String(o.month) === currentMonth && Number(o.year) === currentYear;
        foundUser.billOverrides = (foundUser.billOverrides || []).filter((override) => !matchOverride(override));
        foundUser.markModified('billOverrides');
        await foundUser.save();
        await billingService.clearBillOverride(foundUser._id, foundUser.societyName, toMonthKey(now), society_collection.Society);
    }

    res.redirect('/billOverrides');
});

const overrideBill = asyncHandler(async (req, res) => {
    const { userId, amount, note, month, year } = req.body;
    const now = new Date();
    const currentMonth = month && String(month).trim() ? String(month).trim() : now.toLocaleString('default', { month: 'long' });
    const currentYear = year !== undefined && year !== '' ? Number(year) : now.getFullYear();

    const toNumber = (v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    };

    const foundUser = await user_collection.User.findById(userId);
    if (!foundUser || foundUser.societyName !== req.user.societyName) return res.status(404).send('User not found');
    if (!billingService.isBillingEligibleUser(foundUser)) {
        return res.status(400).send('Billing is not applicable for guard users');
    }

    if (!foundUser.billOverrides) foundUser.billOverrides = [];
    const numericAmount = toNumber(amount);
    const billDetails = {
        societyCharges: toNumber(req.body.societyCharges),
        repairsAndMaintenance: toNumber(req.body.repairsAndMaintenance),
        sinkingFund: toNumber(req.body.sinkingFund),
        waterCharges: toNumber(req.body.waterCharges),
        insuranceCharges: toNumber(req.body.insuranceCharges),
        parkingCharges: toNumber(req.body.parkingCharges),
        electricityCharges: toNumber(req.body.electricityCharges),
        gasCharges: toNumber(req.body.gasCharges),
        liftCharges: toNumber(req.body.liftCharges),
        otherCharges: toNumber(req.body.otherCharges),
        totalAmount: numericAmount,
    };

    const overrideData = {
        month: currentMonth,
        year: currentYear,
        amount: numericAmount,
        note: note || '',
        updatedAt: new Date(),
        updatedBy: (req.user.firstName || '') + ' ' + (req.user.lastName || ''),
        billDetails,
    };

    const matchOverride = (o) => o && String(o.month) === String(currentMonth) && Number(o.year) === Number(currentYear);
    const existingOverrideIndex = foundUser.billOverrides.findIndex(matchOverride);
    if (existingOverrideIndex >= 0) foundUser.billOverrides[existingOverrideIndex] = overrideData;
    else foundUser.billOverrides.push(overrideData);

    foundUser.markModified('billOverrides');
    await foundUser.save();

    const monthKey = monthNameYearToKey(currentMonth, currentYear);
    await billingService.setBillOverride(foundUser._id, foundUser.societyName, monthKey, numericAmount, society_collection.Society);

    res.redirect('/bill');
});

const residentPaymentHistory = asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.userId)) {
        return res.json({ success: false, message: 'Invalid resident' });
    }

    const resident = await user_collection.User.findById(req.params.userId);
    if (!resident) return res.json({ success: false, message: 'Resident not found' });
    if (resident.societyName !== req.user.societyName) return res.json({ success: false, message: 'Not authorized' });
    if (!billingService.isBillingEligibleUser(resident)) {
        return res.json({ success: true, history: [], residentName: `${resident.firstName} ${resident.lastName}` });
    }

    const newPayments = await Payment.find({ userId: resident._id })
        .sort({ paidAt: -1 })
        .limit(200)
        .populate('billId', 'month')
        .lean();

    const history = newPayments.map((p) => {
        const mk = p.billId?.month;
        const disp = mk ? monthKeyToDisplay(mk) : { monthName: '-', year: '' };
        return {
            invoice: p._id.toString().slice(-8).toUpperCase(),
            amount: p.amount,
            date: p.paidAt,
            month: disp.monthName,
            year: disp.year,
            status: 'paid',
            method: p.method || 'online',
        };
    });

    res.json({ success: true, history, residentName: `${resident.firstName} ${resident.lastName}` });
});

const sendPaymentReminder = asyncHandler(async (req, res) => {
    const { userId } = req.body;
    const resident = await user_collection.User.findById(userId);
    if (!resident || resident.societyName !== req.user.societyName) {
        return res.json({ success: false, message: 'Resident not found' });
    }
    res.json({ success: true, message: 'Reminder queued (stub)' });
});

const downloadReceiptPdf = asyncHandler(async (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '..', 'receipts', filename);
    if (!fs.existsSync(filePath)) return res.status(404).send('Receipt not found');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.sendFile(filePath, (err) => {
        if (err) res.status(500).send('Error downloading file');
    });
});

module.exports = {
    renderResidentsData,
    approveResident,
    rejectResident,
    deleteResident,
    exportResidents,
    listGuards: asyncHandler(async (req, res) => {
        const guards = await user_collection.User.find({
            societyName: req.user.societyName,
            role: 'guard',
            validation: 'approved',
        })
            .sort({ createdAt: -1 })
            .lean();

        res.render('adminGuards', {
            guards,
            isAdmin: true,
            error: req.query.error || '',
            success: req.query.success || '',
        });
    }),
    createGuard: asyncHandler(async (req, res) => {
        const name = String(req.body.name || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');

        const parts = name.split(/\s+/).filter(Boolean);
        const firstName = parts[0] || 'Guard';
        const lastName = parts.slice(1).join(' ') || 'User';

        // required by schema
        const flatNumber = `GUARD-${Date.now().toString().slice(-6)}`;

        try {
            const user = await user_collection.User.register(
                {
                    username: email,
                    email: email,
                    firstName,
                    lastName,
                    societyName: req.user.societyName,
                    flatNumber,
                    occupancyStatus: 'Owner',
                    isAdmin: false,
                    role: 'guard',
                    validation: 'approved',
                },
                password
            );

            // ensure explicit role fields persisted
            user.role = 'guard';
            user.validation = 'approved';
            user.isAdmin = false;
            await user.save();

            return res.redirect('/admin/guards?success=' + encodeURIComponent('Guard created'));
        } catch (err) {
            const msg =
                (err && err.message && err.message.includes('already registered')) || err?.name === 'UserExistsError'
                    ? 'Email is already in use'
                    : err?.message || 'Failed to create guard';
            return res.redirect('/admin/guards?error=' + encodeURIComponent(msg));
        }
    }),
    deleteGuard: asyncHandler(async (req, res) => {
        const userId = String(req.body.userId || '').trim();
        if (!mongoose.isValidObjectId(userId)) {
            return res.redirect('/admin/guards?error=' + encodeURIComponent('Invalid guard id'));
        }

        const guard = await user_collection.User.findOne({
            _id: userId,
            societyName: req.user.societyName,
            role: 'guard',
        });
        if (!guard) {
            return res.redirect('/admin/guards?error=' + encodeURIComponent('Guard not found'));
        }

        await user_collection.User.deleteOne({ _id: guard._id });
        return res.redirect('/admin/guards?success=' + encodeURIComponent('Guard deleted'));
    }),
    renderEditBill,
    saveEditBill,
    renderBillOverrides,
    removeOverride,
    overrideBill,
    residentPaymentHistory,
    sendPaymentReminder,
    downloadReceiptPdf,

    // Legacy admin endpoints to disable
    deprecatedAdminBillOverride: deprecated('Deprecated: use /overrideBill + new billing system'),
    deprecatedAdminRecordPayment: deprecated('Deprecated: use /admin/billing/cash-payment (new billing system)'),
};

