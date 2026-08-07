import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { AdminPage } from './pages/AdminPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { Analytics } from '@vercel/analytics/react';
import { SiteSettingsProvider } from './theme/SiteSettingsProvider';

export default function App() {
  return (
    <SiteSettingsProvider>
      <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
      <Analytics />
      </BrowserRouter>
    </SiteSettingsProvider>
  );
}
