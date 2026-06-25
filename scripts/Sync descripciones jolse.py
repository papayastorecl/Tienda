"""
sync_descripciones_jolse.py
────────────────────────────
Busca productos en Supabase que NO tienen descripción (campo
"beneficios" vacío), visita su página en Jolse, extrae el texto
descriptivo y los ingredientes (si están disponibles), traduce
al español, y guarda todo en la tabla "productos".

Se ejecuta manualmente desde GitHub Actions (botón "Run workflow").
No corre solo, no tiene cron.

Variables de entorno requeridas (GitHub Secrets):
  SUPABASE_URL
  SUPABASE_SERVICE_KEY
"""

import os
import re
import sys
import time

import requests
from bs4 import BeautifulSoup
from deep_translator import GoogleTranslator

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

HEADERS_SUPABASE = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
}

HEADERS_JOLSE = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0 Safari/537.36"
    )
}

PAUSA_SEGUNDOS = 1.5

ETIQUETAS_DESCRIPCION = ("features", "description", "product description")
ETIQUETAS_INGREDIENTES = ("ingredients", "full ingredients", "ingredient")


def obtener_productos_sin_descripcion():
    url = (
        f"{SUPABASE_URL}/rest/v1/productos"
        "?select=id,nombre,url,beneficios"
        "&or=(beneficios.is.null,beneficios.eq.)"
    )
    r = requests.get(url, headers=HEADERS_SUPABASE, timeout=30)
    r.raise_for_status()
    return r.json()


def extraer_texto_tras_etiqueta(soup, etiquetas):
    for nodo in soup.find_all(["th", "strong", "b", "h3", "h4", "dt", "span"]):
        texto_nodo = nodo.get_text(strip=True).lower()
        if texto_nodo in etiquetas:
            siguiente = nodo.find_next(["p", "div", "td"])
            if siguiente:
                contenido = siguiente.get_text(" ", strip=True)
                if len(contenido) > 30:
                    return contenido
    return None


def extraer_descripcion_jolse(html):
    soup = BeautifulSoup(html, "html.parser")

    descripcion = extraer_texto_tras_etiqueta(soup, ETIQUETAS_DESCRIPCION)

    # Respaldo: meta description de la página
    if not descripcion:
        meta = soup.find("meta", attrs={"name": "description"})
        if meta and meta.get("content"):
            contenido = meta["content"].strip()
            if len(contenido) > 30:
                descripcion = contenido

    ingredientes = extraer_texto_tras_etiqueta(soup, ETIQUETAS_INGREDIENTES)
    # Validar que de verdad parezca una lista de ingredientes (muchas comas)
    if ingredientes and ingredientes.count(",") < 5:
        ingredientes = None

    return descripcion, ingredientes


def traducir(texto):
    if not texto:
        return None
    try:
        return GoogleTranslator(source="en", target="es").translate(texto)
    except Exception as e:
        print(f"   ⚠️  No se pudo traducir: {e}")
        return None


def actualizar_producto(producto_id, campos):
    url = f"{SUPABASE_URL}/rest/v1/productos?id=eq.{producto_id}"
    r = requests.patch(url, headers=HEADERS_SUPABASE, json=campos, timeout=30)
    r.raise_for_status()


def main():
    productos = obtener_productos_sin_descripcion()
    print(f"Productos sin descripción: {len(productos)}")

    completados, fallidos = 0, 0

    for p in productos:
        nombre = p.get("nombre", "")[:60]
        url = p.get("url")

        if not url:
            print(f"⚠️  Sin URL, se omite: {nombre}")
            fallidos += 1
            continue

        try:
            resp = requests.get(url, headers=HEADERS_JOLSE, timeout=20)
            resp.raise_for_status()

            descripcion, ingredientes = extraer_descripcion_jolse(resp.text)

            if not descripcion:
                print(f"⚠️  No se encontró descripción para: {nombre}")
                fallidos += 1
                time.sleep(PAUSA_SEGUNDOS)
                continue

            descripcion_es = traducir(descripcion)

            campos = {
                "beneficios": descripcion,
                "beneficios_es": descripcion_es,
            }
            if ingredientes:
                campos["ingredientes"] = ingredientes

            actualizar_producto(p["id"], campos)
            print(f"✅ {nombre}")
            completados += 1

        except Exception as e:
            print(f"❌ Error con {nombre}: {e}")
            fallidos += 1

        time.sleep(PAUSA_SEGUNDOS)

    print("\n── Resumen ──")
    print(f"Completados : {completados}")
    print(f"Fallidos    : {fallidos}")

    total = completados + fallidos
    if total > 0 and fallidos > total * 0.5:
        print("\n‼️  Más de la mitad fallaron — Jolse pudo cambiar su HTML")
        print("    o el patrón de descripción no se reconoce para estos productos.")
        sys.exit(1)


if __name__ == "__main__":
    main()