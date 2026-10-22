"""Shared layout helpers for the SOP PDF builders (build_sop.py, build_sop_es.py).

Styles, tables, callouts, and screenshot figures — everything except the words.
"""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

IMG = Path(__file__).resolve().parent / "img"

# Palette roughly matching the app.
NAVY = colors.HexColor("#0f172a")
SLATE = colors.HexColor("#475569")
LIGHT = colors.HexColor("#f1f5f9")
BORDER = colors.HexColor("#cbd5e1")
BLUE = colors.HexColor("#2563eb")
GREEN = colors.HexColor("#059669")
AMBER = colors.HexColor("#b45309")
RED = colors.HexColor("#b91c1c")

styles = getSampleStyleSheet()
S = {
    "title": ParagraphStyle(
        "title", parent=styles["Title"], fontSize=26, leading=30, textColor=NAVY,
        spaceAfter=6,
    ),
    "subtitle": ParagraphStyle(
        "subtitle", parent=styles["Normal"], fontSize=12.5, leading=17,
        textColor=SLATE, alignment=TA_CENTER, spaceAfter=18,
    ),
    "h1": ParagraphStyle(
        "h1", parent=styles["Heading1"], fontSize=16, leading=20, textColor=NAVY,
        spaceBefore=18, spaceAfter=8,
    ),
    "h2": ParagraphStyle(
        "h2", parent=styles["Heading2"], fontSize=12.5, leading=16, textColor=BLUE,
        spaceBefore=12, spaceAfter=5,
    ),
    "body": ParagraphStyle(
        "body", parent=styles["BodyText"], fontSize=10, leading=14.5, spaceAfter=7,
    ),
    "small": ParagraphStyle(
        "small", parent=styles["BodyText"], fontSize=8.7, leading=12, textColor=SLATE,
    ),
    "cell": ParagraphStyle("cell", parent=styles["BodyText"], fontSize=9, leading=12.5,
                           spaceAfter=0),
    "cellb": ParagraphStyle("cellb", parent=styles["BodyText"], fontSize=9, leading=12.5,
                            spaceAfter=0, fontName="Helvetica-Bold"),
    "cellh": ParagraphStyle("cellh", parent=styles["BodyText"], fontSize=9, leading=12.5,
                            spaceAfter=0, fontName="Helvetica-Bold",
                            textColor=colors.white),
    "caption": ParagraphStyle("caption", parent=styles["BodyText"], fontSize=8.5,
                              leading=11.5, textColor=SLATE, spaceAfter=0),
    "callout": ParagraphStyle("callout", parent=styles["BodyText"], fontSize=9.5,
                              leading=13.5, spaceAfter=0),
}


def P(text, style="body"):
    return Paragraph(text, S[style])


def figure(name, caption, max_w=None, max_h=3.9 * inch):
    """A screenshot scaled to fit, with a caption, kept on one page."""
    path = IMG / f"{name}.png"
    iw, ih = ImageReader(str(path)).getSize()
    max_w = max_w or 6.2 * inch
    scale = min(max_w / iw, max_h / ih)
    img = Image(str(path), width=iw * scale, height=ih * scale)
    img.hAlign = "LEFT"
    cap = Paragraph(f"<i>{caption}</i>", S["caption"])
    box = Table([[img], [cap]], colWidths=[iw * scale], hAlign="LEFT")
    box.setStyle(TableStyle([
        ("BOX", (0, 0), (0, 0), 0.75, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (0, 0), 0),
        ("BOTTOMPADDING", (0, 0), (0, 0), 0),
        ("TOPPADDING", (0, 1), (0, 1), 4),
        ("BOTTOMPADDING", (0, 1), (0, 1), 2),
    ]))
    return KeepTogether([box, Spacer(1, 10)])


def figure_row(items, each_w=2.85 * inch, max_h=3.5 * inch):
    """Two screenshots side by side, each with its own caption."""
    cells = []
    for name, caption in items:
        path = IMG / f"{name}.png"
        iw, ih = ImageReader(str(path)).getSize()
        scale = min(each_w / iw, max_h / ih)
        img = Image(str(path), width=iw * scale, height=ih * scale)
        img.hAlign = "LEFT"
        inner = Table([[img], [Paragraph(f"<i>{caption}</i>", S["caption"])]],
                      colWidths=[iw * scale], hAlign="LEFT")
        inner.setStyle(TableStyle([
            ("BOX", (0, 0), (0, 0), 0.75, BORDER),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (0, 0), 0),
            ("BOTTOMPADDING", (0, 0), (0, 0), 0),
            ("TOPPADDING", (0, 1), (0, 1), 4),
        ]))
        cells.append(inner)
    row = Table([cells], colWidths=[each_w + 12] * len(cells), hAlign="LEFT")
    row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return KeepTogether([row, Spacer(1, 10)])


def section(heading, *flowables):
    """An h1 glued to its opening content so it can't be orphaned."""
    return KeepTogether([P(heading, "h1"), *flowables])


def bullets(items, style="body"):
    return ListFlowable(
        [ListItem(Paragraph(i, S[style]), leftIndent=12) for i in items],
        bulletType="bullet", bulletFontSize=7, leftIndent=14, bulletOffsetY=1,
    )


def steps(items):
    return ListFlowable(
        [ListItem(Paragraph(i, S["body"]), leftIndent=14) for i in items],
        bulletType="1", leftIndent=18,
    )


def table(rows, widths, header=True, zebra=True):
    """rows[0] is the header row when header=True. Cells are strings."""
    data = []
    for r_i, row in enumerate(rows):
        style = "cellh" if (header and r_i == 0) else "cell"
        data.append([Paragraph(str(c), S[style]) for c in row])
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    cmds = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if header:
        cmds += [("BACKGROUND", (0, 0), (-1, 0), NAVY),
                 ("TEXTCOLOR", (0, 0), (-1, 0), colors.white)]
        if zebra:
            for i in range(2, len(rows), 2):
                cmds.append(("BACKGROUND", (0, i), (-1, i), LIGHT))
    t.setStyle(TableStyle(cmds))
    return t


def callout(title, text, color=AMBER):
    inner = [Paragraph(f"<b>{title}</b>", S["callout"]),
             Paragraph(text, S["callout"])]
    t = Table([[inner]], colWidths=[6.6 * inch], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fffbeb") if color is AMBER
         else colors.HexColor("#eff6ff")),
        ("LINEBEFORE", (0, 0), (0, -1), 3, color),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return t


def make_doc(out, title, subject, header, footer, page_word):
    """A letter-size document with a header rule, footer line, and page numbers."""

    def on_page(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(0.9 * inch, 10.35 * inch, 7.6 * inch, 10.35 * inch)
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(SLATE)
        canvas.drawString(0.9 * inch, 10.45 * inch, header)
        canvas.line(0.9 * inch, 0.72 * inch, 7.6 * inch, 0.72 * inch)
        canvas.drawString(0.9 * inch, 0.55 * inch, footer)
        canvas.drawRightString(7.6 * inch, 0.55 * inch, f"{page_word} {doc.page}")
        canvas.restoreState()

    doc = BaseDocTemplate(
        str(out), pagesize=letter,
        leftMargin=0.9 * inch, rightMargin=0.9 * inch,
        topMargin=0.95 * inch, bottomMargin=0.9 * inch,
        title=title,
        author="Scanner & Radio Checkout",
        subject=subject,
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="body")
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=on_page)])
    return doc
