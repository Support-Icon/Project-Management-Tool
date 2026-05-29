import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            fontFamily: 'Inter, sans-serif',
            borderRadius: '10px',
            fontSize: '14px',
          },
          success: {
            iconTheme: { primary: '#6366f1', secondary: '#fff' },
          },
        }}
      />
    </HashRouter>
  </React.StrictMode>
);
