# -*- coding: utf-8 -*-
import openpyxl, io, zipfile
PATH = r"docs/回答評価シート(最終).xlsx"
out = io.StringIO()
def p(*a): print(*a, file=out)

# charts / images via zip
z = zipfile.ZipFile(PATH)
names = z.namelist()
p("charts:", [n for n in names if "chart" in n.lower()])
p("drawings:", [n for n in names if "drawing" in n.lower()])
p("images:", [n for n in names if "media" in n.lower()])

wb = openpyxl.load_workbook(PATH)  # formulas preserved
for ws in wb.worksheets:
    # detect formula cells
    fcount = 0
    sample = []
    for row in ws.iter_rows():
        for cell in row:
            if isinstance(cell.value, str) and cell.value.startswith("="):
                fcount += 1
                if len(sample) < 3:
                    sample.append((cell.coordinate, cell.value))
    p(f"sheet={ws.title!r} formulas={fcount} sample={sample} charts={len(getattr(ws,'_charts',[]))} images={len(getattr(ws,'_images',[]))}")

with open("scripts/_features.txt", "w", encoding="utf-8") as f:
    f.write(out.getvalue())
print("done")
