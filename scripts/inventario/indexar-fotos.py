"""
SIGOV · Índice de las fotos del inventario.

    python scripts/inventario/indexar-fotos.py "<carpeta 2-Fotos_Elementos_Viales>" > indice.json

Por cada archivo: su huella SHA-256, sus dimensiones, su peso y la fecha en
que se tomó si la cámara la dejó escrita. No se decodifica la imagen —Pillow
lee solo la cabecera—, así que recorrer las cinco mil fotos toma segundos.

La huella es lo que permite subir cada foto una sola vez: 451 fotos de
calzada vienen copiadas en tres carpetas (Bermas, Calzada y Señalización
horizontal), byte a byte iguales, porque la misma imagen del kilómetro
muestra los tres elementos.
"""
import hashlib
import json
import os
import sys

from PIL import ExifTags, Image

carpeta = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\LUIGI\Desktop\SIGOV INVENTARIO\2-Fotos_Elementos_Viales'
TAG = {v: k for k, v in ExifTags.TAGS.items()}


def fecha_exif(im):
    try:
        ex = im.getexif()
        if not ex:
            return None
        f = ex.get_ifd(0x8769).get(TAG['DateTimeOriginal']) or ex.get(TAG['DateTime'])
        if not f:
            return None
        # «2024:11:21 10:32:05» → ISO
        f = str(f).strip()
        return f[:10].replace(':', '-') + 'T' + f[11:19] if len(f) >= 19 else None
    except Exception:
        return None


salida = []
for raiz, _, archivos in os.walk(carpeta):
    for nombre in sorted(archivos):
        ruta = os.path.join(raiz, nombre)
        rel = os.path.relpath(ruta, carpeta)
        with open(ruta, 'rb') as fh:
            datos = fh.read()
        item = {
            'ruta': rel.replace('\\', '/'),
            'carpeta': rel.split(os.sep)[0],
            'nombre': nombre,
            'sha256': hashlib.sha256(datos).hexdigest(),
            'bytes': len(datos),
        }
        try:
            with Image.open(ruta) as im:
                item['ancho'], item['alto'] = im.size
                item['formato'] = im.format
                item['tomada'] = fecha_exif(im)
        except Exception as e:
            item['error'] = str(e)[:120]
        salida.append(item)

json.dump(salida, sys.stdout, ensure_ascii=False)
