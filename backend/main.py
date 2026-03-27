from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import time
import numpy as np
from sklearn.decomposition import PCA
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from dotenv import load_dotenv
import google.generativeai as genai
import random

load_dotenv()
app = FastAPI()

# Configuration and Database
DATA_DIR = "data"
PERSIST_DIR = "./chroma_db"
os.makedirs(DATA_DIR, exist_ok=True)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
vectorstore = Chroma(persist_directory=PERSIST_DIR, embedding_function=embeddings)

file_color_cache = {}

def get_consistent_color(filename):
    if filename not in file_color_cache:
        # Avoid black/white by staying in the mid-range
        file_color_cache[filename] = "#{:06x}".format(random.randint(0x222222, 0xDDDDDD))
    return file_color_cache[filename]

def is_generic_response(text):
    """Checks if the AI response is conversational or lacks document evidence."""
    generic_phrases = ["hello", "how are you", "i am an ai", "thank you", "i'm doing well"]
    no_info_phrases = ["does not contain", "no information", "i don't see", "not mentioned"]
    text_lower = text.lower()
    return any(p in text_lower for p in generic_phrases + no_info_phrases)

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
                "color": get_consistent_color(source_file), # Use the same helper
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

        # Add to your Chroma database
        vectorstore.add_documents(chunks)
        
        return {"message": "Upload successful", "filename": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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

        # Remove the document's vectors from ChromaDB to clean the 3D map
        vectorstore.delete(where={"source": file_path})
        
        return {"status": "success", "message": f"Deleted {filename} and updated database"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
async def chat_endpoint(request: dict):
    query = request.get("query")
    search_query = query.replace("(", "").replace(")", "")
    try:
        # Retrieve context
        results = vectorstore._collection.query(query_texts=[search_query, query], n_results=5, include=['documents', 'metadatas'])
        context = "\n".join(results['documents'][0])
        
        genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
        model = genai.GenerativeModel('gemini-2.5-flash-lite')
        
        prompt = f"Context:\n{context}\n\nUser Question: {query}\nAnswer only based on context. If not found, say so."
        
        start_time = time.time()
        response = model.generate_content(prompt)
        ans_text = response.text
        latency = f"{round((time.time() - start_time), 2)}s"

        # Filter sources if response is generic
        if is_generic_response(ans_text):
            return {"answer": ans_text, "source_ids": [], "metadata": [], "latency": latency}

        # Deduplicate sources for the UI
        sources = []
        seen = set()
        for m in results['metadatas'][0]:
            src_key = f"{os.path.basename(m['source'])}_{m['page']}"
            if src_key not in seen:
                sources.append({"source": os.path.basename(m['source']), "page": m['page'] + 1})
                seen.add(src_key)

        return {
            "answer": ans_text,
            "source_ids": results['ids'][0],
            "metadata": sources,
            "latency": latency
        }
    except Exception as e:
        return {"answer": f"Backend Error: {str(e)}", "source_ids": [], "metadata": []}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)