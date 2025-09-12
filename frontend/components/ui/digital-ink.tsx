"use client"

import React, { useRef, useMemo, forwardRef, useImperativeHandle } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PerspectiveCamera } from '@react-three/drei'

// GLSL Vertex Shader
const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// GLSL Fragment Shader for the ink effect
const fragmentShader = `
  uniform float u_time;
  uniform float u_intensity;
  uniform vec3 u_color;
  varying vec2 vUv;

  // 2D Noise function
  float noise(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }

  // Fractional Brownian Motion for a more organic look
  float fbm(vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(st);
      st *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 p = vUv - 0.5;
    float len = length(p);
    float a = atan(p.y, p.x);

    float r = len * (1.0 + 0.5 * fbm(p + u_time * 0.0005));
    float distorted_time = u_time * 0.001;
    
    float circle = smoothstep(0.2, 0.205, r);
    float alpha = (1.0 - circle) * u_intensity;
    
    // Add some turbulence to the edge
    float edge_noise = fbm(p * 5.0 + distorted_time);
    alpha *= (1.0 - smoothstep(0.18, 0.2, r + edge_noise * 0.05));

    gl_FragColor = vec4(u_color, alpha);
  }
`

const InkBlob = forwardRef(function InkBlob(props, ref) {
  const mesh = useRef<THREE.Mesh>(null)
  const shader = useRef<THREE.ShaderMaterial>(null)

  useImperativeHandle(ref, () => ({
    get shader() {
      return shader.current;
    }
  }));

  const uniforms = useMemo(
    () => ({
      u_time: { value: 0 },
      u_intensity: { value: 0.0 },
      u_color: { value: new THREE.Color('#2E4057') }, // Indigo Dye
    }),
    []
  )

  useFrame((state) => {
    if (shader.current) {
      shader.current.uniforms.u_time.value = state.clock.getElapsedTime() * 1000
    }
  })

  return (
    <mesh ref={mesh} scale={2}>
      <planeGeometry args={[1, 1, 16, 16]} />
      <shaderMaterial
        ref={shader}
        fragmentShader={fragmentShader}
        vertexShader={vertexShader}
        uniforms={uniforms}
        transparent={true}
      />
    </mesh>
  )
});

const DigitalInk = forwardRef(function DigitalInk(props, ref) {
  const inkBlobRef = useRef<{ shader: THREE.ShaderMaterial | null }>(null);

  useImperativeHandle(ref, () => ({
    get shader() {
      return inkBlobRef.current?.shader ?? null;
    }
  }));

  return (
    <div className="absolute inset-0 z-0">
      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={30} />
        <InkBlob ref={inkBlobRef} />
      </Canvas>
    </div>
  )
});

export default DigitalInk; 