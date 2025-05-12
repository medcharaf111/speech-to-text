import React, { useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  Navigate,
  useLocation,
} from "react-router-dom";
import AdminPanel from "./components/AdminPanel";
import UserPanel from "./components/UserPanel";
import AdminLogin from "./components/AdminLogin";
import AuthGuard from "./components/AuthGuard";
import { BsMicFill } from "react-icons/bs";

// Create a wrapper component to use useLocation
const AppContent = () => {
  const [isRecording, setIsRecording] = useState(false);
  const location = useLocation();
  const isAdminLoginRoute = location.pathname === "/admin-login";

  return (
    <div className="bg-light min-vh-100">
      <div className="container py-4">
        {!isAdminLoginRoute && (
          <div className="row mb-4">
            <div className="col-12">
              <div className="d-flex justify-content-between align-items-center bg-white p-3 rounded shadow-sm">
                <h1 className="h3 mb-0 text-primary">
                  <BsMicFill className="me-2" />
                  Real-time Speech-to-Text
                </h1>
                <div className="d-flex gap-2">
                  {/* <Link to="/" className="btn btn-outline-success">
                  <BsHeadphones className="me-1" />
                  Listener
                </Link> */}
                  <Link to="/admin-login" className="btn btn-outline-primary">
                    <BsMicFill className="me-1" />
                    Speaker
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="row">
          <div className="col-12">
            <Routes>
              <Route path="/" element={<UserPanel />} />
              <Route path="/admin-login" element={<AdminLogin />} />
              <Route
                path="/speechToAdmin"
                element={
                  <AuthGuard>
                    <AdminPanel
                      isRecording={isRecording}
                      setIsRecording={setIsRecording}
                    />
                  </AuthGuard>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
