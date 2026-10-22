import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import Layout from "../components/Layout";
import "./Dashboard.css";
export default function Dashboard() {
  const [gpus, setGpus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("model");
  const fetchGpus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/gpus");
      setGpus(data);
    } catch {
      setError(
        "We couldn't load the GPU catalog. Please check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    fetchGpus();
  }, [fetchGpus]);
  const available = gpus.filter((g) => g.status === "available").length;
  const filtered = gpus
    .filter(
      (g) =>
        (status === "all" || g.status === status) &&
        `${g.model} ${g.location}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) =>
      sort === "memory"
        ? parseFloat(b.vram) - parseFloat(a.vram)
        : a.model.localeCompare(b.model),
    );
  return (
    <Layout>
      <div className="dashboard">
        <div className="page-heading">
          <div>
            <span className="eyebrow">YOUR RESEARCH, ACCELERATED</span>
            <h1>Find your next breakthrough.</h1>
            <p>Explore campus GPUs and reserve the compute you need.</p>
          </div>
          <button
            className="btn-secondary"
            onClick={fetchGpus}
            disabled={loading}
          >
            ↻ Refresh catalog
          </button>
        </div>
        <section className="catalog-hero">
          <div>
            <span className="hero-tag">CAMPUS COMPUTE, SIMPLIFIED</span>
            <h2>
              Big ideas deserve
              <br />
              powerful hardware.
            </h2>
            <p>
              From your first neural network to your next research paper.
              <br />
              Find a GPU, choose a time, and make it happen.
            </p>
            <a href="#gpu-catalog" className="hero-link">
              Explore resources ↓
            </a>
          </div>
          <div className="chip-art" aria-hidden="true">
            <div className="chip-pins">
              <div className="chip-core">
                <span>GPU</span>
                <small>ACCELERATED COMPUTING</small>
              </div>
            </div>
          </div>
        </section>
        <section className="catalog-stats" aria-label="Hardware overview">
          {[
            ["Total resources", gpus.length, "Across campus labs"],
            ["Ready to reserve", available, "Check a time slot to book"],
            [
              "Under maintenance",
              gpus.filter((g) => g.status === "maintenance").length,
              "Getting ready for your work",
            ],
          ].map(([label, value, note], i) => (
            <div className="catalog-stat" key={label}>
              <span className={`stat-symbol symbol-${i}`} aria-hidden="true">
                {["▦", "↗", "⚙"][i]}
              </span>
              <div>
                <span>{label}</span>
                <strong>
                  {loading || error ? "—" : String(value).padStart(2, "0")}
                </strong>
                <small>{note}</small>
              </div>
            </div>
          ))}
        </section>
        <section id="gpu-catalog" className="catalog-section">
          <div className="catalog-title">
            <h2>
              GPU catalog <span>{gpus.length} resources</span>
            </h2>
            <p>The right hardware for whatever comes next.</p>
          </div>
          <div className="catalog-toolbar">
            <div
              className="filter-tabs"
              role="group"
              aria-label="Filter by hardware status"
            >
              {[
                ["all", "All resources"],
                ["available", "Available"],
                ["maintenance", "Maintenance"],
                ["retired", "Retired"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={status === value}
                  className={status === value ? "selected" : ""}
                  onClick={() => setStatus(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="catalog-search">
              <input
                aria-label="Search GPUs"
                type="search"
                placeholder="Search model or location…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                aria-label="Sort GPUs"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="model">Name: A–Z</option>
                <option value="memory">Highest VRAM</option>
              </select>
            </div>
          </div>
          {error ? (
            <div className="empty-state" role="alert">
              <h3>Catalog unavailable</h3>
              <p>{error}</p>
              <button className="btn-primary" onClick={fetchGpus}>
                Try again
              </button>
            </div>
          ) : loading ? (
            <div
              className="gpu-grid"
              aria-label="Loading resources"
              aria-busy="true"
            >
              {[1, 2, 3].map((n) => (
                <div className="gpu-skeleton" key={n} />
              ))}
            </div>
          ) : !filtered.length ? (
            <div className="empty-state">
              <h3>No matching resources</h3>
              <p>Try a different model, location, or availability filter.</p>
              <button
                className="btn-secondary"
                onClick={() => {
                  setSearch("");
                  setStatus("all");
                }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="gpu-grid">
              {filtered.map((gpu) => (
                <article className="gpu-card" key={gpu.id}>
                  <div className="gpu-card-top">
                    <span className="gpu-icon" aria-hidden="true">
                      ▦
                    </span>
                    <span className={`status-badge status-${gpu.status}`}>
                      ● {gpu.status}
                    </span>
                  </div>
                  <span className="gpu-id">
                    GPU / {String(gpu.id).padStart(3, "0")}
                  </span>
                  <h3>{gpu.model}</h3>
                  <p className="gpu-location">
                    {gpu.location || "Location not specified"}
                  </p>
                  <div className="gpu-spec">
                    <span>GPU memory</span>
                    <strong>{gpu.vram || "Not specified"}</strong>
                  </div>
                  {gpu.status === "available" ? (
                    <Link className="btn-reserve" to={`/book/${gpu.id}`}>
                      Reserve a time slot <span aria-hidden="true">↗</span>
                    </Link>
                  ) : (
                    <button className="btn-reserve" disabled>
                      {gpu.status === "maintenance"
                        ? "Temporarily unavailable"
                        : "Resource retired"}
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
          {!loading && !error && (
            <p className="catalog-count" aria-live="polite">
              Showing {filtered.length} of {gpus.length} resources · All booking
              times are in India Standard Time (IST).
            </p>
          )}
        </section>
      </div>
    </Layout>
  );
}
