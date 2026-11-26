import { Route, Routes } from 'react-router-dom';
import { Home } from './pages/Home.tsx';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  );
}
