const user_collection = require('../models/userModel');
const society_collection = require('../models/societyModel');
const { asyncHandler } = require('../middleware/asyncHandler');

const renderResidents = asyncHandler(async (req, res) => {
    const userSocietyName = req.user.societyName;
    const allSocietyUsers = await user_collection.User.find({ societyName: userSocietyName });

    const foundUsers = [];
    const foundAppliedUsers = [];

    allSocietyUsers.forEach((user) => {
        // Hide sensitive data for non-admin users (privacy protection)
        if (!req.user.isAdmin && user._id.toString() !== req.user.id.toString()) {
            user.phoneNumber = '***-***-****';
            user.email = '***@***.***';
        }

        if (user.role === 'guard') return;
        if (user.validation === 'approved') foundUsers.push(user);
        else if (user.validation === 'applied') foundAppliedUsers.push(user);
    });

    res.render('residents', {
        societyResidents: foundUsers,
        appliedResidents: foundAppliedUsers,
        societyName: userSocietyName,
        isAdmin: req.user.isAdmin,
    });
});

const renderNoticeboard = asyncHandler(async (req, res) => {
    const foundSociety = await society_collection.Society.findOne(
        { societyName: req.user.societyName },
        { noticeboard: 1 }
    );
    if (foundSociety) {
        if (!foundSociety.noticeboard || !foundSociety.noticeboard.length) {
            foundSociety.noticeboard = [
                { subject: 'Access all important announcements, notices and circulars here.' },
            ];
        }
        return res.render('noticeboard', {
            notices: foundSociety.noticeboard,
            isAdmin: req.user.isAdmin,
        });
    }
    return res.render('noticeboard', { notices: [], isAdmin: req.user.isAdmin });
});

const renderNoticeForm = asyncHandler(async (req, res) => {
    res.render('notice');
});

const createNotice = asyncHandler(async (req, res) => {
    const date = require('../date/date');
    const foundSociety = await society_collection.Society.findOne({ societyName: req.user.societyName });
    if (!foundSociety) return res.status(404).send('Society not found');

    const notice = {
        date: date.dateString,
        subject: req.body.subject,
        details: req.body.details,
    };
    foundSociety.noticeboard.push(notice);
    await foundSociety.save();
    res.redirect('/noticeboard');
});

const deleteNotice = asyncHandler(async (req, res) => {
    const noticeIndex = parseInt(req.body.noticeIndex);
    const foundSociety = await society_collection.Society.findOne({ societyName: req.user.societyName });
    if (foundSociety && foundSociety.noticeboard) {
        if (Number.isFinite(noticeIndex) && noticeIndex >= 0 && noticeIndex < foundSociety.noticeboard.length) {
            foundSociety.noticeboard.splice(noticeIndex, 1);
            await foundSociety.save();
        }
    }
    res.redirect('/noticeboard');
});

const renderContacts = asyncHandler(async (req, res) => {
    const userSocietyName = req.user.societyName;
    const foundSociety = await society_collection.Society.findOne(
        { societyName: userSocietyName },
        { emergencyContacts: 1, committeeMembers: 1 }
    );

    res.render('contacts', {
        contact: foundSociety?.emergencyContacts || {},
        committeeMembers: foundSociety?.committeeMembers || [],
        isAdmin: req.user.isAdmin,
    });
});

const renderEditContacts = asyncHandler(async (req, res) => {
    const foundSociety = await society_collection.Society.findOne(
        { societyName: req.user.societyName },
        { emergencyContacts: 1 }
    );
    res.render('editContacts', { contact: foundSociety?.emergencyContacts || {} });
});

const saveContacts = asyncHandler(async (req, res) => {
    await society_collection.Society.updateOne(
        { societyName: req.user.societyName },
        {
            $set: {
                emergencyContacts: {
                    plumbingService: req.body.plumbingService,
                    plumbingServiceName: req.body.plumbingServiceName,
                    medicineShop: req.body.medicineShop,
                    medicineShopName: req.body.medicineShopName,
                    ambulance: req.body.ambulance,
                    ambulanceName: req.body.ambulanceName,
                    doctor: req.body.doctor,
                    doctorName: req.body.doctorName,
                    fireStation: req.body.fireStation,
                    fireStationName: req.body.fireStationName,
                    policeStation: req.body.policeStation,
                    policeStationName: req.body.policeStationName,
                    guard: req.body.guard,
                    guardName: req.body.guardName,
                    electrician: req.body.electrician,
                    electricianName: req.body.electricianName,
                },
            },
        }
    );
    res.redirect('/contacts');
});

const renderEditCommittee = asyncHandler(async (req, res) => {
    const foundSociety = await society_collection.Society.findOne(
        { societyName: req.user.societyName },
        { committeeMembers: 1 }
    );
    res.render('editCommittee', {
        committeeMembers: foundSociety?.committeeMembers || [],
        isAdmin: req.user.isAdmin,
    });
});

const saveCommittee = asyncHandler(async (req, res) => {
    const members = req.body.members || {};
    const committeeArray = Object.values(members).filter((m) => m && m.name);
    await society_collection.Society.updateOne(
        { societyName: req.user.societyName },
        { $set: { committeeMembers: committeeArray } }
    );
    res.redirect('/contacts');
});

const renderProfile = asyncHandler(async (req, res) => {
    const foundUser = await user_collection.User.findById(req.user.id);
    if (!foundUser) return res.status(404).send('User not found');
    const foundSociety = await society_collection.Society.findOne({ societyName: foundUser.societyName });
    res.render('profile', { resident: foundUser, society: foundSociety, isAdmin: req.user.isAdmin });
});

const renderEditProfile = asyncHandler(async (req, res) => {
    const foundUser = await user_collection.User.findById(req.user.id);
    if (!foundUser) return res.status(404).send('User not found');
    const foundSociety = await society_collection.Society.findOne({ societyName: foundUser.societyName });
    res.render('editProfile', { resident: foundUser, society: foundSociety, isAdmin: req.user.isAdmin });
});

const saveProfile = asyncHandler(async (req, res) => {
    const profileSet = {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        phoneNumber: req.body.phoneNumber,
        flatNumber: req.body.flatNumber,
        occupancyStatus: req.body.occupancyStatus || 'Owner',
    };
    if (!req.user.isAdmin) {
        profileSet.role = (req.body.occupancyStatus || 'Owner') === 'Rented' ? 'tenant' : 'owner';
    }

    await user_collection.User.updateOne({ _id: req.user.id }, { $set: profileSet });

    if (req.body.address) {
        await society_collection.Society.updateOne(
            { admin: req.user.username },
            {
                $set: {
                    societyAddress: {
                        address: req.body.address,
                        city: req.body.city,
                        district: req.body.district,
                        postalCode: req.body.postalCode,
                    },
                },
            }
        );
    }

    res.redirect('/profile');
});

module.exports = {
    renderResidents,
    renderNoticeboard,
    renderNoticeForm,
    createNotice,
    deleteNotice,
    renderContacts,
    renderEditContacts,
    saveContacts,
    renderEditCommittee,
    saveCommittee,
    renderProfile,
    renderEditProfile,
    saveProfile,
};

