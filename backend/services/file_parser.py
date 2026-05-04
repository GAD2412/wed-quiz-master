import pdfplumber
import pandas as pd
import re
from typing import List, Dict, Any


def parse_excel(file_path: str) -> List[Dict[str, Any]]:
    """
    Parse Excel file. Reads ALL sheets and combines questions.
    Skips derived/filtered sheets (names containing 'lọc').
    Supports two layouts per sheet:
    1. One-row-per-question: columns for question, option_a..d, correct_answer
    2. Multi-row: question on one row ("Câu X. ..."), options on next rows ("a. ..."),
       correct answer marked with "x" in a separate column.
    """
    xl = pd.ExcelFile(file_path)
    all_questions: List[Dict[str, Any]] = []

    for sheet_name in xl.sheet_names:
        if "lọc" in sheet_name.lower():
            continue

        df = pd.read_excel(file_path, sheet_name=sheet_name, header=0)
        df.columns = [str(c).strip().lower() for c in df.columns]

        if _is_multirow_format(df):
            all_questions.extend(_parse_multirow_excel(df))
        else:
            all_questions.extend(_parse_standard_excel(df))

    return all_questions


def _parse_standard_excel(df: pd.DataFrame) -> List[Dict[str, Any]]:
    col_map = _detect_columns(df.columns.tolist())
    questions = []

    for _, row in df.iterrows():
        q_text = str(row.get(col_map.get("question", ""), "")).strip()
        if not q_text or q_text == "nan":
            continue

        options = {}
        for letter in ["a", "b", "c", "d"]:
            key = col_map.get(f"option_{letter}")
            if key:
                val = str(row.get(key, "")).strip()
                if val and val != "nan":
                    options[letter] = val

        correct_key = col_map.get("correct")
        correct_raw = str(row.get(correct_key, "")).strip().lower() if correct_key else ""
        correct = correct_raw[0] if correct_raw and correct_raw[0] in "abcd" else None

        if q_text and len(options) >= 2 and correct:
            questions.append({
                "question": q_text,
                "options": options,
                "correct_answer": correct,
                "explanation": "",
            })

    return questions


def _is_multirow_format(df: pd.DataFrame) -> bool:
    """Detect if the Excel uses multi-row format (one row per option)."""
    cols = df.columns.tolist()
    # Multi-row format typically has very few meaningful columns
    # and the main column contains both "Câu X." and "a./b./c./d." patterns
    content_col = next(
        (c for c in cols if "câu" in c or "question" in c or "nội dung" in c), None
    )
    if not content_col:
        return False
    sample = df[content_col].dropna().astype(str).head(20)
    has_question_row = sample.str.match(r"(?i)câu\s+\d+").any()
    has_option_row = sample.str.match(r"(?i)^[a-d][\.\)]").any()
    return has_question_row and has_option_row


def _parse_multirow_excel(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Parse multi-row Excel format:
      - "Câu X. [question]" row starts a new question
      - "a. [text]" / "b. [text]" etc. are option rows
      - "x" (or similar) in the answer column marks the correct option
    """
    cols = df.columns.tolist()
    content_col = next(
        (c for c in cols if "câu" in c or "question" in c or "nội dung" in c), cols[1] if len(cols) > 1 else cols[0]
    )
    answer_col = next(
        (c for c in cols if "đáp án" in c or "answer" in c or "correct" in c or "đáp" in c), None
    )

    questions = []
    current_question = None
    current_options: Dict[str, str] = {}
    current_correct = None

    def _flush():
        if current_question and len(current_options) >= 2 and current_correct:
            questions.append({
                "question": current_question,
                "options": dict(current_options),
                "correct_answer": current_correct,
                "explanation": "",
            })

    for _, row in df.iterrows():
        cell = str(row.get(content_col, "")).strip()
        if not cell or cell == "nan":
            continue

        answer_mark = str(row.get(answer_col, "")).strip().lower() if answer_col else ""
        is_correct_mark = answer_mark in ("x", "✓", "✔", "1", "true", "đúng", "v")

        q_match = re.match(r"(?i)câu\s+\d+[\.\:]?\s*(.+)", cell, re.DOTALL)
        if q_match:
            _flush()
            current_question = " ".join(q_match.group(1).split())
            current_options = {}
            current_correct = None
            continue

        opt_match = re.match(r"^([a-dA-D])[\.\)]\s*(.+)", cell, re.DOTALL)
        if opt_match and current_question is not None:
            letter = opt_match.group(1).lower()
            option_text = " ".join(opt_match.group(2).split())
            # Nếu chữ cái bị trùng (lỗi dữ liệu), gán chữ cái tiếp theo còn trống
            if letter in current_options:
                for fallback in ["a", "b", "c", "d"]:
                    if fallback not in current_options:
                        letter = fallback
                        break
            current_options[letter] = option_text
            if is_correct_mark:
                current_correct = letter

    _flush()
    return questions


def parse_pdf(file_path: str) -> List[Dict[str, Any]]:
    """
    Parse PDF with Q&A format: numbered questions with a/b/c/d options
    and 'x' marking the correct answer.
    """
    raw_text = ""
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                raw_text += text + "\n"

    return _parse_vietnamese_qa_text(raw_text)


def _parse_vietnamese_qa_text(text: str) -> List[Dict[str, Any]]:
    """
    Parse Vietnamese Q&A format where correct answer is marked with 'x'
    on the same line or trailing the option.
    """
    questions = []

    # Split by question markers like "Câu 1.", "Câu 2.", etc.
    blocks = re.split(r"(?=Câu\s+\d+[\.\:])", text, flags=re.IGNORECASE)

    for block in blocks:
        block = block.strip()
        if not block:
            continue

        q_match = re.match(r"Câu\s+\d+[\.\:]?\s*(.+?)(?=\n[a-d][\.\)])", block, re.IGNORECASE | re.DOTALL)
        if not q_match:
            continue
        question_text = " ".join(q_match.group(1).split())

        options = {}
        correct = None

        option_pattern = re.finditer(
            r"^([a-d])[\.\)]\s*(.+?)(?=\n[a-d][\.\)]|\Z)",
            block,
            re.MULTILINE | re.DOTALL | re.IGNORECASE,
        )

        for m in option_pattern:
            letter = m.group(1).lower()
            content = " ".join(m.group(2).split())
            # Check if this option has trailing 'x' marker
            if re.search(r"\bx\b\s*$", content, re.IGNORECASE):
                correct = letter
                content = re.sub(r"\s*\bx\b\s*$", "", content, flags=re.IGNORECASE).strip()
            options[letter] = content

        if question_text and len(options) >= 2 and correct:
            questions.append({
                "question": question_text,
                "options": options,
                "correct_answer": correct,
                "explanation": "",
            })

    return questions


def _detect_columns(cols: List[str]) -> Dict[str, str]:
    """Map flexible column names to standard keys."""
    mapping = {}
    question_hints = ["câu hỏi", "question", "câu", "nội dung"]
    option_hints = {
        "a": ["đáp án a", "option a", "a.", "a)", "lựa chọn a"],
        "b": ["đáp án b", "option b", "b.", "b)", "lựa chọn b"],
        "c": ["đáp án c", "option c", "c.", "c)", "lựa chọn c"],
        "d": ["đáp án d", "option d", "d.", "d)", "lựa chọn d"],
    }
    correct_hints = ["đáp án đúng", "correct", "đáp án", "answer", "key"]

    for col in cols:
        col_lower = col.lower()
        if not mapping.get("question") and any(h in col_lower for h in question_hints):
            mapping["question"] = col
        if not mapping.get("correct") and any(h in col_lower for h in correct_hints):
            mapping["correct"] = col
        for letter, hints in option_hints.items():
            if not mapping.get(f"option_{letter}") and any(h in col_lower for h in hints):
                mapping[f"option_{letter}"] = col

    # Fallback: positional mapping if heuristics fail
    if not mapping.get("question") and cols:
        mapping["question"] = cols[0]
    for i, letter in enumerate(["a", "b", "c", "d"]):
        if not mapping.get(f"option_{letter}") and len(cols) > i + 1:
            mapping[f"option_{letter}"] = cols[i + 1]
    if not mapping.get("correct") and len(cols) > 5:
        mapping["correct"] = cols[5]

    return mapping
