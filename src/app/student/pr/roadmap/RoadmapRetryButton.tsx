"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export function RoadmapRetryButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRetry = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recommendations/pr-generate", {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error status: ${res.status}`);
      }

      // Generation succeeded or accepted, go to roadmap view / refresh
      router.refresh();
      router.push("/student/pr/roadmap");
    } catch (err: unknown) {
      console.error("Retry generation failed:", err);
      setError(err instanceof Error ? err.message : "Failed to retry roadmap generation.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-100 border border-red-300 text-red-800 text-sm rounded-lg max-w-md mx-auto">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={handleRetry}
        disabled={loading}
        className="px-6 py-3 rounded-xl bg-[#1D4ED8] hover:bg-[#0B1F3A] text-white font-medium transition-colors shadow-sm disabled:opacity-50"
      >
        {loading ? "Re-triggering Gemini AI..." : "Retry Roadmap Generation"}
      </button>
    </div>
  );
}
