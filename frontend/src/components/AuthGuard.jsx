import { Navigate } from "react-router-dom";
import { isAuthenticated } from "../utils/auth";

const AuthGuard = ({ children }) => {
  if (!isAuthenticated()) {
    return <Navigate to="/admin-login" replace />;
  }
  return children;
};

export default AuthGuard;
