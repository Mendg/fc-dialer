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
  last_campaign: string | null;
  last_fund: string | null;
  tribute_type: string | null;
  tribute_name: string | null;
  last_donation_note: string | null;
  donation_count: number;
  last_call_note: string | null;
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

interface MissionsData {
  missions: string[];
  completed: boolean[];
}

interface BossData {
  boss: {
    contact_name: string;
    hp_current: number;
    hp_max: number;
    goal: string;
  } | null;
}

interface SeasonData {
  raised: number;
  goal: number;
  percent: number;
  on_pace: boolean;
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
  const [rewardChest, setRewardChest] = useState<{
    tier: string | null;
    text: string | null;
    xpMultiplier: number;
    xpAwarded: number;
  } | null>(null);

  // Game panel state
  const [gamePanelOpen, setGamePanelOpen] = useState(false);
  const [missions, setMissions] = useState<MissionsData | null>(null);
  const [boss, setBoss] = useState<BossData | null>(null);
  const [season, setSeason] = useState<SeasonData | null>(null);
  const [gamePanelLoading, setGamePanelLoading] = useState(false);

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

  const loadGamePanel = useCallback(async () => {
    setGamePanelLoading(true);
    try {
      const [mRes, bRes, sRes] = await Promise.all([
        fetch("/api/gamification/missions"),
        fetch("/api/gamification/boss"),
        fetch("/api/gamification/season"),
      ]);
      const [mData, bData, sData] = await Promise.all([
        mRes.json(),
        bRes.json(),
        sRes.json(),
      ]);
      setMissions(mData);
      setBoss(bData);
      setSeason(sData);
    } catch (err) {
      console.error("Game panel error:", err);
    } finally {
      setGamePanelLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (gamePanelOpen && !missions) {
      loadGamePanel();
    }
  }, [gamePanelOpen, missions, loadGamePanel]);

  const current = queue[currentIndex] || null;
  const totalToday = queue.length + stats.callsToday;
  const callTarget = 5;
  const progressPct = Math.min(100, Math.round((stats.callsToday / callTarget) * 100));

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
        // Show reward chest
        setRewardChest({
          tier: data.rewardTier,
          text: data.rewardText,
          xpMultiplier: data.xpMultiplier,
          xpAwarded: data.xpAwarded,
        });

        if (data.callsToday === 1) {
          setStreakFlash(true);
          setTimeout(() => setStreakFlash(false), 2500);
        }

        setStats({
          callsToday: data.callsToday,
          xpToday: data.xpToday,
          streak: data.streak,
          xpThisWeek: data.xpThisWeek,
          level: data.level,
        });

        // Auto-advance after 3.5s (or on tap)
        setTimeout(() => {
          setRewardChest(null);
          setXpFlash(data.xpAwarded);
          setTimeout(() => setXpFlash(null), 1200);
          setShowOutcomes(false);
          setShowPledgeInput(false);
          setPledgeAmount("");
          setLogging(false);
          setQueue((prev) => prev.filter((_, i) => i !== currentIndex));
          if (currentIndex >= queue.length - 1) setCurrentIndex(0);
        }, 3500);
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

  const allMissionsDone = missions?.completed?.every(Boolean) ?? false;

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

      {/* Reward Chest Overlay */}
      {rewardChest && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 px-6"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={() => {
            setRewardChest(null);
            setXpFlash(rewardChest.xpAwarded);
            setTimeout(() => setXpFlash(null), 1200);
            setShowOutcomes(false);
            setShowPledgeInput(false);
            setPledgeAmount("");
            setLogging(false);
            setQueue((prev) => prev.filter((_, i) => i !== currentIndex));
            if (currentIndex >= queue.length - 1) setCurrentIndex(0);
          }}
        >
          <div className="text-center w-full max-w-sm">
            {rewardChest.tier ? (
              <>
                {/* Chest icon based on tier */}
                <div className="text-7xl mb-4 animate-bounce">
                  {rewardChest.tier === "legendary" ? "🏆" :
                   rewardChest.tier === "epic" ? "💎" :
                   rewardChest.tier === "rare" ? "🎁" :
                   rewardChest.tier === "uncommon" ? "🎉" : "📦"}
                </div>
                {/* Tier label */}
                <div
                  className="text-xs font-black uppercase tracking-widest mb-2"
                  style={{
                    color: rewardChest.tier === "legendary" ? "#ffd700" :
                           rewardChest.tier === "epic" ? "#c084fc" :
                           rewardChest.tier === "rare" ? "#60a5fa" :
                           rewardChest.tier === "uncommon" ? "#4ade80" : "#9ca3af"
                  }}
                >
                  {rewardChest.tier} drop
                </div>
                {/* XP awarded */}
                <div
                  className="text-4xl font-black mb-3"
                  style={{ color: "#facc15" }}
                >
                  +{rewardChest.xpAwarded} XP
                  {rewardChest.xpMultiplier > 1 && (
                    <span className="text-2xl ml-2" style={{ color: "#f97316" }}>
                      {rewardChest.xpMultiplier}×
                    </span>
                  )}
                </div>
                {/* Reward text */}
                <div
                  className="text-xl font-bold mb-6 px-4 py-3 rounded-xl"
                  style={{ background: "#1a1a1a", color: "#f5f5f5" }}
                >
                  {rewardChest.text}
                </div>
              </>
            ) : (
              <>
                <div className="text-6xl mb-4">📦</div>
                <div className="text-lg text-gray-500 mb-2">Not this time...</div>
                <div
                  className="text-3xl font-black mb-6"
                  style={{ color: "#facc15" }}
                >
                  +{rewardChest.xpAwarded} XP ⚡
                </div>
              </>
            )}
            <div className="text-gray-600 text-sm">tap to continue</div>
          </div>
        </div>
      )}

      {/* Expanded Top Bar */}
      <div className="px-4 pt-3 pb-2" style={{ maxHeight: "80px" }}>
        {/* Row 1: Streak | XP | Level */}
        <div className="flex items-center justify-between mb-1.5">
          <span
            className="text-2xl font-black flex items-center gap-1"
            style={{ color: "#f97316" }}
          >
            🔥 {stats.streak}
          </span>
          <span className="text-lg font-bold" style={{ color: "#facc15" }}>
            ⚡ {stats.xpThisWeek} XP
          </span>
          <span className="text-base font-bold text-gray-300">
            Lv.{stats.level}
          </span>
        </div>
        {/* Row 2: Progress bar */}
        <div className="flex items-center gap-2">
          <div
            className="flex-1 h-3 rounded-full overflow-hidden"
            style={{ background: "#333" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPct}%`,
                background: progressPct >= 100 ? "#22c55e" : "#facc15",
              }}
            />
          </div>
          <span className="text-xs font-bold text-gray-400 whitespace-nowrap">
            {stats.callsToday}/{callTarget}
          </span>
        </div>
      </div>

      {/* Game Panel Toggle + Panel */}
      <div className="px-4 pb-1">
        <button
          onClick={() => setGamePanelOpen(!gamePanelOpen)}
          className="text-sm font-bold py-1 px-3 rounded-lg active:scale-95 transition-transform"
          style={{ background: "#2a2a2a", color: "#facc15" }}
        >
          🎮 {gamePanelOpen ? "Hide" : "Missions & Boss"}
        </button>

        {gamePanelOpen && (
          <div
            className="mt-2 rounded-xl p-4 space-y-4 animate-slide-up"
            style={{ background: "#1a1a1a" }}
          >
            {gamePanelLoading ? (
              <p className="text-gray-400 text-center text-sm">Loading...</p>
            ) : (
              <>
                {/* Daily Missions */}
                <div>
                  <h3 className="text-sm font-bold text-gray-300 mb-2 uppercase tracking-wide">
                    Daily Missions
                  </h3>
                  {allMissionsDone ? (
                    <p className="text-sm" style={{ color: "#22c55e" }}>
                      ✅ All missions done!
                    </p>
                  ) : missions?.missions && missions.missions.length > 0 ? (
                    <div className="space-y-1.5">
                      {missions.missions.map((m, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-sm"
                        >
                          <span>
                            {missions.completed[i] ? "✅" : "⬜"}
                          </span>
                          <span
                            className={
                              missions.completed[i]
                                ? "text-gray-500 line-through"
                                : "text-gray-200"
                            }
                          >
                            {m}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No missions today</p>
                  )}
                </div>

                {/* Boss */}
                <div>
                  <h3 className="text-sm font-bold text-gray-300 mb-2 uppercase tracking-wide">
                    Active Boss
                  </h3>
                  {boss?.boss ? (
                    <div>
                      <p className="text-base font-bold text-white mb-1">
                        🐉 {boss.boss.contact_name}
                      </p>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-400">HP</span>
                        <span className="text-sm font-mono" style={{ color: "#ef4444" }}>
                          {"█".repeat(boss.boss.hp_current)}
                          {"░".repeat(
                            Math.max(0, boss.boss.hp_max - boss.boss.hp_current)
                          )}
                        </span>
                        <span className="text-xs text-gray-500">
                          {boss.boss.hp_current}/{boss.boss.hp_max}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">{boss.boss.goal}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No active boss</p>
                  )}
                </div>

                {/* Season Pass */}
                <div>
                  <h3 className="text-sm font-bold text-gray-300 mb-2 uppercase tracking-wide">
                    Season Pass
                  </h3>
                  {season ? (
                    <div>
                      <div
                        className="h-3 rounded-full overflow-hidden mb-1"
                        style={{ background: "#333" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, season.percent)}%`,
                            background: season.on_pace ? "#22c55e" : "#ef4444",
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-300">
                          ${(season.raised / 1000).toFixed(1)}K / $
                          {(season.goal / 1000).toFixed(0)}K
                        </span>
                        <span>
                          {season.on_pace ? "ON PACE ✅" : "Behind 📉"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Loading season...</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
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

          {/* Tribute — show prominently if exists */}
          {current.tribute_name && (
            <div className="mb-3 px-3 py-2 rounded-lg" style={{ background: "#2a1a0a", borderLeft: "3px solid #d4af37" }}>
              <span className="text-xs uppercase tracking-wide" style={{ color: "#d4af37" }}>
                {current.tribute_type === "IN_MEMORY_OF" ? "💛 In memory of" : "✨ In honor of"}
              </span>
              <p className="text-white font-semibold mt-0.5">{current.tribute_name}</p>
            </div>
          )}

          {/* Last Gift + Campaign */}
          <div className="mb-3">
            <span className="text-gray-500 text-sm uppercase tracking-wide">Last Gift</span>
            <p className="text-xl text-white mt-1">
              {formatGift(current.last_gift_amount, current.last_gift_date)}
            </p>
            {current.last_campaign && (
              <p className="text-sm mt-0.5" style={{ color: "#9ca3af" }}>
                📋 {current.last_campaign}
                {current.last_fund ? ` · ${current.last_fund}` : ""}
              </p>
            )}
            {current.donation_count > 1 && (
              <p className="text-sm mt-0.5 text-gray-600">
                {current.donation_count} total gifts · ${current.lifetime_giving?.toLocaleString()} lifetime
              </p>
            )}
          </div>

          {/* Suggested Ask */}
          <div className="mb-3">
            <span className="text-gray-500 text-sm uppercase tracking-wide">Suggested Ask</span>
            <p className="text-2xl font-bold mt-1" style={{ color: "#22c55e" }}>
              ${current.suggested_ask?.toLocaleString() || "180"}
            </p>
          </div>

          {/* Last call note */}
          {current.last_call_note && (
            <div className="mb-3 px-3 py-2 rounded-lg" style={{ background: "#1a2a1a" }}>
              <span className="text-xs uppercase tracking-wide text-gray-500">Last call note</span>
              <p className="text-gray-300 text-sm mt-0.5 leading-relaxed">
                &quot;{current.last_call_note.length > 100
                  ? current.last_call_note.slice(0, 100) + "…"
                  : current.last_call_note}&quot;
              </p>
            </div>
          )}

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
