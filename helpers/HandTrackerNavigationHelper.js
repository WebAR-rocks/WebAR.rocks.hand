/**
 * Copyright 2020 WebAR.rocks ( https://webar.rocks )
 * 
 * WARNING: YOU SHOULD NOT MODIFY THIS FILE OTHERWISE WEBAR.ROCKS
 * WON'T BE RESPONSIBLE TO MAINTAIN AND KEEP YOUR ADDED FEATURES
 * WEBAR.ROCKS WON'T BE LIABLE FOR BREAKS IN YOUR ADDED FUNCTIONNALITIES
 *
 * WEBAR.ROCKS KEEP THE RIGHT TO WORK ON AN UNMODIFIED VERSION OF THIS SCRIPT.
 * 
 * THIS FILE IS A HELPER AND SHOULD NOT BE MODIFIED TO IMPLEMENT A SPECIFIC USER SCENARIO
 * OR TO ADDRESS A SPECIFIC USE CASE.
 */

const HandTrackerNavigationHelper = (function(){
  const _defaultSpec = {
    canvasVideo: null,
    canvasPointer: null,
    NNsPaths: null,
    callbackReady: null,
    threshold: 0.92,
    thresholdSignal: 0.2,
    videoSettings: {},
    isSelfieCamFirst: true,

    // margins help to detect the hand even if partially out of visible screen:
    marginTop: 12,// in px
    marginLeft: 64,
    marginRight: 64,
    marginBottom: 64,

    // video display:
    GLSLChangeVideoColor: '',
  
    // pointer display:
    landmarks: [],
    lines: [],
    pointRadius: 10,
    lineWidth: 3,
    GLSLPointerLineColor: '',
    GLSLPointerPointColor: '',
    GLSLPointerCursorColor: '',
    cursorAngle: 30,
    cursorRecess: 0.33, // 0 -> cursor is a triangle
    cursorSizePx: 24,

    // pointer logic:
    pointerDistanceFromIndexTipRelative: 0.5, // 0 -> at the tip of index, 0.5 -> middle between thumb and index
    pointerLandmarks: [],
    pointerDistancesPalmSide: [0.35, 0.3], // relative to hand detection window. hysteresis
    pointerDistancesBackSide: [0.25, 0.2],
    pointerHeatDistance: 0.5,
    pointerBlendHandRadiusRange: [1, 3], // relative to pointer size. start and stop blending around the pointer
    delayBeforeFirstClick: 800, // min delay in ms between hand detection and first click

    // event listeners:
    onPointerDown: null,
    onPointerUp: null,
    onPointerMove: null
  };

  let _spec = null;
  let _gl = null, _glVideoTexture = null, _videoTransformMat2 = null;
  let _glp = null;
  let _landmarksStabilizer = null;

  const _landmarks = {
    allLabels: null, 
    positions: null,
    indices: null,
    pointerIndices: null
  };

  const _shps = { // shader programs
    video: null,
    pointerPoints: null,
    pointerLines: null,
    pointerCursor: null,
  };
  const _glVBOs = {
    lmPositions: null,
    lmIsPointer: null,
    lmPointsIndices: null,
    lmLinesIndices: null,
    lmCursorIndices: null
  };

  const _states = {
    notLoaded: -1,
    initialized: 0,
    loading: 1,
    running: 2,
    error: 3,
    busy: 4
  };
  let _state = _states.notLoaded;

  const _dims = {
    width: -1,
    height: -1,
    marginTop: -1,
    marginBottom: -1,
    marginLeft: -1,
    marginRight: -1
  };

  const _pointer = {
    isDown: false,
    downFactor: 0,
    mirrorXFactor: 1,
    x: 0,
    y: 0,
    xPx: 0,
    yPx: 0,
    blendRange: null
  };

  let _isSelfieCam = false;

  const _detection = {
    lastTimestamp: 0,
    isHandFound: false
  };
  //BEGIN VANILLA WEB_gl.HELPERS
  // compile a shader:
  function compile_shader(gl, source, glType, typeString) {
    const glShader = gl.createShader(glType);
    gl.shaderSource(glShader, source);
    gl.compileShader(glShader);
    if (!gl.getShaderParameter(glShader, gl.COMPILE_STATUS)) {
      alert("ERROR IN " + typeString + " SHADER: " + gl.getShaderInfoLog(glShader));
      console.log('Buggy shader source: \n', source);
      return null;
    }
    return glShader;
  };


  // build the shader program:
  function build_shaderProgram(gl, shaderVertexSource, shaderFragmentSource, id, uniformsNames, attributesNames) {
    // compile both shader separately:
    const GLSLprecision = 'precision lowp float;\n';
    const glShaderVertex = compile_shader(gl, GLSLprecision + shaderVertexSource, gl.VERTEX_SHADER, "VERTEX " + id);
    const glShaderFragment = compile_shader(gl, GLSLprecision + shaderFragmentSource, gl.FRAGMENT_SHADER, "FRAGMENT " + id);

    const glShaderProgram = gl.createProgram();
    gl.attachShader(glShaderProgram, glShaderVertex);
    gl.attachShader(glShaderProgram, glShaderFragment);

    // start the linking stage:
    gl.linkProgram(glShaderProgram);
    let aNames = ['position'];
    if ( attributesNames){
      aNames = aNames.concat( attributesNames);
    }
    const attributes = {};
    aNames.forEach(function(aName){
      attributes[aName] = gl.getAttribLocation(glShaderProgram, aName);;
    })

    const uniforms = {};
    if (uniformsNames){
      uniformsNames.forEach(function(name){
        uniforms[name] = gl.getUniformLocation(glShaderProgram, name);
      });
    }

    return {
      program: glShaderProgram,
      uniforms: uniforms,
      attributes: attributes
    };
  } //end build_shaderProgram()
  //END VANILLA WEB_gl.HELPERS


  function init_htNav(){
    // build shaderprogram for video rendering:
    _shps.video = build_shaderProgram(_gl, 'attribute vec2 position;\n\
      uniform mat2 transform;\n\
      varying vec2 vUV;\n\
      void main(void){\n\
        vUV = 0.5 + transform * position;\n\
        gl_Position = vec4(position, 0., 1.);\n\
      }'
      ,
      'uniform sampler2D uun_source;\n\
      varying vec2 vUV;\n\
      void main(void){\n\
        vec4 color = texture2D(uun_source, vUV);\n\
        ' + _spec.GLSLChangeVideoColor + '\n\
        gl_FragColor = color;\n\
      }',
      'VIDEO');
    _shps.video.uniforms.transformMat2 = _gl.getUniformLocation(_shps.video.program, 'transform');

    // build shaderprograms for pointer rendering:
    _shps.pointerPoints = build_shaderProgram(_glp, 
      'attribute vec2 position;\n\
      attribute float isPointer;\n\
      varying float vIsPointer;\n\
      \n\
      void main(void){\n\
        gl_Position = vec4(position, 0., 1.);\n\
        gl_PointSize = ' + _spec.pointRadius.toFixed(2) + ' ;\n\
        vIsPointer = isPointer;\n\
      }',

      'uniform vec2 cursorBlendRange, cursorPosition;\n\
      uniform float downFactor;\n\
      varying float vIsPointer;\n\
      \n\
      void main(void){\n\
        vec2 coord = gl_PointCoord - vec2(0.5);\n\
        if(length(coord) > 0.5)\n\
          discard;\n\
        vec3 color = vec3(1.0, 0.0, 0.0);\n\
        ' + _spec.GLSLPointerPointColor + '\n\
        float alpha = smoothstep(cursorBlendRange.x, cursorBlendRange.y, distance(cursorPosition, gl_FragCoord.xy));\n\
        gl_FragColor = vec4(color, alpha);\n\
      }',
      'POINTERPOINTS',
      ['downFactor', 'cursorBlendRange', 'cursorPosition'],
      ['isPointer']);
    
    _shps.pointerLines = build_shaderProgram(_glp,
      'attribute vec2 position;\n\
      attribute float isPointer;\n\
      varying float vIsPointer;\n\
      \n\
      void main(void){\n\
        gl_Position = vec4(position, 0., 1.);\n\
        vIsPointer = isPointer;\n\
      }',

      'uniform vec2 cursorBlendRange, cursorPosition;\n\
      uniform float downFactor;\n\
      varying float vIsPointer;\n\
      \n\
      void main(void){\n\
        vec3 color = vec3(1.0, 0.0, 0.0);\n\
        ' + _spec.GLSLPointerLineColor + '\n\
        float alpha = smoothstep(cursorBlendRange.x, cursorBlendRange.y, distance(cursorPosition, gl_FragCoord.xy));\n\
        gl_FragColor = vec4(color, alpha);\n\
      }',
      'POINTERLINES',
      ['downFactor', 'cursorBlendRange', 'cursorPosition'],
      ['isPointer']);
    
    _shps.pointerCursor = build_shaderProgram(_glp,
      'attribute vec2 position;\n\
      uniform vec2 cursorPosition, cursorScale;\n\
      \n\
      void main(void){\n\
        gl_Position = vec4(position*cursorScale + cursorPosition, 0., 1.);\n\
      }',

      'uniform float downFactor;\n\
      \n\
      void main(void){\n\
        vec3 color = vec3(1.0, 0.0, 0.0);\n\
        ' + _spec.GLSLPointerCursorColor + '\n\
        gl_FragColor = vec4(color, 1.);\n\
      }',
      'POINTERCURSOR',
      ['downFactor', 'cursorPosition', 'cursorScale']);
    
    // enable position attribute:
    _glp.enableVertexAttribArray(0);

    // build VBOs:
    const lmCount = _spec.landmarks.length;

    // landmarks position VBO (will be updated during runtime):
    _landmarks.positions = new Float32Array(lmCount * 2);
    _glVBOs.lmPositions = _glp.createBuffer();
    _glp.bindBuffer(_glp.ARRAY_BUFFER, _glVBOs.lmPositions);
    _glp.bufferData(_glp.ARRAY_BUFFER, _landmarks.positions, _glp.DYNAMIC_DRAW);

    // if this landmark belongs to the pointer click or not:
    const lmIsPointer = new Float32Array(lmCount);
    _spec.pointerLandmarks.forEach(function(lmLabel){
      const ind = _spec.landmarks.indexOf(lmLabel);
      lmIsPointer[ind] = 1;
    });
    _glVBOs.lmIsPointer = _glp.createBuffer();
    _glp.bindBuffer(_glp.ARRAY_BUFFER, _glVBOs.lmIsPointer);
    _glp.bufferData(_glp.ARRAY_BUFFER, lmIsPointer, _glp.STATIC_DRAW);

    // landmarks indices VBO:
    const lmPointsIndices = new Uint16Array(lmCount);
    for (let i=0; i<lmCount; ++i) lmPointsIndices[i] = i;
    _glVBOs.lmPointsIndices = _glp.createBuffer();
    _glp.bindBuffer(_glp.ELEMENT_ARRAY_BUFFER, _glVBOs.lmPointsIndices);
    _glp.bufferData(_glp.ELEMENT_ARRAY_BUFFER, lmPointsIndices, _glp.STATIC_DRAW);

    // how to bind landmark to make lines:
    const lmLinesIndices = new Uint16Array(_spec.lines.length * 2);
    _spec.lines.forEach(function(line, lineIndice){
      const fromIndice = _spec.landmarks.indexOf(line[0]);
      const toIndice = _spec.landmarks.indexOf(line[1]);
      lmLinesIndices[2 * lineIndice] = fromIndice,
      lmLinesIndices[2 * lineIndice + 1] = toIndice;
    });
    _glVBOs.lmLinesIndices = _glp.createBuffer();
    _glp.bindBuffer(_glp.ELEMENT_ARRAY_BUFFER, _glVBOs.lmLinesIndices);
    _glp.bufferData(_glp.ELEMENT_ARRAY_BUFFER, lmLinesIndices, _glp.STATIC_DRAW);

    // cursor VBOs:
    const a = _spec.cursorAngle * Math.PI/180;
    const k = 1 - _spec.cursorRecess;
    const cursorPositions = new Float32Array([
      0,  0, // B
      0, -1, // A
      k*Math.sin(a/2), -k*Math.cos(a/2), // I
      Math.sin(a), -Math.cos(a) // C
      ]);
    _glVBOs.lmCursorPositions = _glp.createBuffer();
    _glp.bindBuffer(_glp.ARRAY_BUFFER, _glVBOs.lmCursorPositions);
    _glp.bufferData(_glp.ARRAY_BUFFER, cursorPositions, _glp.STATIC_DRAW);

    _glVBOs.lmCursorIndices = _glp.createBuffer();
    _glp.bindBuffer(_glp.ELEMENT_ARRAY_BUFFER, _glVBOs.lmCursorIndices);
    _glp.bufferData(_glp.ELEMENT_ARRAY_BUFFER, new Uint16Array([0,1,2, 0,2,3]), _glp.STATIC_DRAW);
  }


  function draw_video(){
    _gl.viewport(0, 0, _dims.width, _dims.height);

    _gl.useProgram(_shps.video.program);
    _gl.uniformMatrix2fv(_shps.video.uniforms.transformMat2, false, _videoTransformMat2);
    _gl.activeTexture(_gl.TEXTURE0);
    _gl.bindTexture(_gl.TEXTURE_2D, _glVideoTexture);

    // the VBO filling the whole screen is still bound to the context
    // fill the viewPort:
    _gl.drawElements(_gl.TRIANGLES, 3, _gl.UNSIGNED_SHORT, 0);

    _gl.flush();
  }


  function draw_pointer(landmarks){
    _glp.clear(_glp.COLOR_BUFFER_BIT);

    // update positions:
    _landmarks.indices.forEach(function(lmInd, i){
      const lmXy = landmarks[lmInd];
      _landmarks.positions[2*i] = lmXy[0];
      _landmarks.positions[2*i + 1] = lmXy[1];
    });

    // draw lines between points:
    _glp.useProgram(_shps.pointerLines.program);
    _glp.enableVertexAttribArray(1);
    
    // bind and update landmarks positions VBO:
    _glp.bindBuffer(_glp.ARRAY_BUFFER, _glVBOs.lmPositions);
    _glp.bufferData(_glp.ARRAY_BUFFER, _landmarks.positions, _glp.DYNAMIC_DRAW);
    _glp.vertexAttribPointer(_shps.pointerLines.attributes.position, 2, _glp.FLOAT, false, 8, 0);

    // bind the VBO isPointer:
    _glp.bindBuffer(_glp.ARRAY_BUFFER, _glVBOs.lmIsPointer);
    _glp.vertexAttribPointer(_shps.pointerLines.attributes.isPointer, 1, _glp.FLOAT, false, 4, 0);

    // sync uniforms and proceed rendering:    
    sync_cursorUniforms(_shps.pointerLines);
    _glp.bindBuffer(_glp.ELEMENT_ARRAY_BUFFER, _glVBOs.lmLinesIndices);
    _glp.drawElements(_glp.LINES, _spec.lines.length * 2, _glp.UNSIGNED_SHORT, 0);
    
    // draw points:
    _glp.useProgram(_shps.pointerPoints.program);
    sync_cursorUniforms(_shps.pointerPoints);
    _glp.bindBuffer(_glp.ELEMENT_ARRAY_BUFFER, _glVBOs.lmPointsIndices);
    _glp.drawElements(_glp.POINTS, _spec.landmarks.length, _glp.UNSIGNED_SHORT, 0);
    _glp.disableVertexAttribArray(1);

    // draw pointer cursor:
    _glp.useProgram(_shps.pointerCursor.program);
    _glp.uniform1f(_shps.pointerCursor.uniforms.downFactor, _pointer.downFactor);
    _glp.uniform2f(_shps.pointerCursor.uniforms.cursorPosition, _pointer.x, _pointer.y);
    _glp.uniform2f(_shps.pointerCursor.uniforms.cursorScale, 2*_spec.cursorSizePx*_pointer.mirrorXFactor / _dims.width, 2*_spec.cursorSizePx / _dims.height);
    _glp.bindBuffer(_glp.ARRAY_BUFFER, _glVBOs.lmCursorPositions);
    _glp.vertexAttribPointer(0, 2, _glp.FLOAT, false, 8, 0);
    _glp.bindBuffer(_glp.ELEMENT_ARRAY_BUFFER, _glVBOs.lmCursorIndices);
    _glp.drawElements(_glp.TRIANGLES, 6, _glp.UNSIGNED_SHORT, 0);

    _glp.flush();
  }


  function sync_cursorUniforms(shp){
    _glp.uniform1f(shp.uniforms.downFactor, _pointer.downFactor);
    _glp.uniform2f(shp.uniforms.cursorPosition, _pointer.xPx, _pointer.yPx);
    _glp.uniform2fv(shp.uniforms.cursorBlendRange, _pointer.blendRange);
  }


  function update_click(isFlipped, landmarks, handWidth){
    // landmarks absolute relative position:
    const xyFrom = landmarks[_landmarks.pointerIndices[0]];
    const xyTo = landmarks[_landmarks.pointerIndices[1]];

    // landmarks pixel position:
    const xFrom = xyFrom[0] * _dims.width * 0.5;
    const yFrom = xyFrom[1] * _dims.height * 0.5;
    const xTo = xyTo[0] * _dims.width * 0.5;
    const yTo = xyTo[1] * _dims.height * 0.5;
    
    // compute mean position = pointer position:
    const k = _spec.pointerDistanceFromIndexTipRelative;
    const xMean = (1 - k) * xFrom + k * xTo;
    const yMean = (1 - k) * yFrom + k * yTo;
    
    // compute uncentered position in pixel, from lower left corner:
    const xPx = xMean + _dims.width / 2.0;
    const yPx = yMean + _dims.height / 2.0;

    // compute distance in pixels between the points:
    const dx = xFrom - xTo, dy = yFrom - yTo;
    const dlPx = Math.sqrt(dx * dx + dy * dy);

    // compute distance relative to hand size:
    const widthPx = handWidth * _dims.width;
    const dl = dlPx / widthPx;

    // compute state of the pointer (up or down):
    const pointerDistances = (isFlipped) ? _spec.pointerDistancesBackSide : _spec.pointerDistancesPalmSide;
    const dlRef = (_pointer.isDown) ? pointerDistances[0] : pointerDistances[1];
    let isDown = ( dl < dlRef );

    // do not consider pointer down if hand was just detected:
    const dt = Date.now() - _detection.lastTimestamp;
    isDown = isDown && (dt > _spec.delayBeforeFirstClick);
    
    // compute X and Y for the triggered event, taking account of mirroring canvas
    // they are in pixels, from the top left corner of the screen:
    let xEvent = xMean * _pointer.mirrorXFactor + _dims.width / 2.0;
    let yEvent = -yMean + _dims.height / 2.0;
    xEvent -= _dims.marginLeft;
    yEvent -= _dims.marginTop;

    // compare with state and fire events if necessary:
    if (_pointer.isDown && !isDown && _spec.onPointerUp){
      _spec.onPointerUp(xEvent, yEvent);
    } else if (!_pointer.isDown && isDown && _spec.onPointerDown){
      _spec.onPointerDown(xEvent, yEvent);
    }
    if (xPx !== _pointer.xPx || yPx !== _pointer.yPx && _spec.onPointerMove){
      _spec.onPointerMove(xEvent, yEvent, isDown);
    }

    // update downFactor:
    if (isDown) {
      _pointer.downFactor = 1;
    } else {
      _pointer.downFactor = Math.max(0, 1.0 - Math.abs(dl - dlRef) / _spec.pointerHeatDistance);
    }

    // save result:
    _pointer.xPx = xPx, _pointer.yPx = yPx;
    _pointer.x = 2 * xMean / _dims.width, _pointer.y = 2 * yMean / _dims.height;

    _pointer.isDown = isDown;
  }


  function size_canvas(canvas){
    const dpr = ( window.devicePixelRatio ) ? window.devicePixelRatio : 1;
    _dims.marginTop = _spec.marginTop / dpr;
    _dims.marginBottom = _spec.marginBottom / dpr;
    _dims.marginLeft = _spec.marginLeft / dpr;
    _dims.marginRight = _spec.marginRight / dpr;


    _dims.width = window.innerWidth + _dims.marginRight + _dims.marginLeft,
    _dims.height = window.innerHeight + _dims.marginTop + _dims.marginBottom;
    [_spec.canvasVideo, _spec.canvasPointer].forEach(function(canvas){
      canvas.width = _dims.width,
      canvas.height = _dims.height;
      canvas.style.marginTop = (-_dims.marginTop).toString() + 'px';
      canvas.style.marginLeft = (-_dims.marginLeft).toString() + 'px';
    });
    if (_glp){
      _glp.viewport(0, 0, _dims.width, _dims.height);
    }
  }


  function resize(){
    size_canvas();
    if (_state === _states.running){
      WEBARROCKSHAND.resize();
    }
  }


  function onError(errorLabel){
    console.log('ERROR in HandTrackerNavigationHelper:', errorLabel);
    _state = _states.error;
    if (_spec.callbackReady){
      _spec.callbackReady(errorLabel, null);
    }
  }


  function is_mobileOrTablet(){
    let check = false;
    (function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))) check = true;})(navigator['userAgent']||navigator['vendor']||window['opera']);
    return check;
  }


  function set_mirroring(isMirror){
    [_spec.canvasVideo, _spec.canvasPointer].forEach(function(canvas){
      canvas.style.transform = (isMirror) ? 'rotateY(180deg)' : '';
    });
    _pointer.mirrorXFactor = (isMirror) ? -1 : 1;
  }


  const that = {
    init: function(spec){
      _state = _states.initialized;
      _spec = Object.assign({}, _defaultSpec, spec);

      _landmarksStabilizer = WebARRocksLMStabilizer.instance({n: 5});

      // set canvas to fullscreen and set event listener:
      size_canvas();
      window.addEventListener('resize', resize);
      window.addEventListener('orientationchange', resize);

      // init second webgl context:
      try {
        _glp = _spec.canvasPointer.getContext('webgl', {
          antialias: true,
          depth: false,
          alpha: true,
          preserveDrawingBuffer: false
        });
      } catch(e){
        onError('GL_INCOMPATIBLE');
        return;
      }
      if (!_glp){
        onError('GL_INCOMPATIBLE');
        return;
      }
      _glp.clearColor(0, 0, 0, 0);
      _glp.lineWidth(_spec.lineWidth);
      _glp.viewport(0, 0, _dims.width, _dims.height);
      _glp.enable(_glp.BLEND);
      _glp.blendFunc(_glp.SRC_ALPHA, _glp.ZERO);

      // compute pointer blend range:
      _pointer.blendRange = [_spec.pointerBlendHandRadiusRange[0] * _spec.cursorSizePx, _spec.pointerBlendHandRadiusRange[1] * _spec.cursorSizePx];

      that.start();
    },


    start: function(){
      _state = _states.loading;
      WEBARROCKSHAND.init({
        canvas: _spec.canvasVideo,
        NNsPaths: _spec.NNsPaths,
        scanSettings: {
          threshold: _spec.threshold,
          thresholdSignal: _spec.thresholdSignal
        },
        videoSettings: Object.assign({
          facingMode: (_spec.isSelfieCamFirst) ? 'user' : 'environment' // request the back camera (not the selfie one) by default
        }, _spec.videoSettings),
        callbackReady: function(err, objs){
          if (err){
            onError(err);
            return;
          }

          // get GL context initializaed by WebAR.rocks.hand
          // it will be used to display the video:
          _gl = objs.GL;
          _glVideoTexture = objs.videoTexture;
          _videoTransformMat2 = objs.videoTransformMat2;

          // get landmarks label and their indices:
          _landmarks.allLabels = WEBARROCKSHAND.get_LMLabels();
          _landmarks.indices = _spec.landmarks.map(function(lmLabel){
            return _landmarks.allLabels.indexOf(lmLabel);
          });
          _landmarks.pointerIndices = _spec.pointerLandmarks.map(function(lmLabel){
            return _landmarks.allLabels.indexOf(lmLabel);
          });

          // if it is a desktop, mirror the camera:
          const isDesktop = !is_mobileOrTablet();
          if (isDesktop || _spec.isSelfieCamFirst){
            set_mirroring(true);
            _isSelfieCam = true;
          }

          _state = _states.running;
          init_htNav();

          if (_spec.callbackReady){
            _spec.callbackReady(false, {
              isMobileOrTablet: !isDesktop
            });
          }
        },

        callbackTrack: function(detectState){
          draw_video();
          if (detectState.isDetected){
            if (!_detection.isHandFound){
              _detection.isHandFound = true;
              _detection.lastTimestamp = Date.now();
            }
            const landmarksStabilized = _landmarksStabilizer.update( detectState.landmarks, _dims.width, _dims.height);

            update_click(detectState.isFlipped, landmarksStabilized, detectState.s);
            draw_pointer(landmarksStabilized);
          } else {
            _landmarksStabilizer.reset();
            _glp.clear(_glp.COLOR_BUFFER_BIT);
            if (_detection.isHandFound){
              _detection.isHandFound = false;
              _detection.lastTimestamp = 0;
            }
          }
        }
      }); //end WEBARROCKSHAND.init()
    }, //end that.start()


    change_camera(){
      return new Promise(function(accept, reject){
        if (_state !== _states.running){
          reject('NOT_RUNNING');
          return;
        }
        _state = _states.busy;

        WEBARROCKSHAND.update_videoSettings({
          facingMode: (_isSelfieCam) ? 'environment' : 'user'
        }).then(function(){
          _isSelfieCam = !_isSelfieCam;
          
          // mirror canvas using CSS in selfie cam mode:
          set_mirroring(_isSelfieCam);
          console.log('INFO in change_camera(): Camera flipped successfully');
          _state = _states.running;
          accept(_isSelfieCam);
        }).catch(function(err){
          console.log('ERROR in change_camera(): Cannot flip camera -', err);
          _state = _states.error;
          reject(err);
        });
      }); //end returned promise
    },


    enable_camera(){
      return WEBARROCKSHAND.retry_cameraAccess();
    },

    resize: resize

  }; //end that
  return that;
})(); 


// Export ES6 module:
try {
  module.exports = HandTrackerNavigationHelper;
} catch(e){
  console.log('ES6 Module not exported');
}