const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
    {
        billId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResidentBill', required: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        amount: { type: Number, required: true, min: 0 },
        method: { type: String, enum: ['online', 'cash'], required: true },
        receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        paidAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

exports.Payment = mongoose.model('Payment', paymentSchema);
