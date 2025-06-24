import { useState } from 'react';

export default function WhatsAppScheduler() {
  const [form, setForm] = useState({
    phone: '', 
    time: ''
  });

  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState('');
  
  const handleFormChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setScheduling(true);
    setError('');

    try {
      // Validate required fields
      if (!form.phone) throw new Error('Phone number is required');
      if (!form.time) throw new Error('Scheduled time is required');
      
      // Format phone number
      const formattedPhone = form.phone.startsWith('+') ? 
        form.phone : 
        `+${form.phone}`;

      // Prepare payload
      const payload = {
        phone: formattedPhone,
        time: new Date(form.time).toISOString()
      };

      // Send to backend
      const response = await fetch('https://whats-app-chat-bot-server.vercel.app/schedule-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();
      
      if (!response.ok) {
        throw new Error(responseData.error || `Request failed with status ${response.status}`);
      }

      alert(`Message scheduled for ${new Date(form.time).toLocaleString()}!`);
      setForm({ phone: '', time: '' }); // Reset form
    } catch (err) {
      console.error('Scheduling error:', err);
      setError(err.message || 'Failed to schedule message');
    } finally {
      setScheduling(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-4 bg-white shadow-lg rounded-xl">
      <h2 className="text-xl font-bold mb-4">Schedule WhatsApp Message</h2>
      {error && (
        <div className="text-red-500 mb-4 p-2 bg-red-50 rounded">
          Error: {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Phone Number
          </label>
          <input
            type="tel"
            name="phone"
            placeholder="With country code (e.g. +919876543210)"
            value={form.phone}
            onChange={handleFormChange}
            className="w-full p-2 border rounded"
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">
            Scheduled Date & Time
          </label>
          <input
            type="datetime-local"
            name="time"
            value={form.time}
            onChange={handleFormChange}
            className="w-full p-2 border rounded"
            required
          />
        </div>

        <button
          type="submit"
          disabled={scheduling}
          className={`w-full py-2 px-4 rounded text-white ${
            scheduling ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {scheduling ? 'Scheduling...' : 'Schedule Hello World Message'}
        </button>
      </form>
      
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold text-blue-800">Important Note</h3>
        <p className="mt-2 text-blue-700">
          This scheduling feature works best on always-on servers. For Vercel deployments, 
          consider using a database with cron jobs for reliable scheduling.
        </p>
      </div>
    </div>
  );
}