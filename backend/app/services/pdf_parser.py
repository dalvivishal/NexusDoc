import os
import tempfile
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

def process_pdf(file_path: str):
    loader = PyPDFLoader(file_path)
    documents = loader.load()
    
    # We want to keep page numbers in the metadata so the frontend can highlight citations
    # The PyPDFLoader automatically adds "page" and "source" to metadata.
    
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len,
        is_separator_regex=False,
    )
    chunks = text_splitter.split_documents(documents)
    return chunks
