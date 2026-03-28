import React, { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sphere, Html, Grid } from '@react-three/drei';
import axios from 'axios';

const API_BASE_URL = 'https://legal-compliance-rag-app.onrender.com';

const api = axios.create({ baseURL: API_BASE_URL });

const DataPoint = ({ position, text, label, color, isActive, onPointClick, source, page }) => {
  const [hovered, setHover] = useState(false);
  const dotColor = color || "#10b981";

  return (
    <Sphere 
      position={position} 
      args={[0.4, 16, 16]} 
      onPointerOver={() => { setHover(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = 'auto'; }}
      onClick={(e) => {
        e.stopPropagation();
        if (onPointClick && source) onPointClick(source, page + 1);
      }}
    >
      <meshStandardMaterial 
        color={hovered || isActive ? "#ffffff" : dotColor} 
        emissive={hovered || isActive ? "#ffffff" : "#000000"} 
        emissiveIntensity={isActive ? 2.5 : (hovered ? 0.8 : 0)} 
      />
      {hovered && (
        <Html distanceFactor={10}>
          <div className="bg-slate-900 border border-slate-700 p-2 rounded text-[10px] whitespace-nowrap text-white shadow-xl pointer-events-none">
            <strong className="block border-b border-slate-700 mb-1 pb-1">{label}</strong>
            <p className="opacity-70 max-w-xs overflow-hidden text-ellipsis">{text?.substring(0, 50)}...</p>
          </div>
        </Html>
      )}
    </Sphere>
  );
};

const DocumentVisualizer = ({ activeIds = [], onPointClick }) => {
  const [points, setPoints] = useState([]);

  useEffect(() => {
  const fetchInitialClusters = async () => {
    try {
      const res = await api.get('/clusters');

      if (!res.data || !res.data.points) {
        console.log("❌ No cluster data");
        return;
      }

      console.log("Cluster data:", res.data.points);

      setPoints(res.data.points); 
    } catch (err) {
      console.error("Initial Fetch Error:", err);
    }
  };

  fetchInitialClusters();
}, []);

  return (
    <div className="w-full h-full bg-slate-950">
      <Canvas camera={{ position: [15, 15, 15], fov: 50 }}>
        <ambientLight intensity={0.8} />
        <pointLight position={[10, 10, 10]} />
        <Grid infiniteGrid fadeDistance={50} cellColor="#1e293b" />
        {points.map((p, i) => (
          <DataPoint 
            key={p.id || i} 
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
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
};

export default DocumentVisualizer;