const date = new Date();
const today = date.getDate()+'/'+(date.getMonth()+1)+'/'+date.getFullYear();
const month = date.toLocaleString("default", { month: "long" });
const year = today.split('/')[2];
exports.today = today
exports.month = month
exports.year = year
exports.dateString = `${today.split('/')[0]} ${month.slice(0,3)}  ${year.slice(2)}`

function monthDiff(dateFrom, dateTo) {
    // Convert to Date objects if needed
    const fromDate = new Date(dateFrom);
    const toDate = new Date(dateTo);
    
    let months = (toDate.getFullYear() - fromDate.getFullYear()) * 12;
    months -= fromDate.getMonth();
    months += toDate.getMonth();
    
    // Check if we need to adjust for day of month
    // If payment was made on or after the same day number, we're in the next month period
    if (toDate.getDate() < fromDate.getDate()) {
        months--;
    }
    
    return Math.max(0, months);
}
exports.monthDiff = monthDiff