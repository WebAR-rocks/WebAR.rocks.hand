
let GL = null, CV = null, VIDEOTEXTURE = null, VIDEOTRANSFORMMAT2 = null, LMCOLORS = null;
let SHP_DRAWPOINT = null, VERTICESVBO = null, INDICESVBO = null, SHP_COPYCROP = null;

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
      VIDEOTEXTURE = spec.videoTexture;
      VIDEOTRANSFORMMAT2 = spec.videoTransformMat2;

      const lmLabels = WEBARROCKSHAND.get_LMLabels();
      LMCOLORS = lmLabels.map(function(lmLabel, lmInd){
        const h = lmLabels.length / lmInd;
        return convert_HSVtoRGB(h, 1, 1);
      });

      init(spec);
    },
    callbackTrack: function(detectState){
      //console.log(detectState.rightHand);
      //console.log(detectState.flipped)
      
      // draw the video:
      GL.viewport(0, 0, CV.width, CV.height);

      // use the head draw shader program and sync uniforms:
      GL.useProgram(SHP_COPYCROP.program);
      GL.uniformMatrix2fv(SHP_COPYCROP.uniforms.transformMat2, false, VIDEOTRANSFORMMAT2);
      GL.activeTexture(GL.TEXTURE0);
      GL.bindTexture(GL.TEXTURE_2D, VIDEOTEXTURE);
      
      // draw the square looking for the head
      // the VBO filling the whole screen is still bound to the context
      // fill the viewPort
      GL.drawElements(GL.TRIANGLES, 3, GL.UNSIGNED_SHORT, 0);

      // draw landmarks:
      GL.useProgram(SHP_DRAWPOINT.program);

      GL.bindBuffer(GL.ARRAY_BUFFER, VERTICESVBO);
      GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, INDICESVBO);
      GL.vertexAttribPointer(0,1,GL.FLOAT, false, 4,0);

      detectState.landmarks.forEach(draw_landmark);

      GL.flush();
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

  // create copy shp:
  SHP_COPYCROP = build_shaderProgram('attribute vec2 position;\n\
    uniform mat2 transform;\n\
    varying vec2 vUV;\n\
    void main(void){\n\
      vUV = 0.5 + vec2(-1, 1.) * (transform * position); //mirror\n\
      gl_Position = vec4(position, 0., 1.);\n\
    }'
    ,
    'uniform sampler2D uun_source;\n\
    varying vec2 vUV;\n\
    void main(void){\n\
      gl_FragColor = texture2D(uun_source, vUV);\n\
    }', 'COPY CROP');
  SHP_COPYCROP.uniforms.transformMat2 = GL.getUniformLocation(SHP_COPYCROP.program, 'transform');

  // create LM display shader program:
  const shaderVertexSource = "attribute float position;\n\
    uniform vec2 uun_lmPosition;\n\
    void main(void) {\n\
      gl_PointSize = 8.;\n\
      gl_Position = vec4(vec2(-1.0, 1.0) * position * uun_lmPosition, 0., 1.);\n\
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
  var r, g, b, i, f, p, q, t;
  if (arguments.length === 1) {
    s = h.s, v = h.v, h = h.h;
  }
  i = Math.floor(h * 6);
  f = h * 6 - i;
  p = v * (1 - s);
  q = v * (1 - f * s);
  t = v * (1 - (1 - f) * s);
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