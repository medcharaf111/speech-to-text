import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AdminPanel from "./components/AdminPanel";
import UserPanel from "./components/UserPanel";
import AdminLogin from "./components/AdminLogin";
import AuthGuard from "./components/AuthGuard";
import PresentationDisplay from "./components/PresentationDisplay";
import { BsMicFill } from "react-icons/bs";
import { IoMdLogOut } from "react-icons/io";
import { clearToken } from "./utils/auth";

// Chrome for the speaker's pages only. The listener page and the stage display own their layout.
function SpeakerShell({ children }) {
  return (
    <div className="bg-light min-vh-100">
      <div className="container py-4">
        <div className="d-flex justify-content-between align-items-center shell-header p-3 mb-4">
          <h1 className="h3 mb-0 text-primary">
            <BsMicFill className="me-2" />
            Seamo Live · Speaker
          </h1>
          <button
            className="btn btn-outline-primary"
            onClick={() => {
              clearToken();
              window.location.href = "/";
            }}
          >
            <IoMdLogOut className="me-1" />
            Logout
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SpeakerPage() {
  const [isRecording, setIsRecording] = useState(false);
  return (
    <AuthGuard>
      <SpeakerShell>
        <AdminPanel isRecording={isRecording} setIsRecording={setIsRecording} />
      </SpeakerShell>
    </AuthGuard>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<UserPanel />} />
        <Route
          path="/admin-login"
          element={
            <div className="bg-light min-vh-100 px-3">
              <AdminLogin />
            </div>
          }
        />
        <Route path="/speechToAdmin" element={<SpeakerPage />} />
        <Route path="/presentation-display" element={<PresentationDisplay />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
