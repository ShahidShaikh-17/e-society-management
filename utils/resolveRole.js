/**
 * Resolve application role from user document (supports legacy isAdmin / occupancyStatus).
 * @param {import('mongoose').Document & Record<string, unknown>} user
 */
function resolveRole(user) {
    if (!user) return null;
    if (user.role && ['admin', 'owner', 'tenant', 'guard'].includes(user.role)) {
        return user.role;
    }
    if (user.isAdmin) return 'admin';
    if (user.occupancyStatus === 'Rented') return 'tenant';
    return 'owner';
}

module.exports = { resolveRole };
