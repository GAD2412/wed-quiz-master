"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";

interface Detail {
  index: number;
  question: string;
  options: Record<string, string>;
  user_answer: string;
  correct_answer: string;
  is_correct: boolean;
  explanation: string;
}

interface QuizResult {
  quiz_id: string;
  total: number;
  correct: number;
  score: number;
  details: Detail[];
}

export default function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [result, setResult] = useState<QuizResult | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(`result_${id}`);
    if (stored) setResult(JSON.parse(stored));
  }, [id]);

  if (!result) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Không tìm thấy kết quả</p>
          <button onClick={() => router.push("/")} className="text-indigo-600 underline">
            Về trang chủ
          </button>
        </div>
      </main>
    );
  }

  const pct = Math.round((result.correct / result.total) * 100);
  const grade = pct >= 80 ? "Xuất sắc" : pct >= 60 ? "Khá" : pct >= 40 ? "Trung bình" : "Cần cải thiện";
  const gradeColor = pct >= 80 ? "text-green-600" : pct >= 60 ? "text-blue-600" : pct >= 40 ? "text-yellow-600" : "text-red-600";

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Score card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Kết quả bài kiểm tra</h1>

          <div className="relative w-32 h-32 mx-auto mb-4">
            <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="54" fill="none" stroke="#e5e7eb" strokeWidth="10" />
              <circle
                cx="60" cy="60" r="54" fill="none"
                stroke={pct >= 80 ? "#16a34a" : pct >= 60 ? "#2563eb" : pct >= 40 ? "#ca8a04" : "#dc2626"}
                strokeWidth="10"
                strokeDasharray={`${(pct / 100) * 339} 339`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-gray-800">{result.score}</span>
              <span className="text-xs text-gray-400">/10</span>
            </div>
          </div>

          <p className={`text-xl font-bold ${gradeColor} mb-1`}>{grade}</p>
          <p className="text-gray-500 text-sm">
            Đúng {result.correct}/{result.total} câu ({pct}%)
          </p>

          <button
            onClick={() => router.push("/")}
            className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2 rounded-xl transition-colors"
          >
            Làm bài mới
          </button>
        </div>

        {/* Details */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-700 px-1">Chi tiết từng câu</h2>
          {result.details.map((d) => (
            <div
              key={d.index}
              className={`bg-white rounded-xl shadow p-4 border-l-4 ${
                d.is_correct ? "border-green-400" : "border-red-400"
              }`}
            >
              <div
                className="flex items-start justify-between cursor-pointer"
                onClick={() => setExpanded(expanded === d.index ? null : d.index)}
              >
                <div className="flex items-start gap-3">
                  <span className={`text-lg ${d.is_correct ? "text-green-500" : "text-red-500"}`}>
                    {d.is_correct ? "✓" : "✗"}
                  </span>
                  <p className="text-sm text-gray-700 leading-relaxed">{d.question}</p>
                </div>
                <span className="text-gray-400 ml-2 text-sm">{expanded === d.index ? "▲" : "▼"}</span>
              </div>

              {expanded === d.index && (
                <div className="mt-3 ml-8 space-y-2">
                  {Object.entries(d.options).map(([letter, text]) => {
                    const isCorrect = letter === d.correct_answer;
                    const isUser = letter === d.user_answer;
                    return (
                      <div
                        key={letter}
                        className={`flex items-start gap-2 p-2 rounded-lg text-sm ${
                          isCorrect
                            ? "bg-green-50 text-green-800"
                            : isUser && !isCorrect
                            ? "bg-red-50 text-red-700"
                            : "text-gray-500"
                        }`}
                      >
                        <span className="font-bold min-w-5">{letter.toUpperCase()}.</span>
                        <span>{text}</span>
                        {isCorrect && <span className="ml-auto text-green-600 font-bold">✓</span>}
                        {isUser && !isCorrect && <span className="ml-auto text-red-500 font-bold">✗</span>}
                      </div>
                    );
                  })}
                  {d.explanation && (
                    <div className="mt-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-800 border border-blue-200">
                      <span className="font-semibold">Giải thích:</span> {d.explanation}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
