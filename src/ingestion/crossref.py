from __future__ import annotations

from dataclasses import asdict, dataclass
from html import unescape
from pathlib import Path
import re
import time
from typing import Any

import requests

from core.config import Settings
from core.utils import normalize_whitespace, read_json, write_json


CROSSREF_API_URL = "https://api.crossref.org/works"
RETRYABLE_STATUS_CODES = {429, 503}
MAX_REQUEST_ATTEMPTS = 3


@dataclass(frozen=True)
class PaperRecord:
    paper_id: str
    title: str
    summary: str
    authors: list[str]
    categories: list[str]
    primary_category: str
    published: str
    updated: str
    abs_url: str
    pdf_url: str
    comment: str


def _as_text(value: Any) -> str:
    if isinstance(value, list):
        value = " ".join(str(item) for item in value if item)
    if not isinstance(value, str):
        return ""
    return normalize_whitespace(unescape(re.sub(r"<[^>]+>", " ", value)))


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _date_from_parts(value: Any) -> str:
    if not isinstance(value, dict):
        return ""
    parts = value.get("date-parts", [[]])
    if not parts or not isinstance(parts[0], list) or not parts[0]:
        return ""
    numbers = parts[0]
    try:
        year = int(numbers[0])
        month = int(numbers[1]) if len(numbers) > 1 else 1
        day = int(numbers[2]) if len(numbers) > 2 else 1
    except (TypeError, ValueError):
        return ""
    return f"{year:04d}-{month:02d}-{day:02d}"


def _authors(item: dict[str, Any]) -> list[str]:
    authors = []
    for author in _as_list(item.get("author")):
        if not isinstance(author, dict):
            continue
        name = normalize_whitespace(
            " ".join(part for part in (author.get("given", ""), author.get("family", "")) if part)
        )
        if name:
            authors.append(name)
    return authors


def _links(item: dict[str, Any]) -> tuple[str, str]:
    abs_url = _as_text(item.get("URL"))
    resource = item.get("resource", {})
    if isinstance(resource, dict):
        primary = resource.get("primary", {})
        if isinstance(primary, dict):
            abs_url = _as_text(primary.get("URL")) or abs_url

    pdf_url = ""
    for link in _as_list(item.get("link")):
        if not isinstance(link, dict):
            continue
        if _as_text(link.get("content-type")).lower() == "application/pdf":
            pdf_url = _as_text(link.get("URL"))
            break
    return abs_url, pdf_url


def parse_crossref_payload(payload: dict) -> list[PaperRecord]:
    """Convert a Crossref works response into embedding-ready paper records."""
    message = payload.get("message", {})
    items = message.get("items", []) if isinstance(message, dict) else []
    if not isinstance(items, list):
        return []

    records: list[PaperRecord] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        paper_id = _as_text(item.get("DOI"))
        title = _as_text(item.get("title"))
        summary = _as_text(item.get("abstract"))
        if not paper_id or not title or not summary:
            continue

        categories = [_as_text(subject) for subject in _as_list(item.get("subject"))]
        categories = [category for category in categories if category]
        published = next(
            (
                date
                for date in (
                    _date_from_parts(item.get("published-print")),
                    _date_from_parts(item.get("published-online")),
                    _date_from_parts(item.get("published")),
                    _date_from_parts(item.get("issued")),
                )
                if date
            ),
            "",
        )
        updated = _date_from_parts(item.get("indexed")) or _date_from_parts(item.get("created"))
        abs_url, pdf_url = _links(item)
        records.append(
            PaperRecord(
                paper_id=paper_id,
                title=title,
                summary=summary,
                authors=_authors(item),
                categories=categories,
                primary_category=categories[0] if categories else "",
                published=published,
                updated=updated,
                abs_url=abs_url,
                pdf_url=pdf_url,
                comment=_as_text(item.get("publisher")),
            )
        )
    return records


def fetch_source_records(settings: Settings) -> list[PaperRecord]:
    """Fetch the configured Crossref records and persist raw source artifacts."""
    params = {
        "query": settings.source_query,
        "filter": settings.source_filter,
        "rows": settings.max_results,
    }
    response: requests.Response | None = None
    for attempt in range(MAX_REQUEST_ATTEMPTS):
        try:
            candidate = requests.get(CROSSREF_API_URL, params=params, timeout=30)
            if candidate.status_code in RETRYABLE_STATUS_CODES and attempt < MAX_REQUEST_ATTEMPTS - 1:
                time.sleep(2**attempt)
                continue
            candidate.raise_for_status()
            response = candidate
            break
        except requests.RequestException:
            if attempt == MAX_REQUEST_ATTEMPTS - 1:
                raise
            time.sleep(2**attempt)

    if response is None:  # pragma: no cover - defensive guard for type checkers
        raise RuntimeError("Crossref request did not return a response.")

    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("Crossref returned a non-object JSON payload.")
    records = parse_crossref_payload(payload)
    write_json(settings.paths.raw_api_response, payload)
    write_json(settings.paths.raw_records_json, [asdict(record) for record in records])
    return records


def load_raw_records(path: Path) -> list[PaperRecord]:
    """Load a persisted Crossref record snapshot."""
    payload = read_json(path)
    if not isinstance(payload, list):
        raise ValueError(f"Expected a list of raw records in {path}.")
    return [PaperRecord(**item) for item in payload if isinstance(item, dict)]
