#!/usr/bin/env python3
"""Fetch AI / CS radar items for the static GitHub Pages dashboard.

No secrets are required. If GITHUB_TOKEN is present, GitHub API rate limits are higher.
The script is intentionally conservative and writes a small public JSON file.
"""
from __future__ import annotations

import argparse
import email.utils
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "radar" / "data.json"
UA = "GongyiChuren-AI-Radar/1.0 (+https://me.gongyichuren.de/radar/)"
NOW = datetime.now(timezone.utc)

AI_KEYWORDS = [
    "ai", "llm", "agent", "agents", "machine learning", "deep learning", "generative",
    "openai", "anthropic", "claude", "gpt", "gemini", "llama", "mistral", "qwen",
    "rag", "mcp", "transformer", "inference", "diffusion", "multimodal", "embedding",
]
CS_KEYWORDS = [
    "developer", "programming", "compiler", "database", "linux", "security", "webassembly",
    "python", "javascript", "typescript", "rust", "go", "kubernetes", "devtools",
    "performance", "distributed", "systems", "open source", "github",
]


def http_get(url: str, *, headers: dict[str, str] | None = None, timeout: int = 25) -> bytes:
    req_headers = {"User-Agent": UA, "Accept": "application/json, text/xml, application/xml, text/html;q=0.8, */*;q=0.7"}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, headers=req_headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def get_json(url: str, *, headers: dict[str, str] | None = None) -> Any:
    return json.loads(http_get(url, headers=headers).decode("utf-8", "replace"))


def strip_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value or "")
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def short(value: str, limit: int = 220) -> str:
    value = strip_html(value)
    return value if len(value) <= limit else value[: limit - 1].rstrip() + "…"


def parse_dt(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip()
    try:
        if value.endswith("Z"):
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
        return datetime.fromisoformat(value).astimezone(timezone.utc).isoformat()
    except Exception:
        try:
            return email.utils.parsedate_to_datetime(value).astimezone(timezone.utc).isoformat()
        except Exception:
            return None


def score_text(*parts: str) -> int:
    text = " ".join(parts).lower()
    score = 0
    for kw in AI_KEYWORDS:
        if kw in text:
            score += 3
    for kw in CS_KEYWORDS:
        if kw in text:
            score += 1
    return score


def uniq(items: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out = []
    for item in items:
        key = item.get("url") or item.get("title")
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(item)
        if len(out) >= limit:
            break
    return out


def fetch_github(limit: int = 18) -> list[dict[str, Any]]:
    headers = {"Accept": "application/vnd.github+json"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    since = (NOW - timedelta(days=14)).date().isoformat()
    queries = [
        f"AI OR LLM OR agent created:>{since} stars:>20",
        f"machine-learning OR deep-learning created:>{since} stars:>20",
        f"developer-tools OR cli OR terminal created:>{since} stars:>30",
    ]
    collected: list[dict[str, Any]] = []
    for query in queries:
        url = "https://api.github.com/search/repositories?" + urllib.parse.urlencode({
            "q": query,
            "sort": "stars",
            "order": "desc",
            "per_page": "20",
        })
        try:
            data = get_json(url, headers=headers)
        except Exception as exc:
            print(f"github fetch failed: {exc}", file=sys.stderr)
            continue
        for repo in data.get("items", []):
            title = repo.get("full_name") or repo.get("name") or ""
            desc = repo.get("description") or ""
            relevance = score_text(title, desc, " ".join(repo.get("topics") or []))
            if relevance <= 0:
                continue
            collected.append({
                "title": title,
                "url": repo.get("html_url"),
                "summary": short(desc or "No description"),
                "source": "GitHub",
                "kind": "repo",
                "language": repo.get("language"),
                "stars": repo.get("stargazers_count"),
                "forks": repo.get("forks_count"),
                "updatedAt": parse_dt(repo.get("updated_at")),
                "score": relevance + int(repo.get("stargazers_count") or 0) / 120,
            })
    collected.sort(key=lambda x: (x.get("score") or 0, x.get("stars") or 0), reverse=True)
    return uniq(collected, limit)


def fetch_hn(limit: int = 18) -> list[dict[str, Any]]:
    queries = ["AI OR LLM OR agent OR GPT OR Claude", "programming OR database OR Linux OR compiler OR security"]
    collected: list[dict[str, Any]] = []
    for query in queries:
        url = "https://hn.algolia.com/api/v1/search_by_date?" + urllib.parse.urlencode({
            "query": query,
            "tags": "story",
            "hitsPerPage": "30",
        })
        try:
            data = get_json(url)
        except Exception as exc:
            print(f"hn fetch failed: {exc}", file=sys.stderr)
            continue
        for hit in data.get("hits", []):
            title = hit.get("title") or hit.get("story_title") or ""
            target = hit.get("url") or hit.get("story_url") or f"https://news.ycombinator.com/item?id={hit.get('objectID')}"
            points = hit.get("points") or 0
            comments = hit.get("num_comments") or 0
            relevance = score_text(title, target)
            if relevance <= 0:
                continue
            collected.append({
                "title": short(title, 160),
                "url": target,
                "commentsUrl": f"https://news.ycombinator.com/item?id={hit.get('objectID')}",
                "summary": f"{points} points · {comments} comments",
                "source": "Hacker News",
                "kind": "story",
                "points": points,
                "comments": comments,
                "updatedAt": parse_dt(hit.get("created_at")),
                "score": relevance + points / 80 + comments / 120,
            })
    collected.sort(key=lambda x: (x.get("score") or 0, x.get("points") or 0), reverse=True)
    return uniq(collected, limit)


def fetch_arxiv(limit: int = 16) -> list[dict[str, Any]]:
    query = 'cat:cs.AI OR cat:cs.CL OR cat:cs.LG OR cat:cs.CV OR cat:cs.SE OR cat:cs.PL'
    url = "https://export.arxiv.org/api/query?" + urllib.parse.urlencode({
        "search_query": query,
        "start": "0",
        "max_results": "32",
        "sortBy": "submittedDate",
        "sortOrder": "descending",
    })
    try:
        raw = http_get(url, headers={"Accept": "application/atom+xml"})
    except Exception as exc:
        print(f"arxiv fetch failed: {exc}", file=sys.stderr)
        return []
    root = ET.fromstring(raw)
    ns = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}
    items: list[dict[str, Any]] = []
    for entry in root.findall("atom:entry", ns):
        title = short(entry.findtext("atom:title", "", ns), 180)
        summary = short(entry.findtext("atom:summary", "", ns), 260)
        link = entry.findtext("atom:id", "", ns)
        authors = [a.findtext("atom:name", "", ns) for a in entry.findall("atom:author", ns)]
        cats = [c.attrib.get("term", "") for c in entry.findall("atom:category", ns) if c.attrib.get("term")]
        relevance = score_text(title, summary, " ".join(cats))
        if relevance <= 0:
            continue
        items.append({
            "title": title,
            "url": link,
            "summary": summary,
            "source": "arXiv",
            "kind": "paper",
            "authors": [a for a in authors if a][:4],
            "categories": cats[:4],
            "updatedAt": parse_dt(entry.findtext("atom:published", "", ns)),
            "score": relevance,
        })
    return uniq(items, limit)


def parse_feed(raw: bytes, source: str, limit: int) -> list[dict[str, Any]]:
    root = ET.fromstring(raw)
    items: list[dict[str, Any]] = []
    # Atom
    if root.tag.endswith("feed"):
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        for entry in root.findall("atom:entry", ns)[:limit * 2]:
            title = entry.findtext("atom:title", "", ns)
            summary = entry.findtext("atom:summary", "", ns) or entry.findtext("atom:content", "", ns)
            link_el = entry.find("atom:link[@rel='alternate']", ns)
            if link_el is None:
                link_el = entry.find("atom:link", ns)
            link = link_el.attrib.get("href") if link_el is not None else entry.findtext("atom:id", "", ns)
            items.append({
                "title": short(title, 170),
                "url": link,
                "summary": short(summary, 230),
                "source": source,
                "kind": "blog",
                "updatedAt": parse_dt(entry.findtext("atom:updated", "", ns) or entry.findtext("atom:published", "", ns)),
                "score": score_text(title, summary),
            })
    else:
        channel = root.find("channel")
        for item in (channel.findall("item") if channel is not None else [])[:limit * 2]:
            title = item.findtext("title", "")
            summary = item.findtext("description", "")
            items.append({
                "title": short(title, 170),
                "url": item.findtext("link", ""),
                "summary": short(summary, 230),
                "source": source,
                "kind": "blog",
                "updatedAt": parse_dt(item.findtext("pubDate", "")),
                "score": score_text(title, summary),
            })
    return [i for i in items if i.get("title") and i.get("url")]


def fetch_blogs(limit: int = 18) -> list[dict[str, Any]]:
    feeds = [
        ("OpenAI Blog", "https://openai.com/blog/rss.xml"),
        ("Anthropic News", "https://openrss.org/www.anthropic.com/news"),
        ("Google AI Blog", "https://blog.google/technology/ai/rss/"),
        ("Hugging Face Blog", "https://huggingface.co/blog/feed.xml"),
        ("Simon Willison", "https://simonwillison.net/atom/everything/"),
        ("TechCrunch AI", "https://techcrunch.com/category/artificial-intelligence/feed/"),
    ]
    all_items: list[dict[str, Any]] = []
    for source, url in feeds:
        try:
            all_items.extend(parse_feed(http_get(url), source, 5))
        except Exception as exc:
            print(f"feed fetch failed {source}: {exc}", file=sys.stderr)
    all_items.sort(key=lambda x: (x.get("updatedAt") or "", x.get("score") or 0), reverse=True)
    return uniq(all_items, limit)


def build_payload() -> dict[str, Any]:
    sections = {
        "github": fetch_github(),
        "hn": fetch_hn(),
        "arxiv": fetch_arxiv(),
        "blogs": fetch_blogs(),
    }
    all_items = [item for items in sections.values() for item in items]
    all_items.sort(key=lambda x: (x.get("score") or 0, x.get("updatedAt") or ""), reverse=True)
    highlights = uniq(all_items, 8)
    return {
        "generatedAt": NOW.isoformat(),
        "site": "https://me.gongyichuren.de/radar/",
        "sections": sections,
        "highlights": highlights,
        "counts": {key: len(value) for key, value in sections.items()},
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(OUT))
    args = parser.parse_args()
    payload = build_payload()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(out.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(out)
    print(f"wrote {out} with {sum(payload['counts'].values())} items")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
