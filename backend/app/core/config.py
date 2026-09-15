import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Self-Correcting RAG Pipeline"
    API_V1_STR: str = "/api/v1"
    QDRANT_PATH: str = "local_qdrant"
    COLLECTION_NAME: str = "documents"
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

    class Config:
        env_file = ".env"

settings = Settings()
