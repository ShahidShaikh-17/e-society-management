const express = require('express');
const router = express.Router();
const billController = require('../controllers/billController');
const monthlyConfigController = require('../controllers/monthlyConfigController');
const { requireApproved, authorizeRoles } = require('../middleware/authRoles');

router.get('/bill', requireApproved, authorizeRoles('admin', 'owner', 'tenant'), billController.renderBill);
router.post('/billing/pay-online', requireApproved, authorizeRoles('admin', 'owner', 'tenant'), billController.payOnline);
router.post('/billing/create-online-checkout', requireApproved, authorizeRoles('admin', 'owner', 'tenant'), billController.createOnlineCheckout);
router.get('/billing/payment-success', requireApproved, authorizeRoles('admin', 'owner', 'tenant'), billController.onlinePaymentSuccess);
router.get('/payment-history', requireApproved, authorizeRoles('admin', 'owner', 'tenant'), billController.renderPaymentHistory);

router.get('/admin/monthly-config', requireApproved, authorizeRoles('admin'), monthlyConfigController.renderForm);
router.post('/admin/monthly-config', requireApproved, authorizeRoles('admin'), monthlyConfigController.saveConfig);

router.post('/admin/monthly-config/delete/:id',
  requireApproved,
  authorizeRoles('admin'),
  monthlyConfigController.deleteConfig
);

router.post('/admin/billing/cash-payment', requireApproved, authorizeRoles('admin'), billController.recordCashPayment);

module.exports = router;
