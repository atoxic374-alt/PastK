import { useState, useEffect, useRef } from "react";
import {
  useGetBotStatus,
  useStartBot,
  useStopBot,
  useSubmitOtp,
  useGetBotAccount,
  useGetBotLogs,
  useGetMessages,
  useCreateMessage,
  useDeleteMessage,
  useSearchChannels,
  useGetChannelStatus,
  getGetBotStatusQueryKey,
  getGetBotLogsQueryKey,
  getGetMessagesQueryKey,
  getGetBotAccountQueryKey,
  getSearchChannelsQueryKey,
  getGetChannelStatusQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// ─── Types ─────────────────────────────────────────────────────

type Tab = "status" | "search" | "messages" | "logs";

const STATE_LABELS: Record<string, string> = {
  idle: "جاهز",
  launching: "يشغّل المتصفح...",
  logging_in: "يسجّل الدخول...",
  awaiting_otp: "ينتظر رمز OTP",
  verifying: "يتحقق من الجلسة...",
  monitoring: "يراقب القناة",
  live: "مباشر — يرسل رسائل",
  stopped: "متوقف",
  error: "خطأ",
};

const STATE_COLOR: Record<string, string> = {
  idle: "text-gray-400",
  launching: "text-yellow-400",
  logging_in: "text-yellow-400",
  awaiting_otp: "text-orange-400",
  verifying: "text-yellow-400",
  monitoring: "text-blue-400",
  live: "text-[#53fc18]",
  stopped: "text-gray-500",
  error: "text-red-400",
};

const STATE_DOT: Record<string, string> = {
  idle: "bg-gray-500",
  launching: "bg-yellow-400 animate-pulse",
  logging_in: "bg-yellow-400 animate-pulse",
  awaiting_otp: "bg-orange-400 animate-pulse",
  verifying: "bg-yellow-400 animate-pulse",
  monitoring: "bg-blue-400 animate-pulse",
  live: "bg-[#53fc18] animate-pulse",
  stopped: "bg-gray-600",
  error: "bg-red-500",
};

const LOG_ICONS: Record<string, string> = {
  BOT_START: "▶", BOT_STOP: "⏹", LIVE_START: "🔴", LIVE_END: "⚫",
  MESSAGE_SENT: "💬", LOGIN: "🔐", SESSION: "🍪", OTP: "📱",
  ACCOUNT: "👤", CHECK: "🔍", INFO: "ℹ", WARNING: "⚠", ERROR: "✗",
};

const LOG_COLOR: Record<string, string> = {
  BOT_START: "text-green-400", BOT_STOP: "text-gray-400", LIVE_START: "text-red-400",
  LIVE_END: "text-gray-400", MESSAGE_SENT: "text-[#53fc18]", LOGIN: "text-blue-400",
  SESSION: "text-purple-400", OTP: "text-orange-400", ACCOUNT: "text-cyan-400",
  CHECK: "text-gray-500", INFO: "text-gray-400", WARNING: "text-yellow-400", ERROR: "text-red-400",
};

// ─── Sub-components ────────────────────────────────────────────

function Avatar({ src, name, size = 40 }: { src?: string | null; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (src && !err) {
    return <img src={src} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} onError={() => setErr(true)} />;
  }
  return (
    <div className="rounded-full bg-[#53fc18]/20 flex items-center justify-center font-bold text-[#53fc18]"
      style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {name[0]?.toUpperCase()}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-current" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────

export default function Dashboard() {
  const qc = useQueryClient();

  const { data: status } = useGetBotStatus();
  const { data: accountData } = useGetBotAccount();
  const { data: logsData } = useGetBotLogs();
  const { data: messagesData } = useGetMessages();

  const startBot = useStartBot();
  const stopBot = useStopBot();
  const submitOtp = useSubmitOtp();
  const createMessage = useCreateMessage();
  const deleteMessage = useDeleteMessage();

  const [tab, setTab] = useState<Tab>("status");

  // Form state
  const [channelName, setChannelName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [intervalSec, setIntervalSec] = useState(300);

  // OTP
  const [otpCode, setOtpCode] = useState("");

  // Messages
  const [newMsg, setNewMsg] = useState("");

  // Channel search
  const [searchQ, setSearchQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (searchQ.length >= 2) {
      searchTimer.current = setTimeout(() => setDebouncedQ(searchQ), 600);
    } else {
      setDebouncedQ("");
    }
  }, [searchQ]);

  const { data: searchData, isFetching: searching } = useSearchChannels(
    { q: debouncedQ },
    { query: { enabled: debouncedQ.length >= 2, queryKey: getSearchChannelsQueryKey({ q: debouncedQ }) } }
  );

  // Monitored channel status (refetch every 10s)
  const trackedSlug = status?.channelName ?? "";
  const { data: trackedChannel } = useGetChannelStatus(
    trackedSlug,
    { query: {
        enabled: !!trackedSlug && (status?.state === "monitoring" || status?.state === "live"),
        refetchInterval: 10000,
        queryKey: getGetChannelStatusQueryKey(trackedSlug),
      }
    }
  );

  const state = status?.state ?? "idle";
  const account = accountData?.account ?? null;
  const logs = logsData?.logs ?? [];
  const messages = messagesData?.messages ?? [];
  const isRunning = ["launching", "logging_in", "awaiting_otp", "verifying", "monitoring", "live"].includes(state);
  const awaitingOtp = state === "awaiting_otp";

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
    qc.invalidateQueries({ queryKey: getGetBotLogsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetBotAccountQueryKey() });
  };

  const handleStart = async () => {
    if (!channelName.trim() || !email.trim() || !password.trim()) return;
    await startBot.mutateAsync({ data: { channelName: channelName.trim(), email: email.trim(), password, intervalSeconds: intervalSec } });
    invalidateAll();
  };

  const handleStop = async () => {
    await stopBot.mutateAsync();
    invalidateAll();
  };

  const handleOtp = async () => {
    if (!otpCode.trim()) return;
    await submitOtp.mutateAsync({ data: { code: otpCode.trim() } });
    setOtpCode("");
    invalidateAll();
  };

  const handleAddMsg = async () => {
    if (!newMsg.trim()) return;
    await createMessage.mutateAsync({ data: { text: newMsg.trim() } });
    setNewMsg("");
    qc.invalidateQueries({ queryKey: getGetMessagesQueryKey() });
  };

  const handleDelMsg = async (id: number) => {
    await deleteMessage.mutateAsync({ id });
    qc.invalidateQueries({ queryKey: getGetMessagesQueryKey() });
  };

  const setChannel = (slug: string) => {
    setChannelName(slug);
    setTab("status");
    setSearchQ("");
    setDebouncedQ("");
  };

  return (
    <div className="min-h-screen bg-[#0a0b0f] text-white" dir="rtl">

      {/* ── OTP Modal ─────────────────────────────────────────── */}
      {awaitingOtp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#13161f] border border-orange-500/50 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-xl">📱</div>
              <div>
                <p className="font-bold text-white">تحقق من إيميلك</p>
                <p className="text-xs text-gray-400">Kick أرسل رمز OTP — أدخله هنا</p>
              </div>
            </div>
            <input
              type="text"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
              onKeyDown={(e) => e.key === "Enter" && handleOtp()}
              placeholder="أدخل رمز التحقق"
              className="w-full bg-[#0a0b0f] border border-orange-500/50 rounded-xl px-4 py-3 text-center text-2xl tracking-widest font-mono text-white placeholder-gray-600 focus:outline-none focus:border-orange-400 mb-4"
              autoFocus
              dir="ltr"
            />
            <button
              onClick={handleOtp}
              disabled={!otpCode || submitOtp.isPending}
              className="w-full bg-orange-500 hover:bg-orange-400 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {submitOtp.isPending && <Spinner />}
              {submitOtp.isPending ? "جاري التحقق..." : "تأكيد الرمز"}
            </button>
          </div>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────── */}
      <header className="border-b border-white/5 bg-[#0a0b0f]/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#53fc18] flex items-center justify-center shadow-lg shadow-[#53fc18]/20">
              <span className="text-black font-black text-base">K</span>
            </div>
            <div>
              <p className="font-bold text-sm">Kick Bot</p>
              <p className="text-[10px] text-gray-500">لوحة التحكم</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${STATE_DOT[state] ?? "bg-gray-500"}`} />
            <span className={`text-xs font-medium ${STATE_COLOR[state] ?? "text-gray-400"}`}>
              {STATE_LABELS[state] ?? state}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-5">

        {/* ── Account card ──────────────────────────────────── */}
        {account && (
          <div className="bg-[#13161f] border border-white/5 rounded-2xl p-4 flex items-center gap-4">
            <Avatar src={account.avatar} name={account.username} size={52} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white flex items-center gap-2">
                @{account.username}
                {account.verified && (
                  <span className="text-[10px] bg-[#53fc18]/20 text-[#53fc18] px-2 py-0.5 rounded-full font-medium">موثّق</span>
                )}
              </p>
              {account.email && <p className="text-xs text-gray-500 truncate">{account.email}</p>}
            </div>
            <div className="flex gap-4 text-center shrink-0">
              <div>
                <p className="text-sm font-bold text-white">{account.followersCount.toLocaleString()}</p>
                <p className="text-[10px] text-gray-500">متابع</p>
              </div>
              <div>
                <p className="text-sm font-bold text-white">{account.followingCount.toLocaleString()}</p>
                <p className="text-[10px] text-gray-500">يتابع</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Stats row ─────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "الحالة", value: STATE_LABELS[state] ?? state, color: STATE_COLOR[state] },
            { label: "البث", value: status?.isLive ? "مباشر 🔴" : "أوفلاين", color: status?.isLive ? "text-red-400" : "text-gray-500" },
            { label: "المشاهدون", value: status?.viewers != null ? status.viewers.toLocaleString() : "—", color: "text-white" },
            { label: "الرسائل المرسلة", value: (status?.messagesSent ?? 0).toString(), color: "text-[#53fc18]" },
          ].map((s) => (
            <div key={s.label} className="bg-[#13161f] border border-white/5 rounded-xl p-3">
              <p className="text-[10px] text-gray-500 mb-1">{s.label}</p>
              <p className={`text-sm font-bold truncate ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* ── Stream title ───────────────────────────────────── */}
        {status?.streamTitle && (
          <div className="bg-[#13161f] border border-[#53fc18]/20 rounded-xl px-4 py-2.5 flex items-center gap-2">
            <span className="text-[#53fc18] text-sm">🎮</span>
            <p className="text-sm text-gray-300 truncate">{status.streamTitle}</p>
          </div>
        )}

        {/* ── Tabs ──────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-1 bg-[#13161f] border border-white/5 rounded-xl p-1">
          {(["status", "search", "messages", "logs"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                tab === t ? "bg-[#53fc18] text-black" : "text-gray-400 hover:text-white"
              }`}
            >
              {{ status: "التحكم", search: "بحث", messages: "الرسائل", logs: "السجل" }[t]}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════
            TAB: التحكم
        ══════════════════════════════════════════════════════ */}
        {tab === "status" && (
          <div className="space-y-4">
            {/* Config form */}
            <div className="bg-[#13161f] border border-white/5 rounded-2xl p-5 space-y-4">
              <p className="text-sm font-semibold text-white">إعدادات البوت</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-gray-400 mb-1.5 block">اسم القناة</label>
                  <input
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                    disabled={isRunning}
                    placeholder="xqc"
                    className="w-full bg-[#0a0b0f] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#53fc18]/40 disabled:opacity-40"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 mb-1.5 block">الفترة بين الرسائل (ثانية)</label>
                  <input
                    type="number"
                    value={intervalSec}
                    onChange={(e) => setIntervalSec(Math.max(60, Number(e.target.value)))}
                    disabled={isRunning}
                    min={60}
                    className="w-full bg-[#0a0b0f] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#53fc18]/40 disabled:opacity-40"
                  />
                  <p className="text-[10px] text-gray-600 mt-1">±30 ثانية عشوائية تلقائياً</p>
                </div>
              </div>

              <div className="border-t border-white/5 pt-4">
                <p className="text-[11px] text-gray-500 mb-3 flex items-center gap-1.5">
                  <span>🔐</span> بيانات الحساب — تُحفظ في كوكيز محلي فقط
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-gray-400 mb-1.5 block">الإيميل</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isRunning}
                      placeholder="you@email.com"
                      className="w-full bg-[#0a0b0f] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#53fc18]/40 disabled:opacity-40"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 mb-1.5 block">كلمة المرور</label>
                    <div className="relative">
                      <input
                        type={showPass ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isRunning}
                        placeholder="••••••••"
                        className="w-full bg-[#0a0b0f] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#53fc18]/40 disabled:opacity-40 pl-16"
                        dir="ltr"
                      />
                      <button type="button" onClick={() => setShowPass(!showPass)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-500 hover:text-gray-300 transition-colors">
                        {showPass ? "إخفاء" : "إظهار"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              {!isRunning ? (
                <button
                  onClick={handleStart}
                  disabled={!channelName.trim() || !email.trim() || !password.trim() || startBot.isPending}
                  className="w-full bg-[#53fc18] hover:bg-[#45d414] text-black font-bold py-3 rounded-xl text-sm transition-all disabled:opacity-30 flex items-center justify-center gap-2 shadow-lg shadow-[#53fc18]/10"
                >
                  {startBot.isPending && <Spinner />}
                  {startBot.isPending ? "جاري التشغيل..." : "تشغيل البوت"}
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  disabled={stopBot.isPending}
                  className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl text-sm transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {stopBot.isPending && <Spinner />}
                  {stopBot.isPending ? "جاري الإيقاف..." : "إيقاف البوت"}
                </button>
              )}

              {status?.error && (
                <div className="bg-red-950/50 border border-red-800/50 rounded-lg px-4 py-3 text-xs text-red-400">
                  ⚠ {status.error}
                </div>
              )}
            </div>

            {/* Live monitor card */}
            {(state === "monitoring" || state === "live") && trackedChannel && (
              <div className={`bg-[#13161f] border rounded-2xl p-4 space-y-3 ${trackedChannel.isLive ? "border-[#53fc18]/30" : "border-white/5"}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">القناة المراقبة</p>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${trackedChannel.isLive ? "bg-red-500/20 text-red-400" : "bg-gray-800 text-gray-500"}`}>
                    {trackedChannel.isLive ? "● LIVE" : "أوفلاين"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Avatar src={trackedChannel.avatar} name={trackedChannel.username} size={44} />
                  <div>
                    <p className="font-medium text-white">@{trackedChannel.username}</p>
                    {trackedChannel.streamTitle && <p className="text-xs text-gray-400 truncate max-w-xs">{trackedChannel.streamTitle}</p>}
                    {trackedChannel.category && <p className="text-[11px] text-purple-400">{trackedChannel.category}</p>}
                  </div>
                  {trackedChannel.viewers != null && (
                    <div className="mr-auto text-right">
                      <p className="text-sm font-bold text-white">{trackedChannel.viewers.toLocaleString()}</p>
                      <p className="text-[10px] text-gray-500">مشاهد</p>
                    </div>
                  )}
                </div>
                {trackedChannel.thumbnail && (
                  <img src={trackedChannel.thumbnail} alt="thumbnail" className="w-full rounded-lg object-cover max-h-32" />
                )}
              </div>
            )}

            {/* Stealth info */}
            <div className="bg-[#13161f] border border-white/5 rounded-xl px-4 py-3">
              <p className="text-[10px] text-gray-500 mb-2 font-semibold">طبقات الحماية المفعّلة</p>
              <div className="flex flex-wrap gap-2">
                {["WebDriver Masking","User-Agent Rotation","Human Typing Delay","±30s Jitter","Cookie Session","Mouse Simulation","OTP Handler"].map((f) => (
                  <span key={f} className="text-[10px] bg-[#53fc18]/10 text-[#53fc18]/80 px-2 py-0.5 rounded-full">{f}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: بحث
        ══════════════════════════════════════════════════════ */}
        {tab === "search" && (
          <div className="space-y-4">
            <div className="bg-[#13161f] border border-white/5 rounded-2xl p-5 space-y-4">
              <p className="text-sm font-semibold text-white">البحث عن قناة Kick</p>
              <div className="relative">
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="ابحث عن اسم القناة..."
                  className="w-full bg-[#0a0b0f] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#53fc18]/40 pl-10"
                  dir="ltr"
                  autoFocus
                />
                {searching && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><Spinner /></span>
                )}
              </div>

              {debouncedQ.length >= 2 && (
                <div className="space-y-2">
                  {!searchData?.results?.length && !searching && (
                    <p className="text-center text-gray-600 text-sm py-6">لا نتائج لـ "{debouncedQ}"</p>
                  )}
                  {searchData?.results?.map((ch) => (
                    <div key={ch.slug}
                      className="flex items-center gap-3 bg-[#0a0b0f] border border-white/5 rounded-xl p-3 hover:border-[#53fc18]/20 transition-all group">
                      <Avatar src={ch.avatar} name={ch.username} size={40} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-white text-sm">@{ch.username}</p>
                          {ch.isLive && (
                            <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-semibold animate-pulse">LIVE</span>
                          )}
                        </div>
                        {ch.streamTitle && <p className="text-xs text-gray-500 truncate">{ch.streamTitle}</p>}
                        {ch.category && <p className="text-[10px] text-purple-400">{ch.category}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {ch.viewers != null && ch.isLive && (
                          <span className="text-xs text-gray-400">{ch.viewers.toLocaleString()} 👁</span>
                        )}
                        <button
                          onClick={() => setChannel(ch.slug)}
                          className="text-xs bg-[#53fc18]/10 hover:bg-[#53fc18]/20 text-[#53fc18] px-3 py-1.5 rounded-lg font-medium transition-all opacity-0 group-hover:opacity-100"
                        >
                          تتبّع
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!debouncedQ && (
                <div className="text-center py-8 text-gray-600">
                  <p className="text-3xl mb-2">🔍</p>
                  <p className="text-sm">اكتب اسم القناة للبحث</p>
                  <p className="text-xs mt-1">يمكنك اختيار القناة مباشرة لإضافتها للمراقبة</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: الرسائل
        ══════════════════════════════════════════════════════ */}
        {tab === "messages" && (
          <div className="bg-[#13161f] border border-white/5 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">قائمة الرسائل التلقائية</p>
              <span className="text-xs text-gray-500 bg-[#0a0b0f] px-2.5 py-1 rounded-full">{messages.length} رسالة</span>
            </div>

            <div className="flex gap-2">
              <input
                value={newMsg}
                onChange={(e) => setNewMsg(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddMsg()}
                placeholder="أضف رسالة جديدة..."
                className="flex-1 bg-[#0a0b0f] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#53fc18]/40"
              />
              <button
                onClick={handleAddMsg}
                disabled={!newMsg.trim() || createMessage.isPending}
                className="bg-[#53fc18] hover:bg-[#45d414] text-black font-bold px-4 py-2.5 rounded-xl text-sm transition-all disabled:opacity-30"
              >
                إضافة
              </button>
            </div>

            {messages.length === 0 ? (
              <div className="text-center py-10 text-gray-600">
                <p className="text-3xl mb-2">💬</p>
                <p className="text-sm">لا توجد رسائل</p>
                <p className="text-xs mt-1">أضف رسائل سيرسلها البوت أثناء البث</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {messages.map((m) => (
                  <div key={m.id}
                    className="flex items-center justify-between bg-[#0a0b0f] border border-white/5 rounded-xl px-4 py-3 group hover:border-white/10 transition-all">
                    <span className="text-sm text-gray-200">{m.text}</span>
                    <button
                      onClick={() => handleDelMsg(m.id)}
                      className="text-[11px] text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0 mr-2"
                    >
                      حذف
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-gray-600 border-t border-white/5 pt-3">
              البوت يختار رسالة عشوائية كل مرة — تنويع الرسائل يقلّل احتمال الحظر
            </p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: السجل
        ══════════════════════════════════════════════════════ */}
        {tab === "logs" && (
          <div className="bg-[#13161f] border border-white/5 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">سجل الأحداث</p>
              <span className="text-xs text-gray-500 bg-[#0a0b0f] px-2.5 py-1 rounded-full">{logs.length} حدث</span>
            </div>

            {logs.length === 0 ? (
              <div className="text-center py-10 text-gray-600">
                <p className="text-3xl mb-2">📋</p>
                <p className="text-sm">لا يوجد سجل بعد</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                {logs.map((log) => (
                  <div key={log.id}
                    className="flex items-start gap-2.5 bg-[#0a0b0f] border border-white/5 rounded-lg px-3 py-2 font-mono text-xs">
                    <span className="shrink-0">{LOG_ICONS[log.event] ?? "•"}</span>
                    <span className={`font-bold shrink-0 ${LOG_COLOR[log.event] ?? "text-gray-400"}`}>{log.event}</span>
                    {log.message && <span className="text-gray-400 break-all flex-1">{log.message}</span>}
                    <span className="text-gray-700 shrink-0 text-[10px] mr-auto">
                      {new Date(log.timestamp).toLocaleTimeString("ar-SA")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
