import { RouterProvider, createBrowserRouter } from 'react-router';
import MotionProvider from './components/motion/MotionProvider.jsx';
import { appConfig } from './config/appConfig.js';
import { AuthProvider } from './context/AuthContext.jsx';
import { routes } from './routes.jsx';

// basename mengikuti BASE_PATH saat build (mis. "/E-Voting" di hosting Rumahweb).
const router = createBrowserRouter(routes, { basename: appConfig.routerBasename });

export default function App() {
  return (
    <AuthProvider>
      <MotionProvider>
        <RouterProvider router={router} />
      </MotionProvider>
    </AuthProvider>
  );
}
