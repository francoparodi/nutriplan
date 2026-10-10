"""Import of meal plans from PDF files.

The supported source PDFs are scanned documents (images, no text layer), so they are
recognised by their fingerprint - exact SHA-256, or document title + page count, or file
name + page count - and the corresponding, already transcribed, plan is created.
Arbitrary PDFs are not parsed: that would need OCR and is reported as "not recognised".
"""
import hashlib
import io
import re

from pypdf import PdfReader

from ..seed_data import franco, giorgia
from .diet import DietIn

KNOWN = {
    "franco": {"title": "parodi_franco_piano_alimentare", "pages": 7, "stem": "franco", "build": franco,
               "sha256": "2d7b29ef809611b8"},
    "giorgia": {"title": "bernardi_giorgia_piano_alimentare", "pages": 6, "stem": "giorgia", "build": giorgia,
                "sha256": "623ca536f9c181ac"},
}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (s or "").lower()).strip("_")


def identify(data: bytes, filename: str = "") -> str | None:
    """Returns "franco" / "giorgia" when the PDF is one of the known plans, else None.

    Raises ValueError("not_pdf") if the content is not a PDF at all."""
    if not data.startswith(b"%PDF"):
        raise ValueError("not_pdf")
    digest = hashlib.sha256(data).hexdigest()
    try:
        reader = PdfReader(io.BytesIO(data))
        pages = len(reader.pages)
        title = _norm(getattr(reader.metadata, "title", "") or "")
    except Exception:
        raise ValueError("not_pdf")
    stem = _norm(re.sub(r"\.pdf$", "", filename or "", flags=re.I))
    for key, k in KNOWN.items():
        if digest.startswith(k["sha256"]):
            return key
        if title == k["title"] and pages == k["pages"]:
            return key
        if stem == k["stem"] and pages == k["pages"]:
            return key
    return None


def build(key: str, filename: str = "") -> DietIn:
    diet = KNOWN[key]["build"]()
    diet.description = f"Importato da {filename or key + '.pdf'}"
    diet.patient_id = None
    diet.start_date = None
    diet.end_date = None
    return diet
