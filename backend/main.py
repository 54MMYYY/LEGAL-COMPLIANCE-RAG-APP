from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import time
import numpy as np
from sklearn.decomposition import PCA
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from dotenv import load_dotenv
from google import genai
from google.genai import types
import random
import time

load_dotenv()
app = FastAPI()

# Configuration and Database
DATA_DIR = "data"
PERSIST_DIR = "./chroma_db"
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(PERSIST_DIR, exist_ok=True)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

embeddings = GoogleGenerativeAIEmbeddings(
    model="models/embedding-001",
    google_api_key=os.getenv("GOOGLE_API_KEY")
)
vectorstore = Chroma(persist_directory=PERSIST_DIR, embedding_function=embeddings)

file_color_cache = {}

def get_consistent_color(filename):
    if filename not in file_color_cache:
        file_color_cache[filename] = "#{:06x}".format(random.randint(0x222222, 0xDDDDDD))
    return file_color_cache[filename]

def is_generic_response(text):
    """Checks if the AI response is conversational or lacks document evidence."""
    generic_phrases = ["hello", "how are you", "i am an ai", "thank you", "i'm doing well"]
    no_info_phrases = ["does not contain", "no information", "i don't see", "not mentioned"]
    text_lower = text.lower()
    return any(p in text_lower for p in generic_phrases + no_info_phrases)

@app.get("/")
async def root():
    return RedirectResponse(url="/docs")

@app.get("/clusters")
async def get_clusters():
    try:
        data = vectorstore._collection.get(include=['embeddings', 'documents', 'metadatas'], limit = 10000)
        vecs = np.array(data['embeddings'])
        
        if vecs.shape[0] < 3:
            coords_3d = np.array([[float(i) * 5.0, 0.0, 0.0] for i in range(vecs.shape[0])])
        else:
            pca = PCA(n_components=3)
            coords_3d = pca.fit_transform(vecs)
        
        points = []
        for i in range(len(coords_3d)):
            source_file = os.path.basename(data['metadatas'][i].get('source', ''))
            points.append({
                "id": data['ids'][i],
                "position": (coords_3d[i] * 10).tolist(),
                "color": get_consistent_color(source_file), 
                "source": source_file,
                "page": data['metadatas'][i].get('page', 0),
                "text": data['documents'][i][:200]
            })
        return {"points": points}
    except Exception as e:
        return {"points": [], "error": str(e)}

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        # Save the physical file
        file_path = os.path.join(DATA_DIR, file.filename)
        with open(file_path, "wb") as f:
            f.write(await file.read())

        # Load and split the PDF
        loader = PyPDFLoader(file_path)
        documents = loader.load()
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        chunks = text_splitter.split_documents(documents)

        # Adding to Chroma database
        vectorstore.add_documents(chunks)
        
        return {"message": "Upload successful", "filename": file.filename}
    except Exception as e:
        print(f"UPLOAD ERROR: {e}") 
        return {"error": str(e)}

@app.get("/files")
async def list_files():
    # Returns the list of files in data folder to the sidebar
    if not os.path.exists(DATA_DIR):
        return []
    files = [f for f in os.listdir(DATA_DIR) if f.endswith('.pdf')]
    # Return a list of objects instead of just strings
    return [{"name": f, "color": get_consistent_color(f)} for f in files]

@app.get("/files/{filename}")
async def get_file(filename: str):
    file_path = os.path.join(DATA_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="File not found")

@app.delete("/delete/{filename}")
async def delete_file(filename: str):
    try:
        file_path = os.path.join(DATA_DIR, filename)
        
        if os.path.exists(file_path):
            os.remove(file_path)
        else:
            return {"status": "error", "message": "File not found on disk"}

        # Removing the document's vectors from ChromaDB to clean the 3D map
        vectorstore.delete(where={"source": filename})
        
        return {"status": "success", "message": f"Deleted {filename} and updated database"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
async def chat_endpoint(request: dict):
    query = request.get("query")
    try:
        # Retrieve context
        docs = vectorstore.similarity_search(query, k=5)
        context = "\n".join([doc.page_content for doc in docs])
        
        client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
        MODEL_ID = 'gemini-2.5-flash-lite'
        
        prompt = f"Context:\n{context}\n\nUser Question: {query}\nAnswer only based on context. If not found, say so."
        
        start_time = time.time()
        response = client.models.generate_content(
            model=MODEL_ID,
            contents=prompt
        )
        ans_text = response.text
        latency = f"{round((time.time() - start_time), 2)}s"

        # Filter sources if response is generic
        if is_generic_response(ans_text):
            return {"answer": ans_text, "source_ids": [], "metadata": [], "latency": latency}

        # Deduplicate sources for the UI
        sources = []
        seen = set()
        for doc in docs:
            source_name = os.path.basename(doc.metadata.get('source', 'unknown'))
            page_num = doc.metadata.get('page', 0)
            src_key = f"{source_name}_{page_num}"
            
            if src_key not in seen:
                sources.append({"source": source_name, "page": page_num + 1})
                seen.add(src_key)

        return {
            "answer": ans_text,
            "source_ids": [doc.metadata.get('id', '') for doc in docs], # Mapping IDs from docs
            "metadata": sources,
            "latency": latency
        }
    except Exception as e:
        return {"answer": f"Backend Error: {str(e)}", "source_ids": [], "metadata": []}

@app.get("/health")
async def health_check():
    """Endpoint for the frontend to check if the Render server is awake"""
    return {
        "status": "online", 
        "timestamp": time.time(),
        "region": "Dubai" 
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)