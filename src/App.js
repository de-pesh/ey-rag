import React, { useState, useEffect } from 'react';
import AccessGate from './components/AccessGate';
import ChatWindow from './components/ChatWindow';
import { getSession, clearSession } from './backendConfig';

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getSession();
    if (session?.authenticated) {
      setAuthenticated(true);
    }
    setLoading(false);
  }, []);

  const handleAuthenticated = () => setAuthenticated(true);

  const handleSignOut = () => {
    clearSession();
    setAuthenticated(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#e8e8e8]/20 border-t-[#e8e8e8] rounded-full animate-spin" />
      </div>
    );
  }

  return authenticated
    ? <ChatWindow onSignOut={handleSignOut} />
    : <AccessGate onAuthenticated={handleAuthenticated} />;
}
