from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import chromadb
import pandas as pd

from core.config import Settings
from core.utils import read_json, safe_slug, write_json
from retrieval.embeddings import MiniLMEmbeddings


@dataclass(frozen=True)
class SearchResult:
    paper_id: str
    title: str
    score: float
    content: str
    metadata: dict[str, Any]


class LocalEmbeddingIndex:
    REQUIRED_COLUMNS = {
        "paper_id",
        "title",
        "text_for_embedding",
        "published",
        "authors_joined",
        "categories_joined",
        "summary",
        "abs_url",
        "pdf_url",
    }

    def __init__(
        self,
        settings: Settings,
        collection_name: str,
        documents: list[dict[str, Any]],
        persist_path: Path,
    ):
        self.settings = settings
        self.collection_name = collection_name
        self.documents = documents
        self.persist_path = persist_path
        self.embedding_backend = "chroma"
        self.embedding_model = MiniLMEmbeddings(settings.embedding_model)
        self.client = chromadb.PersistentClient(path=str(persist_path))
        self.collection = self.client.get_collection(name=collection_name)
        self.documents_by_paper_id = {document["paper_id"].lower(): document for document in documents}
        self.documents_by_title = {document["title"].lower(): document for document in documents}

    @staticmethod
    def _build_documents(df: pd.DataFrame) -> list[dict[str, Any]]:
        missing_columns = LocalEmbeddingIndex.REQUIRED_COLUMNS.difference(df.columns)
        if missing_columns:
            missing = ", ".join(sorted(missing_columns))
            raise ValueError(f"Cleaned dataframe is missing required RAG columns: {missing}.")
        if df.empty:
            raise ValueError(
                "Cannot build a RAG index from an empty dataframe. "
                "Run the ingestion and cleaning pipeline first."
            )

        records = df.to_dict(orient="records")
        documents: list[dict[str, Any]] = []
        for index, row in enumerate(records):
            paper_id = str(row["paper_id"]).strip()
            title = str(row["title"]).strip()
            content = str(row["text_for_embedding"]).strip()
            if not paper_id or not title or not content:
                raise ValueError(
                    "Each indexed record needs non-empty paper_id, title, and text_for_embedding."
                )
            documents.append(
                {
                    "record_id": f"{paper_id}::{index}",
                    "paper_id": paper_id,
                    "title": title,
                    "content": content,
                    "metadata": {
                        "paper_id": row["paper_id"],
                        "title": row["title"],
                        "published": row["published"],
                        "authors_joined": row["authors_joined"],
                        "categories_joined": row["categories_joined"],
                        "summary": row["summary"],
                        "abs_url": row["abs_url"],
                        "pdf_url": row["pdf_url"],
                    },
                }
            )
        return documents

    @staticmethod
    def _derive_collection_name(settings: Settings, embeddings_output_path: Path | None) -> str:
        if embeddings_output_path is None:
            return settings.baseline_collection_name

        name_map = {
            settings.paths.embeddings_json.resolve(): settings.baseline_collection_name,
            settings.paths.corrupted_embeddings_json.resolve(): settings.corrupted_collection_name,
            settings.paths.repaired_embeddings_json.resolve(): settings.repaired_collection_name,
        }
        resolved_path = embeddings_output_path.resolve()
        if resolved_path in name_map:
            return name_map[resolved_path]
        return safe_slug(embeddings_output_path.stem)

    @classmethod
    def build(
        cls,
        df: pd.DataFrame,
        settings: Settings,
        embeddings_output_path: Path | None = None,
    ) -> "LocalEmbeddingIndex":
        collection_name = cls._derive_collection_name(settings, embeddings_output_path)
        documents = cls._build_documents(df)
        persist_path = settings.paths.chroma_dir
        persist_path.mkdir(parents=True, exist_ok=True)

        embedding_model = MiniLMEmbeddings(settings.embedding_model)
        client = chromadb.PersistentClient(path=str(persist_path))
        try:
            client.delete_collection(name=collection_name)
        except Exception:
            pass
        collection = client.create_collection(
            name=collection_name,
            configuration={"hnsw": {"space": "cosine"}},
        )
        embeddings = embedding_model.embed_documents([document["content"] for document in documents])
        collection.add(
            ids=[document["record_id"] for document in documents],
            embeddings=embeddings,
            documents=[document["content"] for document in documents],
            metadatas=[document["metadata"] for document in documents],
        )

        manifest_path = embeddings_output_path or settings.paths.embeddings_json
        write_json(
            manifest_path,
            {
                "backend": "chroma",
                "embedding_model": settings.embedding_model,
                "persist_path": str(persist_path.relative_to(settings.paths.project_dir)),
                "collection_name": collection_name,
                "documents": documents,
            },
        )
        return cls(
            settings=settings,
            collection_name=collection_name,
            documents=documents,
            persist_path=persist_path,
        )

    @classmethod
    def load(cls, settings: Settings, embeddings_path: Path | None = None) -> "LocalEmbeddingIndex":
        manifest_path = embeddings_path or settings.paths.embeddings_json
        if not manifest_path.exists():
            raise FileNotFoundError(
                f"RAG index manifest not found at {manifest_path}. "
                "Run the baseline pipeline to create cleaned data and embeddings first."
            )
        payload = read_json(manifest_path)
        return cls(
            settings=settings,
            collection_name=payload["collection_name"],
            documents=payload["documents"],
            # The manifest may have been generated on another machine.  The
            # project setting is the portable source of truth for Chroma data.
            persist_path=settings.paths.chroma_dir,
        )

    def search(self, query: str, top_k: int | None = None) -> list[SearchResult]:
        query = query.strip()
        if not query:
            raise ValueError("Search query must not be empty.")
        requested_top_k = top_k or self.settings.top_k
        if requested_top_k < 1:
            raise ValueError("top_k must be at least 1.")
        collection_size = self.collection.count()
        if collection_size == 0:
            return []

        query_embedding = self.embedding_model.embed_query(query)
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=min(requested_top_k, collection_size),
            include=["documents", "metadatas", "distances"],
        )
        ids = results.get("ids", [[]])[0]
        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        scored: list[SearchResult] = []
        for record_id, content, metadata, distance in zip(ids, documents, metadatas, distances, strict=False):
            if not record_id or not metadata or not content:
                continue
            scored.append(
                SearchResult(
                    paper_id=str(metadata["paper_id"]),
                    title=str(metadata["title"]),
                    score=max(0.0, 1.0 - float(distance or 0.0)),
                    content=str(content),
                    metadata=dict(metadata),
                )
            )
        return scored

    def lookup(self, value: str) -> dict[str, Any] | None:
        needle = value.strip().lower()
        if needle in self.documents_by_paper_id:
            return self.documents_by_paper_id[needle]
        if needle in self.documents_by_title:
            return self.documents_by_title[needle]
        return None
