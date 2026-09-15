from app.core.config import settings
from app.services.vector_store import client, embeddings, add_documents_to_store, retrieve_context
from langchain_core.documents import Document
import traceback

docs = [Document(page_content="test doc", metadata={"page": 1})]

try:
    print("Adding docs...")
    add_documents_to_store(docs)
    print("Docs added successfully.")
    
    print("Retrieving docs...")
    res = retrieve_context("test")
    print("Docs retrieved:", res)
except Exception as e:
    print("Error occurred!")
    traceback.print_exc()
