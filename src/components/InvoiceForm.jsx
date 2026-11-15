import React, { useState } from 'react';
import { generateInvoicePDF } from '../utils/generateInvoicePDF';
import { getEmptyInvoice } from '../data/invoiceData';

export default function InvoiceForm({ result, pitch, onClose }) {
  const [invoice, setInvoice] = useState(() => {
    const base = getEmptyInvoice();
    
    // Auto-populate the line items with real data!
    base.job.roofArea = result.roof_area_m2 || 0;
    base.job.pitch = pitch || 30;
    
    if (result.items) {
        // Just using fallback if backend didn't send specific items
    }
    
    // We map the Estimator results to the invoice items
    base.items[0].quantity = result.roof_area_m2 || 0; // Metal
    base.items[1].quantity = result.trims?.hip_capping_m || 0; // Hip
    base.items[2].quantity = result.trims?.ridge_capping_m || 0; // Ridge
    base.items[3].quantity = result.trims?.eaves_gutter_m || 0; // Eaves
    base.items[4].quantity = result.sheets?.length || 0; // Labour
    
    return base;
  });

  const handleChange = (section, field, value) => {
    setInvoice(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...invoice.items];
    newItems[index][field] = parseFloat(value) || 0;
    setInvoice({ ...invoice, items: newItems });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h3 style={{ margin: 0 }}>Create Invoice</h3>
          <button style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }} onClick={onClose}>✕</button>
        </div>

        <h4 style={{ color: 'var(--silver-mid)', marginBottom: '10px', fontSize: '13px', textTransform: 'uppercase' }}>Client Details</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
          <div className="input-group"><label>Name</label><input type="text" value={invoice.client.name} onChange={e => handleChange('client', 'name', e.target.value)} /></div>
          <div className="input-group"><label>Phone</label><input type="text" value={invoice.client.phone} onChange={e => handleChange('client', 'phone', e.target.value)} /></div>
          <div className="input-group" style={{ gridColumn: 'span 2' }}><label>Address</label><input type="text" value={invoice.client.address} onChange={e => handleChange('client', 'address', e.target.value)} /></div>
        </div>

        <h4 style={{ color: 'var(--silver-mid)', marginBottom: '10px', fontSize: '13px', textTransform: 'uppercase' }}>Line Items (Auto-filled)</h4>
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', marginBottom: '20px' }}>
          {invoice.items.map((item, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--silver-dark)' }}>{item.description}</span>
              <input type="number" value={item.quantity} onChange={e => handleItemChange(i, 'quantity', e.target.value)} style={{ padding: '5px', fontSize: '12px' }} />
              <input type="number" value={item.rate} onChange={e => handleItemChange(i, 'rate', e.target.value)} style={{ padding: '5px', fontSize: '12px' }} />
              <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--silver-light)' }}>${(item.quantity * item.rate).toFixed(2)}</span>
            </div>
          ))}
        </div>

        <button className="btn btn-primary" style={{ width: '100%', padding: '15px' }} onClick={() => generateInvoicePDF(invoice)}>
          📄 Download Invoice PDF
        </button>
      </div>
    </div>
  );
}
