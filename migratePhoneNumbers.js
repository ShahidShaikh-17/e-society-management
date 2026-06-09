const mongoose = require('mongoose');
const dotenv = require('dotenv');
const db = require('./config/db');

dotenv.config();

async function migratePhoneNumbers() {
    try {
        await db.connectDB();
        console.log('Connected to database');

        const User = mongoose.model('User', new mongoose.Schema({
            mobileNumber: String,
            phoneNumber: String
        }));

        // Find all users with mobileNumber but no phoneNumber
        const usersToUpdate = await User.find({
            mobileNumber: { $exists: true, $ne: null },
            phoneNumber: { $exists: false }
        });

        console.log(`Found ${usersToUpdate.length} users to migrate`);

        for (const user of usersToUpdate) {
            user.phoneNumber = user.mobileNumber;
            await user.save();
            console.log(`Migrated user ${user._id}: ${user.mobileNumber} -> ${user.phoneNumber}`);
        }

        // Optionally, remove the old mobileNumber field
        // await User.updateMany({}, { $unset: { mobileNumber: 1 } });

        console.log('Migration completed');
        process.exit(0);
    } catch (error) {
        console.error('Migration error:', error);
        process.exit(1);
    }
}

migratePhoneNumbers();
