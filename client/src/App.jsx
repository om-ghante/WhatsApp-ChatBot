//App.jsx
import WhatsAppScheduler from "./components/WhatsAppScheduler";

function App() {
  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <h1 className="text-2xl font-bold text-center mb-6 text-blue-800">
        WhatsApp Message Scheduler
      </h1>
      <WhatsAppScheduler />
    </div>
  );
}

export default App