import React, { useState, useEffect } from 'react';

export default function Settings() {
  const [settings, setSettings] = useState({
    companyName: "Mitchell's Metal Roofing",
    abn: "0435 918 594",
    phone: "0435 918 594",
    email: "info@mitchellsmetal.com.au",
    address: "123 Example St, Toowoomba QLD 4350",
    gstNumber: "12 345 678 901",
    paymentTerms: "7 days from invoice date",
    bankName: "Commonwealth Bank",
    bsb: "123-456",
    accountNumber: "1234 5678"
  });

  useEffect(() => {
    const saved = localStorage.getItem('sheetSetSettings');
    if (saved) { try { setSettings(JSON.parse(saved)); } catch(e) {} }
  }, []);

  const handleChange = (e) => {
    setSettings({ ...settings, [e.target.name]: e.target.value });
  };

  const save = () => {
    localStorage.setItem('sheetSetSettings', JSON.stringify(settings));
    alert("Settings saved successfully.");
  };

  return (
    <div className="page-content" style={{ padding: '20px', animation: 'fadeIn 0.25s ease-out' }}>
      <div className="dash-card">
        <h3>Company Details</h3>
        <div className="input-group"><label>Company Name</label><input type="text" name="companyName" value={settings.companyName} onChange={handleChange} /></div>
        <div className="input-group"><label>ABN / GST Number</label><input type="text" name="gstNumber" value={settings.gstNumber} onChange={handleChange} /></div>
        <div className="input-group"><label>Phone</label><input type="text" name="phone" value={settings.phone} onChange={handleChange} /></div>
        <div className="input-group"><label>Email</label><input type="text" name="email" value={settings.email} onChange={handleChange} /></div>
        <div className="input-group"><label>Address</label><input type="text" name="address" value={settings.address} onChange={handleChange} /></div>

        <h3 style={{ marginTop: '25px' }}>Payment Details</h3>
        <div className="input-group"><label>Payment Terms</label><input type="text" name="paymentTerms" value={settings.paymentTerms} onChange={handleChange} /></div>
        <div className="input-group"><label>Bank Name</label><input type="text" name="bankName" value={settings.bankName} onChange={handleChange} /></div>
        <div className="input-group"><label>BSB</label><input type="text" name="bsb" value={settings.bsb} onChange={handleChange} /></div>
        <div className="input-group"><label>Account Number</label><input type="text" name="accountNumber" value={settings.accountNumber} onChange={handleChange} /></div>

        <button className="btn btn-primary" style={{ marginTop: '20px', width: '100%' }} onClick={save}>Save Settings</button>
      </div>
    </div>
  );
}
