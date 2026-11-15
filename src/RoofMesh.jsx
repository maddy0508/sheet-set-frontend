import React, { useMemo } from 'react';

export default function RoofMesh({ vertices, faces }) {
  const geometry = useMemo(() => {
    if (!vertices || !faces) return null;
    const triangles = [];
    faces.forEach(face => {
      for (let i = 1; i < face.length - 1; i++) triangles.push([face[0], face[i], face[i+1]]);
    });
    return { positions: new Float32Array(vertices.flat()), indices: new Uint32Array(triangles.flat()) };
  }, [vertices, faces]);

  if (!geometry) return null;

  return (
    <mesh>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={geometry.positions.length / 3} array={geometry.positions} itemSize={3} />
        <bufferAttribute attach="index" count={geometry.indices.length} array={geometry.indices} itemSize={1} />
      </bufferGeometry>
      <meshStandardMaterial color="#00E5FF" emissive="#003344" side={2} flatShading={true} metalness={0.8} roughness={0.2} />
    </mesh>
  );
}
