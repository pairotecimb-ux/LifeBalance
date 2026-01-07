import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css'; // 👈 บรรทัดนี้สำคัญมาก ต้องมีเพื่อดึงสไตล์มาใช้

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
