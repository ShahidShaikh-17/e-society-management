const path = require('path');
const fs = require('fs');
const multer = require('multer');
const user_collection = require('../models/userModel');
const date = require('../date/date');
const { asyncHandler } = require('../middleware/asyncHandler');

const complaintUploadsDir = path.join(__dirname, '..', 'uploads', 'complaints');
if (!fs.existsSync(complaintUploadsDir)) {
    fs.mkdirSync(complaintUploadsDir, { recursive: true });
}

const complaintUpload = multer({
    storage: multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, complaintUploadsDir);
        },
        filename: function (req, file, cb) {
            const safeOriginal = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
            cb(null, `${Date.now()}_${Math.round(Math.random() * 1e9)}_${safeOriginal}`);
        },
    }),
    fileFilter: function (req, file, cb) {
        const ok =
            file &&
            (file.mimetype === 'image/jpeg' ||
                file.mimetype === 'image/png' ||
                file.mimetype === 'image/gif' ||
                file.mimetype === 'image/webp');
        cb(ok ? null : new Error('Only JPEG, PNG, GIF, or WEBP images are allowed'), ok);
    },
    limits: {
        fileSize: 10 * 1024 * 1024,
        files: 5,
    },
});

const redirectHelpdeskFromReferer = (req) =>
    (req.get('referer') || '').includes('helpdeskAdmin') ? '/helpdeskAdmin' : '/helpdesk';

const renderHelpdesk = asyncHandler(async (req, res) => {
    const foundUsers = await user_collection.User.find({
        $and: [{ societyName: req.user.societyName }, { validation: 'approved' }],
    });
    if (req.user.isAdmin) {
        return res.render('helpdeskAdmin', { users: foundUsers, isAdmin: req.user.isAdmin });
    }
    return res.render('helpdesk', { users: foundUsers, isAdmin: req.user.isAdmin });
});

const renderComplaintForm = asyncHandler(async (req, res) => {
    res.render('complaint', { isAdmin: req.user.isAdmin });
});

const createComplaint = asyncHandler(async (req, res) => {
    const foundUser = await user_collection.User.findById(req.user.id);
    if (!foundUser) return res.status(404).send('User not found');

    const attachments = (req.files || []).map((f) => ({
        url: `/uploads/complaints/${f.filename}`,
        originalName: f.originalname,
        mimeType: f.mimetype,
        size: f.size,
    }));

    const complaint = {
        date: date.dateString,
        category: req.body.category,
        type: req.body.type,
        description: req.body.description,
        status: 'open',
        attachments,
    };

    if (!foundUser.complaints) foundUser.complaints = [];
    foundUser.complaints.push(complaint);
    await foundUser.save();

    res.redirect('/helpdesk');
});

const closeTicket = asyncHandler(async (req, res) => {
    const user_id = req.body.userId;
    const ticket_index = req.body.ticketIndex;
    const resolutionNote = req.body.resolutionNote || '';

    if (!user_id || ticket_index === undefined) {
        return res.status(400).send('Invalid request');
    }

    const foundUser = await user_collection.User.findById(user_id);
    if (!foundUser) return res.status(404).send('User not found');
    if (foundUser.societyName !== req.user.societyName) return res.status(403).send('Access denied');

    if (!foundUser.complaints || !foundUser.complaints[ticket_index]) {
        return res.status(404).send('Ticket not found');
    }

    const ticketData = {
        status: 'close',
        date: foundUser.complaints[ticket_index].date,
        category: foundUser.complaints[ticket_index].category,
        type: foundUser.complaints[ticket_index].type,
        description: foundUser.complaints[ticket_index].description,
        resolutionNote,
        resolvedAt: date.dateString,
        attachments: foundUser.complaints[ticket_index].attachments || [],
    };

    const ticket = 'complaints.' + ticket_index;
    await user_collection.User.updateOne({ _id: user_id }, { $set: { [ticket]: ticketData } });

    res.redirect(redirectHelpdeskFromReferer(req));
});

const deleteTicket = asyncHandler(async (req, res) => {
    const user_id = req.body.userId;
    const ticket_index = req.body.ticketIndex;

    if (!user_id || ticket_index === undefined) {
        return res.status(400).send('Invalid request');
    }

    const foundUser = await user_collection.User.findById(user_id);
    if (!foundUser) return res.status(404).send('User not found');
    if (foundUser.societyName !== req.user.societyName) return res.status(403).send('Access denied');

    if (!foundUser.complaints || !foundUser.complaints[ticket_index]) {
        return res.status(404).send('Ticket not found');
    }

    if (foundUser.complaints[ticket_index].status !== 'close') {
        return res.status(400).send('Can only delete resolved complaints');
    }

    foundUser.complaints.splice(ticket_index, 1);
    await foundUser.save();

    res.redirect('/helpdesk');
});

function complaintUploadMiddleware(req, res, next) {
    return complaintUpload.array('attachments', 5)(req, res, function (err) {
        if (err) {
            return res.redirect('/complaint?error=' + encodeURIComponent(err.message || 'Invalid upload'));
        }
        next();
    });
}

module.exports = {
    renderHelpdesk,
    renderComplaintForm,
    complaintUploadMiddleware,
    createComplaint,
    closeTicket,
    deleteTicket,
};

