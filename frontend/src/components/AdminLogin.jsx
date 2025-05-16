import { useEffect, useState } from "react";
import { MdEmail, MdError, MdLock } from "react-icons/md";
import { useNavigate } from "react-router-dom";

const AdminLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const isAuthenticated = localStorage.getItem("adminAuthenticated") === "true";
    if (isAuthenticated) {
      navigate("/speechToAdmin");
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Simulate 1 second loading
    setTimeout(() => {
      // Check against static credentials
      if (email === import.meta.env.VITE_ADMIN_EMAIL && password === import.meta.env.VITE_ADMIN_PASSWORD) {
        // Set authenticated flag in localStorage
        localStorage.setItem("adminAuthenticated", "true");
        navigate("/speechToAdmin");
      } else {
        setError("Invalid credentials. Please try again.");
        setLoading(false);
      }
    }, 1000);
  };

  return (
    <div className="d-flex align-items-center  justify-content-center " style={{ height: "calc(100vh - 48px)" }}>
      <div className="card shadow w-100" style={{ maxWidth: "450px", borderRadius: "15px", border: "none" }}>
        <div className="card-body p-4 p-md-5">
          <div className="text-center mb-4">
            <h1 className="fw-bold text-primary mb-2" style={{ fontSize: "1.75rem" }}>
              Admin Portal
            </h1>
            <p className="text-muted">Enter Admin credentials to continue</p>
          </div>

          {error && (
            <div className="alert alert-danger d-flex align-items-center" role="alert">
              <MdError />
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="needs-validation">
            <div className="mb-4">
              <label htmlFor="email" className="form-label fw-semibold">
                Email Address
              </label>
              <div className="input-group">
                <span className="input-group-text bg-light border-end-0">
                  <MdEmail />
                </span>
                <input
                  type="email"
                  className="form-control border-start-0"
                  id="email"
                  placeholder="Enter admin email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="mb-4">
              <div className="d-flex justify-content-between">
                <label htmlFor="password" className="form-label fw-semibold">
                  Password
                </label>
              </div>
              <div className="input-group">
                <span className="input-group-text bg-light border-end-0">
                  <MdLock />
                </span>
                <input
                  type="password"
                  className="form-control border-start-0"
                  id="password"
                  placeholder="Enter admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-100 py-2 mt-3 mb-3"
              style={{
                borderRadius: "8px",
                fontWeight: "600",
                background: "linear-gradient(to right, #4776E6, #8E54E9)",
                border: "none",
                transition: "all 0.3s ease",
              }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
