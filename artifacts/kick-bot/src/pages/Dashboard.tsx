import { useState, useEffect, useRef, useCallback } from "react";
import {
  useGetBotStatus, useStartBot, useStopBot, useSubmitOtp,
  useGetBotAccount, useGetBotLogs, useGetMessages,
  useCreateMessage, useDeleteMessage, useSearchChannels,
  useGetChannelStatus, useGetRecentStreams,
  getGetBotStatusQueryKey, getGetBotLogsQueryKey, getGetMessagesQueryKey,
  getGetBotAccountQueryKey, getSearchChannelsQueryKey,
  getGetChannelStatusQueryKey, getGetRecentStreamsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// ─── SVG Icon components ──────────────────────────────────────

function IconPulse({ color = "#53fc18", size = 10 }: { color?: string; size?: number }) {
  return (
    <span className="relative flex" style={{ width: size, height: size }}>
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
        style={{ backgroundColor: color }} />
      <span className="relative inline-flex rounded-full" style={{ width: size, height: size, backgroundColor: color }} />
    </span>
  );
}

function IconDot({ state }: { state: string }) {
  const map: Record<string, string> = {
    idle: "#6b7280", launching: "#facc15", logging_in: "#facc15",
    awaiting_otp: "#fb923c", verifying: "#facc15", monitoring: "#60a5fa",
    live: "#53fc18", stopped: "#374151", error: "#ef4444",
  };
  const color = map[state] ?? "#6b7280";
  const pulse = ["launching", "logging_in", "awaiting_otp", "verifying", "monitoring", "live"].includes(state);
  return pulse ? <IconPulse color={color} size={8} /> : (
    <span className="inline-block rounded-full" style={{ width: 8, height: 8, backgroundColor: color }} />
  );
}

function IconSpinner({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="3" strokeDasharray="31.416" strokeDashoffset="10" strokeLinecap="round" />
    </svg>
  );
}

function IconLive({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="4" fill="#ef4444" className="animate-pulse" />
      <circle cx="12" cy="12" r="8" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 2" className="animate-spin" style={{ animationDuration: "3s" }} />
    </svg>
  );
}

function IconSignal({ size = 16, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M1 8 C3 4 9 1 12 1 C15 1 21 4 23 8" stroke={active ? "#60a5fa" : "#4b5563"} strokeWidth="2" strokeLinecap="round" />
      <path d="M4 12 C6 9 9 7 12 7 C15 7 18 9 20 12" stroke={active ? "#60a5fa" : "#4b5563"} strokeWidth="2" strokeLinecap="round" />
      <path d="M7 16 C8.5 14 10 13 12 13 C14 13 15.5 14 17 16" stroke={active ? "#60a5fa" : "#4b5563"} strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="20" r="1.5" fill={active ? "#60a5fa" : "#4b5563"} />
    </svg>
  );
}

function IconChat({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M20 2H4C2.9 2 2 2.9 2 4V16C2 17.1 2.9 18 4 18H8L12 22L16 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z"
        stroke="#53fc18" strokeWidth="2" strokeLinejoin="round" fill="none" />
      <line x1="7" y1="8" x2="17" y2="8" stroke="#53fc18" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="7" y1="12" x2="13" y2="12" stroke="#53fc18" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconEye({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z"
        stroke="#9ca3af" strokeWidth="2" fill="none" />
      <circle cx="12" cy="12" r="3" stroke="#9ca3af" strokeWidth="2" fill="none" />
    </svg>
  );
}

function IconUser({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke="#53fc18" strokeWidth="2" fill="none" />
      <path d="M4 20C4 16.686 7.582 14 12 14C16.418 14 20 16.686 20 20"
        stroke="#53fc18" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function IconShield({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2L4 6V12C4 16.4 7.4 20.5 12 22C16.6 20.5 20 16.4 20 12V6L12 2Z"
        stroke="#53fc18" strokeWidth="2" strokeLinejoin="round" fill="none" />
      <path d="M9 12L11 14L15 10" stroke="#53fc18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClock({ size = 16, color = "#9ca3af" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" fill="none" />
      <path d="M12 7V12L15 15" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconPlay({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M8 5L19 12L8 19V5Z" fill="#53fc18" stroke="#53fc18" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function IconStop({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="5" width="14" height="14" rx="2" fill="#ef4444" />
    </svg>
  );
}

function IconOTP({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="14" fill="#fb923c22" />
      <rect x="10" y="14" width="28" height="20" rx="4" stroke="#fb923c" strokeWidth="2" fill="none" />
      <line x1="10" y1="22" x2="38" y2="22" stroke="#fb923c" strokeWidth="1.5" />
      <rect x="14" y="26" width="4" height="4" rx="1" fill="#fb923c" className="animate-pulse" />
      <rect x="22" y="26" width="4" height="4" rx="1" fill="#fb923c" />
      <rect x="30" y="26" width="4" height="4" rx="1" fill="#fb923c" />
    </svg>
  );
}

function IconRefresh({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin" style={{ animationDuration: "1.5s" }}>
      <path d="M4 12C4 7.6 7.6 4 12 4C14.5 4 16.7 5.1 18.2 6.8" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
      <path d="M20 12C20 16.4 16.4 20 12 20C9.5 20 7.3 18.9 5.8 17.2" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 3L18.2 6.8L14.5 6.8" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 21L5.8 17.2L9.5 17.2" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────

const STATE_LABELS: Record<string, string> = {
  idle: "جاهز", launching: "يشغّل المتصفح", logging_in: "يسجّل الدخول",
  awaiting_otp: "ينتظر رمز OTP", verifying: "يتحقق من الجلسة",
  monitoring: "يراقب القناة", live: "داخل اللايف", stopped: "متوقف", error: "خطأ",
};

const STATE_COLOR: Record<string, string> = {
  idle: "text-gray-500", launching: "text-yellow-400", logging_in: "text-yellow-400",
  awaiting_otp: "text-orange-400", verifying: "text-yellow-400", monitoring: "text-blue-400",
  live: "text-[#53fc18]", stopped: "text-gray-600", error: "text-red-400",
};

function formatDuration(fromIso: string | null | undefined): string {
  if (!fromIso) return "—";
  const diff = Math.floor((Date.now() - new Date(fromIso).getTime()) / 1000);
  if (diff < 60) return `${diff}ث`;
  if (diff < 3600) return `${Math.floor(diff / 60)}د ${diff % 60}ث`;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return `${h}س ${m}د`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}

function Avatar({ src, name, size = 40 }: { src?: string | null; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (src && !err) {
    return <img src={src} alt={name} className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }} onError={() => setErr(true)} />;
  }
  return (
    <div className="rounded-full bg-[#53fc18]/20 flex items-center justify-center font-bold text-[#53fc18] shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {(name[0] ?? "?").toUpperCase()}
    </div>
  );
}

// ─── Live clock ───────────────────────────────────────────────
function LiveClock({ from }: { from: string | null | undefined }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <span>{formatDuration(from)}</span>;
}

type Tab = "status" | "search" | "messages" | "logs";

// ─── Main Dashboard ───────────────────────────────────────────
export default function Dashboard() {
  const qc = useQueryClient();

  const { data: status, isFetching: statusFetching } = useGetBotStatus();
  const { data: accountData } = useGetBotAccount();
  const { data: logsData } = useGetBotLogs();
  const { data: messagesData } = useGetMessages();

  const startBot = useStartBot();
  const stopBot = useStopBot();
  const submitOtp = useSubmitOtp();
  const createMessage = useCreateMessage();
  const deleteMessage = useDeleteMessage();

  const [tab, setTab] = useState<Tab>("status");
  const [immersiveMode, setImmersiveMode] = useState(true);

  // Form
  const [channelName, setChannelName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [intervalSec, setIntervalSec] = useState(300);

  // OTP
  const [otpCode, setOtpCode] = useState("");
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Messages
  const [newMsg, setNewMsg] = useState("");

  // Search
  const [searchQ, setSearchQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [selectedSlugForStreams, setSelectedSlugForStreams] = useState<string | null>(null);

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

  // Tracked channel status
  const trackedSlug = status?.channelName ?? "";
  const { data: trackedChannel } = useGetChannelStatus(
    trackedSlug,
    {
      query: {
        enabled: !!trackedSlug && (status?.state === "monitoring" || status?.state === "live"),
        refetchInterval: 15000,
        queryKey: getGetChannelStatusQueryKey(trackedSlug),
      },
    }
  );

  // Recent streams for a slug
  const { data: recentStreams, isFetching: loadingStreams } = useGetRecentStreams(
    selectedSlugForStreams ?? "",
    {
      query: {
        enabled: !!selectedSlugForStreams,
        queryKey: getGetRecentStreamsQueryKey(selectedSlugForStreams ?? ""),
        staleTime: 60000,
      },
    }
  );

  const state = status?.state ?? "idle";
  const account = accountData?.account ?? null;
  const logs = logsData?.logs ?? [];
  const messages = messagesData?.messages ?? [];
  const isRunning = ["launching", "logging_in", "awaiting_otp", "verifying", "monitoring", "live"].includes(state);
  const awaitingOtp = state === "awaiting_otp";

  // Auto-focus OTP input
  useEffect(() => {
    if (awaitingOtp) {
      setTimeout(() => otpInputRef.current?.focus(), 100);
    }
  }, [awaitingOtp]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
    qc.invalidateQueries({ queryKey: getGetBotLogsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetBotAccountQueryKey() });
  }, [qc]);

  const handleStart = async () => {
    if (!channelName.trim() || !email.trim() || !password.trim()) return;
    await startBot.mutateAsync({ data: { channelName: channelName.trim(), email: email.trim(), password, intervalSeconds: intervalSec } });
    invalidate();
  };

  const handleStop = async () => {
    await stopBot.mutateAsync();
    invalidate();
  };

  const handleOtp = async () => {
    if (!otpCode.trim()) return;
    await submitOtp.mutateAsync({ data: { code: otpCode.trim() } });
    setOtpCode("");
    invalidate();
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

  const pickChannel = (slug: string) => {
    setChannelName(slug);
    setTab("status");
    setSearchQ("");
    setDebouncedQ("");
  };

  return (
    <div className="min-h-screen bg-[#0a0b0f] text-white" dir="rtl">

      {/* ══ OTP Modal ════════════════════════════════════════════ */}
      {awaitingOtp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="bg-[#13161f] border border-orange-500/40 rounded-2xl p-7 w-full max-w-sm mx-4 shadow-2xl shadow-orange-900/20"
            style={{ animation: "slideUp 0.25s ease-out" }}>

            <div className="flex flex-col items-center mb-6">
              <IconOTP size={52} />
              <h2 className="mt-4 text-lg font-bold text-white">تحقق من بريدك الإلكتروني</h2>
              <p className="text-sm text-gray-400 mt-1 text-center">
                أرسل لك Kick رمز OTP — أدخله أدناه
              </p>
            </div>

            {/* OTP digit boxes */}
            <div className="relative mb-5">
              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                onKeyDown={(e) => e.key === "Enter" && handleOtp()}
                placeholder="000000"
                className="w-full bg-[#0a0b0f] border-2 border-orange-500/50 focus:border-orange-400 rounded-xl px-4 py-4 text-center text-3xl tracking-[0.5em] font-mono text-white placeholder-gray-700 focus:outline-none transition-colors"
                dir="ltr"
                autoComplete="one-time-code"
              />
            </div>

            <button
              onClick={handleOtp}
              disabled={!otpCode || submitOtp.isPending}
              className="w-full bg-orange-500 hover:bg-orange-400 active:scale-95 text-white font-bold py-3.5 rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-2 text-sm"
            >
              {submitOtp.isPending ? <><IconSpinner size={16} color="white" /> جاري التحقق...</> : "تأكيد الرمز →"}
            </button>

            <p className="text-center text-xs text-gray-600 mt-4">
              البوت سيكمل تلقائياً بعد التحقق
            </p>
          </div>
        </div>
      )}

      {/* ══ Header ═══════════════════════════════════════════════ */}
      <header className="border-b border-white/5 bg-[#0a0b0f]/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#53fc18] flex items-center justify-center shadow-lg shadow-[#53fc18]/20 shrink-0">
              <span className="text-black font-black text-base">K</span>
            </div>
            <div>
              <p className="font-bold text-sm leading-none">Kick Bot</p>
              <p className="text-[10px] text-gray-500 mt-0.5">لوحة التحكم</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {statusFetching && <IconRefresh size={12} />}
            <IconDot state={state} />
            <span className={`text-xs font-semibold ${STATE_COLOR[state] ?? "text-gray-400"}`}>
              {STATE_LABELS[state] ?? state}
            </span>
          </div>
        </div>
      </header>

      <main className={`${immersiveMode ? "max-w-7xl" : "max-w-4xl"} mx-auto px-4 py-5 space-y-4`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <IconDot state={state} />
            <span>{STATE_LABELS[state] ?? state}</span>
            {state === "live" && (
              <span className="text-[#53fc18] font-semibold">داخل البث الآن</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setImmersiveMode((v) => !v)}
            className="text-[11px] px-3 py-1.5 rounded-full border border-white/10 bg-[#13161f] text-white hover:border-[#53fc18]/30 hover:text-[#53fc18] transition-colors"
          >
            {immersiveMode ? "خروج من وضع الشاشة" : "وضع الشاشة"}
          </button>
        </div>

        {/* ══ Account card ═════════════════════════════════════════ */}
        {account && (
          <div className="bg-[#13161f] border border-white/5 rounded-2xl p-4 flex items-center gap-4">
            <Avatar src={account.avatar} name={account.username} size={50} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-white">@{account.username}</p>
                {account.verified && (
                  <span className="text-[10px] bg-[#53fc18]/15 text-[#53fc18] px-2 py-0.5 rounded-full font-semibold border border-[#53fc18]/20">
                    موثّق ✓
                  </span>
                )}
              </div>
              {account.email && <p className="text-[11px] text-gray-500 truncate mt-0.5">{account.email}</p>}
            </div>
            <div className="flex gap-5 text-center shrink-0">
              <div>
                <p className="text-sm font-bold text-white">{account.followersCount.toLocaleString("ar-SA")}</p>
                <p className="text-[10px] text-gray-500">متابع</p>
              </div>
              <div>
                <p className="text-sm font-bold text-white">{account.followingCount.toLocaleString("ar-SA")}</p>
                <p className="text-[10px] text-gray-500">يتابع</p>
              </div>
            </div>
          </div>
        )}

        {/* ══ Live session banner ═══════════════════════════════════ */}
        {state === "live" && (
          <div className="bg-gradient-to-l from-[#53fc18]/10 via-[#53fc18]/5 to-[#53fc18]/0 border border-[#53fc18]/35 rounded-3xl p-5 shadow-2xl shadow-[#53fc18]/5">
            <div className="flex items-center gap-3 mb-3">
              <IconLive size={18} />
              <p className="font-bold text-[#53fc18] text-sm">داخل البث — جلسة #{status?.liveSessionCount ?? 1}</p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { icon: <IconClock size={14} color="#53fc18" />, label: "وقتي في اللايف", value: <LiveClock from={status?.liveEnteredAt} /> },
                { icon: <IconClock size={14} color="#60a5fa" />, label: "بدأ اللايف منذ", value: <LiveClock from={status?.streamStartedAt} /> },
                { icon: <IconEye size={14} />, label: "المشاهدون", value: status?.viewers?.toLocaleString("ar-SA") ?? "—" },
                { icon: <IconChat size={14} />, label: "رسائل أرسلتها", value: (status?.messagesSent ?? 0).toString() },
              ].map((s, i) => (
                <div key={i} className="bg-black/30 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">{s.icon}<p className="text-[10px] text-gray-500">{s.label}</p></div>
                  <p className="text-sm font-bold text-white font-mono">{s.value}</p>
                </div>
              ))}
            </div>
            {status?.streamTitle && (
              <p className="mt-3 text-xs text-gray-400 truncate border-t border-white/5 pt-2">
                عنوان البث: {status.streamTitle}
                {status.category && <span className="text-purple-400 mr-2"> · {status.category}</span>}
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
              {[
                { label: "قناة المتابعة", value: `@${status?.channelName ?? ""}` },
                { label: "الحساب", value: account?.username ? `@${account.username}` : "—" },
                { label: "متابعون", value: status?.channelFollowers != null ? status.channelFollowers.toLocaleString("ar-SA") : "—" },
                { label: "جلسات", value: (status?.liveSessionCount ?? 0).toString() },
              ].map((item) => (
                <div key={item.label} className="bg-black/20 rounded-xl px-3 py-2">
                  <p className="text-[10px] text-gray-500">{item.label}</p>
                  <p className="text-xs font-bold text-white mt-0.5 truncate">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ Stats row ════════════════════════════════════════════ */}
        {state !== "live" && (
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "الحالة", value: STATE_LABELS[state] ?? state, color: STATE_COLOR[state] },
              { label: "البث", value: status?.isLive ? "مباشر" : "أوفلاين", color: status?.isLive ? "text-red-400" : "text-gray-600" },
              { label: "المشاهدون", value: status?.viewers != null ? status.viewers.toLocaleString("ar-SA") : "—", color: "text-white" },
              { label: "الرسائل", value: (status?.messagesSent ?? 0).toString(), color: "text-[#53fc18]" },
            ].map((s) => (
              <div key={s.label} className="bg-[#13161f] border border-white/5 rounded-xl p-3">
                <p className="text-[10px] text-gray-600 mb-1">{s.label}</p>
                <p className={`text-sm font-bold truncate ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ══ Tabs ═════════════════════════════════════════════════ */}
          <div className="grid grid-cols-4 gap-1 bg-[#13161f] border border-white/5 rounded-xl p-1">
          {(["status", "search", "messages", "logs"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                tab === t ? "bg-[#53fc18] text-black shadow-sm" : "text-gray-500 hover:text-white"
              }`}>
              {{ status: "التحكم", search: "بحث", messages: "الرسائل", logs: "السجل" }[t]}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════
            TAB: التحكم
        ════════════════════════════════════════════════════════ */}
        {tab === "status" && (
          <div className="space-y-4">
            {/* Config form */}
            <div className="bg-[#13161f] border border-white/5 rounded-2xl p-5 space-y-5">
              <div className="flex items-center gap-2">
                <IconSignal size={18} active={state === "monitoring"} />
                <p className="text-sm font-semibold text-white">إعدادات البوت</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-gray-500 mb-1.5 block">اسم القناة</label>
                  <input value={channelName} onChange={(e) => setChannelName(e.target.value)}
                    disabled={isRunning} placeholder="xqc"
                    className="w-full bg-[#0a0b0f] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-[#53fc18]/40 disabled:opacity-40 transition-colors"
                    dir="ltr" />
                  <p className="text-[10px] text-gray-600 mt-1">
                    يراقب القناة ويدخل اللايف تلقائياً عند البدء
                  </p>
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 mb-1.5 block">الفترة بين الرسائل (ثانية)</label>
                  <input type="number" value={intervalSec}
                    onChange={(e) => setIntervalSec(Math.max(60, Number(e.target.value)))}
                    disabled={isRunning} min={60}
                    className="w-full bg-[#0a0b0f] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#53fc18]/40 disabled:opacity-40 transition-colors" />
                  <p className="text-[10px] text-gray-600 mt-1">±45 ثانية عشوائية تلقائياً</p>
                </div>
              </div>

              <div className="border-t border-white/5 pt-4 space-y-3">
                <p className="text-[11px] text-gray-500 flex items-center gap-2">
                  <IconUser size={13} /> بيانات الحساب — تُحفظ كـ cookies محلية فقط
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-gray-500 mb-1.5 block">الإيميل</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      disabled={isRunning} placeholder="you@email.com"
                      className="w-full bg-[#0a0b0f] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-[#53fc18]/40 disabled:opacity-40 transition-colors"
                      dir="ltr" />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 mb-1.5 block">كلمة المرور</label>
                    <div className="relative">
                      <input type={showPass ? "text" : "password"} value={password}
                        onChange={(e) => setPassword(e.target.value)} disabled={isRunning}
                        placeholder="••••••••"
                        className="w-full bg-[#0a0b0f] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-[#53fc18]/40 disabled:opacity-40 transition-colors pl-14"
                        dir="ltr" />
                      <button type="button" onClick={() => setShowPass(!showPass)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
                        {showPass ? "إخفاء" : "إظهار"}
                      </button>
                    </div>
                  </div>
                </div>
                {account && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: "الاسم", value: `@${account.username}` },
                      { label: "الإيميل", value: account.email ?? "—" },
                      { label: "المتابعون", value: account.followersCount.toLocaleString("ar-SA") },
                      { label: "يتابع", value: account.followingCount.toLocaleString("ar-SA") },
                    ].map((item) => (
                      <div key={item.label} className="bg-black/20 rounded-xl px-3 py-2">
                        <p className="text-[10px] text-gray-500">{item.label}</p>
                        <p className="text-xs font-bold text-white mt-0.5 truncate">{item.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action button */}
              {!isRunning ? (
                <button onClick={handleStart}
                  disabled={!channelName.trim() || !email.trim() || !password.trim() || startBot.isPending}
                  className="w-full bg-[#53fc18] hover:bg-[#45d414] active:scale-[0.99] text-black font-bold py-3.5 rounded-xl text-sm transition-all disabled:opacity-30 flex items-center justify-center gap-2 shadow-lg shadow-[#53fc18]/10">
                  {startBot.isPending ? <><IconSpinner size={16} color="black" /> جاري التشغيل...</>
                    : <><IconPlay size={16} /> تشغيل البوت</>}
                </button>
              ) : (
                <button onClick={handleStop} disabled={stopBot.isPending}
                  className="w-full bg-red-600/90 hover:bg-red-500 active:scale-[0.99] text-white font-bold py-3.5 rounded-xl text-sm transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                  {stopBot.isPending ? <><IconSpinner size={16} color="white" /> جاري الإيقاف...</>
                    : <><IconStop size={16} /> إيقاف البوت</>}
                </button>
              )}

              {status?.error && (
                <div className="bg-red-950/40 border border-red-700/40 rounded-xl px-4 py-3 text-xs text-red-400 flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">⚠</span>
                  <span>{status.error}</span>
                </div>
              )}
            </div>

            {/* Live monitor card */}
            {(state === "monitoring" || state === "live") && trackedChannel && (
              <div className={`bg-[#13161f] border rounded-2xl p-4 space-y-3 ${trackedChannel.isLive ? "border-[#53fc18]/35 shadow-lg shadow-[#53fc18]/5" : "border-white/5"}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">القناة المراقبة</p>
                  <div className="flex items-center gap-2">
                    {trackedChannel.isLive && <IconPulse color="#ef4444" size={7} />}
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${trackedChannel.isLive ? "bg-red-500/15 text-red-400" : "bg-gray-800 text-gray-500"}`}>
                      {trackedChannel.isLive ? "LIVE" : "أوفلاين"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Avatar src={trackedChannel.avatar} name={trackedChannel.username} size={44} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm">@{trackedChannel.username}</p>
                    {trackedChannel.streamTitle && <p className="text-xs text-gray-400 truncate">{trackedChannel.streamTitle}</p>}
                    {trackedChannel.category && <p className="text-[11px] text-purple-400">{trackedChannel.category}</p>}
                  </div>
                  <div className="text-left shrink-0 space-y-1">
                    {trackedChannel.viewers != null && (
                      <div className="flex items-center gap-1 justify-end">
                        <IconEye size={12} />
                        <span className="text-xs font-bold text-white">{trackedChannel.viewers.toLocaleString("ar-SA")}</span>
                      </div>
                    )}
                    {trackedChannel.followersCount != null && (
                      <p className="text-[10px] text-gray-500">{trackedChannel.followersCount.toLocaleString("ar-SA")} متابع</p>
                    )}
                    {trackedChannel.streamStartedAt && (
                      <p className="text-[10px] text-gray-600">بث منذ <LiveClock from={trackedChannel.streamStartedAt} /></p>
                    )}
                  </div>
                </div>
                {trackedChannel.thumbnail && (
                  <img src={trackedChannel.thumbnail} alt="stream thumbnail"
                    className="w-full rounded-xl object-cover" style={{ maxHeight: 140 }} />
                )}
                <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-500">
                  <div className="bg-black/20 rounded-xl px-3 py-2">
                    <p>القناة</p>
                    <p className="text-white font-bold truncate">@{trackedChannel.username}</p>
                  </div>
                  <div className="bg-black/20 rounded-xl px-3 py-2">
                    <p>الحالة</p>
                    <p className={`font-bold ${trackedChannel.isLive ? "text-red-400" : "text-gray-400"}`}>
                      {trackedChannel.isLive ? "مباشر" : "أوفلاين"}
                    </p>
                  </div>
                </div>
                {/* View recent streams button */}
                <button
                  onClick={() => { setSelectedSlugForStreams(trackedChannel.slug); setTab("search"); }}
                  className="text-[11px] text-gray-500 hover:text-[#53fc18] transition-colors flex items-center gap-1">
                  <IconClock size={11} color="currentColor" /> عرض آخر البثوث
                </button>
              </div>
            )}

            {/* Stealth badges */}
            <div className="bg-[#13161f] border border-white/5 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <IconShield size={14} />
                <p className="text-[11px] text-gray-400 font-semibold">طبقات الحماية المفعّلة</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["WebDriver Masking", "Plugins Spoof", "Human Typing", "Mouse Simulation", "±45s Jitter",
                  "Cookie Session", "OTP Handler", "Idle Behavior", "Quiet API Check", "Sequential Nav", "Account Card", "Recent Streams"].map((f) => (
                  <span key={f} className="text-[10px] bg-[#53fc18]/8 text-[#53fc18]/70 border border-[#53fc18]/15 px-2 py-0.5 rounded-full">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            TAB: بحث
        ════════════════════════════════════════════════════════ */}
        {tab === "search" && (
          <div className="space-y-4">
            <div className="bg-[#13161f] border border-white/5 rounded-2xl p-5 space-y-4">
              <p className="text-sm font-semibold text-white">البحث عن قنوات Kick</p>
              <div className="relative">
                <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="ابحث باسم القناة..."
                  className="w-full bg-[#0a0b0f] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-[#53fc18]/40 transition-colors"
                  dir="ltr" autoFocus />
                {searching && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2"><IconSpinner size={14} color="#60a5fa" /></span>
                )}
              </div>

              {debouncedQ.length >= 2 && (
                <div className="space-y-2">
                  {!searchData?.results?.length && !searching && (
                    <p className="text-center text-gray-600 text-sm py-8">لا نتائج لـ "{debouncedQ}"</p>
                  )}
                  {searchData?.results?.map((ch) => (
                    <div key={ch.slug}
                      className="flex items-center gap-3 bg-[#0a0b0f] border border-white/5 rounded-xl p-3 hover:border-white/10 transition-all group">
                      <Avatar src={ch.avatar} name={ch.username} size={42} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-white text-sm">@{ch.username}</p>
                          {ch.isLive && (
                            <span className="flex items-center gap-1 text-[10px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded font-bold">
                              <IconPulse color="#ef4444" size={6} /> LIVE
                            </span>
                          )}
                        </div>
                        {ch.streamTitle && <p className="text-xs text-gray-500 truncate">{ch.streamTitle}</p>}
                        {ch.category && <p className="text-[10px] text-purple-400">{ch.category}</p>}
                        {ch.followersCount && <p className="text-[10px] text-gray-600">{ch.followersCount.toLocaleString("ar-SA")} متابع</p>}
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {ch.viewers != null && ch.isLive && (
                          <div className="flex items-center gap-1">
                            <IconEye size={12} />
                            <span className="text-xs text-gray-400">{ch.viewers.toLocaleString("ar-SA")}</span>
                          </div>
                        )}
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setSelectedSlugForStreams(ch.slug); }}
                            className="text-[11px] bg-white/5 hover:bg-white/10 text-gray-300 px-2 py-1 rounded-lg transition-all">
                            بثوثه
                          </button>
                          <button onClick={() => pickChannel(ch.slug)}
                            className="text-[11px] bg-[#53fc18]/15 hover:bg-[#53fc18]/25 text-[#53fc18] px-3 py-1 rounded-lg font-semibold transition-all">
                            تتبّع
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!debouncedQ && (
                <div className="text-center py-10 text-gray-600">
                  <IconSignal size={32} active={false} />
                  <p className="text-sm mt-3">ابحث باسم القناة</p>
                  <p className="text-xs mt-1">اضغط "تتبّع" لمراقبتها تلقائياً</p>
                </div>
              )}
              {debouncedQ.length >= 2 && !searching && searchData?.results?.length === 0 && (searchData as any)?.error === "start_bot_first" && (
                <div className="bg-orange-950/30 border border-orange-700/30 rounded-xl px-4 py-4 text-center">
                  <p className="text-sm text-orange-400 font-semibold">شغّل البوت أولاً للبحث</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Kick تحجب الطلبات المباشرة — البحث يعمل عبر متصفح البوت
                  </p>
                </div>
              )}
            </div>

            {/* Recent streams section */}
            {selectedSlugForStreams && (
              <div className="bg-[#13161f] border border-white/5 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <IconClock size={15} color="#60a5fa" />
                    <p className="text-sm font-semibold text-white">آخر بثوث @{selectedSlugForStreams}</p>
                  </div>
                  {recentStreams?.totalStreams != null && (
                    <span className="text-xs text-gray-500 bg-[#0a0b0f] px-2.5 py-1 rounded-full">
                      {recentStreams.totalStreams} بث إجمالاً
                    </span>
                  )}
                </div>

                {loadingStreams && (
                  <div className="flex items-center justify-center py-8 gap-2 text-blue-400">
                    <IconSpinner size={16} color="#60a5fa" />
                    <span className="text-sm">جاري التحميل...</span>
                  </div>
                )}

                {!loadingStreams && (!recentStreams?.streams?.length) && (
                  <p className="text-center text-gray-600 text-sm py-6">لا توجد بثوث مسجلة</p>
                )}

                {recentStreams?.streams?.map((s) => (
                  <div key={s.id} className="flex items-start gap-3 bg-[#0a0b0f] border border-white/5 rounded-xl p-3">
                    {s.thumbnail ? (
                      <img src={s.thumbnail} alt={s.title ?? ""} className="w-20 rounded-lg object-cover shrink-0" style={{ height: 48 }} />
                    ) : (
                      <div className="w-20 h-12 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                        <IconPlay size={18} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{s.title ?? "بدون عنوان"}</p>
                      {s.category && <p className="text-[10px] text-purple-400">{s.category}</p>}
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {s.startedAt && <span className="text-[10px] text-gray-500">{formatDate(s.startedAt)}</span>}
                        {s.durationSeconds != null && (
                          <span className="text-[10px] text-gray-600">
                            {Math.floor(s.durationSeconds / 3600)}س {Math.floor((s.durationSeconds % 3600) / 60)}د
                          </span>
                        )}
                        {s.peakViewers != null && (
                          <span className="text-[10px] text-gray-600 flex items-center gap-0.5">
                            <IconEye size={10} /> {s.peakViewers.toLocaleString("ar-SA")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            TAB: الرسائل
        ════════════════════════════════════════════════════════ */}
        {tab === "messages" && (
          <div className="bg-[#13161f] border border-white/5 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconChat size={16} />
                <p className="text-sm font-semibold text-white">الرسائل التلقائية</p>
              </div>
              <span className="text-xs text-gray-500 bg-[#0a0b0f] px-2.5 py-1 rounded-full">{messages.length} رسالة</span>
            </div>

            <div className="flex gap-2">
              <input value={newMsg} onChange={(e) => setNewMsg(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddMsg()}
                placeholder="أضف رسالة سيرسلها البوت..."
                className="flex-1 bg-[#0a0b0f] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-[#53fc18]/40 transition-colors" />
              <button onClick={handleAddMsg} disabled={!newMsg.trim() || createMessage.isPending}
                className="bg-[#53fc18] hover:bg-[#45d414] text-black font-bold px-5 py-2.5 rounded-xl text-sm transition-all disabled:opacity-30 shrink-0">
                إضافة
              </button>
            </div>

            {messages.length === 0 ? (
              <div className="text-center py-10 text-gray-600">
                <IconChat size={32} />
                <p className="text-sm mt-3">لا توجد رسائل بعد</p>
                <p className="text-xs mt-1">أضف رسائل يختار منها البوت عشوائياً</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {messages.map((m) => (
                  <div key={m.id}
                    className="flex items-center justify-between bg-[#0a0b0f] border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 group transition-all">
                    <span className="text-sm text-gray-200 flex-1 min-w-0 truncate">{m.text}</span>
                    <button onClick={() => handleDelMsg(m.id)}
                      className="text-[11px] text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0 mr-3">
                      حذف
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-gray-600 border-t border-white/5 pt-3 flex items-center gap-1">
              <IconShield size={11} /> البوت يختار رسالة عشوائية — نوّع الرسائل لتقليل احتمال الحظر
            </p>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            TAB: السجل
        ════════════════════════════════════════════════════════ */}
        {tab === "logs" && (
          <div className="bg-[#13161f] border border-white/5 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">سجل الأحداث</p>
              <span className="text-xs text-gray-500 bg-[#0a0b0f] px-2.5 py-1 rounded-full">{logs.length} حدث</span>
            </div>

            {logs.length === 0 ? (
              <div className="text-center py-10 text-gray-600">
                <IconSignal size={28} active={false} />
                <p className="text-sm mt-3">لا يوجد سجل بعد</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[520px] overflow-y-auto">
                {logs.map((log) => {
                  const colors: Record<string, string> = {
                    BOT_START: "text-green-400", BOT_STOP: "text-gray-500",
                    LIVE_START: "text-red-400", LIVE_END: "text-gray-400",
                    MESSAGE_SENT: "text-[#53fc18]", LOGIN: "text-blue-400",
                    SESSION: "text-purple-400", OTP: "text-orange-400",
                    ACCOUNT: "text-cyan-400", CHECK: "text-gray-600",
                    INFO: "text-gray-500", WARNING: "text-yellow-400", ERROR: "text-red-400",
                  };
                  return (
                    <div key={log.id}
                      className="flex items-start gap-2 bg-[#0a0b0f] border border-white/5 rounded-lg px-3 py-2 font-mono text-xs">
                      <span className={`font-bold shrink-0 ${colors[log.event] ?? "text-gray-500"}`}>
                        [{log.event}]
                      </span>
                      {log.message && <span className="text-gray-400 break-all flex-1">{log.message}</span>}
                      <span className="text-gray-700 shrink-0 text-[10px] mr-auto whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString("ar-SA")}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </main>

      {/* Slide-up animation for OTP modal */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );

  async function handleDelMsg(id: number) {
    await deleteMessage.mutateAsync({ id });
    qc.invalidateQueries({ queryKey: getGetMessagesQueryKey() });
  }
}
