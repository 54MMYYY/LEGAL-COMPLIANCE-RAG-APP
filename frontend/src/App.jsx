import React, { useState, useEffect, useRef } from 'react';
import { Send, FileText, Activity, Database, Clock, ChevronRight } from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const App = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ latency: '0ms', sources: 0, cost: '$0.00' });
  const [showStats, setShowStats] = useState(true);
  const chatEndRef = useRef(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Replace with your actual Render/Railway backend URL
      const response = await axios.post('http://127.0.0.1:8000/chat', { query: input });
      
      const botMessage = { 
        role: 'assistant', 
        content: response.data.answer,
        sources: response.data.sources // Array of page numbers/quotes
      };

      setMessages(prev => [...prev, botMessage]);
      setStats({
        latency: response.data.latency, // e.g., "1.2s"
        sources: response.data.sources.length,
        cost: response.data.cost // e.g., "$0.004"
      });
    } catch (error) {
      console.error("Error fetching AI response:", error);
    } finally {
      setLoading(false);
    }
  };

  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      // Points to your Python FastAPI backend
      const response = await axios.post('http://127.0.0.1:8000/upload', formData);
      alert("File uploaded and indexed successfully!");
    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload PDF. Is the backend running?");
    } finally {
      setIsUploading(false);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current.click();
  };

  return (
    <div className="flex h-screen w-screen bg-slate-900 text-white" style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      {/* SIDEBAR: File Upload & Project Info */}
      <div className="w-80 bg-slate-950 border-r border-slate-800 p-6 flex flex-col">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent mb-8">
          Production RAG v1.0
        </h1>
        
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-400 mb-2">Upload Knowledge Base</label>
          
          {/* HIDDEN FILE INPUT */}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept=".pdf"
          />

          {/* INTERACTIVE DROPZONE */}
          <div 
            onClick={triggerFileSelect}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer bg-slate-900/50 ${
              isUploading 
                ? 'border-emerald-500/50 opacity-50 pointer-events-none' 
                : 'border-slate-800 hover:border-blue-500'
            }`}
          >
            <FileText className={`mx-auto mb-2 text-slate-500 ${isUploading ? 'animate-bounce text-emerald-400' : ''}`} />
            <span className="text-xs text-slate-500 uppercase tracking-wider">
              {isUploading ? 'Indexing PDF...' : 'Drop PDFs here'}
            </span>
          </div>
        </div>

        {/* PROJECT 3: Observability Dashboard */}
        <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
          <div className="flex items-center gap-2 mb-3 text-emerald-400 text-sm font-semibold">
            <Activity size={16} /> <span>System Metrics</span>
          </div>
          <div className="space-y-3">
            <Metric icon={<Clock size={14}/>} label="Latency" value={stats.latency} />
            <Metric icon={<Database size={14}/>} label="Retrieved Chunks" value={stats.sources} />
            <Metric icon={<Activity size={14}/>} label="Est. Cost" value={stats.cost} />
          </div>
        </div>
      </div>

      {/* MAIN CHAT AREA */}
      <div className="flex-1 flex flex-col relative">
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-2xl p-4 rounded-2xl ${
                m.role === 'user' ? 'bg-blue-600' : 'bg-slate-800 border border-slate-700'
              }`}>
                <p className="text-sm leading-relaxed">{m.content}</p>
                {m.sources && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.sources.map((s, idx) => (
                      <span key={idx} className="text-[10px] bg-slate-700 px-2 py-1 rounded border border-slate-600 text-slate-300">
                        Source: {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && <div className="text-slate-500 text-xs animate-pulse">AI is thinking...</div>}
          <div ref={chatEndRef} />
        </div>

        {/* INPUT AREA */}
        <div className="p-6 bg-slate-900/50 border-t border-slate-800">
          <form onSubmit={handleSend} className="max-w-3xl mx-auto flex gap-4">
            <input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask your documents anything..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
            <button className="bg-blue-600 hover:bg-blue-500 p-3 rounded-xl transition-colors">
              <Send size={20} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

const Metric = ({ icon, label, value }) => (
  <div className="flex justify-between items-center text-xs">
    <div className="flex items-center gap-2 text-slate-500">
      {icon} <span>{label}</span>
    </div>
    <span className="font-mono text-slate-200">{value}</span>
  </div>
);

export default App;