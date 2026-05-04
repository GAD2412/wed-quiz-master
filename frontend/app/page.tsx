"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import API_URL from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("mixed");
  const [withExplanations, setWithExplanations] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "pdf"].includes(ext || "")) {
      setError("Chỉ hỗ trợ file .xlsx, .xls, hoặc .pdf");
      return;
    }
    setFile(f);
    setError("");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("question_count", "9999");
    formData.append("topic", topic);
    formData.append("difficulty", difficulty);
    formData.append("with_explanations", String(withExplanations));

    try {
      const res = await fetch(`${API_URL}/api/upload-and-generate`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Lỗi tạo bài kiểm tra");
      }
      const data = await res.json();
      router.push(`/quiz/${data.quiz_id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lỗi kết nối server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-700 mb-2">AI Quiz Master</h1>
          <p className="text-gray-500 text-sm">Tải file tài liệu, AI tự tạo bài kiểm tra cho bạn</p>
        </div>

        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors mb-6 ${
            dragOver ? "border-indigo-500 bg-indigo-50" : "border-gray-300 hover:border-indigo-400"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById("file-input")?.click()}
        >
          <input
            id="file-input"
            type="file"
            className="hidden"
            accept=".xlsx,.xls,.pdf"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {file ? (
            <div className="flex items-center justify-center gap-2 text-indigo-700 font-medium">
              <span className="text-2xl">{file.name.endsWith(".pdf") ? "📄" : "📊"}</span>
              <span className="truncate max-w-xs">{file.name}</span>
            </div>
          ) : (
            <div className="text-gray-400">
              <div className="text-4xl mb-2">☁️</div>
              <p className="font-medium">Kéo thả hoặc click để chọn file</p>
              <p className="text-xs mt-1">Hỗ trợ .xlsx, .xls, .pdf</p>
            </div>
          )}
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <p className="text-sm text-indigo-600 font-medium bg-indigo-50 rounded-lg px-3 py-2">
              Số câu hỏi sẽ bằng toàn bộ số câu AI đọc được từ file
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Chủ đề trọng tâm (tuỳ chọn)
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="VD: PCCC, An toàn điện, Tai nạn lao động..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Độ khó
            </label>
            <div className="flex gap-2">
              {[
                { value: "easy", label: "Dễ" },
                { value: "mixed", label: "Hỗn hợp" },
                { value: "hard", label: "Khó" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDifficulty(opt.value)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    difficulty === opt.value
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "border-gray-300 text-gray-600 hover:border-indigo-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={withExplanations}
              onChange={(e) => setWithExplanations(e.target.checked)}
              className="accent-indigo-600 w-4 h-4"
            />
            <span className="text-sm text-gray-700">Thêm giải thích đáp án từ AI</span>
          </label>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-2 mb-4">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!file || loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="animate-spin inline-block">⏳</span>
              <span>AI đang xử lý...</span>
            </>
          ) : (
            <span>Tạo bài kiểm tra</span>
          )}
        </button>
      </div>
    </main>
  );
}
