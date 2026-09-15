import traceback
from app.services.vector_store import client, embeddings, settings
try:
    client.get_collection(settings.COLLECTION_NAME)
    print("Collection exists")
except Exception as e:
    print("Collection doesn't exist:", str(e))
