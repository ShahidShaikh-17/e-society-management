const { Visitor } = require('../models/visitorModel');
const { asyncHandler } = require('../middleware/asyncHandler');

const VEHICLE_RE = /^[A-Z]{2}[0-9]{2}[A-HJ-NP-Z]{1,2}[0-9]{4}$/i;
const PHONE_RE = /^(\+91[\-\s]?)?[0-9]{10}$/;

function addHours(d, h) {
    const x = new Date(d);
    x.setHours(x.getHours() + h);
    return x;
}

const listLog = asyncHandler(async (req, res) => {
    // Mark any currently-in visitors as overstayed (cheap bulk update)
    await Visitor.updateMany(
        {
            societyName: req.user.societyName,
            status: 'IN',
            expectedExitTime: { $lt: new Date() },
        },
        { $set: { status: 'OVERSTAYED' } }
    );

    const list = await Visitor.find({ societyName: req.user.societyName })
        .sort({ entryTime: -1 })
        .limit(200)
        .populate('createdBy', 'firstName lastName')
        .lean();

    const now = Date.now();
    const enriched = list.map((v) => ({
        ...v,
        overstayed:
            (v.status === 'IN' || v.status === 'OVERSTAYED') &&
            now > new Date(v.expectedExitTime).getTime(),
    }));

    res.render('visitorLog', {
        visitors: enriched,
        readOnly: req.resolvedRole === 'owner' || req.resolvedRole === 'tenant',
        isAdmin: req.user.isAdmin,
        userRole: req.resolvedRole,
        pageActive: 'visitorLog',
    });
});

const registerForm = asyncHandler(async (req, res) => {
    res.render('visitorRegister', { pageActive: 'visitorRegister', userRole: req.resolvedRole, isAdmin: req.user.isAdmin });
});

const createVisitor = asyncHandler(async (req, res) => {
    const { name, phone, flatNumber, vehicleNumber, purpose } = req.body;
    if (!name || !phone || !flatNumber) {
        return res.redirect('/visitor-register?error=' + encodeURIComponent('Name, phone and flat are required'));
    }
    const cleanName = String(name).trim();
    const cleanPhone = String(phone).trim();
    const cleanFlat = String(flatNumber).trim();
    const cleanPurpose = String(purpose || '').trim();
    if (cleanName.length < 2 || cleanName.length > 80 || !/^[a-zA-Z][a-zA-Z\s.'-]*$/.test(cleanName)) {
        return res.redirect('/visitor-register?error=' + encodeURIComponent('Invalid visitor name'));
    }
    if (!PHONE_RE.test(cleanPhone)) {
        return res.redirect('/visitor-register?error=' + encodeURIComponent('Invalid phone number'));
    }
    if (!/^[a-zA-Z0-9\-\/\s]{1,20}$/.test(cleanFlat)) {
        return res.redirect('/visitor-register?error=' + encodeURIComponent('Invalid flat number'));
    }
    if (cleanPurpose.length > 120) {
        return res.redirect('/visitor-register?error=' + encodeURIComponent('Purpose is too long'));
    }
    const vh = String(vehicleNumber || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '');
    if (vh && !VEHICLE_RE.test(vh)) {
        return res.redirect(
            '/visitor-register?error=' + encodeURIComponent('Vehicle number format e.g. MH12AB1234')
        );
    }

    const entryTime = new Date();
    const photoUrl = req.file ? `/uploads/visitors/${req.file.filename}` : '';

    await Visitor.create({
        societyName: req.user.societyName,
        name: cleanName,
        phone: cleanPhone,
        flatNumber: cleanFlat,
        vehicleNumber: vh,
        purpose: cleanPurpose,
        photoUrl,
        entryTime,
        expectedExitTime: addHours(entryTime, 1),
        status: 'IN',
        createdBy: req.user._id,
    });

    res.redirect('/visitor-log?created=1');
});

const markExit = asyncHandler(async (req, res) => {
    const v = await Visitor.findOne({
        _id: req.params.id,
        societyName: req.user.societyName,
    });
    if (!v) return res.status(404).send('Visitor not found');
    if (v.status === 'OUT') return res.redirect('/visitor-log');

    v.status = 'OUT';
    v.exitTime = new Date();
    await v.save();
    res.redirect('/visitor-log');
});

module.exports = {
    listLog,
    registerForm,
    createVisitor,
    markExit,
};
