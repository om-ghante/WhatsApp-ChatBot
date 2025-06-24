// App.jsx
//import WhatsAppScheduler from "./components/WhatsAppScheduler";
//
//function App() {
//  return (
//    <div className="min-h-screen bg-gray-100 p-4">
//      <h1 className="text-2xl font-bold text-center mb-6 text-blue-800">
//        WhatsApp Message Scheduler
//      </h1>
//      <WhatsAppScheduler />
//    </div>
//  );
//}
//
//export default App;


import React from 'react';

function App() {
  const sendMessage = async () => {
    try {
      const response = await fetch('https://whats-app-chat-bot-server.vercel.app/api/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: 'hi' }),
      });
      
      const data = await response.json();
      console.log('Backend response:', data.response);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <div>
      <button onClick={sendMessage}>Send Message to Backend</button>
    </div>
  );
}

export default App;