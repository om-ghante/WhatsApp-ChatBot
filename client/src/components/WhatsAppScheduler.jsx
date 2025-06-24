import React, { useState } from 'react';
import axios from 'axios';

export default function WhatsAppScheduler() {
  const [config, setConfig] = useState({
    WA_TOKEN: '',
    PHONE_ID: '',
  });

  const [form, setForm] = useState({
    name: '',
    phone: '',
    dayOfWeek: '',
    greeting: 'Good Morning',
    time: '',
    image: null,
  });

  const greetings = ['Good Morning', 'Good Afternoon', 'Good Evening'];

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

  const handleSubmit = async (e) => {
    e.preventDefault();

    const reader = new FileReader();
    reader.onloadend = async () => {
      const imageBase64 = reader.result.split(',')[1];
      const payload = {
        ...form,
        image: imageBase64,
        ...config,
      };

      try {
        await axios.post('https://whats-app-chat-bot-lac.vercel.app/send-template', payload);
        alert('Scheduled message submitted!');
      } catch (error) {
        console.error('Error scheduling message:', error);
        alert('Failed to schedule. Check console.');
      }
    };

    if (form.image) {
      reader.readAsDataURL(form.image);
    } else {
      alert('Please select an image.');
    }
  };

  return (
    <div className="max-w-xl mx-auto p-4 bg-white shadow-lg rounded-xl">
      <h2 className="text-xl font-bold mb-4">WhatsApp Config</h2>
      <input
        type="text"
        name="WA_TOKEN"
        placeholder="WA_TOKEN"
        onChange={handleConfigChange}
        className="w-full mb-2 p-2 border rounded"
      />
      <input
        type="text"
        name="PHONE_ID"
        placeholder="PHONE_ID"
        onChange={handleConfigChange}
        className="w-full mb-4 p-2 border rounded"
      />

      <h2 className="text-xl font-bold mb-4">Schedule WhatsApp Message</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          name="name"
          placeholder="Customer Name"
          value={form.name}
          onChange={handleFormChange}
          className="w-full p-2 border rounded"
        />
        <input
          type="text"
          name="phone"
          placeholder="Phone Number (with country code)"
          value={form.phone}
          onChange={handleFormChange}
          className="w-full p-2 border rounded"
        />
        <input
          type="text"
          name="dayOfWeek"
          placeholder="Day of Week (e.g., Monday)"
          value={form.dayOfWeek}
          onChange={handleFormChange}
          className="w-full p-2 border rounded"
        />
        <select
          name="greeting"
          value={form.greeting}
          onChange={handleFormChange}
          className="w-full p-2 border rounded"
        >
          {greetings.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <input
          type="time"
          name="time"
          value={form.time}
          onChange={handleFormChange}
          className="w-full p-2 border rounded"
        />
        <input
          type="file"
          name="image"
          accept="image/*"
          onChange={handleFormChange}
          className="w-full p-2 border rounded"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Schedule Message
        </button>
      </form>
    </div>
  );
}
