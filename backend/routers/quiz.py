import os
import uuid
import tempfile
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any

import pandas as pd
from services.file_parser import parse_excel, parse_pdf, _detect_columns
from services.gemini_service import select_and_shuffle_questions, generate_explanations

router = APIRouter(prefix="/api", tags=["quiz"])

# In-memory store for MVP (replace with DB in Phase 3)
_quiz_store: Dict[str, Any] = {}


class SubmitAnswersRequest(BaseModel):
    answers: Dict[str, str]  # {question_index: chosen_letter}


class QuizResult(BaseModel):
    quiz_id: str
    total: int
    correct: int
    score: float
    details: List[Dict[str, Any]]


@router.post("/debug-file")
async def debug_file(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        df = pd.read_excel(tmp_path, header=0)
        df.columns = [str(c).strip().lower() for c in df.columns]
        cols = df.columns.tolist()
        col_map = _detect_columns(cols)
        sample = df.head(3).fillna("").to_dict(orient="records")
    finally:
        os.unlink(tmp_path)
    return {"columns": cols, "detected_mapping": col_map, "sample_rows": sample}


@router.post("/upload-and-generate")
async def upload_and_generate(
    file: UploadFile = File(...),
    question_count: int = Form(10),
    topic: Optional[str] = Form(""),
    difficulty: str = Form("mixed"),
    with_explanations: bool = Form(False),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".xlsx", ".xls", ".pdf"):
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ file .xlsx, .xls, .pdf")

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        if ext in (".xlsx", ".xls"):
            raw_questions = parse_excel(tmp_path)
        else:
            raw_questions = parse_pdf(tmp_path)
    finally:
        os.unlink(tmp_path)

    if not raw_questions:
        raise HTTPException(
            status_code=422,
            detail="Không thể đọc câu hỏi từ file. Kiểm tra lại định dạng.",
        )

    selected = select_and_shuffle_questions(
        raw_questions,
        count=min(question_count, len(raw_questions)),
        topic=topic or "",
        difficulty=difficulty,
    )

    if with_explanations:
        selected = generate_explanations(selected)

    quiz_id = str(uuid.uuid4())[:8]
    _quiz_store[quiz_id] = {
        "questions": selected,
        "total_in_pool": len(raw_questions),
    }

    return {
        "quiz_id": quiz_id,
        "question_count": len(selected),
        "total_in_pool": len(raw_questions),
        "questions": [_strip_answer(q) for q in selected],
    }


@router.get("/quiz/{quiz_id}/answer/{index}")
def get_answer(quiz_id: str, index: int):
    quiz = _quiz_store.get(quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz không tìm thấy")
    questions = quiz["questions"]
    if index < 0 or index >= len(questions):
        raise HTTPException(status_code=404, detail="Câu hỏi không tồn tại")
    q = questions[index]
    return {
        "correct_answer": q["correct_answer"],
        "explanation": q.get("explanation", ""),
    }


@router.get("/quiz/{quiz_id}")
def get_quiz(quiz_id: str):
    quiz = _quiz_store.get(quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz không tìm thấy")
    return {
        "quiz_id": quiz_id,
        "questions": [_strip_answer(q) for q in quiz["questions"]],
    }


@router.post("/quiz/{quiz_id}/submit")
def submit_quiz(quiz_id: str, body: SubmitAnswersRequest):
    quiz = _quiz_store.get(quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz không tìm thấy")

    questions = quiz["questions"]
    details = []
    correct_count = 0

    for i, q in enumerate(questions):
        user_answer = body.answers.get(str(i), "")
        is_correct = user_answer.lower() == q["correct_answer"].lower()
        if is_correct:
            correct_count += 1
        details.append({
            "index": i,
            "question": q["question"],
            "options": q["options"],
            "user_answer": user_answer,
            "correct_answer": q["correct_answer"],
            "is_correct": is_correct,
            "explanation": q.get("explanation", ""),
        })

    score = round(correct_count / len(questions) * 10, 1) if questions else 0

    return QuizResult(
        quiz_id=quiz_id,
        total=len(questions),
        correct=correct_count,
        score=score,
        details=details,
    )


def _strip_answer(q: Dict[str, Any]) -> Dict[str, Any]:
    """Remove correct_answer before sending to client."""
    return {k: v for k, v in q.items() if k != "correct_answer"}
