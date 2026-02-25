"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/dialer");
    } else {
      setError("Wrong password");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
         style={{ background: "#0f0f0f" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">📞</div>
          <h1 className="text-3xl font-bold text-white">FC Dialer</h1>
          <p className="text-gray-400 mt-2 text-lg">
            Friendship Circle International
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            autoFocus
            className="w-full px-5 py-4 rounded-xl text-lg text-white placeholder-gray-500
                       border border-gray-700 focus:border-green-500 focus:outline-none
                       transition-colors"
            style={{ background: "#1a1a1a", fontSize: "18px" }}
          />

          {error && (
            <p className="text-red-400 text-center text-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-xl text-xl font-bold text-white
                       transition-all active:scale-95 disabled:opacity-50"
            style={{
              background: "#22c55e",
              minHeight: "60px",
            }}
          >
            {loading ? "Logging in..." : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}
