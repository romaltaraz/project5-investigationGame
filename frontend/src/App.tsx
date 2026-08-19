import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import Dashboard from './pages/Dashboard';
import BriefingPage from './pages/BriefingPage';
import GamePage from './pages/GamePage';
import { AuthProvider, useAuth } from './context/AuthContext';
import InvestigationLoader from './components/InvestigationLoader';

function RouteGuard({ children, requiresAuth }) {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="screen-loader">
        <div className="screen-loader__panel">
          <span className="screen-loader__eyebrow">Investigation Console</span>
          <InvestigationLoader label="טוען סביבת חקירה..." />
        </div>
      </div>
    );
  }

  if (requiresAuth && !isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (!requiresAuth && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route
            path="/"
            element={(
              <RouteGuard requiresAuth={false}>
                <LoginPage />
              </RouteGuard>
            )}
          />
          <Route
            path="/register"
            element={(
              <RouteGuard requiresAuth={false}>
                <RegisterPage />
              </RouteGuard>
            )}
          />
          <Route
            path="/forgot-password"
            element={(
              <RouteGuard requiresAuth={false}>
                <ForgotPasswordPage />
              </RouteGuard>
            )}
          />
          <Route
            path="/dashboard"
            element={(
              <RouteGuard requiresAuth>
                <Dashboard />
              </RouteGuard>
            )}
          />
          <Route
            path="/briefing/:caseId"
            element={(
              <RouteGuard requiresAuth>
                <BriefingPage />
              </RouteGuard>
            )}
          />
          <Route
            path="/game/:caseId"
            element={(
              <RouteGuard requiresAuth>
                <GamePage />
              </RouteGuard>
            )}
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;