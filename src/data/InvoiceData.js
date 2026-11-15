export const getEmptyInvoice = () => ({
  company: {
    name: "MITCHELL'S METAL ROOFING",
    phone: "0435 918 594",
    abn: "12 345 678 901",
    bankName: "Commonwealth Bank",
    bsb: "123-456",
    account: "1234 5678"
  },
  invoice: {
    number: "INV-" + new Date().getFullYear() + "-" + Math.floor(Math.random() * 1000),
    date: new Date().toLocaleDateString(),
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(), // 7 days from now
    reference: ""
  },
  client: {
    name: "",
    address: "",
    phone: "",
    email: ""
  },
  job: {
    address: "Traced from map",
    roofArea: 0,
    roofType: "Metal",
    pitch: 0
  },
  items: [
    { description: "Metal Roof Sheeting", quantity: 0, unit: "m²", rate: 45.00 },
    { description: "Hip Capping", quantity: 0, unit: "m", rate: 12.50 },
    { description: "Ridge Capping", quantity: 0, unit: "m", rate: 12.50 },
    { description: "Eaves Gutter", quantity: 0, unit: "m", rate: 18.00 },
    { description: "Installation Labour", quantity: 0, unit: "sheet", rate: 35.00 }
  ],
  notes: "Payment due within 7 days. Please reference invoice number. Thank you for your business!",
  gstRate: 0.10
});
