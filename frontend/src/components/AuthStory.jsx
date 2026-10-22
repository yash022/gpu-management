import { Link } from "react-router-dom";
export default function AuthStory() {
  return (
    <section className="auth-story">
      <Link to="/login" className="brand">
        <span className="brand-mark">G</span>
        <span>
          GPU<span className="brand-light">space</span>
          <small>MANIPAL UNIVERSITY JAIPUR</small>
        </span>
      </Link>
      <span className="eyebrow">YOUR CAMPUS. YOUR COMPUTE.</span>
      <h2>
        A little compute.
        <br />A world of possibility.
      </h2>
      <p>
        Access powerful GPUs for your next experiment. Reserve a resource,
        manage your sessions, and keep your research moving.
      </p>
      <p className="auth-footnote">ONE WORKSPACE FOR STUDENTS & RESEARCHERS</p>
    </section>
  );
}
