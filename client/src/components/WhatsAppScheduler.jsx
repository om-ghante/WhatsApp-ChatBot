import { useState } from 'react';

export default function WhatsAppScheduler() {
  const [config, setConfig] = useState({
    WA_TOKEN: '',
    PHONE_ID: '',
    CLOUD_NAME: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '',
    UPLOAD_PRESET: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '',
  });

  const [form, setForm] = useState({
    name: '',
    phone: '',
    dayOfWeek: '',
    greeting: 'Good Morning',
    time: '',
    image: null,
    imageUrl: '',
  });

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  
  const greetings = ['Good Morning', 'Good Afternoon', 'Good Evening'];
  const daysOfWeek = [
    'Monday', 'Tuesday', 'Wednesday', 
    'Thursday', 'Friday', 'Saturday', 'Sunday'
  ];

  const handleConfigChange = (e) => {
    setConfig({ ...config, [e.target.name]: e.target.value });
  };

  const handleFormChange = (e) => {
    if (e.target.name === 'image') {
      setForm({ ...form, image: e.target.files[0] });
    } else {
      setForm({ ...form, [e.target.name]: e.target.value });
    }
  };

  const uploadImageToCloudinary = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', config.UPLOAD_PRESET);
    formData.append('folder', 'whatsapp_schedule');

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${config.CLOUD_NAME}/image/upload`,
        { method: 'POST', body: formData }
      );

      if (!response.ok) throw new Error('Upload failed');
      return (await response.json()).secure_url;
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUploading(true);
    setError('');

    if (!form.image) {
      setError('Please select an image');
      setUploading(false);
      return;
    }

    try {
      const imageUrl = await uploadImageToCloudinary(form.image);
      
      const response = await fetch('https://whats-app-chat-bot-server.vercel.app/sendtemplate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, imageUrl, ...config }),
      });

      if (!response.ok) {
        throw new Error(`Failed to schedule: ${response.statusText}`);
      }

      const data = await response.json();
      alert('Message scheduled successfully!');
      console.log('Server response:', data);
    } catch (err) {
      console.error('Error:', err);
      setError(err.message || 'Failed to schedule message');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-4 bg-white shadow-lg rounded-xl">
      <h2 className="text-xl font-bold mb-4">WhatsApp Config</h2>
      <input
        type="text"
        name="WA_TOKEN"
        placeholder="WA_TOKEN"
        value={config.WA_TOKEN}
        onChange={handleConfigChange}
        className="w-full mb-2 p-2 border rounded"
        required
      />
      <input
        type="text"
        name="PHONE_ID"
        placeholder="PHONE_ID"
        value={config.PHONE_ID}
        onChange={handleConfigChange}
        className="w-full mb-4 p-2 border rounded"
        required
      />

      <h2 className="text-xl font-bold mb-4">Schedule WhatsApp Message</h2>
      {error && <div className="text-red-500 mb-4">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          name="name"
          placeholder="Customer Name"
          value={form.name}
          onChange={handleFormChange}
          className="w-full p-2 border rounded"
          required
        />
        <input
          type="tel"
          name="phone"
          placeholder="Phone Number (with country code)"
          value={form.phone}
          onChange={handleFormChange}
          className="w-full p-2 border rounded"
          required
        />
        <select
          name="dayOfWeek"
          value={form.dayOfWeek}
          onChange={handleFormChange}
          className="w-full p-2 border rounded"
          required
        >
          <option value="">Select Day</option>
          {daysOfWeek.map(day => (
            <option key={day} value={day}>{day}</option>
          ))}
        </select>
        <select
          name="greeting"
          value={form.greeting}
          onChange={handleFormChange}
          className="w-full p-2 border rounded"
        >
          {greetings.map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <input
          type="time"
          name="time"
          value={form.time}
          onChange={handleFormChange}
          className="w-full p-2 border rounded"
          required
        />
        <input
          type="file"
          name="image"
          accept="image/*"
          onChange={handleFormChange}
          className="w-full p-2 border rounded"
          required
        />
        <button
          type="submit"
          disabled={uploading}
          className={`w-full py-2 px-4 rounded text-white ${
            uploading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {uploading ? 'Scheduling...' : 'Schedule Message'}
        </button>
      </form>
    </div>
  );
}