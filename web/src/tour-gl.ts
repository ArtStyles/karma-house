// WebGL view morph for the house walk. Between two photos, each is warped toward the other with the depth-aware
// model fitted by artifacts/tour/casa/align_seq.py and they cross-fade; at a pause the frame turns into the navy and
// cream duotone that the hero poster bakes in (web/scripts/tour-assets.py, same 0.7 gain).

export type Tex = { t: WebGLTexture; w: number; h: number };
/** A photo inside a texture: the whole texture, or one tile of a grid image ([x, y, w, h] in 0..1). */
export type View = { tex: Tex; rect: number[] };
const WHOLE = [0, 0, 1, 1];
/** dir 1 walks forward from this photo, -1 steps back from the next one: points spread from `focus` by
 *  1 + amt * (ka + kb * nearness) and shift by `shift` (turning). `drift` sways the camera a little. */
export type Pose = { focus: number[]; ka: number; kb: number; amt: number; dir: 1 | -1; alpha: number; shift?: number[]; drift?: number[]; tone?: number };

const VS = 'attribute vec2 a;varying vec2 v;void main(){v=vec2(a.x*.5+.5,.5-a.y*.5);gl_Position=vec4(a,0.,1.);}';
const FS = `precision highp float;varying vec2 v;
uniform sampler2D img,dep;uniform vec4 imgR,depR;uniform vec2 cover,center,focus,shift,cam;uniform float amt,ka,kb,dir,alpha,tone;
void main(){
  vec2 x=center+(v-.5)*cover-shift;
  vec2 p=x;
  for(int i=0;i<5;i++){
    float d=texture2D(dep,depR.xy+clamp(p,0.,1.)*depR.zw).r;
    float s=1.+amt*(ka+kb*d);
    p=dir>0.?focus+(x-focus)/s:focus+(x-focus)*s;
  }
  p-=cam*(texture2D(dep,depR.xy+clamp(p,0.,1.)*depR.zw).r-.35)*.5;
  vec2 e=smoothstep(vec2(0.),vec2(.015),p)*smoothstep(vec2(1.),vec2(.985),p);
  vec3 c=texture2D(img,imgR.xy+clamp(p,0.,1.)*imgR.zw).rgb;
  float l=dot(c,vec3(.299,.587,.114));
  vec3 duo=mix(vec3(.04,.1,.17),vec3(.93,.89,.8),smoothstep(.04,.98,l))*.7;
  gl_FragColor=vec4(mix(c,duo,tone),alpha*e.x*e.y);
}`;
const UNIFORMS = ['img', 'dep', 'imgR', 'depR', 'cover', 'center', 'focus', 'shift', 'cam', 'amt', 'ka', 'kb', 'dir', 'alpha', 'tone'] as const;

/** null when the browser has no WebGL. */
export function createWalk(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) return null;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = Object.fromEntries(UNIFORMS.map((n) => [n, gl.getUniformLocation(prog, n)])) as Record<(typeof UNIFORMS)[number], WebGLUniformLocation>;
  gl.uniform1i(U.img, 0);
  gl.uniform1i(U.dep, 1);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  let W = 1, H = 1;

  return {
    /** Resolves null when the image fails, so the caller can retry later. */
    async load(src: string): Promise<Tex | null> {
      const im = new Image();
      im.src = src;
      try { await im.decode(); } catch { return null; }
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return { t, w: im.naturalWidth, h: im.naturalHeight };
    },
    free(tex: Tex | null | undefined) { if (tex) gl.deleteTexture(tex.t); },
    resize(w: number, h: number) { W = canvas.width = w; H = canvas.height = h; gl.viewport(0, 0, w, h); },
    clear() { gl.clearColor(0.04, 0.08, 0.13, 1); gl.clear(gl.COLOR_BUFFER_BIT); },
    /** Draws the photo to cover the canvas, a little above centre like object-position 50% 47%. A Tex is the whole
     *  photo; a View can be one tile of a grid image. */
    draw(photo: Tex | View, depth: View, o: Pose) {
      const { tex: img, rect } = 'rect' in photo ? photo : { tex: photo, rect: WHOLE };
      const ia = (rect[2] * img.w) / (rect[3] * img.h), ca = W / H;
      const cover = ca > ia ? [1, ia / ca] : [ca / ia, 1];
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, img.t);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, depth.tex.t);
      gl.uniform4fv(U.imgR, rect); gl.uniform4fv(U.depR, depth.rect);
      gl.uniform2fv(U.cover, cover);
      gl.uniform2fv(U.center, [0.5, Math.min(Math.max(0.47, cover[1] / 2), 1 - cover[1] / 2)]);
      gl.uniform2fv(U.focus, o.focus);
      gl.uniform2fv(U.shift, o.shift ?? [0, 0]);
      gl.uniform2fv(U.cam, o.drift ?? [0, 0]);
      gl.uniform1f(U.amt, o.amt); gl.uniform1f(U.ka, o.ka); gl.uniform1f(U.kb, o.kb);
      gl.uniform1f(U.dir, o.dir); gl.uniform1f(U.alpha, o.alpha); gl.uniform1f(U.tone, o.tone ?? 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}
