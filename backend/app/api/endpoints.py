import os
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from app.services.pdf_parser import process_pdf
from app.services.vector_store import add_documents_to_store
from app.services.graph import app_graph
import tempfile
import uuid
import traceback

router = APIRouter()

class ChatRequest(BaseModel):
    query: str

class ChatResponse(BaseModel):
    answer: str
    steps: list[str]

@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    try:
        # Save uploaded file to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        # Process PDF and chunk it
        chunks = process_pdf(tmp_path)
        
        # Add to Vector Store
        add_documents_to_store(chunks)
        
        # Cleanup
        os.unlink(tmp_path)
        
        return {"message": "Document processed and indexed successfully", "chunks": len(chunks)}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        inputs = {"question": request.query}
        # Run the graph
        result = app_graph.invoke(inputs)
        return ChatResponse(
            answer=result["generation"],
            steps=result["steps"]
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
