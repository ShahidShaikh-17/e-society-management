const express = require('express');
const adminController = require('../controllers/adminController');
const { requireAdmin, requireApproved } = require('../middleware/authRoles');
const { validateInput, miscValidation, billValidation } = require('../middleware/validation');

const router = express.Router();

// Admin dashboards & operations
router.get('/residents-data', requireAdmin, adminController.renderResidentsData);
router.get('/admin/guards', requireAdmin, adminController.listGuards);
router.post(
    '/admin/create-guard',
    requireAdmin,
    validateInput(miscValidation.createGuard, '/admin/guards'),
    adminController.createGuard
);
router.post('/admin/delete-guard', requireAdmin, validateInput(miscValidation.userDelete, '/admin/guards'), adminController.deleteGuard);
router.post('/approveResident', requireAdmin, validateInput(miscValidation.userApproval), adminController.approveResident);
router.post('/rejectResident', requireAdmin, validateInput(miscValidation.userApproval), adminController.rejectResident);
router.post('/delete-resident', requireAdmin, validateInput(miscValidation.userDelete), adminController.deleteResident);
router.get('/export-residents', requireAdmin, adminController.exportResidents);

// Billing admin screens
router.get('/editBill', requireAdmin, adminController.renderEditBill);
router.post('/editBill', requireAdmin, validateInput(billValidation.editBill, '/editBill'), adminController.saveEditBill);

router.get('/billOverrides', requireAdmin, adminController.renderBillOverrides);
router.get('/removeOverride', requireAdmin, adminController.removeOverride);
router.post('/overrideBill', requireAdmin, validateInput(miscValidation.overrideBill, '/billOverrides'), adminController.overrideBill);

// Admin payment history / reminders
router.get('/resident-payment-history/:userId', requireAdmin, adminController.residentPaymentHistory);
router.post('/send-payment-reminder', requireAdmin, adminController.sendPaymentReminder);

// Receipts download (any approved user who can access the app)
router.get('/receipts/:filename', requireApproved, adminController.downloadReceiptPdf);

// Disable legacy admin billing endpoints
router.post('/admin/bill-override', requireAdmin, adminController.deprecatedAdminBillOverride);
router.post('/admin/record-payment', requireAdmin, adminController.deprecatedAdminRecordPayment);

module.exports = router;

