// src/main.jsx
import './supabaseClient';  // ⚠️ Supabase 동기화 (반드시 App.jsx 전에 import)

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
