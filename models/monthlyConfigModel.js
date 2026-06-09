const mongoose = require('mongoose');

const monthlyConfigSchema = new mongoose.Schema(
    {
        societyName: { type: String, required: true, index: true },
        month: {
            type: String,
            required: true,
            match: /^\d{4}-\d{2}$/,
        },
        defaultAmount: { type: Number, required: true, min: 0 },
        isLocked: { type: Boolean, default: false },
    },
    { timestamps: true }
);

monthlyConfigSchema.index({ societyName: 1, month: 1 }, { unique: true });

exports.MonthlyConfig = mongoose.model('MonthlyConfig', monthlyConfigSchema);
