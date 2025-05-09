import React, { useState } from "react";
import io from "socket.io-client";
import AdminPanel from "./components/AdminPanel";
import UserPanel from "./components/UserPanel";

const socket = io("http://localhost:5000");

function App() {
  const [role, setRole] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  // Set user role
  const handleRoleSelect = (selectedRole) => {
    setRole(selectedRole);
    socket.emit("register", { role: selectedRole });
  };

  // Render role selection if no role is selected
  if (!role) {
    return (
      <div className="container mt-5">
        <div className="row justify-content-center">
          <div className="col-md-6">
            <div className="card">
              <div className="card-header bg-primary text-white">
                <h2 className="text-center">Real-time Speech-to-Text</h2>
              </div>
              <div className="card-body">
                <h4 className="text-center mb-4">Select Your Role</h4>
                <div className="d-grid gap-2">
                  <button
                    className="btn btn-lg btn-outline-primary"
                    onClick={() => handleRoleSelect("admin")}
                  >
                    I am the Admin (Speaker)
                  </button>
                  <button
                    className="btn btn-lg btn-outline-secondary"
                    onClick={() => handleRoleSelect("user")}
                  >
                    I am a Listener
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-4">
      <div className="row mb-4">
        <div className="col-12">
          <div className="d-flex justify-content-between align-items-center">
            <h1>Real-time Speech-to-Text</h1>
            <div>
              <span className="badge bg-secondary me-2">
                Role: {role === "admin" ? "Admin (Speaker)" : "Listener"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {role === "admin" ? (
        <AdminPanel isRecording={isRecording} setIsRecording={setIsRecording} />
      ) : (
        <UserPanel isRecording={isRecording} />
      )}
    </div>
  );
}

export default App;
