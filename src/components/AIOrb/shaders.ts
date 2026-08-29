export const vertexShader = `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uMode;

  varying vec2 vUv;
  varying float vDisplacement;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  // Ultra-fast lightweight trigonometric noise (Zero texture lookups, 10x faster than Perlin)
  float fastNoise(vec3 p, float t) {
    return sin(p.x * 2.0 + t) * cos(p.y * 2.0 + t * 0.8) * sin(p.z * 2.0 + t * 1.2);
  }

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);

    // Weights for current mode
    float t0 = clamp(1.0 - abs(uMode - 0.0), 0.0, 1.0); // IDLE
    float t1 = clamp(1.0 - abs(uMode - 1.0), 0.0, 1.0); // LISTENING
    float t2 = clamp(1.0 - abs(uMode - 2.0), 0.0, 1.0); // THINKING
    float t3 = clamp(1.0 - abs(uMode - 3.0), 0.0, 1.0); // PLANNING
    float t4 = clamp(1.0 - abs(uMode - 4.0), 0.0, 1.0); // EXECUTING
    float t5 = clamp(1.0 - abs(uMode - 5.0), 0.0, 1.0); // AWAITING_CONFIRMATION
    float t6 = clamp(1.0 - abs(uMode - 6.0), 0.0, 1.0); // SPEAKING
    float t7 = clamp(1.0 - abs(uMode - 7.0), 0.0, 1.0); // ERROR

    float baseN = fastNoise(position, uTime * 0.6);
    float fastN = sin(position.x * 4.0 + position.y * 3.0 + uTime * 2.5);

    // Displacements
    float disp0 = baseN * 0.3 * uIntensity;
    float disp1 = fastN * 0.5 * uIntensity;
    float disp2 = (baseN + fastN * 0.6) * 0.7 * uIntensity;
    float disp3 = (fastN * 0.8) * uIntensity;
    float disp4 = (baseN * 1.2 + fastN * 0.8) * uIntensity;
    float disp5 = sin(uTime * 5.0) * 0.4 * uIntensity;
    float disp6 = (baseN + sin(uTime * 6.0) * 0.3) * uIntensity;
    float disp7 = fastN * 1.5 * uIntensity;

    vDisplacement = disp0*t0 + disp1*t1 + disp2*t2 + disp3*t3 + disp4*t4 + disp5*t5 + disp6*t6 + disp7*t7;
    
    vec3 newPosition = position + normal * vDisplacement * 0.15;

    vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const fragmentShader = `
  uniform float uTime;
  uniform float uColorShift;
  uniform float uMode;
  uniform float uIntensity;

  varying vec2 vUv;
  varying float vDisplacement;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    float t0 = clamp(1.0 - abs(uMode - 0.0), 0.0, 1.0); // IDLE
    float t1 = clamp(1.0 - abs(uMode - 1.0), 0.0, 1.0); // LISTENING
    float t2 = clamp(1.0 - abs(uMode - 2.0), 0.0, 1.0); // THINKING
    float t3 = clamp(1.0 - abs(uMode - 3.0), 0.0, 1.0); // PLANNING
    float t4 = clamp(1.0 - abs(uMode - 4.0), 0.0, 1.0); // EXECUTING
    float t5 = clamp(1.0 - abs(uMode - 5.0), 0.0, 1.0); // AWAITING_CONFIRMATION
    float t6 = clamp(1.0 - abs(uMode - 6.0), 0.0, 1.0); // SPEAKING
    float t7 = clamp(1.0 - abs(uMode - 7.0), 0.0, 1.0); // ERROR

    float noiseVal = fract(vDisplacement * 2.0 + uColorShift);
    
    // Fast color blending
    vec3 c0 = mix(vec3(0.0, 0.53, 1.0), vec3(0.54, 0.36, 0.96), noiseVal);
    vec3 c1 = mix(vec3(0.0, 0.9, 1.0), vec3(0.23, 0.51, 0.96), noiseVal);
    vec3 c2 = mix(vec3(0.96, 0.62, 0.04), vec3(0.97, 0.45, 0.08), noiseVal);
    vec3 c3 = mix(vec3(0.54, 0.36, 0.96), vec3(0.75, 0.52, 0.99), noiseVal);
    vec3 c4 = mix(vec3(0.06, 0.72, 0.5), vec3(0.02, 0.71, 0.83), noiseVal);
    vec3 c5 = mix(vec3(0.97, 0.45, 0.08), vec3(0.94, 0.27, 0.27), noiseVal);
    vec3 c6 = mix(vec3(0.66, 0.33, 0.97), vec3(0.93, 0.28, 0.6), noiseVal);
    vec3 c7 = mix(vec3(0.94, 0.27, 0.27), vec3(0.72, 0.11, 0.11), noiseVal);

    vec3 baseColor = c0*t0 + c1*t1 + c2*t2 + c3*t3 + c4*t4 + c5*t5 + c6*t6 + c7*t7;

    // Fast Fresnel computation
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = 1.0 - max(dot(normal, viewDir), 0.0);
    fresnel = fresnel * fresnel * 1.5;

    vec3 primaryColor = vec3(0.0, 0.53, 1.0)*t0 + vec3(0.0, 0.9, 1.0)*t1 + vec3(0.96, 0.62, 0.04)*t2 + vec3(0.54, 0.36, 0.96)*t3 + vec3(0.06, 0.72, 0.5)*t4 + vec3(0.97, 0.45, 0.08)*t5 + vec3(0.66, 0.33, 0.97)*t6 + vec3(0.94, 0.27, 0.27)*t7;
    
    // Built-in additive glow without needing heavy post-processing passes!
    vec3 finalColor = baseColor + primaryColor * fresnel * 2.0;

    gl_FragColor = vec4(finalColor, 0.9 + fresnel * 0.1);
  }
`;

export type AIOrbUniforms = {
  uTime: { value: number };
  uIntensity: { value: number };
  uColorShift: { value: number };
  uMode: { value: number };
};
