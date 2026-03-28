import React, { useEffect, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sphere, Html, Grid } from '@react-three/drei';
import axios from 'axios';

// Dynamically determine the API URL just like in App.jsx
const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://127.0.0.1:8000' 
  : 'https://legal-compliance-rag-app.onrender.com';

const DataPoint = ({ position, text, label, color, isActive, onPointClick, source, page }) => {
  const [hovered, setHover] = useState(false);
  const dotColor = color || "#10b981";

  return (
    <Sphere 
      position={position} 
      args={[0.6, 16, 16]} // Slightly larger for better visibility
      onPointerOver={() => { setHover(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = 'auto'; }}
      onClick={(e) => {
        e.stopPropagation();
        // Backend page is already 1-indexed in our new clusters logic, 
        // but we ensure the callback gets the right number.
        if (onPointClick && source) onPointClick(source, page);
      }}
    >
      <meshStandardMaterial 
        color={hovered || isActive ? "#ffffff" : dotColor} 
        emissive={hovered || isActive ? "#ffffff" : dotColor} 
        emissiveIntensity={isActive ? 2.5 : (hovered ? 1.2 : 0.2)} 
        transparent
        opacity={isActive || hovered ? 1 : 0.8}
      />
      {hovered && (
        <Html distanceFactor={15}>
          <div className="bg-slate-900 border border-slate-700 p-2 rounded text-[10px] whitespace-nowrap text-white shadow-2xl pointer-events-none select-none">
            <strong className="block border-b border-slate-700 mb-1 pb-1 text-blue-400">{label}</strong>
            <p className="opacity-70 max-w-xs overflow-hidden text-ellipsis italic">"{text?.substring(0, 60)}..."</p>
            <p className="mt-1 text-[8px] text-slate-500 font-mono">Page {page}</p>
          </div>
        </Html>
      )}
    </Sphere>
  );
};

const DocumentVisualizer = ({ activeIds = [], onPointClick }) => {
  const [points, setPoints] = useState([]);

  const fetchData = async () => {
    try {
      // Use the dynamic API_BASE_URL instead of localhost
      const res = await axios.get(`${API_BASE_URL}/clusters`);
      setPoints(res.data.points || []);
    } catch (err) { 
      console.error("Visualizer Fetch Error:", err); 
    }
  };

  // We need to fetch when the component mounts AND when activeIds changes (chat interaction)
  // BUT: App.jsx should also trigger this when uploads happen.
  useEffect(() => {
    fetchData();
    
    // Optional: Poll every 10 seconds to catch background indexing
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [activeIds]);

  return (
    <div className="w-full h-full bg-slate-950">
      <Canvas camera={{ position: [25, 25, 25], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[20, 20, 20]} intensity={1.5} />
        <pointLight position={[-20, -20, -20]} color="#1e293b" />
        
        <Grid 
          infiniteGrid 
          fadeDistance={100} 
          cellColor="#1e293b" 
          sectionColor="#334155" 
          cellSize={5} 
          sectionSize={20} 
        />

        {points.map((p, i) => (
          <DataPoint 
            key={p.id || `point-${i}`} 
            position={p.position} 
            text={p.text} 
            label={p.source} 
            color={p.color} 
            isActive={activeIds.includes(p.id)}
            source={p.source}
            page={p.page}
            onPointClick={onPointClick}
          />
        ))}
        
        <OrbitControls 
          makeDefault 
          enableDamping 
          dampingFactor={0.05}
          minDistance={5}
          maxDistance={200}
        />
      </Canvas>
    </div>
  );
};

export default DocumentVisualizer;