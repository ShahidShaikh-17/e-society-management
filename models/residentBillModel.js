const mongoose = require('mongoose');

const residentBillSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        societyName: { type: String, required: true, index: true },
        month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
        amount: { type: Number, required: true, min: 0 },
        totalPaid: { type: Number, default: 0, min: 0 },
        dueAmount: { type: Number, default: 0, min: 0 },
        status: {
            type: String,
            enum: ['paid', 'unpaid', 'partial'],
            default: 'unpaid',
        },
        override: { type: Boolean, default: false },
    },
    { timestamps: true }
);

residentBillSchema.index({ userId: 1, month: 1 }, { unique: true });
residentBillSchema.index({ societyName: 1, month: 1 });

exports.ResidentBill = mongoose.model('ResidentBill', residentBillSchema);
