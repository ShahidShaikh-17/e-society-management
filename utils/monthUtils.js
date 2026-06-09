/** @param {Date} d */
function toMonthKey(d) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    return `${y}-${String(m).padStart(2, '0')}`;
}

/** @param {string} monthKey YYYY-MM */
function monthKeyToDisplay(monthKey) {
    const [ys, ms] = monthKey.split('-');
    const y = Number(ys);
    const m = Number(ms);
    const date = new Date(y, m - 1, 1);
    return {
        monthName: date.toLocaleString('default', { month: 'long' }),
        year: y,
    };
}

/** First instant of calendar month in local TZ */
function startOfMonthDate(monthKey) {
    const [ys, ms] = monthKey.split('-');
    return new Date(Number(ys), Number(ms) - 1, 1, 0, 0, 0, 0);
}

/** True if current local time is on or after the first day of `monthKey` month */
function isMonthStarted(monthKey) {
    const start = startOfMonthDate(monthKey);
    return Date.now() >= start.getTime();
}

/** @param {string} monthName e.g. "April" @param {number} year */
function monthNameYearToKey(monthName, year) {
    const d = new Date(`${String(monthName)} 1, ${Number(year)}`);
    if (Number.isNaN(d.getTime())) return toMonthKey(new Date());
    return toMonthKey(d);
}

module.exports = {
    toMonthKey,
    monthKeyToDisplay,
    startOfMonthDate,
    isMonthStarted,
    monthNameYearToKey,
};
