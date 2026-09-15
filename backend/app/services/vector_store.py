import os
import atexit
from qdrant_client import QdrantClient
from langchain_qdrant import QdrantVectorStore
from langchain_huggingface import HuggingFaceEmbeddings
from qdrant_client.models import Distance, VectorParams
from app.core.config import settings

# Initialize Qdrant client (local disk storage)
client = QdrantClient(path=settings.QDRANT_PATH)
atexit.register(client.close)

# Initialize Embeddings
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

def get_vector_store():
    # If the collection doesn't exist, QdrantVectorStore handles it when adding texts,
    # but for pure retrieval we might need it initialized.
    vector_store = QdrantVectorStore(
        client=client,
        collection_name=settings.COLLECTION_NAME,
        embedding=embeddings,
    )
    return vector_store

def add_documents_to_store(docs):
    if not client.collection_exists(settings.COLLECTION_NAME):
        client.create_collection(
            collection_name=settings.COLLECTION_NAME,
            vectors_config=VectorParams(size=384, distance=Distance.COSINE),
        )
    vector_store = QdrantVectorStore(
        client=client,
        collection_name=settings.COLLECTION_NAME,
        embedding=embeddings,
    )
    vector_store.add_documents(docs)
    return True

def retrieve_context(query: str, top_k: int = 5):
    if not client.collection_exists(settings.COLLECTION_NAME):
        return []
    vector_store = get_vector_store()
    results = vector_store.similarity_search(query, k=top_k)
    return results
