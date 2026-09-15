import sys
import traceback
sys.path.append("/home/neural/vishal/AI_Projects/backend")
from app.services.graph import app_graph
try:
    print("Invoking graph...")
    app_graph.invoke({"question": "hello"})
except Exception as e:
    traceback.print_exc()
