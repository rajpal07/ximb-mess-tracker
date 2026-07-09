import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader


def normalize_text(path: Path) -> str:
    reader = PdfReader(str(path))
    text = " ".join((page.extract_text() or "") for page in reader.pages)
    return " ".join(text.split())


def title_case(value: str) -> str:
    return " ".join(part.capitalize() for part in value.lower().split())


def parse_invoice(path: Path) -> list[dict]:
    text = normalize_text(path)

    date_match = re.search(r"Invoice Date\s*:?\s*(\d{2}-\d{2}-\d{4})", text, re.IGNORECASE)
    if not date_match:
        raise ValueError("invoice date not found")

    day, month, year = date_match.group(1).split("-")
    date_str = f"{year}-{month}-{day}"

    # Pattern to match structured item rows and extract:
    # 1. SNo, 2. Item Name (alphabets only), 3. Qty, 4. Total Price
    row_pattern = r"\b(\d+)\s+([A-Z][A-Z\s&.-]*?)(?:\s+\d+)?\s+(\d+(?:\.\d+)?)\s*PC(?:\s+[A-Z])?\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)\b"

    matches = re.findall(row_pattern, text, re.IGNORECASE)
    items_list = []

    for sno, name, qty, price in matches:
        clean_name = title_case(name.strip())
        q = float(qty)
        if q > 1:
            qty_label = str(int(q)) if q.is_integer() else str(q)
            clean_name = f"{clean_name} ({qty_label})"
        items_list.append({
            "date": date_str,
            "item": clean_name,
            "sourceFile": path.name,
            "total": float(price),
        })

    if not items_list:
        # Fallback if no structured table rows found
        item_match = re.search(
            r"Item Name.*?Total\s+\d+\s+(.+?)\s+\d+\s+1\.0PC\b",
            text,
            re.IGNORECASE,
        )
        fallback_item = title_case(item_match.group(1).strip()) if item_match else path.stem
        fallback_item = re.sub(r'\s*\d+\s*$', '', fallback_item)

        total_matches = re.findall(
            r"Total Invoice Amount(?: After Tax)?\s*(\d+(?:\.\d{1,2})?)",
            text,
            re.IGNORECASE,
        )
        grand_total = float(total_matches[-1]) if total_matches else 0.0
        items_list.append({
            "date": date_str,
            "item": fallback_item,
            "sourceFile": path.name,
            "total": grand_total,
        })

    return items_list


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: parse_invoice.py <pdf_path>")

    path = Path(sys.argv[1])
    result = parse_invoice(path)
    print(json.dumps(result))


if __name__ == "__main__":
    main()

