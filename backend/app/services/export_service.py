"""
Servicio de exportación: genera archivos PDF (reportlab) y Excel (openpyxl)
en memoria. Los endpoints simplemente devuelven los bytes.
"""
from io import BytesIO
from typing import Any, Iterable
from datetime import datetime

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
)

from app.core import branding


def _format_money(v: Any) -> str:
    try:
        return "$ " + f"{float(v):,.0f}".replace(",", ".")
    except Exception:
        return str(v)


# ─── EXCEL ─────────────────────────────────────────────────────────────────

def excel_from_table(
    title: str,
    columns: list[str],
    rows: Iterable[list[Any]],
    money_columns: list[int] | None = None,
    summary: dict[str, Any] | None = None,
) -> bytes:
    """Genera un Excel simple con título, header en negrita, y datos."""
    money_columns = money_columns or []
    wb = Workbook()
    ws = wb.active
    ws.title = title[:30]

    header_fill = PatternFill("solid", fgColor="EA580C")
    header_font = Font(bold=True, color="FFFFFF", size=11)
    title_font = Font(bold=True, size=14, color="000000")
    money_align = Alignment(horizontal="right")
    thin = Side(border_style="thin", color="CCCCCC")
    border = Border(top=thin, bottom=thin, left=thin, right=thin)

    # Title row
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(columns))
    cell = ws.cell(row=1, column=1, value=title)
    cell.font = title_font
    cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 26

    # Meta line
    meta = f"Generado el {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=len(columns))
    ws.cell(row=2, column=1, value=meta).font = Font(italic=True, size=9, color="666666")

    # Header
    for col_idx, col_name in enumerate(columns, 1):
        c = ws.cell(row=4, column=col_idx, value=col_name)
        c.fill = header_fill
        c.font = header_font
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = border

    # Data rows
    row_idx = 5
    for row in rows:
        for col_idx, value in enumerate(row, 1):
            c = ws.cell(row=row_idx, column=col_idx, value=value)
            c.border = border
            if (col_idx - 1) in money_columns:
                c.number_format = '"$ "#,##0'
                c.alignment = money_align
        row_idx += 1

    # Summary
    if summary:
        row_idx += 1
        for label, value in summary.items():
            ws.cell(row=row_idx, column=1, value=label).font = Font(bold=True)
            cv = ws.cell(row=row_idx, column=2, value=value)
            if isinstance(value, (int, float)):
                cv.number_format = '"$ "#,##0'
                cv.alignment = money_align
            row_idx += 1

    # Auto width
    for col_idx in range(1, len(columns) + 1):
        max_len = 12
        for r in ws.iter_rows(min_row=4, max_row=row_idx, min_col=col_idx, max_col=col_idx):
            for cell in r:
                v = cell.value
                if v is not None:
                    max_len = max(max_len, min(40, len(str(v)) + 2))
        ws.column_dimensions[get_column_letter(col_idx)].width = max_len

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()


# ─── PDF ───────────────────────────────────────────────────────────────────

def pdf_from_table(
    title: str,
    columns: list[str],
    rows: list[list[Any]],
    money_columns: list[int] | None = None,
    summary: dict[str, Any] | None = None,
    subtitle: str | None = None,
) -> bytes:
    """Genera un PDF carta con título, tabla y resumen."""
    money_columns = money_columns or []
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        rightMargin=1.5*cm, leftMargin=1.5*cm,
        topMargin=1.5*cm, bottomMargin=1.5*cm,
        title=title,
    )

    styles = getSampleStyleSheet()
    h_style = ParagraphStyle('H', parent=styles['Title'], fontSize=18, textColor=colors.HexColor("#1f2937"))
    sub_style = ParagraphStyle('S', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor("#666"))
    foot_style = ParagraphStyle('F', parent=styles['Normal'], fontSize=8, textColor=colors.HexColor("#999"), alignment=1)

    elements: list = []
    elements.append(Paragraph(branding.business_name(), h_style))
    elements.append(Paragraph(title, ParagraphStyle('H2', parent=styles['Heading2'])))
    if subtitle:
        elements.append(Paragraph(subtitle, sub_style))
    elements.append(Paragraph(f"Generado: {datetime.now().strftime('%Y-%m-%d %H:%M')}", sub_style))
    elements.append(Spacer(1, 0.4*cm))

    # Format rows: money columns → string
    display_rows = [columns]
    for row in rows:
        display_rows.append([
            _format_money(v) if (i in money_columns) else (str(v) if v is not None else "—")
            for i, v in enumerate(row)
        ])

    table = Table(display_rows, repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#EA580C")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
    ] + [
        ('ALIGN', (mc, 1), (mc, -1), 'RIGHT') for mc in money_columns
    ]))
    elements.append(table)
    elements.append(Spacer(1, 0.5*cm))

    if summary:
        sum_data = [[Paragraph(f"<b>{k}</b>", styles['Normal']),
                     _format_money(v) if isinstance(v, (int, float)) else str(v)]
                    for k, v in summary.items()]
        sum_table = Table(sum_data, colWidths=[9*cm, 5*cm])
        sum_table.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('LINEABOVE', (0, 0), (-1, 0), 1, colors.HexColor("#1f2937")),
            ('LINEBELOW', (0, -1), (-1, -1), 2, colors.HexColor("#1f2937")),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(sum_table)

    elements.append(Spacer(1, 1*cm))
    elements.append(Paragraph(
        "Software Titanova · 3013896861 · Soluciones inteligentes, negocios en movimiento",
        foot_style
    ))

    doc.build(elements)
    buf.seek(0)
    return buf.read()
