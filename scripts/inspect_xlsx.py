# -*- coding: utf-8 -*-
import openpyxl, glob, io, sys

out = io.StringIO()
def p(*a):
    print(*a, file=out)

for path in glob.glob("docs/*.xlsx"):
    if "~$" in path:
        p("[LOCK FILE]", path)
        continue
    p("=" * 70)
    p("FILE:", path)
    try:
        wb = openpyxl.load_workbook(path, data_only=True)
    except Exception as e:
        p("  ERROR:", e)
        continue
    p("  SHEETS:", wb.sheetnames)
    for ws in wb.worksheets:
        p("-" * 60)
        p("  SHEET:", ws.title, " dims:", ws.dimensions, " max_row:", ws.max_row, " max_col:", ws.max_column)
        # print first 12 rows
        for r in range(1, min(ws.max_row, 12) + 1):
            row_vals = []
            for c in range(1, min(ws.max_column, 14) + 1):
                v = ws.cell(row=r, column=c).value
                row_vals.append(f"{openpyxl.utils.get_column_letter(c)}{r}={v!r}")
            p("   " + " | ".join(row_vals))

with open("scripts/_xlsx_dump.txt", "w", encoding="utf-8") as f:
    f.write(out.getvalue())
print("done")
