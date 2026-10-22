import AuthStory from "../components/AuthStory";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import "./Register.css";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("student");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register, user, loading: checkingSession } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!name || !email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      await register(name, email, password, role);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Registration failed.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession)
    return (
      <div className="loading-page" role="status">
        Checking your session...
      </div>
    );
  if (user) return <Navigate to="/dashboard" replace />;
  return (
    <div className="register-page">
      <AuthStory />
      <div className="register-card">
        <div className="register-header">
          <h1>Create Account</h1>
          <p className="register-subtitle">
            GPU Resource Reservation System — MUJ
          </p>
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Full Name</label>
            <input
              id="name"
              autoComplete="name"
              required
              maxLength={100}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
            />
          </div>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              autoComplete="email"
              required
              maxLength={150}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              autoComplete="new-password"
              required
              maxLength={72}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter a password (min 8 chars)"
            />
          </div>
          <div className="form-group">
            <label htmlFor="role">Role</label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="student">Student</option>
              <option value="faculty">Faculty</option>
              <option value="researcher">Researcher</option>
            </select>
          </div>
          <button
            type="submit"
            className="btn-primary btn-full"
            disabled={loading}
          >
            {loading ? "Creating account..." : "Register"}
          </button>
        </form>
        <p className="register-footer">
          Already have an account? <Link to="/login">Login here</Link>
        </p>
      </div>
    </div>
  );
}
