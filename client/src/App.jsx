import { RouterProvider, createBrowserRouter } from 'react-router';
import MotionProvider from './components/motion/MotionProvider.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { routes } from './routes.jsx';

const router = createBrowserRouter(routes);

export default function App() {
  return (
    <AuthProvider>
      <MotionProvider>
        <RouterProvider router={router} />
      </MotionProvider>
    </AuthProvider>
  );
}
