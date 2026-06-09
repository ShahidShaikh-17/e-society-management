const mongoose = require('mongoose');

const societySchema = mongoose.Schema(
    {
        societyName: {
            type: String,
            unique: true,
            required: true
        },
        societyAddress: {
            address: {
                type: String,
                required: true
            },
            city: {
                type: String,
                required: true
            },
            district: {
                type: String,
                required: true
            },
            postalCode: {
                type: Number,
                required: true
            }
        },
        admin: {
            type: String,
            required: true
        },
        // Society Committee Members/Managers
        committeeMembers: [{
            name: {
                type: String,
                required: true
            },
            role: {
                type: String,
                required: true,
                enum: ['Chairman', 'Secretary', 'Treasurer', 'Committee Member', 'Manager', 'Other']
            },
            phone: {
                type: String,
                default: ''
            },
            email: {
                type: String,
                default: ''
            },
            flatNumber: {
                type: String,
                default: ''
            }
        }],
        noticeboard: Array,
        emergencyContacts: {
            plumbingService: {
                type: String,
                default: 'Not added by admin'
            },
            plumbingServiceName: {
                type: String,
                default: ''
            },
            medicineShop: {
                type: String,
                default: 'Not added by admin'
            },
            medicineShopName: {
                type: String,
                default: ''
            },
            ambulance: {
                type: String,
                default: 'Not added by admin'
            },
            ambulanceName: {
                type: String,
                default: ''
            },
            doctor: {
                type: String,
                default: 'Not added by admin'
            },
            doctorName: {
                type: String,
                default: ''
            },
            fireStation: {
                type: String,
                default: 'Not added by admin'
            },
            fireStationName: {
                type: String,
                default: ''
            },
            guard: {
                type: String,
                default: 'Not added by admin'
            },
            guardName: {
                type: String,
                default: ''
            },
            policeStation: {
                type: String,
                default: 'Not added by admin'
            },
            policeStationName: {
                type: String,
                default: ''
            },
            electrician: {
                type: String,
                default: 'Not added by admin'
            },
            electricianName: {
                type: String,
                default: ''
            }
        },
        maintenanceBill: {
            societyCharges: {
                type: Number,
                default: 186
            },
            repairsAndMaintenance: {
                type: Number,
                default: 1415
            },
            sinkingFund: {
                type: Number,
                default: 240
            },
            waterCharges: {
                type: Number,
                default: 150
            },
            insuranceCharges: {
                type: Number,
                default: 30
            },
            parkingCharges: {
                type: Number,
                default: 150
            },
            electricityCharges: {
                type: Number,
                default: 0
            },
            gasCharges: {
                type: Number,
                default: 0
            },
            liftCharges: {
                type: Number,
                default: 0
            },
            otherCharges: {
                type: Number,
                default: 0
            }
        }
    },
    {
		timestamps: true,
	}
)

exports.Society = mongoose.model("society", societySchema);