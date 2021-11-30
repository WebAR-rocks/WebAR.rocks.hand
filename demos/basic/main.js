
let GL = null, CV = null, LMCOLORS = null;
let SHP_DRAWPOINT = null, VERTICESVBO = null, INDICESVBO = null;

function main(){
  const NNpath = '../../neuralNets/';
  WEBARROCKSHAND.init({
    //followZRot: false,
    canvasId: 'theCanvas',
    NNsPaths: [NNpath + 'NN_NAV_RP_8.json', NNpath + 'NN_NAV_RB_8.json'],
    callbackReady: function(err, spec){
      if (err){
        alert('AN ERROR HAPPENS. ERR = ' + err);
        return;
      }

      console.log('INFO: WEBARROCKSHAND IS READY. spec =', spec);
      
      GL = spec.GL;
      CV = spec.canvasElement;
      
      const lmLabels = WEBARROCKSHAND.get_LMLabels();
      LMCOLORS = lmLabels.map(function(lmLabel, lmInd){
        const h = lmLabels.length / lmInd;
        return convert_HSVtoRGB(h, 1, 1);
      });

      init(spec);
    },
    callbackTrack: function(detectState){
      WEBARROCKSHAND.render_video();

      // draw landmarks:
      GL.useProgram(SHP_DRAWPOINT.program);

      GL.bindBuffer(GL.ARRAY_BUFFER, VERTICESVBO);
      GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, INDICESVBO);
      GL.vertexAttribPointer(0, 1, GL.FLOAT, false, 4, 0);

      detectState.landmarks.forEach(draw_landmark);
    }
  });
}


function init(spec){
  // create vertex buffer objects:
  VERTICESVBO = GL.createBuffer();
  GL.bindBuffer(GL.ARRAY_BUFFER, VERTICESVBO);
  GL.bufferData(GL.ARRAY_BUFFER, new Float32Array([1]), GL.STATIC_DRAW);

  INDICESVBO = GL.createBuffer();
  GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, INDICESVBO);
  GL.bufferData(GL.ELEMENT_ARRAY_BUFFER, new Uint16Array([0]), GL.STATIC_DRAW);

  // create LM display shader program:
  const shaderVertexSource = "attribute float position;\n\
    uniform vec2 uun_lmPosition;\n\
    void main(void) {\n\
      gl_PointSize = 5.;\n\
      gl_Position = vec4( position * uun_lmPosition, 0., 1.);\n\
    } ";
  const shaderFragmentSource = "uniform vec3 uun_lmColor;\n\
    void main(void){\n\
      gl_FragColor = vec4(uun_lmColor, 1.);\n\
    }";
  SHP_DRAWPOINT = build_shaderProgram(shaderVertexSource, shaderFragmentSource, 'DRAWPOINT');
  SHP_DRAWPOINT.uniforms.lmPosition = GL.getUniformLocation(SHP_DRAWPOINT.program, 'uun_lmPosition');
  SHP_DRAWPOINT.uniforms.lmColor = GL.getUniformLocation(SHP_DRAWPOINT.program, 'uun_lmColor');
}


function draw_landmark(lmXy, lmInd){
  GL.uniform2fv(SHP_DRAWPOINT.uniforms.lmPosition, lmXy);
  GL.uniform3fv(SHP_DRAWPOINT.uniforms.lmColor, LMCOLORS[lmInd]);
  GL.drawElements(GL.POINTS, 1, GL.UNSIGNED_SHORT, 0);
}


//BEGIN VANILLA WEBGL HELPERS
// compile a shader:
function compile_shader(source, glType, typeString) {
  const glShader = GL.createShader(glType);
  GL.shaderSource(glShader, source);
  GL.compileShader(glShader);
  if (!GL.getShaderParameter(glShader, GL.COMPILE_STATUS)) {
    alert("ERROR IN " + typeString + " SHADER: " + GL.getShaderInfoLog(glShader));
    console.log('Buggy shader source: \n', source);
    return null;
  }
  return glShader;
};


// build the shader program:
function build_shaderProgram(shaderVertexSource, shaderFragmentSource, id) {
  // compile both shader separately:
  const GLSLprecision = 'precision lowp float;';
  const glShaderVertex = compile_shader(shaderVertexSource, GL.VERTEX_SHADER, "VERTEX " + id);
  const glShaderFragment = compile_shader(GLSLprecision + shaderFragmentSource, GL.FRAGMENT_SHADER, "FRAGMENT " + id);

  const glShaderProgram = GL.createProgram();
  GL.attachShader(glShaderProgram, glShaderVertex);
  GL.attachShader(glShaderProgram, glShaderFragment);

  // start the linking stage:
  GL.linkProgram(glShaderProgram);
  const aPos = GL.getAttribLocation(glShaderProgram, "position");
  GL.enableVertexAttribArray(aPos);

  return {
    program: glShaderProgram,
    uniforms: {}
  };
} //end build_shaderProgram()
//END VANILLA WEBGL HELPERS


// from https://stackoverflow.com/questions/17242144/javascript-convert-hsb-hsv-color-to-rgb-accurately
function convert_HSVtoRGB(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let r = -1, g = -1, b = -1
  switch (i % 6) {
    case 0: r = v, g = t, b = p; break;
    case 1: r = q, g = v, b = p; break;
    case 2: r = p, g = v, b = t; break;
    case 3: r = p, g = q, b = v; break;
    case 4: r = t, g = p, b = v; break;
    case 5: r = v, g = p, b = q; break;
  }
  return [r, g, b];
}


window.addEventListener('load', main);