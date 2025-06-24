import { useState } from 'react';

export default function WhatsAppScheduler() {
  const [form, setForm] = useState({
    name: '',
    phone: '', 
    dayOfWeek: '',
    greeting: 'Good Morning',
    time: '',
    image: null,
  });

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  
  const greetings = ['Good Morning', 'Good Afternoon', 'Good Evening'];
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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
    formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', 'whatsapp_schedule');

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: 'POST', body: formData }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Upload failed');
      }

      const data = await response.json();
      return data.secure_url;
    } catch (error) {
      console.error('Upload error:', error);
      throw new Error(`Cloudinary upload failed: ${error.message}`);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUploading(true);
    setError('');

    try {
      // Validate required fields
      if (!form.image) throw new Error('Please select an image');
      if (!form.phone) throw new Error('Phone number is required');
      
      // Format phone number (ensure it starts with +)
      const formattedPhone = form.phone.startsWith('+') ? form.phone : `+${form.phone}`;

      // Upload image to Cloudinary
      const imageUrl = await uploadImageToCloudinary(form.image);
      console.log('Image uploaded to:', imageUrl);

      // Prepare payload (only user data - no tokens)
      const payload = {
        name: form.name,
        phone: formattedPhone,
        dayOfWeek: form.dayOfWeek,
        greeting: form.greeting,
        image: imageUrl
      };

      // Send to backend
      const response = await fetch('https://whats-app-chat-bot-server.vercel.app/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();
      console.log('Server response:', responseData);
      
      if (!response.ok) {
        throw new Error(responseData.message || `Request failed with status ${response.status}`);
      }

      alert('Message scheduled successfully!');
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
          placeholder="Phone Number (with country code, e.g. +919876543210)"
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