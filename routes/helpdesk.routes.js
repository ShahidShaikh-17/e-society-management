const express = require('express');
const { requireApproved, requireAdmin } = require('../middleware/authRoles');
const { validateInput, complaintValidation, miscValidation } = require('../middleware/validation');
const helpdeskController = require('../controllers/helpdeskController');

const router = express.Router();

router.get('/helpdesk', requireApproved, helpdeskController.renderHelpdesk);
router.get('/complaint', requireApproved, helpdeskController.renderComplaintForm);

router.post(
    '/complaint',
    requireApproved,
    helpdeskController.complaintUploadMiddleware,
    validateInput(complaintValidation.create, '/complaint'),
    helpdeskController.createComplaint
);

router.post(
    '/closeTicket',
    requireApproved,
    validateInput(miscValidation.indexBodyKey('ticketIndex'), (req) => {
        const ref = req.get('referer') || '';
        return ref.includes('helpdeskAdmin') ? '/helpdeskAdmin' : '/helpdesk';
    }),
    helpdeskController.closeTicket
);

router.post(
    '/deleteTicket',
    requireAdmin,
    validateInput(miscValidation.indexBodyKey('ticketIndex'), '/helpdeskAdmin'),
    helpdeskController.deleteTicket
);

module.exports = router;

