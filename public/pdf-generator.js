window.onload = function () {
    // Check if download-receipt button exists before adding event listener
    const downloadReceiptBtn = document.getElementById("download-receipt");
    if (downloadReceiptBtn) {
        downloadReceiptBtn.addEventListener("click", () => {
            const invoice = document.getElementById("receipt");
            if (invoice) {
                var opt = {
                    margin: 1,
                    filename: 'receipt.pdf',
                    image: { type: 'jpeg', quality: 1 },
                    html2canvas: { scale: 2 },
                    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
                };
                html2pdf().from(invoice).set(opt).save();
            }
        });
    }

    // Check if download-btn button exists before adding event listener
    const downloadBtn = document.getElementById("download-btn");
    if (downloadBtn) {
        downloadBtn.addEventListener("click", () => {
            const invoice = document.getElementById("print-content");
            if (invoice) {
                var opt = {
                    margin: 1,
                    filename: 'bill.pdf',
                    image: { type: 'jpeg', quality: 1 },
                    html2canvas: { scale: 2 },
                    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
                };
                html2pdf().from(invoice).set(opt).save();
            }
        });
    }
}