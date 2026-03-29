import React, { useState, useEffect, useRef } from 'react';
import { Send, FileText, Activity, Database, Clock, Maximize2, Minimize2, Trash2 } from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import DocumentVisualizer from './components/DocumentVisualizer';
import { Worker, Viewer } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';

const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://127.0.0.1:8000' 
  : 'https://legal-compliance-rag-app.onrender.com';

const api = axios.create({ baseURL: API_BASE_URL });

const App = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ latency: '0ms', sources: 0, cost: '$0.00' });
  const [isVisualizerOpen, setIsVisualizerOpen] = useState(true);
  const [activeIds, setActiveIds] = useState([]); 
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const fileInputRef = useRef(null);
  const [serverStatus, setServerStatus] = useState('connecting');
  
  const [pdfViewer, setPdfViewer] = useState({ isOpen: false, url: '', page: 0, width: 600, key: 0 });
  const isResizing = useRef(false);

  const chatEndRef = useRef(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const textareaRef = useRef(null);

  useEffect(() => {
  const checkHealth = async () => {
    try {
      await api.get('/health');
      setServerStatus('online');
    } catch (e) {
      setServerStatus('offline');
      console.log("Server is still waking up...");
    }
  };

  checkHealth();
  const timer = setInterval(checkHealth, 20000);
  return () => clearInterval(timer);
}, []);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`; 
    }
  };

  const fetchFiles = async () => {
    try {
      const res = await api.get('/files');
      setUploadedFiles(res.data);
    } catch (e) { console.error("Fetch failed"); }
  };
  useEffect(() => { fetchFiles(); }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing.current) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 350 && newWidth < 900) setPdfViewer(prev => ({ ...prev, width: newWidth }));
    };
    const stopResizing = () => { isResizing.current = false; };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResizing);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', stopResizing); };
  }, []);

  const openPdfAtPage = (fileName, pageNum) => {
    const url = `${API_BASE_URL}/files/${fileName}`;
    setPdfViewer(prev => ({ ...prev, isOpen: true, url, page: pageNum - 1, key: Date.now() }));
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || uploadedFiles.length >= 5) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post('/upload', formData);
      fetchFiles();
    } catch (error) { alert("Upload failed."); }
    finally { setIsUploading(false); }
  };

  const deleteFile = async (filename) => {
    try {
      await api.delete(`/delete/${filename}`);
      fetchFiles();
      if (pdfViewer.url.includes(filename)) setPdfViewer(p => ({ ...p, isOpen: false }));
    } catch (e) { alert("Delete failed"); }
  };

  const handleSend = async (e) => {
  if (e) e.preventDefault();
  if (!input.trim()) return;

  const currentQuery = input;

  setMessages(prev => [...prev, { role: 'user', content: currentQuery }]);
  setInput(''); 

  if (textareaRef.current) {
    textareaRef.current.style.height = 'auto';
  }

  setLoading(true);

  try {
    const res = await api.post('/chat', { query: currentQuery });
    setStats({
      latency: res.data.latency,
      sources: res.data.metadata.length,
      cost: "$0.00" 
    });
    setMessages(prev => [...prev, { 
      role: 'assistant', 
      content: res.data.answer, 
      sources: res.data.metadata 
    }]);
    setActiveIds(res.data.source_ids);
  } catch (err) {
    console.error("Chat error:", err);
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="flex h-screen w-screen bg-slate-900 text-white overflow-hidden font-sans">
      {/* SIDEBAR */}
      <div className="w-80 bg-slate-950 border-r border-slate-800 p-6 flex flex-col shrink-0">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent mb-8">Production RAG v1.0</h1>
        <div className="flex items-center gap-2 mb-8 px-1">
          <div className={`w-2 h-2 rounded-full transition-all duration-500 ${
            serverStatus === 'online' 
              ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' 
              : 'bg-red-500 shadow-[0_0_8px_#ef4444]'
          }`} />
          <span className="text-[10px] text-slate-500 uppercase font-mono tracking-wider">
            System: {serverStatus}
          </span>
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          <label className="block text-sm font-medium text-slate-400 mb-2">Knowledge Base ({uploadedFiles.length}/5)</label>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".pdf" />
          <div onClick={() => uploadedFiles.length < 5 && fileInputRef.current.click()} className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer bg-slate-900/50 mb-4 ${isUploading ? 'border-emerald-500 opacity-50' : 'border-slate-800 hover:border-blue-500'} ${uploadedFiles.length >= 5 ? 'opacity-30' : ''}`}>
            <FileText className={`mx-auto mb-2 ${isUploading ? 'animate-bounce text-emerald-400' : 'text-slate-500'}`} />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{isUploading ? 'Indexing...' : 'Add Document'}</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {uploadedFiles.map((fileObj) => (
              <div key={fileObj.name} className="flex items-center justify-between bg-slate-900/50 p-2 rounded border border-slate-800 group">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {/* The Cluster Color Circle */}
                  <div 
                    className="w-3 h-3 rounded-full shrink-0 shadow-sm transition-transform hover:scale-125"
                    style={{ backgroundColor: fileObj.color }}
                    title={`Cluster Color: ${fileObj.color}`}/>
                  
                  <button 
                    onClick={() => openPdfAtPage(fileObj.name, 1)} 
                    className="text-[11px] truncate text-slate-400 hover:text-blue-400 text-left">
                    {fileObj.name}
                  </button>
                </div>

                <button 
                  onClick={() => deleteFile(fileObj.name)} 
                  className="text-slate-600 hover:text-red-500 ml-2">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 mt-4">
          <div className="flex items-center gap-2 mb-3 text-emerald-400 text-sm font-semibold"><Activity size={16} /> <span>System Metrics</span></div>
          <div className="space-y-3">
            <Metric icon={<Clock size={14}/>} label="Latency" value={stats.latency} />
            <Metric icon={<Database size={14}/>} label="Retrieved Chunks" value={stats.sources} />
            <Metric icon={<Activity size={14}/>} label="Est. Cost" value={stats.cost} />
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col relative h-full overflow-hidden">
        <div className={`transition-all duration-500 ${isVisualizerOpen ? 'h-[400px]' : 'h-12'} bg-slate-950 border-b border-slate-800 relative`}>
            <div className="absolute top-3 left-6 z-20 flex items-center gap-4">
                <span className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">Knowledge Cluster Map</span>
                <button 
                    onClick={() => setIsVisualizerOpen(!isVisualizerOpen)} 
                    className="hover:text-blue-400 transition-colors"
                >
                    {isVisualizerOpen ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}
                </button>
            </div>
            {isVisualizerOpen && (
                <DocumentVisualizer 
                    activeIds={activeIds} 
                    onPointClick={openPdfAtPage} 
                    fileCount={uploadedFiles.length}
                />
            )}
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-4 rounded-2xl break-words overflow-hidden ${m.role === 'user' ? 'bg-blue-600 shadow-blue-900/20' : 'bg-slate-800 border border-slate-700 text-slate-200'}`}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.sources.map((src, idx) => (
                      <button key={idx} onClick={() => openPdfAtPage(src.source, src.page)} className="text-[10px] bg-blue-600/20 hover:bg-blue-600/40 px-2 py-1 rounded border border-blue-500/30 text-blue-300 transition-all flex items-center gap-1 shrink-0">
                        <FileText size={10} /> <span>{src.source} (Pg {src.page})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="p-6 bg-slate-900 border-t border-slate-800">
          <form onSubmit={handleSend} className="max-w-3xl mx-auto flex items-end gap-4">
            <textarea
              ref={textareaRef}
              rows="1"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                adjustHeight();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              placeholder="Query your knowledge base..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none max-h-[200px] overflow-y-auto transition-all"
            />
            <button 
              type="submit" 
              className="bg-blue-600 p-3 rounded-xl hover:bg-blue-500 transition-all shrink-0 h-[46px]"
            >
              <Send size={20} />
            </button>
          </form>
        </div>
      </div>

      <AnimatePresence>
        {pdfViewer.isOpen && (
          <motion.div initial={{ x: 600 }} animate={{ x: 0 }} exit={{ x: 600 }} style={{ width: pdfViewer.width }} className="h-full bg-slate-950 border-l border-slate-800 relative flex shrink-0">
            <div onMouseDown={() => { isResizing.current = true; }} className="absolute left-0 top-0 w-1 h-full cursor-col-resize hover:bg-blue-500 z-50 transition-colors" />
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              <div className="p-3 bg-slate-900 border-b border-slate-800 flex justify-between items-center shrink-0">
                <span className="text-[10px] font-mono text-slate-400">PDF INSPECTOR</span>
                <button onClick={() => setPdfViewer({ ...pdfViewer, isOpen: false })} className="text-slate-500 hover:text-white transition-colors"><Minimize2 size={16} /></button>
              </div>
              <div className="flex-1 bg-slate-800 overflow-hidden">
                <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.4.120/build/pdf.worker.min.js">
                  <Viewer key={pdfViewer.key} fileUrl={pdfViewer.url} initialPage={pdfViewer.page} theme="dark" />
                </Worker>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Metric = ({ icon, label, value }) => (
  <div className="flex justify-between items-center text-xs">
    <div className="flex items-center gap-2 text-slate-500">{icon} <span>{label}</span></div>
    <span className="font-mono text-slate-200">{value}</span>
  </div>
);

export default App;