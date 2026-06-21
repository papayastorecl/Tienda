"""
sync_precios_jolse.py
──────────────────────
Recorre todos los productos guardados en la tabla "productos" de Supabase,
visita su URL en jolse.com, extrae el precio actual y actualiza el campo
precio_usd_base.

Se ejecuta manualmente desde GitHub Actions (botón "Run workflow").
No corre solo, no tiene cron.

Variables de entorno requeridas (se inyectan como GitHub Secrets):
  SUPABASE_URL          -> https://cfhjywllsnsurulywoyc.supabase.co
  SUPABASE_SERVICE_KEY  -> service_role key (NO la anon/publishable key)
"""

import os
import re
import sys
import time

import requests
from bs4 import BeautifulSoup

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

# Pausa entre cada producto para no sobrecargar el servidor de Jolse
PAUSA_SEGUNDOS = 1.5

PRECIO_RE = re.compile(r"USD\s*([\d,]+\.\d{2})")


def obtener_productos():
    url = f"{SUPABASE_URL}/rest/v1/productos?select=id,nombre,url,precio_usd_base"
    r = requests.get(url, headers=HEADERS_SUPABASE, timeout=30)
    r.raise_for_status()
    return r.json()


def extraer_precio_jolse(html):
    """
    Busca primero 'Discounted Price' (lo que el cliente realmente paga hoy).
    Si no existe, usa 'Price' (precio de lista).
    Devuelve un float en USD o None si no se pudo determinar.
    """
    soup = BeautifulSoup(html, "html.parser")

    def precio_por_etiqueta(etiqueta):
        for th in soup.find_all(["th", "td", "dt", "strong", "span"]):
            texto = th.get_text(strip=True)
            if texto == etiqueta:
                # el valor suele estar en el siguiente <td> o el siguiente hermano
                contenedor = th.find_next(["td", "dd", "span", "strong"])
                if contenedor:
                    m = PRECIO_RE.search(contenedor.get_text(" ", strip=True))
                    if m:
                        return float(m.group(1).replace(",", ""))
        return None

    precio = precio_por_etiqueta("Discounted Price")
    if precio is None:
        precio = precio_por_etiqueta("Price")

    # Respaldo: buscar cualquier patrón "USD XX.XX" en todo el texto
    if precio is None:
        m = PRECIO_RE.search(soup.get_text(" ", strip=True))
        if m:
            precio = float(m.group(1).replace(",", ""))

    return precio


def actualizar_precio(producto_id, nuevo_precio):
    url = f"{SUPABASE_URL}/rest/v1/productos?id=eq.{producto_id}"
    body = {"precio_usd_base": nuevo_precio, "updated_at": "now()"}
    r = requests.patch(url, headers=HEADERS_SUPABASE, json=body, timeout=30)
    r.raise_for_status()


def main():
    productos = obtener_productos()
    print(f"Productos a revisar: {len(productos)}")

    actualizados, sin_cambio, fallidos = 0, 0, 0

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
            nuevo_precio = extraer_precio_jolse(resp.text)

            if nuevo_precio is None:
                print(f"⚠️  No se encontró precio para: {nombre}")
                fallidos += 1
            else:
                anterior = p.get("precio_usd_base")
                if anterior is not None and abs(float(anterior) - nuevo_precio) < 0.001:
                    sin_cambio += 1
                else:
                    actualizar_precio(p["id"], nuevo_precio)
                    print(f"✅ {nombre}: {anterior} → {nuevo_precio}")
                    actualizados += 1

        except Exception as e:
            print(f"❌ Error con {nombre}: {e}")
            fallidos += 1

        time.sleep(PAUSA_SEGUNDOS)

    print("\n── Resumen ──")
    print(f"Actualizados : {actualizados}")
    print(f"Sin cambios  : {sin_cambio}")
    print(f"Fallidos     : {fallidos}")

    if fallidos > len(productos) * 0.5:
        # Si fallaron más de la mitad, probablemente Jolse cambió su HTML
        # o está bloqueando el bot. Se marca el job como fallido para
        # que se note en GitHub Actions.
        print("\n‼️  Más de la mitad de los productos fallaron — revisa si Jolse")
        print("    cambió la estructura de su página o está bloqueando el acceso.")
        sys.exit(1)


if __name__ == "__main__":
    main()
