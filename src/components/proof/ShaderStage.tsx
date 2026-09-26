"use client";
import { useEffect, useRef, useState } from "react";

/**
 * One full-screen fragment shader behind the stage: a slow ink field with four soft light
 * columns, one under each outcome lane. `pulses` is a shared array the parent bumps when an
 * invoice lands in a lane; the shader flares that column and lets it decay.
 * Renders at reduced resolution (it's a soft field), pauses when off-screen, and falls back to a
 * static gradient without WebGL or when the viewer prefers reduced motion.
 */
const FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform vec4 u_pulse;
uniform float u_activity;
uniform vec4 u_lanes;
uniform float u_cols;

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i+vec2(1.,0.)), c = hash(i+vec2(0.,1.)), d = hash(i+vec2(1.,1.));
  vec2 u = f*f*(3.-2.*f);
  return mix(a,b,u.x) + (c-a)*u.y*(1.-u.x) + (d-b)*u.x*u.y;
}
float fbm(vec2 p){
  float v = 0., a = .5;
  for(int i=0;i<5;i++){ v += a*noise(p); p = p*2.02 + vec2(1.7,9.2); a *= .5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = uv * vec2(u_res.x/u_res.y, 1.);
  float t = u_time*.035;
  vec2 q = vec2(fbm(p*1.3 + t), fbm(p*1.3 + vec2(5.2,1.3) - t));
  vec2 r = vec2(fbm(p*1.5 + 3.*q + vec2(1.7,9.2) + t*1.4), fbm(p*1.5 + 3.*q + vec2(8.3,2.8) - t));
  float f = fbm(p*1.1 + 3.4*r);

  vec3 col = mix(vec3(.027,.031,.039), vec3(.07,.078,.11), f);
  col += vec3(.26,.29,.62) * pow(f, 3.2) * .55;           // violet sheen in the ink

  vec3 lane[4];
  lane[0] = vec3(.27,.79,.55);   // approved
  lane[1] = vec3(.88,.60,.17);   // held
  lane[2] = vec3(1.,.48,.42);    // rejected
  lane[3] = vec3(.90,.28,.30);   // blocked
  for(int i=0;i<4;i++){
    float x = i==0 ? u_lanes.x : i==1 ? u_lanes.y : i==2 ? u_lanes.z : u_lanes.w;
    float d = uv.x - x;
    float pulse = i==0 ? u_pulse.x : i==1 ? u_pulse.y : i==2 ? u_pulse.z : u_pulse.w;
    float beam = exp(-d*d*(260. - 120.*pulse)) * smoothstep(1.05, .0, uv.y);
    col += lane[i] * beam * (.08 + .95*pulse) * (.55 + .6*f) * u_cols;
  }

  float band = exp(-pow(uv.y - (1. - fract(u_time*.22)), 2.) * 900.) * u_activity;
  col += vec3(.49,.55,1.) * band * .07;

  float v = smoothstep(1.25, .25, length((uv - vec2(.5,.62)) * vec2(1.,1.25)));
  col *= .55 + .45*v;
  gl_FragColor = vec4(col, 1.);
}`;

const VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;

export function ShaderStage({ pulses, lanes, active, className }: { pulses: React.RefObject<number[]>; lanes: React.RefObject<number[]>; active: boolean; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  const [fallback, setFallback] = useState(false);
  activeRef.current = active;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = el.getContext("webgl", { antialias: false, premultipliedAlpha: false, powerPreference: "low-power" });
    if (!gl) {
      setFallback(true);
      return;
    }
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    let prog: WebGLProgram;
    try {
      prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
    } catch {
      setFallback(true);
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uPulse = gl.getUniformLocation(prog, "u_pulse");
    const uAct = gl.getUniformLocation(prog, "u_activity");
    const uLanes = gl.getUniformLocation(prog, "u_lanes");
    const uCols = gl.getUniformLocation(prog, "u_cols");
    const setLanes = () => {
      const l = lanes.current;
      gl.uniform4f(uLanes, l[0], l[1], l[2], l[3]);
      gl.uniform1f(uCols, l[4] ?? 1);
    };

    const SCALE = 0.5; // soft field: half resolution keeps it well inside a frame budget
    const resize = () => {
      const w = Math.max(1, Math.floor(el.clientWidth * SCALE));
      const h = Math.max(1, Math.floor(el.clientHeight * SCALE));
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);

    let raf = 0;
    let act = 0;
    const t0 = performance.now();
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      const p = pulses.current;
      for (let i = 0; i < 4; i++) p[i] *= 0.94; // decay each landing flare
      act += ((activeRef.current ? 1 : 0) - act) * 0.05;
      gl.uniform2f(uRes, el.width, el.height);
      gl.uniform1f(uTime, reduce ? 40 : (performance.now() - t0) / 1000);
      gl.uniform4f(uPulse, Math.min(p[0], 1), Math.min(p[1], 1), Math.min(p[2], 1), Math.min(p[3], 1));
      gl.uniform1f(uAct, act);
      setLanes();
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    if (reduce) {
      // one still frame, no animation loop
      gl.uniform2f(uRes, el.width, el.height);
      gl.uniform1f(uTime, 40);
      gl.uniform4f(uPulse, 0, 0, 0, 0);
      gl.uniform1f(uAct, 0);
      setLanes();
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else frame();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [pulses, lanes]);

  return (
    <div className={className} aria-hidden="true">
      {fallback ? <div className="stage-fallback absolute inset-0" /> : <canvas ref={canvas} className="absolute inset-0 h-full w-full" />}
    </div>
  );
}
