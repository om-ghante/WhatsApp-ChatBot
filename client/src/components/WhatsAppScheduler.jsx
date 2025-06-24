import { useState } from 'react';

export default function WhatsAppScheduler() {
  const [form, setForm] = useState({
    phone: '', 
    scheduledTime: ''
  });

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  
  const handleFormChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUploading(true);
    setError('');

    try {
      // Validate required fields
      if (!form.phone) throw new Error('Phone number is required');
      if (!form.scheduledTime) throw new Error('Scheduled time is required');
      
      // Format phone number (ensure it starts with +)
      const formattedPhone = form.phone.startsWith('+') ? 
        form.phone : 
        `+${form.phone}`;

      // Convert to ISO format for backend
      const scheduledTimeISO = new Date(form.scheduledTime).toISOString();

      // Prepare payload
      const payload = {
        phone: formattedPhone,
        scheduledTime: scheduledTimeISO
      };

      // Send to backend
      const response = await fetch('https://whats-app-chat-bot-server.vercel.app/schedule-hello', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();
      
      if (!response.ok) {
        throw new Error(responseData.error || `Request failed with status ${response.status}`);
      }

      alert('Message scheduled successfully!');
      setForm({ phone: '', scheduledTime: '' }); // Reset form
    } catch (err) {
      console.error('Scheduling error:', err);
      setError(err.message || 'Failed to schedule message');
    } finally {
      setUploading(false);
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
            name="scheduledTime"
            value={form.scheduledTime}
            onChange={handleFormChange}
            className="w-full p-2 border rounded"
            required
          />
        </div>

        <button
          type="submit"
          disabled={uploading}
          className={`w-full py-2 px-4 rounded text-white ${
            uploading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {uploading ? 'Scheduling...' : 'Schedule Hello World Message'}
        </button>
      </form>
      
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold text-blue-800">About This Message</h3>
        <p className="mt-2 text-blue-700">
          This will send a simple "hello_world" WhatsApp template message at the scheduled time.
          No additional parameters or images will be included.
        </p>
      </div>
    </div>
  );
}