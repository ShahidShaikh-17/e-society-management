const { resolveRole } = require('../utils/resolveRole');

function requireAuth(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) return next();
    if (req.accepts('html')) return res.redirect('/login');
    return res.status(401).json({ success: false, message: 'Authentication required' });
}

function requireApproved(req, res, next) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        if (req.accepts('html')) return res.redirect('/login');
        return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (req.user.validation !== 'approved') {
        if (req.accepts('html')) return res.redirect('/home');
        return res.status(403).json({ success: false, message: 'Account not approved' });
    }
    return next();
}

/** Attach resolved role on req and res.locals */
function attachRole(req, res, next) {
    if (req.user) {
        const role = resolveRole(req.user);
        req.resolvedRole = role;
        res.locals.userRole = role;
    }
    next();
}

function authorizeRoles(...allowed) {
    const set = new Set(allowed);
    return (req, res, next) => {
        const role = req.resolvedRole || resolveRole(req.user);
        if (!req.user) {
            if (req.accepts('html')) return res.redirect('/login');
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        if (!set.has(role)) {
            if (req.accepts('html')) return res.status(403).send('Access denied');
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        next();
    };
}

function requireAdmin(req, res, next) {
    return requireApproved(req, res, (err) => {
        if (err) return next(err);
        return authorizeRoles('admin')(req, res, next);
    });
}

function requireGuard(req, res, next) {
    return requireApproved(req, res, (err) => {
        if (err) return next(err);
        return authorizeRoles('guard')(req, res, next);
    });
}

function requireUser(req, res, next) {
    return requireApproved(req, res, (err) => {
        if (err) return next(err);
        return authorizeRoles('admin', 'owner', 'tenant')(req, res, next);
    });
}

module.exports = {
    requireAuth,
    requireApproved,
    attachRole,
    authorizeRoles,
    requireAdmin,
    requireGuard,
    requireUser,
    resolveRole,
};
