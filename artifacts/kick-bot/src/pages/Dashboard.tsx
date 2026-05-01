import { useState, useEffect } from "react";
import {
  useGetBotStatus,
  useStartBot,
  useStopBot,
  useGetBotLogs,
  useGetMessages,
  useCreateMessage,
  useDeleteMessage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetBotStatusQueryKey, getGetBotLogsQueryKey, getGetMessagesQueryKey } from "@workspace/api-client-react";

export default function Dashboard() {
  const qc = useQueryClient();

  const { data: status } = useGetBotStatus();
  const { data: logsData } = useGetBotLogs();
  const { data: messagesData } = useGetMessages();

  const startBot = useStartBot();
  const stopBot = useStopBot();
  const createMessage = useCreateMessage();
  const deleteMessage = useDeleteMessage();

  const [channelName, setChannelName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [intervalSec, setIntervalSec] = useState(300);
  const [newMessage, setNewMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"control" | "messages" | "logs">("control");

  const isRunning = status?.running ?? false;
  const isLive = status?.isLive ?? false;

  const handleStart = async () => {
    if (!channelName || !email || !password) return;
    await startBot.mutateAsync({
      data: { channelName, email, password: password, intervalSeconds: intervalSec },
    });
    qc.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
  };

  const handleStop = async () => {
    await stopBot.mutateAsync();
    qc.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
  };

  const handleAddMessage = async () => {
    if (!newMessage.trim()) return;
    await createMessage.mutateAsync({ data: { text: newMessage.trim() } });
    setNewMessage("");
    qc.invalidateQueries({ queryKey: getGetMessagesQueryKey() });
  };

  const handleDeleteMessage = async (id: number) => {
    await deleteMessage.mutateAsync({ id });
    qc.invalidateQueries({ queryKey: getGetMessagesQueryKey() });
  };

  const logs = logsData?.logs ?? [];
  const messages = messagesData?.messages ?? [];

  const getLogIcon = (event: string) => {
    if (event === "MESSAGE_SENT") return "💬";
    if (event === "LIVE_START") return "🔴";
    if (event === "LIVE_END") return "⬛";
    if (event === "LOGIN") return "🔐";
    if (event === "SESSION") return "🍪";
    if (event === "ERROR") return "❌";
    if (event === "BOT_START") return "▶️";
    if (event === "BOT_STOP") return "⏹️";
    return "ℹ️";
  };

  const getLogColor = (event: string) => {
    if (event === "ERROR") return "text-red-400";
    if (event === "MESSAGE_SENT") return "text-green-400";
    if (event === "LIVE_START") return "text-red-400";
    if (event === "BOT_START") return "text-green-400";
    if (event === "BOT_STOP") return "text-yellow-400";
    if (event === "LOGIN" || event === "SESSION") return "text-blue-400";
    return "text-gray-400";
  };

  return (
    <div className="min-h-screen bg-[#0d0f14] text-white">
      {/* Header */}
      <header className="border-b border-[#1e2330] bg-[#0d0f14] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#53fc18] flex items-center justify-center">
              <span className="text-black font-black text-sm">K</span>
            </div>
            <div>
              <h1 className="font-bold text-white text-sm">Kick Bot</h1>
              <p className="text-[10px] text-gray-500">لوحة التحكم</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isRunning && (
              <div className="flex items-center gap-1.5 bg-[#1a1f2e] border border-[#53fc18]/20 rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#53fc18] animate-pulse-live inline-block"></span>
                <span className="text-[11px] text-[#53fc18] font-medium">
                  {isLive ? `مباشر — ${status?.channelName}` : `يراقب — ${status?.channelName}`}
                </span>
              </div>
            )}
            {!isRunning && (
              <div className="flex items-center gap-1.5 bg-[#1a1f2e] border border-gray-700 rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-500 inline-block"></span>
                <span className="text-[11px] text-gray-400 font-medium">متوقف</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#13161f] border border-[#1e2330] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">الحالة</p>
            <p className={`text-lg font-bold ${isRunning ? "text-[#53fc18]" : "text-gray-400"}`}>
              {isRunning ? "يعمل" : "متوقف"}
            </p>
          </div>
          <div className="bg-[#13161f] border border-[#1e2330] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">البث</p>
            <p className={`text-lg font-bold ${isLive ? "text-red-400" : "text-gray-400"}`}>
              {isLive ? "مباشر 🔴" : "أوفلاين"}
            </p>
          </div>
          <div className="bg-[#13161f] border border-[#1e2330] rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">الرسائل المرسلة</p>
            <p className="text-lg font-bold text-white">{status?.messagesSent ?? 0}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[#13161f] border border-[#1e2330] rounded-xl p-1">
          {(["control", "messages", "logs"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === tab
                  ? "bg-[#53fc18] text-black"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab === "control" ? "التحكم" : tab === "messages" ? "الرسائل" : "السجلات"}
            </button>
          ))}
        </div>

        {/* Control Tab */}
        {activeTab === "control" && (
          <div className="bg-[#13161f] border border-[#1e2330] rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-white text-sm">إعدادات البوت</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">اسم القناة على Kick</label>
                <input
                  type="text"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  placeholder="مثال: xqc"
                  disabled={isRunning}
                  className="w-full bg-[#0d0f14] border border-[#1e2330] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#53fc18]/50 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">الفترة بين الرسائل (ثانية)</label>
                <input
                  type="number"
                  value={intervalSec}
                  onChange={(e) => setIntervalSec(Number(e.target.value))}
                  min={60}
                  max={3600}
                  disabled={isRunning}
                  className="w-full bg-[#0d0f14] border border-[#1e2330] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#53fc18]/50 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-[10px] text-gray-600 mt-1">سيُضاف تشتيت عشوائي ±30 ثانية تلقائياً</p>
              </div>
            </div>

            <div className="border-t border-[#1e2330] pt-4">
              <p className="text-xs text-gray-500 mb-3 flex items-center gap-1.5">
                <span>🔐</span>
                <span>بيانات حساب Kick — تُستخدم فقط لتسجيل الدخول محلياً وتُحفظ في ملف كوكيز محلي</span>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    disabled={isRunning}
                    className="w-full bg-[#0d0f14] border border-[#1e2330] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#53fc18]/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">كلمة المرور</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      disabled={isRunning}
                      className="w-full bg-[#0d0f14] border border-[#1e2330] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#53fc18]/50 disabled:opacity-50 disabled:cursor-not-allowed pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
                    >
                      {showPassword ? "إخفاء" : "إظهار"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2">
              {!isRunning ? (
                <button
                  onClick={handleStart}
                  disabled={!channelName || !email || !password || startBot.isPending}
                  className="w-full bg-[#53fc18] hover:bg-[#45d414] text-black font-bold py-3 rounded-xl text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {startBot.isPending ? "جاري التشغيل..." : "تشغيل البوت"}
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  disabled={stopBot.isPending}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl text-sm transition-all disabled:opacity-40"
                >
                  {stopBot.isPending ? "جاري الإيقاف..." : "إيقاف البوت"}
                </button>
              )}
            </div>

            {isRunning && (
              <div className="bg-[#0d0f14] border border-[#53fc18]/20 rounded-lg p-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-gray-500">القناة: </span>
                    <span className="text-white font-medium">{status?.channelName}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">الفترة: </span>
                    <span className="text-white font-medium">{status?.intervalSeconds}ث</span>
                  </div>
                  <div>
                    <span className="text-gray-500">بدأ في: </span>
                    <span className="text-white font-medium">
                      {status?.startedAt ? new Date(status.startedAt).toLocaleTimeString("ar") : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">الرسائل: </span>
                    <span className="text-[#53fc18] font-bold">{status?.messagesSent}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-[#0d0f14] border border-yellow-900/40 rounded-lg p-3">
              <p className="text-[10px] text-yellow-600/80 leading-relaxed">
                طبقات الحماية المفعّلة: تزوير WebDriver • عشوائية وكيل المستخدم • تأخير الكتابة الإنساني • توقيت عشوائي • كوكيز جلسة دائمة • حركة ماوس طبيعية
              </p>
            </div>
          </div>
        )}

        {/* Messages Tab */}
        {activeTab === "messages" && (
          <div className="bg-[#13161f] border border-[#1e2330] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white text-sm">قائمة الرسائل التلقائية</h2>
              <span className="text-xs text-gray-500">{messages.length} رسالة</span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddMessage()}
                placeholder="اكتب رسالة جديدة..."
                className="flex-1 bg-[#0d0f14] border border-[#1e2330] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#53fc18]/50"
                dir="rtl"
              />
              <button
                onClick={handleAddMessage}
                disabled={!newMessage.trim() || createMessage.isPending}
                className="bg-[#53fc18] hover:bg-[#45d414] text-black font-bold px-4 py-2.5 rounded-lg text-sm transition-all disabled:opacity-40"
              >
                إضافة
              </button>
            </div>

            {messages.length === 0 ? (
              <div className="text-center py-10 text-gray-600">
                <p className="text-3xl mb-2">💬</p>
                <p className="text-sm">لا توجد رسائل بعد</p>
                <p className="text-xs mt-1">أضف رسائل سيرسلها البوت أثناء البث</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className="flex items-center justify-between bg-[#0d0f14] border border-[#1e2330] rounded-lg px-3 py-2.5 group"
                  >
                    <span className="text-sm text-white" dir="rtl">{msg.text}</span>
                    <button
                      onClick={() => handleDeleteMessage(msg.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors text-xs opacity-0 group-hover:opacity-100"
                    >
                      حذف
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-gray-600">
              البوت يختار رسالة عشوائية من القائمة في كل مرة للتنويع وتجنب الكشف
            </p>
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === "logs" && (
          <div className="bg-[#13161f] border border-[#1e2330] rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white text-sm">سجل الأحداث</h2>
              <span className="text-xs text-gray-500">آخر 50 حدث</span>
            </div>

            {logs.length === 0 ? (
              <div className="text-center py-10 text-gray-600">
                <p className="text-3xl mb-2">📋</p>
                <p className="text-sm">لا يوجد سجل بعد</p>
                <p className="text-xs mt-1">شغّل البوت لرؤية الأحداث</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-96 overflow-y-auto font-mono">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-2 text-xs bg-[#0d0f14] border border-[#1e2330] rounded-lg px-3 py-2"
                  >
                    <span>{getLogIcon(log.event)}</span>
                    <span className={`font-bold shrink-0 ${getLogColor(log.event)}`}>{log.event}</span>
                    {log.message && <span className="text-gray-400 break-all">{log.message}</span>}
                    <span className="text-gray-700 shrink-0 ml-auto">
                      {new Date(log.timestamp).toLocaleTimeString("ar")}
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
