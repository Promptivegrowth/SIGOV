"""
SIGOV · Volcar los Excel del inventario a JSON crudo.

    python scripts/inventario/volcar-excel.py "<carpeta 1-Inventario Vial>" > hojas.json

Existe solo porque `exceljs` no consigue abrir el Excel del subtramo 2
—arrastra formato hasta miles de filas y la lectura no termina—, mientras
que openpyxl lo abre en un segundo. Aquí no se interpreta nada: cada hoja
sale como una lista de filas con sus valores tal cual, y toda la limpieza
la hace `leer-excel.mjs`.
"""
import datetime as dt
import glob
import json
import os
import sys

import openpyxl

carpeta = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\LUIGI\Desktop\SIGOV INVENTARIO\1-Inventario Vial'


def celda(v):
    if isinstance(v, (dt.datetime, dt.date)):
        return {'fecha': v.isoformat()}
    if isinstance(v, float) and v != v:  # NaN
        return None
    return v


salida = {}
for ruta in sorted(glob.glob(os.path.join(carpeta, '*.xlsx'))):
    # data_only: el valor calculado de las fórmulas, no la fórmula.
    wb = openpyxl.load_workbook(ruta, data_only=True, read_only=True)
    hojas = {}
    for ws in wb.worksheets:
        filas = []
        for fila in ws.iter_rows(values_only=True):
            filas.append([celda(v) for v in fila])
        # Las filas vacías del final son formato arrastrado, no datos.
        while filas and all(v in (None, '') for v in filas[-1]):
            filas.pop()
        hojas[ws.title] = filas
    wb.close()
    salida[os.path.basename(ruta)] = hojas

json.dump(salida, sys.stdout, ensure_ascii=False)
