"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import API_URL from "@/lib/api";

interface Question {
  question: string;
  options: Record<string, string>;
  explanation?: string;
}

interface QuizData {
  quiz_id: string;
  questions: Question[];
}

interface Revealed {
  correct: string;
  explanation: string;
}

export default function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, Revealed>>({});
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerEnabled] = useState(true);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/quiz/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Không tìm thấy bài kiểm tra");
        return r.json();
      })
      .then((data) => {
        setQuiz(data);
        if (timerEnabled) setTimeLeft(data.questions.length * 60);
      })
      .catch((err) => setFetchError(err.message));
  }, [id, timerEnabled]);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const t = setTimeout(() => setTimeLeft((v) => (v ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft]);

  useEffect(() => {
    if (timeLeft === 0) handleSubmit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  const handleSelect = async (letter: string) => {
    if (revealed[current]) return; // đã reveal rồi, không đổi được
    setAnswers((prev) => ({ ...prev, [current]: letter }));
    try {
      const res = await fetch(`${API_URL}/api/quiz/${id}/answer/${current}`);
      const data = await res.json();
      setRevealed((prev) => ({
        ...prev,
        [current]: { correct: data.correct_answer, explanation: data.explanation ?? "" },
      }));
    } catch {
      // nếu lỗi thì bỏ qua, không block người dùng
    }
  };

  const handleSubmit = async () => {
    if (!quiz || submitting) return;
    setSubmitting(true);
    const stringAnswers: Record<string, string> = {};
    Object.entries(answers).forEach(([k, v]) => { stringAnswers[k] = v; });
    try {
      const res = await fetch(`${API_URL}/api/quiz/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: stringAnswers }),
      });
      const result = await res.json();
      sessionStorage.setItem(`result_${id}`, JSON.stringify(result));
      router.push(`/results/${id}`);
    } catch {
      setSubmitting(false);
    }
  };

  if (fetchError) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 font-medium mb-4">{fetchError}</p>
          <button onClick={() => router.push("/")} className="text-indigo-600 underline">
            Về trang chủ
          </button>
        </div>
      </main>
    );
  }

  if (!quiz) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-indigo-600 text-lg font-medium animate-pulse">Đang tải bài kiểm tra...</div>
      </main>
    );
  }

  const q = quiz.questions[current];
  const totalQ = quiz.questions.length;
  const answered = Object.keys(answers).length;
  const mins = Math.floor((timeLeft ?? 0) / 60);
  const secs = ((timeLeft ?? 0) % 60).toString().padStart(2, "0");
  const timerWarning = (timeLeft ?? Infinity) < 60;

  const rev = revealed[current];
  const userAnswer = answers[current];
  const isCorrect = rev && userAnswer === rev.correct;

  const getOptionStyle = (letter: string) => {
    if (!rev) {
      // chưa chọn / chưa reveal
      const selected = userAnswer === letter;
      return selected
        ? "border-indigo-500 bg-indigo-50"
        : "border-gray-300 hover:border-indigo-400 hover:bg-gray-50";
    }
    if (letter === rev.correct) return "border-green-500 bg-green-50";
    if (letter === userAnswer) return "border-red-400 bg-red-50";
    return "border-gray-200 opacity-60";
  };

  const getBadgeStyle = (letter: string) => {
    if (!rev) {
      return userAnswer === letter
        ? "bg-indigo-500 border-indigo-500 text-white"
        : "border-gray-300 text-gray-500";
    }
    if (letter === rev.correct) return "bg-green-500 border-green-500 text-white";
    if (letter === userAnswer) return "bg-red-400 border-red-400 text-white";
    return "border-gray-300 text-gray-400";
  };

  const getTextStyle = (letter: string) => {
    if (!rev) return "text-gray-900";
    if (letter === rev.correct) return "text-green-800 font-semibold";
    if (letter === userAnswer) return "text-red-700";
    return "text-gray-500";
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow p-4 mb-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Câu <span className="font-bold text-indigo-600">{current + 1}</span> / {totalQ}
          </div>
          <div className="flex-1 mx-4 bg-gray-200 rounded-full h-2">
            <div
              className="bg-indigo-500 h-2 rounded-full transition-all"
              style={{ width: `${((current + 1) / totalQ) * 100}%` }}
            />
          </div>
          {timeLeft !== null && (
            <div className={`text-sm font-mono font-bold ${timerWarning ? "text-red-500" : "text-gray-600"}`}>
              {mins}:{secs}
            </div>
          )}
        </div>

        {/* Question card */}
        <div className="bg-white rounded-2xl shadow p-6 mb-4">
          <p className="text-gray-900 font-semibold text-base leading-relaxed mb-6">{q.question}</p>

          <div className="space-y-3">
            {Object.entries(q.options).map(([letter, text]) => (
              <button
                key={letter}
                onClick={() => handleSelect(letter)}
                disabled={!!rev}
                className={`w-full text-left flex items-start gap-3 p-4 rounded-xl border-2 transition-all ${getOptionStyle(letter)}`}
              >
                <span
                  className={`min-w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold border-2 shrink-0 ${getBadgeStyle(letter)}`}
                >
                  {letter.toUpperCase()}
                </span>
                <span className={`leading-relaxed text-sm ${getTextStyle(letter)}`}>{text}</span>
              </button>
            ))}
          </div>

          {/* Feedback */}
          {rev && (
            <div className={`mt-4 px-4 py-3 rounded-xl text-sm font-medium ${isCorrect ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {isCorrect ? (
                <span>✅ Bạn chọn đúng rồi!</span>
              ) : (
                <span>❌ Sai rồi! Đáp án đúng là <strong>{rev.correct.toUpperCase()}</strong></span>
              )}
              {rev.explanation && (
                <p className="mt-1 text-gray-600 font-normal">{rev.explanation}</p>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          <button
            onClick={() => setCurrent((v) => Math.max(0, v - 1))}
            disabled={current === 0}
            className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            Câu trước
          </button>

          {current < totalQ - 1 ? (
            <button
              onClick={() => setCurrent((v) => v + 1)}
              className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors"
            >
              Câu tiếp
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors disabled:bg-gray-300"
            >
              {submitting ? "Đang nộp..." : `Nộp bài (${answered}/${totalQ})`}
            </button>
          )}
        </div>

        {/* Question dots */}
        <div className="mt-4 flex flex-wrap gap-2 justify-center">
          {quiz.questions.map((_, i) => {
            const r = revealed[i];
            const a = answers[i];
            let dotStyle = "bg-gray-200 text-gray-600 hover:bg-gray-300";
            if (i === current) dotStyle = "bg-indigo-600 text-white";
            else if (r && a === r.correct) dotStyle = "bg-green-500 text-white";
            else if (r && a !== r.correct) dotStyle = "bg-red-400 text-white";
            else if (a) dotStyle = "bg-indigo-300 text-white";
            return (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${dotStyle}`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
