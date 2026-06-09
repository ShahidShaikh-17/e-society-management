const mongoose = require('mongoose');
const passportLocalMongoose = require('passport-local-mongoose');
const passport = require('passport');

const userSchema = mongoose.Schema(
    {
        firstName: {
            type: String,
            required: true
        },
        lastName: {
            type: String,
            required: true
        },
        email: {
            type: String,
            required: false
        },
        password: {
            type: String,
            required: false
        },
        societyName: {
            type: String,
            required: true
        },
        flatNumber: {
            type: String,
            required: true
        },
        occupancyStatus: {
            type: String,
            enum: ['Owner', 'Rented'],
            default: 'Owner'
        },
        phoneNumber: {
            type: String,
            required: false
        },
        isAdmin: {
            type: Boolean,
            default: false
        },
        role: {
            type: String,
            enum: ['admin', 'owner', 'tenant', 'guard'],
        },
        validation: {
            type: String,
            default: 'pending'
        },
        lastPayment: {
            invoice: {
                type: String,
                default: ''
            },
            amount: {
                type: Number,
                default: 0
            },
            date: {
                type: Date,
                default: null
            }
        },
        paymentHistory: [{
            invoice: {
                type: String,
                required: true
            },
            amount: {
                type: Number,
                required: true
            },
            date: {
                type: Date,
                required: false
            },
            month: {
                type: String,
                required: true
            },
            year: {
                type: Number,
                required: true
            },
            status: {
                type: String,
                enum: ['paid', 'unpaid'],
                default: 'unpaid'
            },
            receiptUrl: {
                type: String,
                default: ''
            },
            billDetails: {
                societyCharges: Number,
                repairsAndMaintenance: Number,
                sinkingFund: Number,
                waterCharges: Number,
                insuranceCharges: Number,
                parkingCharges: Number,
                electricityCharges: Number,
                gasCharges: Number,
                liftCharges: Number,
                otherCharges: Number,
                totalAmount: Number
            }
        }],
        makePayment: {
            type: Number,
            default: 0
        },
        billOverrides: [
            {
                month: {
                    type: String,
                    required: true
                },
                year: {
                    type: Number,
                    required: true
                },
                amount: {
                    type: Number,
                    required: true
                },
                note: {
                    type: String,
                    default: ''
                },
                // Individual bill components for detailed override
                billDetails: {
                    societyCharges: Number,
                    repairsAndMaintenance: Number,
                    sinkingFund: Number,
                    waterCharges: Number,
                    insuranceCharges: Number,
                    parkingCharges: Number,
                    electricityCharges: Number,
                    gasCharges: Number,
                    liftCharges: Number,
                    otherCharges: Number
                },
                updatedAt: {
                    type: Date,
                    default: Date.now
                },
                updatedBy: {
                    type: String,
                    default: ''
                }
            }
        ],
        complaints: [
            {
                date: {
                    type: String,
                    required: true
                },
                category: {
                    type: String,
                    required: true
                },
                type: {
                    type: String,
                    required: true
                },
                description: {
                    type: String,
                    required: true
                },
                status: {
                    type: String,
                    enum: ['open', 'close'],
                    default: 'open'
                },
                resolutionNote: {
                    type: String,
                    default: ''
                },
                resolvedAt: {
                    type: String,
                    default: ''
                },
                attachments: [
                    {
                        url: {
                            type: String,
                            required: true
                        },
                        originalName: {
                            type: String,
                            default: ''
                        },
                        mimeType: {
                            type: String,
                            default: ''
                        },
                        size: {
                            type: Number,
                            default: 0
                        }
                    }
                ]
            }
        ]
    },
    {
        timestamps: true,
    }
)

userSchema.plugin(passportLocalMongoose);
const User = mongoose.model("User", userSchema);
passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());
exports.User = User