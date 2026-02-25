"use client";

import { useState, useEffect, useCallback } from "react";

interface QueueItem {
  id: number;
  contact_id: string;
  contact_name: string;
  phone: string;
  last_gift_amount: number | null;
  last_gift_date: string | null;
  lifetime_giving: number;
  suggested_ask: number;
  context_line: string;
  position: number;
  called: boolean;
  outcome: string | null;
}

interface Stats {
  callsToday: number;
  xpToday: number;
  streak: number;
  xpThisWeek: number;
  level: number;
}

type Outcome =
  | "pledged"
  | "good_conversation"
  | "no_answer"
  | "left_message"
  | "bad_timing";

export default function DialerPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stats, setStats] = useState<Stats>({
    callsToday: 0,
    xpToday: 0,
    streak: 0,
    xpThisWeek: 0,
    level: 1,
  });
  const [loading, setLoading] = useState(true);
  const [showOutcomes, setShowOutcomes] = useState(false);
  const [xpFlash, setXpFlash] = useState<number | null>(null);
  const [streakFlash, setStreakFlash] = useState(false);
  const [showPledgeInput, setShowPledgeInput] = useState(false);
  const [pledgeAmount, setPledgeAmount] = useState("");
  const [logging, setLogging] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [queueRes, statsRes] = await Promise.all([
        fetch("/api/dialer/queue"),
        fetch("/api/dialer/stats"),
      ]);

      const queueData = await queueRes.json();
      const statsData = await statsRes.json();

      const uncalled = (queueData.queue || []).filter(
        (q: QueueItem) => !q.called
      );
      setQueue(uncalled);
      setCurrentIndex(0);
      setStats(statsData);
    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const current = queue[currentIndex] || null;
  const totalToday = queue.length + stats.callsToday;

  function firstName(fullName: string): string {
    return fullName.split(" ")[0] || fullName;
  }

  function formatGift(amount: number | null, date: string | null): string {
    if (!amount || !date) return "Never donated";
    const months = Math.floor(
      (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24 * 30)
    );
    const timeAgo =
      months === 0
        ? "this month"
        : months === 1
        ? "1 month ago"
        : `${months} months ago`;
    return `$${amount.toLocaleString()} — ${timeAgo}`;
  }

  function handleCallTap() {
    setShowOutcomes(true);
  }

  async function logOutcome(outcome: Outcome) {
    if (!current || logging) return;

    if (outcome === "pledged" && !showPledgeInput) {
      setShowPledgeInput(true);
      return;
    }

    setLogging(true);

    try {
      const res = await fetch("/api/dialer/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queueId: current.id,
          outcome,
          pledgeAmount: outcome === "pledged" ? pledgeAmount : undefined,
        }),
      });

      const data = await res.json();

      if (data.success) {
        // XP flash
        setXpFlash(data.xpAwarded);
        setTimeout(() => setXpFlash(null), 1500);

        // Streak check
        if (data.callsToday === 1) {
          setStreakFlash(true);
          setTimeout(() => setStreakFlash(false), 2000);
        }

        // Update stats
        setStats({
          callsToday: data.callsToday,
          xpToday: data.xpToday,
          streak: data.streak,
          xpThisWeek: data.xpThisWeek,
          level: data.level,
        });

        // Advance after delay
        setTimeout(() => {
          setShowOutcomes(false);
          setShowPledgeInput(false);
          setPledgeAmount("");
          setLogging(false);

          setQueue((prev) => prev.filter((_, i) => i !== currentIndex));
          if (currentIndex >= queue.length - 1) {
            setCurrentIndex(0);
          }
        }, 1500);
      }
    } catch (err) {
      console.error("Log error:", err);
      setLogging(false);
    }
  }

  async function handleSkip() {
    if (!current) return;

    await fetch("/api/dialer/skip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId: current.id }),
    });

    setShowOutcomes(false);
    setShowPledgeInput(false);

    const skipped = queue[currentIndex];
    const rest = queue.filter((_, i) => i !== currentIndex);
    setQueue([...rest, skipped]);

    if (currentIndex >= rest.length) {
      setCurrentIndex(0);
    }
  }

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#0f0f0f" }}
      >
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">📞</div>
          <p className="text-gray-400 text-xl">Loading your calls...</p>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-6"
        style={{ background: "#0f0f0f" }}
      >
        <div className="text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-white mb-2">All done!</h2>
          <p className="text-gray-400 text-lg mb-2">
            {stats.callsToday} calls made today
          </p>
          <p className="text-lg" style={{ color: "#facc15" }}>
            {stats.xpToday} XP earned
          </p>
          <button
            onClick={loadData}
            className="mt-8 px-8 py-4 rounded-xl text-lg font-bold text-white active:scale-95 transition-transform"
            style={{ background: "#22c55e", minHeight: "60px" }}
          >
            Refresh Queue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{ background: "#0f0f0f" }}
    >
      {/* XP Flash Animation */}
      {xpFlash !== null && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div
            className="text-5xl font-black animate-xp-flash"
            style={{ color: "#facc15" }}
          >
            +{xpFlash} XP ⚡
          </div>
        </div>
      )}

      {/* Streak Flash */}
      {streakFlash && (
        <div className="fixed top-20 left-0 right-0 flex justify-center z-50 pointer-events-none">
          <div
            className="text-2xl font-bold px-6 py-3 rounded-full animate-streak-pulse"
            style={{ background: "#f97316", color: "white" }}
          >
            🔥 Streak alive!
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className="text-2xl font-bold flex items-center gap-1"
            style={{ color: "#f97316" }}
          >
            🔥 {stats.streak}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium" style={{ color: "#facc15" }}>
            {stats.xpThisWeek} XP this week
          </span>
          <span className="text-sm font-medium text-gray-400">
            Lv.{stats.level}
          </span>
        </div>
        <div className="text-sm font-medium text-gray-300">
          {stats.callsToday} calls today
        </div>
      </div>

      {/* Main Card */}
      <div className="flex-1 flex flex-col justify-center px-5 pb-4">
        <div
          className="rounded-2xl p-6 animate-slide-up"
          style={{ background: "#1a1a1a" }}
          key={current.id}
        >
          {/* Contact Name */}
          <h2 className="text-3xl font-bold text-white mb-4 leading-tight">
            {current.contact_name}
          </h2>

          {/* Last Gift */}
          <div className="mb-3">
            <span className="text-gray-500 text-sm uppercase tracking-wide">
              Last Gift
            </span>
            <p className="text-xl text-white mt-1">
              {formatGift(current.last_gift_amount, current.last_gift_date)}
            </p>
          </div>

          {/* Suggested Ask */}
          <div className="mb-3">
            <span className="text-gray-500 text-sm uppercase tracking-wide">
              Suggested Ask
            </span>
            <p
              className="text-2xl font-bold mt-1"
              style={{ color: "#22c55e" }}
            >
              ${current.suggested_ask?.toLocaleString() || "180"}
            </p>
          </div>

          {/* Context */}
          <p className="text-gray-400 text-base leading-relaxed mb-4">
            {current.context_line}
          </p>

          {/* Phone */}
          <a
            href={`tel:${current.phone}`}
            className="block text-center text-lg font-medium py-2 rounded-lg"
            style={{ color: "#22c55e" }}
          >
            {current.phone}
          </a>
        </div>
      </div>

      {/* Action Area */}
      <div className="px-5 pb-6 space-y-3">
        {!showOutcomes ? (
          <>
            <a
              href={`tel:${current.phone}`}
              onClick={handleCallTap}
              className="block w-full py-5 rounded-2xl text-center text-2xl font-bold text-white
                         active:scale-95 transition-transform"
              style={{ background: "#22c55e", minHeight: "70px" }}
            >
              📞 Call {firstName(current.contact_name)}
            </a>
          </>
        ) : (
          <div className="space-y-2 animate-slide-up">
            {showPledgeInput ? (
              <div className="space-y-3">
                <input
                  type="number"
                  value={pledgeAmount}
                  onChange={(e) => setPledgeAmount(e.target.value)}
                  placeholder="Pledge amount ($)"
                  autoFocus
                  className="w-full px-5 py-4 rounded-xl text-xl text-white placeholder-gray-500
                             border border-gray-700 focus:border-green-500 focus:outline-none"
                  style={{ background: "#1a1a1a", fontSize: "20px" }}
                />
                <button
                  onClick={() => logOutcome("pledged")}
                  disabled={logging}
                  className="w-full py-4 rounded-xl text-xl font-bold text-white
                             active:scale-95 transition-transform disabled:opacity-50"
                  style={{ background: "#22c55e", minHeight: "60px" }}
                >
                  {logging ? "Logging..." : "Log Pledge"}
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => logOutcome("pledged")}
                  disabled={logging}
                  className="w-full py-4 rounded-xl text-lg font-bold text-white
                             active:scale-95 transition-transform disabled:opacity-50"
                  style={{ background: "#22c55e", minHeight: "60px" }}
                >
                  ✅ Pledged / Gave info
                </button>
                <button
                  onClick={() => logOutcome("good_conversation")}
                  disabled={logging}
                  className="w-full py-4 rounded-xl text-lg font-bold text-white
                             active:scale-95 transition-transform disabled:opacity-50"
                  style={{ background: "#22c55e", minHeight: "60px" }}
                >
                  💬 Good conversation
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => logOutcome("no_answer")}
                    disabled={logging}
                    className="flex-1 py-4 rounded-xl text-base font-bold text-white
                               active:scale-95 transition-transform disabled:opacity-50"
                    style={{ background: "#374151", minHeight: "60px" }}
                  >
                    📵 No answer
                  </button>
                  <button
                    onClick={() => logOutcome("left_message")}
                    disabled={logging}
                    className="flex-1 py-4 rounded-xl text-base font-bold text-white
                               active:scale-95 transition-transform disabled:opacity-50"
                    style={{ background: "#374151", minHeight: "60px" }}
                  >
                    📝 Left msg
                  </button>
                </div>
                <button
                  onClick={() => logOutcome("bad_timing")}
                  disabled={logging}
                  className="w-full py-3 rounded-xl text-base font-bold text-white
                             active:scale-95 transition-transform disabled:opacity-50"
                  style={{ background: "#374151", minHeight: "56px" }}
                >
                  ⏰ Bad timing
                </button>
              </>
            )}
          </div>
        )}

        {/* Bottom controls */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={handleSkip}
            className="text-gray-500 text-base py-2 px-4 active:text-gray-300 transition-colors"
          >
            Skip for now
          </button>
          <span className="text-gray-600 text-sm">
            {currentIndex + 1} of {totalToday} today&apos;s calls
          </span>
        </div>
      </div>
    </div>
  );
}
