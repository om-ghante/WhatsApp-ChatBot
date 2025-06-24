//App.jsx
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
//export default App


import { useState } from 'react';

function App() {
  const [response, setResponse] = useState('');

  const handleClick = async () => {
    try {
      const res = await fetch('https://whats-app-chat-bot-server.vercel.app/api/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'Hello' })
      });

      const data = await res.json();

      if (res.ok) {
        setResponse(data.reply);
      } else {
        setResponse('Error: ' + data.error);
      }
    } catch (error) {
      console.error(error);
      setResponse('Network error');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <button
        onClick={handleClick}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Send "Hello"
      </button>

      {response && (
        <p className="mt-4 text-xl text-gray-800">
          {response}
        </p>
      )}
    </div>
  );
}

export default App;