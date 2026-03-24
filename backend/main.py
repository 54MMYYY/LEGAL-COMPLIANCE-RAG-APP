from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import os
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_chroma import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from langchain_classic.chains import create_retrieval_chain
from dotenv import load_dotenv # Add this import

load_dotenv() # Load environment variables from .env file

app = FastAPI()

# CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
persist_directory = "./chroma_db"

# Initialize Vectorstore
# Note: Using .from_documents or initializing with an empty list if you want it ready immediately
vectorstore = Chroma(persist_directory=persist_directory, embedding_function=embeddings)

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not os.path.exists("data"):
        os.makedirs("data")
    
    path = f"data/{file.filename}"
    with open(path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    # Process PDF
    loader = PyPDFLoader(path)
    docs = loader.load()
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    splits = text_splitter.split_documents(docs)
    
    # Adding to Chroma
    vectorstore.add_documents(documents=splits)
    return {"message": "Success", "filename": file.filename}

@app.post("/chat")
async def chat_endpoint(request: dict):
    query = request.get("query")
    retriever = vectorstore.as_retriever()
    llm = ChatGoogleGenerativeAI(
        model="gemini-1.5-flash", 
        google_api_key=os.getenv("GOOGLE_API_KEY") 
    )
    
    # 2. Define the Prompt
    system_prompt = (
        "Use the following pieces of retrieved context to answer the question. "
        "If you don't know the answer, say you don't know. \n\n {context}"
    )
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human", "{input}")
    ])
    
    # 3. Create the RAG Chain
    question_answer_chain = create_stuff_documents_chain(llm, prompt)
    rag_chain = create_retrieval_chain(retriever, question_answer_chain)
    
    # 4. Invoke the Chain
    response = rag_chain.invoke({"input": query})
    
    # 5. Final Return (Always keep this at the very bottom)
    return {
        "answer": response["answer"],
        "sources": [doc.metadata.get("page", "N/A") for doc in response.get("context", [])],
        "latency": "1.2s", 
        "cost": "$0.00"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)