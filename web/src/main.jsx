import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './styles/index.css';
const Workshop = lazy(() => import('./pages/Workshop'));
const Builds = lazy(() => import('./pages/Builds'));
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense fallback={<div className="full-state">正在加载工作台…</div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/workbench" replace />} />
          <Route path="/workbench" element={<Workshop />} />
          <Route path="/workbench/:id" element={<Workshop />} />
          <Route path="/builder" element={<Workshop initialArea="shelves" />} />
          <Route path="/builder/:id" element={<Workshop initialArea="shelves" />} />
          <Route path="/builds" element={<Builds />} />
          <Route
            path="*"
            element={
              <div className="full-state">
                页面不存在<a href="/builder">返回装机工作台</a>
              </div>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>,
);
