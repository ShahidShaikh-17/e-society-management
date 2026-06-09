const express = require('express');
const societyController = require('../controllers/societyController');
const { requireApproved, requireAdmin } = require('../middleware/authRoles');
const { validateInput, miscValidation, userValidation } = require('../middleware/validation');

const router = express.Router();

router.get('/residents', requireApproved, societyController.renderResidents);

router.get('/noticeboard', requireApproved, societyController.renderNoticeboard);
router.get('/notice', requireAdmin, societyController.renderNoticeForm);
router.post('/notice', requireAdmin, validateInput(miscValidation.noticeCreate, '/notice'), societyController.createNotice);
router.post(
    '/delete-notice',
    requireAdmin,
    validateInput(miscValidation.indexBodyKey('noticeIndex'), '/noticeboard'),
    societyController.deleteNotice
);

router.get('/contacts', requireApproved, societyController.renderContacts);
router.get('/editContacts', requireAdmin, societyController.renderEditContacts);
router.post(
    '/editContacts',
    requireAdmin,
    validateInput(miscValidation.editContacts, '/editContacts'),
    societyController.saveContacts
);

router.get('/editCommittee', requireAdmin, societyController.renderEditCommittee);
router.post(
    '/editCommittee',
    requireAdmin,
    validateInput(miscValidation.editCommittee, '/editCommittee'),
    societyController.saveCommittee
);

router.get('/profile', requireApproved, societyController.renderProfile);
router.get('/editProfile', requireApproved, societyController.renderEditProfile);
router.post(
    '/editProfile',
    requireApproved,
    validateInput(userValidation.profileUpdate, '/editProfile'),
    societyController.saveProfile
);

module.exports = router;

