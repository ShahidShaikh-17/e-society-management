const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema(
    {
        societyName: { type: String, required: true, index: true },
        name: { type: String, required: true, trim: true },
        phone: { type: String, required: true, trim: true },
        flatNumber: { type: String, required: true, trim: true },
        vehicleNumber: { type: String, default: '', trim: true },
        purpose: { type: String, default: '', trim: true },
        photoUrl: { type: String, default: '' },
        entryTime: { type: Date, default: Date.now },
        expectedExitTime: { type: Date, required: true },
        exitTime: { type: Date, default: null },
        status: { type: String, enum: ['IN', 'OUT', 'OVERSTAYED'], default: 'IN' },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

visitorSchema.index({ societyName: 1, status: 1, entryTime: -1 });

exports.Visitor = mongoose.model('Visitor', visitorSchema);
