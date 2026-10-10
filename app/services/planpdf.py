"""PDF del piano alimentare, con impaginazione analoga a quella dei piani cartacei (Franco.pdf)."""
import io
from datetime import date
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, KeepTogether, PageBreak, PageTemplate, Paragraph,
                                Spacer, Table, TableStyle)

from .diet import qty_display
from .day import resolve_meals

L = {
    "it": {"plan": "Piano alimentare", "doctor": "Medico", "substitutes": "S O S T I T U E N T I",
           "general": "INDICAZIONI GENERALI:", "type": "TIPO", "raw": "CRUDO", "cooked": "COTTO",
           "conv": "Tabella conversione crudo/cotto", "or": "oppure", "star": "* = sostituibile con gli alimenti elencati in «Sostituenti»",
           "week": "max {n} volta/e alla settimana", "page": "Pagina", "from": "Dal", "to": "al"},
    "en": {"plan": "Meal plan", "doctor": "Doctor", "substitutes": "S U B S T I T U T E S",
           "general": "GENERAL GUIDELINES:", "type": "TYPE", "raw": "RAW", "cooked": "COOKED",
           "conv": "Raw/cooked conversion table", "or": "or", "star": "* = can be replaced with the foods listed in “Substitutes”",
           "week": "max {n} time(s) per week", "page": "Page", "from": "From", "to": "to"},
}

BASE = "Times-Roman"
S = {
    "cover": ParagraphStyle("cover", fontName=BASE, fontSize=30, alignment=TA_CENTER, leading=38),
    "cover2": ParagraphStyle("cover2", fontName=BASE, fontSize=13, alignment=TA_CENTER, leading=18,
                             textColor=colors.HexColor("#444444")),
    "h": ParagraphStyle("h", fontName="Times-BoldItalic", fontSize=14, leading=18, spaceBefore=14, spaceAfter=6),
    "p": ParagraphStyle("p", fontName=BASE, fontSize=11.5, leading=15),
    "note": ParagraphStyle("note", fontName="Times-Italic", fontSize=10.5, leading=14,
                           textColor=colors.HexColor("#444444")),
    "opt": ParagraphStyle("opt", fontName=BASE, fontSize=11, alignment=TA_CENTER, leading=14),
    "cell": ParagraphStyle("cell", fontName=BASE, fontSize=10.5, leading=13),
    "cellr": ParagraphStyle("cellr", fontName=BASE, fontSize=10.5, leading=13, alignment=TA_RIGHT),
    "sub": ParagraphStyle("sub", fontName=BASE, fontSize=13, alignment=TA_CENTER, leading=18, spaceAfter=10),
    "gh": ParagraphStyle("gh", fontName=BASE, fontSize=11.5, leading=15, spaceBefore=12, spaceAfter=3),
    "small": ParagraphStyle("small", fontName="Times-Italic", fontSize=9.5, leading=12,
                            textColor=colors.HexColor("#555555")),
}


def _fmt_ref(g):
    return qty_display(g["ref_qty"], g["ref_unit"]) if g["ref_qty"] else ""


def _item_line(it, star=True):
    name = escape(it["name"])
    q = qty_display(it["qty"], it["unit"], it["qty_text"])
    return name, escape(q) + (" *" if it["group_id"] and star else "")


def _simple_meal(m, t):
    """Pasto "a riga": alternative brevi unite da 'oppure', alimenti uniti da '+'."""
    ch = [o for o in m["options"] if o["kind"] == "choice"]
    if not ch or len(ch) > 4 or any(o["course"] for o in ch) or any(len(o["items"]) > 3 for o in ch):
        return None
    parts = []
    for o in ch:
        parts.append(" + ".join(" ".join(x for x in _item_line(i) if x) for i in o["items"]))
    return f" {t['or']} ".join(parts)


def _option_box(o, width, t):
    head = escape(" ".join(x for x in (o["label"], f"({o['course']})" if o["course"] else "") if x))
    extra = ""
    if o["max_per_week"]:
        extra = " " + escape(t["week"].format(n=o["max_per_week"]))
    rows = []
    for it in o["items"]:
        n, q = _item_line(it)
        rows.append([Paragraph(n + (f' <font size="8"><i>{escape(it["note"])}</i></font>' if it["note"] else ""), S["cell"]),
                     Paragraph(q, S["cellr"])])
    if not rows:
        rows = [[Paragraph("", S["cell"]), Paragraph("", S["cellr"])]]
    inner = Table(rows, colWidths=[width * 0.64, width * 0.30])
    inner.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.8, colors.black),
                               ("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    box = [Paragraph(f"<b>{head}</b>" + (f'<font size="8"> {extra}</font>' if extra else ""), S["opt"]), inner]
    if o["note"]:
        box.append(Paragraph(escape(o["note"]), S["small"]))
    return box


def _meal_flowables(m, t, W):
    out = [Paragraph(escape(m["name"]).upper() if m["kind"] == "extras" else escape(m["name"]).upper(), S["h"])]
    if m["note"]:
        out.append(Paragraph(escape(m["note"]), S["note"]))
    if m["kind"] == "extras":
        for o in m["options"]:
            for it in o["items"]:
                n, q = _item_line(it)
                line = f"{n} {q}".strip()
                extra = []
                if it["note"]:
                    extra.append(escape(it["note"]))
                if it["max_per_week"] and not it["note"]:
                    extra.append(escape(t["week"].format(n=it["max_per_week"])))
                out.append(Paragraph(line + (" – " + ", ".join(extra) if extra else ""), S["p"]))
        return out
    simple = _simple_meal(m, t) if not m["same_as_meal_id"] else None
    if simple:
        out.append(Paragraph(simple, S["p"]))
        return out
    if m["same_as_meal_id"] and not any(o["kind"] == "choice" and not o.get("inherited") for o in m["options"]):
        adds = [o for o in m["options"] if o["kind"] == "addon" and not o.get("inherited")]
        for o in adds:
            out.append(Paragraph("+ " + ", ".join(" ".join(x for x in _item_line(i) if x) for i in o["items"]), S["p"]))
        return out
    # tabelle A | B | C
    opts = [o for o in m["options"] if o["kind"] == "choice"] + [o for o in m["options"] if o["kind"] == "addon"]
    ncol = 3
    cw = W / ncol
    for i in range(0, len(opts), ncol):
        row = [_option_box(o, cw - 8, t) for o in opts[i:i + ncol]]
        row += [""] * (ncol - len(row))
        tb = Table([row], colWidths=[cw] * ncol)
        tb.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 2),
                                ("RIGHTPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
        out.append(tb)
    return out


def plan_pdf(doc: dict, patient_name: str, doctor_name: str, lang: str = "it") -> bytes:
    t = L.get(lang, L["it"])
    buf = io.BytesIO()
    pw, ph = A4
    margin = 20 * mm
    W = pw - 2 * margin

    def footer(canvas, d):
        canvas.saveState()
        canvas.setFont(BASE, 8.5)
        canvas.setFillColor(colors.HexColor("#666666"))
        canvas.drawString(margin, 12 * mm, f"Nutriplan – {doc['name']}")
        canvas.drawRightString(pw - margin, 12 * mm, f"{t['page']} {d.page}")
        canvas.restoreState()

    tpl = BaseDocTemplate(buf, pagesize=A4, leftMargin=margin, rightMargin=margin, topMargin=margin,
                          bottomMargin=22 * mm, title=doc["name"], author="Nutriplan")
    tpl.addPageTemplates([PageTemplate(id="p", frames=[Frame(margin, 22 * mm, W, ph - margin - 22 * mm, id="f")],
                                       onPage=footer)])
    el = []
    # copertina
    el.append(Spacer(1, 90 * mm))
    el.append(Paragraph(escape((patient_name or doc["name"])).upper(), S["cover"]))
    el.append(Spacer(1, 10 * mm))
    el.append(Paragraph(escape(doc["name"]), S["cover2"]))
    if doctor_name:
        el.append(Paragraph(f"{t['doctor']}: {escape(doctor_name)}", S["cover2"]))
    if doc.get("start_date"):
        rng = f"{t['from']} {doc['start_date']}" + (f" {t['to']} {doc['end_date']}" if doc.get("end_date") else "")
        el.append(Paragraph(rng, S["cover2"]))
    el.append(PageBreak())
    # pasti
    meals = resolve_meals(doc)
    for m in meals:
        el.append(KeepTogether(_meal_flowables(m, t, W)))
    el.append(Spacer(1, 6 * mm))
    el.append(Paragraph(escape(t["star"]), S["small"]))
    # sostituenti
    if doc["groups"]:
        el.append(PageBreak())
        el.append(Paragraph(t["substitutes"], S["sub"]))
        for g in doc["groups"]:
            ref = _fmt_ref(g)
            blk = [Paragraph(f"{escape(g['name']).upper()} {escape(ref)}:", S["gh"])]
            if g["note"]:
                blk.append(Paragraph(escape(g["note"]), S["p"]))
            rows = []
            for mem in g["members"]:
                q = qty_display(mem["qty"], mem["unit"], mem["qty_text"])
                nm = "– " + escape(mem["name"])
                if mem["note"]:
                    nm += f' <font size="9"><i>({escape(mem["note"])})</i></font>'
                if mem["max_per_week"]:
                    nm += f' <font size="9"><i>[{escape(t["week"].format(n=mem["max_per_week"]))}]</i></font>'
                rows.append([Paragraph(nm, S["cell"]), Paragraph(escape(q), S["cell"])])
            if rows:
                tb = Table(rows, colWidths=[W * 0.7, W * 0.3])
                tb.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 1.5),
                                        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5)]))
                blk.append(tb)
            el.append(KeepTogether(blk))
    # indicazioni generali
    notes = [x.strip() for x in (doc.get("notes") or "").splitlines() if x.strip()]
    conv = doc.get("conversion") or []
    if notes or conv:
        el.append(PageBreak())
        if notes:
            el.append(Paragraph(f"<b>{t['general']}</b>", S["gh"]))
            for n in notes:
                el.append(Paragraph(escape(n), S["p"]))
                el.append(Spacer(1, 3 * mm))
        if conv:
            el.append(Spacer(1, 6 * mm))
            el.append(Paragraph(t["conv"], S["p"]))
            el.append(Spacer(1, 3 * mm))
            rows = [[t["type"], t["raw"], t["cooked"]]] + [[c["name"].upper(), c["raw"], ""] for c in conv]
            tb = Table(rows, colWidths=[W * 0.35, W * 0.3, W * 0.3])
            tb.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.7, colors.black), ("FONT", (0, 0), (-1, -1), BASE, 11),
                                    ("ALIGN", (1, 0), (1, -1), "CENTER"), ("ALIGN", (2, 0), (2, 0), "CENTER"),
                                    ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
            el.append(tb)
    tpl.build(el)
    return buf.getvalue()
