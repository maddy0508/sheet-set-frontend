import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const COLORS = {
  gunmetal: [64, 88, 96],
  darkBlueGray: [40, 64, 80],
  silver: [192, 192, 192],
  text: [32, 32, 32]
};

export function generateInvoicePDF(data) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;

  // HEADER
  doc.setFillColor(...COLORS.darkBlueGray);
  doc.roundedRect(0, 0, pageWidth, 42, 0, 0, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(28);
  doc.text(data.company.name.split(' ')[0], margin + 8, 28);
  
  doc.setFontSize(14); doc.setFont('helvetica', 'normal');
  doc.text(data.company.name.split(' ').slice(1).join(' '), margin + 8, 36);

  doc.setFontSize(11);
  doc.text(`INVOICE #${data.invoice.number}`, pageWidth - margin, 24, { align: 'right' });
  doc.text(`Date: ${data.invoice.date}`, pageWidth - margin, 31, { align: 'right' });
  doc.text(`Due: ${data.invoice.dueDate}`, pageWidth - margin, 38, { align: 'right' });

  // BILL TO / JOB
  const infoY = 55;
  doc.setTextColor(...COLORS.text);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text("BILL TO", margin, infoY);
  doc.text("JOB DETAILS", pageWidth / 2 + margin, infoY);

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(data.client.name || "Client Name", margin, infoY + 7);
  doc.text(data.client.address || "Client Address", margin, infoY + 12.5);
  doc.text(data.client.phone || "Client Phone", margin, infoY + 18);

  doc.text(`Location: ${data.job.address}`, pageWidth / 2 + margin, infoY + 7);
  doc.text(`Roof Area: ${data.job.roofArea} m²`, pageWidth / 2 + margin, infoY + 12.5);
  doc.text(`Pitch: ${data.job.pitch}°`, pageWidth / 2 + margin, infoY + 18);

  doc.setDrawColor(...COLORS.silver);
  doc.line(margin, 82, pageWidth - margin, 82);

  // TABLE
  const tableBody = data.items
    .filter(item => item.quantity > 0)
    .map(item => [
      item.description,
      item.quantity.toString(),
      item.unit,
      `$${item.rate.toFixed(2)}`,
      `$${(item.quantity * item.rate).toFixed(2)}`
    ]);

  const subtotal = data.items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
  const gst = subtotal * data.gstRate;
  const total = subtotal + gst;

  autoTable(doc, {
    startY: 90,
    head: [['DESCRIPTION', 'QTY', 'UNIT', 'RATE', 'AMOUNT']],
    body: tableBody,
    foot: [
      ['', '', '', 'Subtotal', `$${subtotal.toFixed(2)}`],
      ['', '', '', `GST @ ${data.gstRate * 100}%`, `$${gst.toFixed(2)}`],
      ['', '', '', 'TOTAL DUE', `$${total.toFixed(2)}`]
    ],
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: COLORS.darkBlueGray, textColor: 255 },
    footStyles: { fontStyle: 'bold', fontSize: 11 },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 22, halign: 'center' }, 2: { cellWidth: 20, halign: 'center' }, 3: { cellWidth: 30, halign: 'right' }, 4: { cellWidth: 35, halign: 'right' } }
  });

  // FOOTER
  const finalY = doc.lastAutoTable.finalY + 15;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text("PAYMENT DETAILS", margin, finalY);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text([`Bank: ${data.company.bankName}`, `BSB: ${data.company.bsb}   Account: ${data.company.account}`], margin, finalY + 7);
  doc.text(data.notes, margin, pageHeight - 25, { maxWidth: pageWidth / 2 });

  doc.save(`Invoice_${data.invoice.number}.pdf`);
}
