import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Dashboard from './pages/Dashboard';
import BriefingPage from './pages/BriefingPage';
import GamePage from './pages/GamePage';
import { AuthProvider, useAuth } from './context/AuthContext';

function RouteGuard({ children, requiresAuth }) {
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="screen-loader">
        <div className="screen-loader__panel">
          <span className="screen-loader__eyebrow">Investigation Console</span>
          <strong>טוען סביבת חקירה...</strong>
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