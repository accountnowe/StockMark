import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadServerSettings } from './market';
import './styles.css';

function start() {
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

// The stock catalog and paper-market state come from the server, so read them
// before the first paint. The call never rejects and bounds its own wait.
loadServerSettings().finally(start);
