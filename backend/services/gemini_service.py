import json
import random
import os
from typing import List, Dict, Any

import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

genai.configure(api_key=os.environ["GEMINI_API_KEY"])
_model = genai.GenerativeModel("gemini-1.5-flash")


def select_and_shuffle_questions(
    questions: List[Dict[str, Any]],
    count: int,
    topic: str = "",
    difficulty: str = "mixed",
) -> List[Dict[str, Any]]:
    """
    Use Gemini to select `count` questions from the pool,
    then shuffle the answer options for each selected question.
    Returns questions with shuffled options and updated correct_answer key.
    """
    if not questions:
        return []

    count = min(count, len(questions))

    # Build a compact representation for Gemini to select from
    pool_text = _build_pool_text(questions)

    prompt = _build_selection_prompt(pool_text, count, topic, difficulty, len(questions))

    try:
        response = _model.generate_content(prompt)
        selected_indices = _parse_indices(response.text, len(questions))
    except Exception:
        # Fallback: random selection
        selected_indices = random.sample(range(len(questions)), count)

    selected = [questions[i] for i in selected_indices[:count]]

    # Shuffle options and update correct_answer key
    return [_shuffle_options(q) for q in selected]


def generate_explanations(questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Add AI-generated explanations for each question's correct answer."""
    if not questions:
        return questions

    combined = "\n\n".join(
        f"Câu {i+1}: {q['question']}\n"
        f"Đáp án đúng ({q['correct_answer'].upper()}): {q['options'].get(q['correct_answer'], '')}"
        for i, q in enumerate(questions)
    )

    prompt = (
        "Dưới đây là các câu hỏi trắc nghiệm về an toàn lao động và điện lực. "
        "Hãy viết giải thích ngắn gọn (1-2 câu) cho mỗi đáp án đúng bằng tiếng Việt.\n\n"
        f"{combined}\n\n"
        "Trả về JSON array theo format:\n"
        '[{"index": 0, "explanation": "..."}, ...]'
    )

    try:
        response = _model.generate_content(prompt)
        explanations = _parse_json_array(response.text)
        for item in explanations:
            idx = item.get("index", -1)
            if 0 <= idx < len(questions):
                questions[idx]["explanation"] = item.get("explanation", "")
    except Exception:
        pass

    return questions


# --- helpers ---

def _build_pool_text(questions: List[Dict[str, Any]]) -> str:
    lines = []
    for i, q in enumerate(questions):
        lines.append(f"[{i}] {q['question']}")
    return "\n".join(lines)


def _build_selection_prompt(pool: str, count: int, topic: str, difficulty: str, total: int) -> str:
    topic_clause = f"ưu tiên chủ đề '{topic}'" if topic else "chọn đa dạng chủ đề"
    diff_clause = {
        "easy": "câu hỏi dễ, định nghĩa cơ bản",
        "hard": "câu hỏi khó, số liệu cụ thể, tình huống phức tạp",
        "mixed": "mix đều dễ - trung bình - khó",
    }.get(difficulty, "mix đều")

    return (
        f"Từ danh sách {total} câu hỏi dưới đây (mỗi câu có index trong []),\n"
        f"hãy chọn {count} câu hợp lý nhất ({topic_clause}, {diff_clause}).\n\n"
        f"{pool}\n\n"
        f"Trả về JSON array các index được chọn, ví dụ: [0, 5, 12, 7, ...]"
    )


def _parse_indices(text: str, max_index: int) -> List[int]:
    import re
    numbers = re.findall(r"\d+", text)
    seen = set()
    result = []
    for n in numbers:
        idx = int(n)
        if idx < max_index and idx not in seen:
            seen.add(idx)
            result.append(idx)
    return result


def _parse_json_array(text: str) -> List[Dict]:
    import re
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except Exception:
            pass
    return []


def _shuffle_options(question: Dict[str, Any]) -> Dict[str, Any]:
    """Shuffle answer options and update the correct_answer key accordingly."""
    original_options = question["options"]
    correct_letter = question["correct_answer"]
    correct_text = original_options.get(correct_letter, "")

    letters = list(original_options.keys())
    texts = list(original_options.values())

    combined = list(zip(letters, texts))
    random.shuffle(combined)

    new_options = {}
    new_correct = correct_letter
    for new_letter, (_, text) in zip(["a", "b", "c", "d"], combined):
        new_options[new_letter] = text
        if text == correct_text:
            new_correct = new_letter

    return {
        **question,
        "options": new_options,
        "correct_answer": new_correct,
    }
