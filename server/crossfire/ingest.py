"""Read a bounded upload with the pinned Crossfire ingestion modules."""
import asyncio
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).with_name("upstream")))
if dependencies := os.getenv("TACTILE_CROSSFIRE_LIBS"):
    sys.path.insert(1, dependencies)

MAX_BYTES = 4 * 1024 * 1024
MAX_PIXELS = 12_000_000
MAX_PAGES = 15
MAX_TEXT = 2401


async def extract(kind, data):
    import io

    import pymupdf
    from PIL import Image
    from ingestion.image import ingest_image
    from ingestion.pdf import ingest_pdf

    if kind == "image":
        with Image.open(io.BytesIO(data)) as image:
            if (
                image.format not in {"PNG", "JPEG", "WEBP"}
                or image.width * image.height > MAX_PIXELS
            ):
                raise ValueError("Unsupported image")
            image.verify()
        return await ingest_image(data)

    if kind != "pdf" or not data.startswith(b"%PDF-"):
        raise ValueError("Unsupported document")
    with pymupdf.open(stream=data, filetype="pdf") as document:
        if not 0 < len(document) <= MAX_PAGES or document.needs_pass:
            raise ValueError("Unsupported PDF")
        for page in document:
            area_at_150_dpi = page.rect.width * page.rect.height * (150 / 72) ** 2
            if area_at_150_dpi > MAX_PIXELS:
                raise ValueError("PDF dimensions exceed raster budget")
    return await ingest_pdf(data)


if __name__ == "__main__":
    try:
        data = sys.stdin.buffer.read(MAX_BYTES + 1)
        if not 0 < len(data) <= MAX_BYTES:
            raise ValueError("Invalid upload size")
        text = asyncio.run(extract(sys.argv[1], data)).strip()
        if len(text) < 12:
            raise ValueError("No readable text")
        sys.stdout.buffer.write(text[:MAX_TEXT].encode("utf-8"))
    except (ValueError, OSError, RuntimeError):
        sys.exit(2)
