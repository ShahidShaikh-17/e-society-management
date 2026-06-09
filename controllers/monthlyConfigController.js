const society_collection = require('../models/societyModel');
const billingService = require('../services/billingService');
const user_collection = require('../models/userModel');
const { MonthlyConfig } = require('../models/monthlyConfigModel');
const { isMonthStarted } = require('../utils/monthUtils');
const { asyncHandler } = require('../middleware/asyncHandler');
const { ResidentBill } = require('../models/residentBillModel');

const renderForm = asyncHandler(async (req, res) => {
    const society = await society_collection.Society.findOne({ societyName: req.user.societyName });
    const configs = await MonthlyConfig.find({ societyName: req.user.societyName })
        .sort({ month: -1 })
        .limit(24)
        .lean();

    res.render('adminMonthlyConfig', {
        isAdmin: true,
        society,
        configs,
        suggestedDefault: billingService.sumMaintenanceBill(society?.maintenanceBill),
        pageActive: 'monthlyConfig',
    });
});

const deleteConfig = async (req, res) => {
  try {
    const config = await MonthlyConfig.findById(req.params.id);

    if (!config) {
      return res.redirect('/admin/monthly-config');
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    const isFuture = new Date(config.month + "-01") > new Date(currentMonth + "-01");

    if (config.isLocked || !isFuture) {
      return res.send("Cannot delete locked or past month configs");
    }

    // 🧠 IMPORTANT FIX: DELETE BILLS ALSO
    await ResidentBill.deleteMany({
      societyName: req.user.societyName,
      month: config.month
    });

    // DELETE CONFIG
    await MonthlyConfig.findByIdAndDelete(req.params.id);

    res.redirect('/admin/monthly-config');

  } catch (err) {
    console.error(err);
    res.redirect('/admin/monthly-config');
  }
};

const saveConfig = asyncHandler(async (req, res) => {
    const { month, defaultAmount } = req.body;
    const monthKey = String(month || '').trim();
    const amt = Number(defaultAmount);

    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
        return res.redirect('/admin/monthly-config?error=' + encodeURIComponent('Month must be YYYY-MM'));
    }
    if (!Number.isFinite(amt) || amt < 0) {
        return res.redirect('/admin/monthly-config?error=' + encodeURIComponent('Invalid default amount'));
    }

    let doc = await MonthlyConfig.findOne({ societyName: req.user.societyName, month: monthKey });
    const started = isMonthStarted(monthKey);

    if (doc) {
        if (doc.isLocked || started) {
            return res.redirect(
                '/admin/monthly-config?error=' +
                    encodeURIComponent('This month is locked; default amount cannot be changed.')
            );
        }
        doc.defaultAmount = amt;
        await doc.save();
    } else {
        doc = await MonthlyConfig.create({
            societyName: req.user.societyName,
            month: monthKey,
            defaultAmount: amt,
            isLocked: started,
        });
    }

    await billingService.cleanupGuardBillingData(req.user.societyName, user_collection.User);
    await billingService.syncResidentBillsForMonth(
        req.user.societyName,
        monthKey,
        user_collection.User,
        doc.defaultAmount
    );

    res.redirect('/admin/monthly-config?saved=1');
});

module.exports = { renderForm, saveConfig, deleteConfig };
