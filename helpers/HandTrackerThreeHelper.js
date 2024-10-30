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

const HandTrackerThreeHelper = (function(){
  // private variables:
  const NNPath = '../../neuralNets/';
  const _defaultSpec = {
    handTrackerCanvas: null,
    VTOCanvas: null,

    scanSettings: {},
    videoSettings: null,
    threshold: 0.92, // detection threshold, in [0,1] 1 -> hard, 0 -> easy
    maxHandsDetected: 1,
    freeZRot: false,

    GLSLTweakVideoColor: '',

    NNsPaths: null,
    NNs: null,

    cameraMinVideoDimFov: 33, // vertical camera FoV in degrees
    cameraFovRange: [30, 60], // vertical camera FoV range in degrees
    cameraZoom: 1,
    posePointLabels: [],
    poseFilter: null,
    isPostProcessing: false,
    taaLevel: 0,

    poseLandmarksLabels: ["wristBack", "wristLeft", "wristRight", "wristPalm", "wristPalmTop", "wristBackTop"],
    poseRotationDirectionSrc: null,
    poseRotationDirectionDst: null,
    isInverseYZObjectPosition: false,
    objectPositionTweaker: null,
    objectPointsPositionFactors: [1.0, 1.0, 1.0],
    //imagePointsTweaks: [], // implemented for VTOWatchOnly on 2024-10

    enableFlipObject: true, // flip the object if left hand. useful for hand accessories
    landmarksStabilizerSpec: {},

    callbackTrack: null,
    stabilizationSettings: null,
    hideTrackerIfDetectionLost: true,

    // debug flags - should be all false:
    debugLogHandInfo: false,
    debugDisablePoseOrientation: false,
    debugDisplayLandmarks: false
  };
  let _spec = null;
  let _landmarksStabilizers = null, _poseFilters = null, _neuralNetworkIndices = [];

  let _gl = null, _glVideoTexture = null, _videoTransformMat2 = null, _videoElement = null;
  
  const _three = {
    renderer: null,
    occluderMat: null,
    scene: null,
    loadingManager: null,
    camera: null,
    trackersParent: null,
    trackersRight: null,
    trackersLeft: null
  };
  const _shps = {
    copy: null,
    displayLandmarks: null
  };
  const _poseEstimation = {
    focals: [0, 0],
    objPointsRight: null,
    objPointsLeft: null,
    imgPointsPx: [],
    poseLandmarksIndices: [],
    //imagePointsTweaksIndices: [],
    matMov: null
  };
  const _debugDisplayLandmarks = {
    LMLabels: null,
    vertices: null,
    glIndicesVBO: null,
    glVerticesVBO: null
  };

  const _deg2rad = Math.PI / 180;
  let _cameraFoVY = -1;

  // private methods:
  
  // compile a shader:
  function compile_shader(source, glType, typeString) {
    const glShader = _gl.createShader(glType);
    _gl.shaderSource(glShader, source);
    _gl.compileShader(glShader);
    if (!_gl.getShaderParameter(glShader, _gl.COMPILE_STATUS)) {
      alert("ERROR IN " + typeString + " SHADER: " + _gl.getShaderInfoLog(glShader));
      console.log('Buggy shader source: \n', source);
      return null;
    }
    return glShader;
  };


  // build the shader program:
  function build_shaderProgram(shaderVertexSource, shaderFragmentSource, id) {
    // compile both shader separately:
    const GLSLprecision = 'precision lowp float;';
    const glShaderVertex = compile_shader(shaderVertexSource, _gl.VERTEX_SHADER, "VERTEX " + id);
    const glShaderFragment = compile_shader(GLSLprecision + shaderFragmentSource, _gl.FRAGMENT_SHADER, "FRAGMENT " + id);

    const glShaderProgram = _gl.createProgram();
    _gl.attachShader(glShaderProgram, glShaderVertex);
    _gl.attachShader(glShaderProgram, glShaderFragment);

    // start the linking stage:
    _gl.linkProgram(glShaderProgram);
    const aPos = _gl.getAttribLocation(glShaderProgram, "position");
    _gl.enableVertexAttribArray(aPos);

    return {
      program: glShaderProgram,
      uniforms: {}
    };
  }


  // return true if IOS:
  function check_isAppleCrap(){
    return /iPad|iPhone|iPod/.test(navigator.platform)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  

  // build shader programs:
  function init_shps(){
    // create copy shp, used to display the video on the canvas:
    _shps.drawVideo = build_shaderProgram('attribute vec2 position;\n\
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
        vec3 color = texture2D(uun_source, vUV).rgb;\n\
        ' + _spec.GLSLTweakVideoColor +  '\n\
        gl_FragColor = vec4(color, 1.0);\n\
      }',
      'DRAW VIDEO');
    _shps.drawVideo.uniforms.transformMat2 = _gl.getUniformLocation(_shps.drawVideo.program, 'transform');

    if (_spec.debugDisplayLandmarks){
      _shps.displayLandmarks = build_shaderProgram('attribute vec2 position;\n\
        void main(void){\n\
          gl_PointSize = 4.0;\n\
          gl_Position = vec4(position, 0., 1.);\n\
        }'
        ,
        'void main(void){\n\
          gl_FragColor = vec4(0.,1.,0.,1.);\n\
        }',
        'DISPLAY LANDMARKS');
    }
  }


  function init_debugDisplayLandmarks(){
    _debugDisplayLandmarks.LMLabels = WEBARROCKSHAND.get_LMLabels();
    _debugDisplayLandmarks.vertices = new Float32Array(_debugDisplayLandmarks.LMLabels.length*2);

    // create vertex buffer objects:
    // VBO to draw only 1 point
    _debugDisplayLandmarks.glVerticesVBO = _gl.createBuffer();
    _gl.bindBuffer(_gl.ARRAY_BUFFER, _debugDisplayLandmarks.glVerticesVBO);
    _gl.bufferData(_gl.ARRAY_BUFFER, _debugDisplayLandmarks.vertices, _gl.DYNAMIC_DRAW);

    const indices = new Uint16Array(_debugDisplayLandmarks.LMLabels.length);
    for (let i=0; i<_debugDisplayLandmarks.LMLabels.length; ++i){
      indices[i] = i;
    }
    _debugDisplayLandmarks.glIndicesVBO = _gl.createBuffer();
    _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER, _debugDisplayLandmarks.glIndicesVBO);
    _gl.bufferData(_gl.ELEMENT_ARRAY_BUFFER, indices, _gl.STATIC_DRAW);
  }


  function init_three(){
    // init renderer:
    _three.renderer = new THREE.WebGLRenderer({
      canvas: _spec.VTOCanvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true
    });
    _three.renderer.setClearAlpha(0);

    // Fix a weird issue with IOS15.3 and 15.4:
    if (check_isAppleCrap()){
      const threeCanvasStyle = _three.renderer.domElement.style;
      console.log('IOS Detect, apply a crappy workaround');
      threeCanvasStyle.backgroundColor = 'darkblue';
      setTimeout(function(){
        threeCanvasStyle.backgroundColor = 'transparent';
      }, 10);
    }

    // init scene:
    _three.scene = new THREE.Scene();

    // init loading manager:
    _three.loadingManager = new THREE.LoadingManager();

    // init camera:
    const viewAspectRatio = _spec.VTOCanvas.width / _spec.VTOCanvas.height;
    _three.camera = new THREE.PerspectiveCamera(_cameraFoVY, viewAspectRatio, 0.1, 1000);
    if (_spec.isPostProcessing){
      init_threePostProcessing();
    }

    // init tracker object:
    _three.trackersParent = [], _three.trackersLeft = [], _three.trackersRight = [];
    for (let i=0; i<_spec.maxHandsDetected; ++i){
      const trackerParent = new THREE.Object3D();
      const trackerRight = new THREE.Object3D();
      const trackerLeft = new THREE.Object3D();
      trackerParent.frustumCulled = false;
      trackerParent.matrixAutoUpdate = false;
      trackerParent.add(trackerRight, trackerLeft);
      _three.trackersParent.push(trackerParent);
      _three.trackersRight.push(trackerRight);
      _three.trackersLeft.push(trackerLeft);
      _three.scene.add(trackerParent);
    }

    // occluder material:
    _three.occluderMat = new THREE.ShaderMaterial({
      vertexShader: THREE.ShaderLib.basic.vertexShader,
      fragmentShader: "precision lowp float;\n void main(void){\n gl_FragColor = vec4(1., 0., 0., 1.);\n }",
      uniforms: THREE.ShaderLib.basic.uniforms,
      side: THREE.DoubleSide,
      colorWrite: false
    });
  }


  function init_threePostProcessing(){
     // init composer (for postprocessing):
    _three.composer = new THREE.EffectComposer( _three.renderer );
    if (_spec.taaLevel > 0){
      // add temporal anti-aliasing pass:
      const taaRenderPass = new THREE.TAARenderPass( _three.scene, _three.camera );
      taaRenderPass.unbiased = false;
      _three.composer.addPass( taaRenderPass );
      taaRenderPass.sampleLevel = _spec.taaLevel;
    }
    
    // render scene pass:
    const renderScenePass = new THREE.RenderPass( _three.scene, _three.camera );
    _three.composer.addPass( renderScenePass );
    
    if (_spec.taaLevel > 0){
      renderScenePass.enabled = false;
      const copyPass = new THREE.ShaderPass( THREE.CopyShader );
      _three.composer.addPass( copyPass );
    }
  }


  function tweak_landmarkObjectPosition(position){
    const posTweaked = position.slice(0);
    if (_spec.isInverseYZObjectPosition){
      const y = posTweaked[1];
      const z = posTweaked[2];
      posTweaked[1] = -z;
      posTweaked[2] = y;
    }

    return posTweaked;
  }


  function init_objPoints(poseLandmarksIndices, isInvX){
    const mean = new THREE.Vector3();
    const landmarksInfo = WEBARROCKSHAND.get_LM();
    
    const points = poseLandmarksIndices.map(function(ind){
      const pos = tweak_landmarkObjectPosition(landmarksInfo[ind].position);
      if (isInvX){
        pos[0] *= -1.0;
      }
      //console.log('3D pos of', landmarksInfo[ind].label, ': ', pos);
      const threePos = new THREE.Vector3().fromArray(pos);
      mean.add(threePos);
      return pos;
    });
    mean.divideScalar(poseLandmarksIndices.length);

    // substract mean:
    points.forEach(function(pos, ind){
      pos[0] -= mean.x, pos[1] -= mean.y, pos[2] -= mean.z;

      pos[0] *= _spec.objectPointsPositionFactors[0],
      pos[1] *= _spec.objectPointsPositionFactors[1],
      pos[2] *= _spec.objectPointsPositionFactors[2];
      
      if (_spec.objectPositionTweaker){
        _spec.objectPositionTweaker(pos, landmarksInfo[ind].label);
      }
    });

    return {
      points: points,
      mean: mean
    };
  }


  function init_poseEstimation(){
    // find indices of landmarks used for pose estimation:
    _poseEstimation.poseLandmarksIndices = _spec.poseLandmarksLabels.map(function(label){
      const ind = WEBARROCKSHAND.get_LMLabels().indexOf(label);
      if (ind === -1){
        throw new Error('Cannot find landmark label ' + label);
      }
      return ind;
    });

    // init objPoints:
    _poseEstimation.objPointsRight = init_objPoints(_poseEstimation.poseLandmarksIndices, false);
    _poseEstimation.objPointsLeft = init_objPoints(_poseEstimation.poseLandmarksIndices, true);   

    // init imgPoints:
    _poseEstimation.imgPointsPx = _poseEstimation.poseLandmarksIndices.map(function(){
      return [0, 0];
    });

    // init imagePointsTweaksIndices:
    /*_poseEstimation.imagePointsTweaksIndices = _spec.imagePointsTweaks.map((tweak) => {
      return tweak.pointLabels.map((label) => {
        const ind = _spec.poseLandmarksLabels.indexOf(label);
        if (ind === -1){
          throw new Error('Cannot find tweak landmark label in pose labels ' + label);
        }
        return ind;
      })
    });*/

    // init THREE stuffs:
    if (!_poseEstimation.matMov){
      _poseEstimation.matMov = new THREE.Matrix4();
    }
  }


  function draw_video(){
     // use the head draw shader program and sync uniforms:
    _gl.useProgram(_shps.drawVideo.program);
    _gl.uniformMatrix2fv(_shps.drawVideo.uniforms.transformMat2, false, _videoTransformMat2);
    _gl.activeTexture(_gl.TEXTURE0);
    _gl.bindTexture(_gl.TEXTURE_2D, _glVideoTexture);

    // draw the square looking for the head
    // the VBO filling the whole screen is still bound to the context
    // fill the viewPort
    _gl.drawElements(_gl.TRIANGLES, 3, _gl.UNSIGNED_SHORT, 0);
  }


  function draw_landmarks(detectState){
    // copy landmarks:
    detectState.landmarks.forEach(function(lm, lmIndex){
      _debugDisplayLandmarks.vertices[lmIndex*2] =     lm[0]; // X
      _debugDisplayLandmarks.vertices[lmIndex*2 + 1] = lm[1]; // Y
    });

    // draw landmarks:
    _gl.useProgram(_shps.displayLandmarks.program);

    _gl.bindBuffer(_gl.ARRAY_BUFFER, _debugDisplayLandmarks.glVerticesVBO);
    _gl.bufferData(_gl.ARRAY_BUFFER, _debugDisplayLandmarks.vertices, _gl.DYNAMIC_DRAW);
    _gl.bindBuffer(_gl.ELEMENT_ARRAY_BUFFER, _debugDisplayLandmarks.glIndicesVBO);
    _gl.vertexAttribPointer(0, 2, _gl.FLOAT, false, 8,0);

    _gl.drawElements(_gl.POINTS, _debugDisplayLandmarks.LMLabels.length, _gl.UNSIGNED_SHORT, 0);
  }


  function callbackTrack(detectStatesArg){
    const vWidth = that.get_viewWidth(), vHeight = that.get_viewHeight();
    _gl.viewport(0, 0, vWidth, vHeight);
    
    // draw the video:
    draw_video();
    _gl.flush();

    // draw the THREE.js scene:
    let isRender = false;
    const detectStates = (_spec.maxHandsDetected === 1) ? [detectStatesArg] : detectStatesArg;
    for (let i = 0; i<detectStates.length; ++i){
      const detectState = detectStates[i];
      const trackerParent = _three.trackersParent[i];
      const stabilizer = _landmarksStabilizers[i];
      const poseFilter = _poseFilters[i];
      
      if (detectState.isDetected) {
        trackerParent.visible = true;
        
        if (_spec.debugDisplayLandmarks){
          draw_landmarks(detectState);
        }

        if (_spec.debugLogHandInfo){
          console.log('isRightHand: ', detectState.isRightHand, 'isFlipped: ', detectState.isFlipped);
        }

        const dpr = window.devicePixelRatio || 1.0;
        const landmarksStabilized = stabilizer.update(detectState.landmarks, vWidth/dpr, vHeight/dpr);

        const isValidPose = compute_pose(landmarksStabilized, detectState.isRightHand, poseFilter, i);
        isRender =  isRender || isValidPose;

        if (_neuralNetworkIndices[i] !== detectState.neuralNetworkInd){
          //console.log('NN changed');
          stabilizer.reset();
          if (poseFilter !== null){
            poseFilter.reset();
          }
          _neuralNetworkIndices[i] = detectState.neuralNetworkInd;
        }

      } else if(trackerParent.visible){
        stabilizer.reset();
        if (_spec.hideTrackerIfDetectionLost){
          trackerParent.visible = false;
        }
        _neuralNetworkIndices[i] = -1;
        isRender = true;
        if (poseFilter !== null){
          poseFilter.reset();
        }
      }

    } // end loop on detectStates

    if (_spec.callbackTrack !== null){
      _spec.callbackTrack(detectStatesArg);
    }
    
    if (isRender){
      if (_spec.isPostProcessing){
        _three.composer.render();
      } else {
        _three.renderer.render(_three.scene, _three.camera);
      }
    }
  }


  function update_focals(){
    // COMPUTE CAMERA PARAMS (FOCAL LENGTH)
    // see https://docs.opencv.org/3.0-beta/modules/calib3d/doc/camera_calibration_and_3d_reconstruction.html?highlight=projectpoints
    // and http://ksimek.github.io/2013/08/13/intrinsic/

    const halfFovYRad = 0.5 * _cameraFoVY * _deg2rad;
    const cotanHalfFovY = 1.0 / Math.tan(halfFovYRad);

    // settings with EPnP:
    const fy = 0.5 * that.get_viewHeight() * cotanHalfFovY;
    const fx = fy;

    console.log('INFO in HandTrackerThreeHelper - update_focals(): fy =', fy);
    
    const focals = _poseEstimation.focals;
    focals[0] = fx, focals[1] = fy;
  }


  /*function apply_tweakScale(imgPointsPx, pointInds, tweak){
    const p0 = imgPointsPx[pointInds[0]];
    const p1 = imgPointsPx[pointInds[1]];
    const center = [0.5*(p0[0]+p1[0]), 0.5*(p0[1]+p1[1])];
    const u = [0.5*(p1[0]-p0[0]), 0.5*(p1[1]-p0[1])];
    const k = tweak.factor;
    p0[0] = center[0] - k*u[0], p0[1] = center[1] - k*u[1];
    p1[0] = center[0] + k*u[0], p1[1] = center[1] + k*u[1];
    //p0[0] = 0, p0[1] = 0, p1[0] = 0, p1[1] = 0
  }*/


  function compute_pose(landmarks, isRightHand, poseFilter, handIndex){
    // update image points to compute imgPointPx:
    const imgPointsPx = _poseEstimation.imgPointsPx;
    const w2 = that.get_viewWidth() / 2.0;
    const h2 = that.get_viewHeight() / 2.0;

    _poseEstimation.poseLandmarksIndices.forEach(function(ind, i){
      const imgPointPx = imgPointsPx[i];
      imgPointPx[0] = - ( 1.0 / _spec.cameraZoom ) * landmarks[ind][0] * w2,  // X in pixels
      imgPointPx[1] = - ( 1.0 / _spec.cameraZoom ) * landmarks[ind][1] * h2;  // Y in pixels
    });

    // apply imagePointsTweaks
    /*if (_spec.imagePointsTweaks.length !== 0){
      _spec.imagePointsTweaks.forEach(function(tweak, tweakInd){
        const pointInds = _poseEstimation.imagePointsTweaksIndices[tweakInd];
        switch(tweak.type){
          case 'SCALE':
            apply_tweakScale(imgPointsPx, pointInds, tweak);
            break;
          default:
            throw new Error('Unknow image points tweak type for ', tweak);
            break;
        }
      }); // end loop on tweaks
    }*/

    // get right hand side object points:
    const objPoints = (isRightHand) ? _poseEstimation.objPointsRight : _poseEstimation.objPointsLeft;
    
    // compute pose:
    const focals = _poseEstimation.focals;
    const computePoseOptions = {
      rotationDirectionSrc: _spec.poseRotationDirectionSrc,
      rotationDirectionDst: _spec.poseRotationDirectionDst
    }
    const solved = WEBARROCKSHAND.compute_pose(objPoints.points, imgPointsPx, focals[0], focals[1], computePoseOptions);

    const tracker = (isRightHand || !_spec.enableFlipObject) ? _three.trackersRight[handIndex] : _three.trackersLeft[handIndex];
    tracker.visible = true;
    tracker.position.copy(objPoints.mean).multiplyScalar(-1);

    // hide the other side:
    const trackerHidden = (tracker === _three.trackersRight[handIndex]) ? _three.trackersLeft[handIndex] : _three.trackersRight[handIndex];
    trackerHidden.visible = false;
  
    if (!solved){
      return false;
    }

    // copy pose to THREE.js matrix:
    const m = _poseEstimation.matMov.elements;
    const r = solved.rotation, t = solved.translation;
    if (isNaN(t[0])){
      return false;
    }

    // set translation part:
    m[12] = -t[0], m[13] = -t[1], m[14] = -t[2];

    // set rotation part:
    if (!_spec.debugDisablePoseOrientation){
      m[0] = -r[0][0], m[4] =  -r[0][1], m[8] =  r[0][2],
      m[1] = -r[1][0], m[5] =  -r[1][1], m[9] =  r[1][2],
      m[2] = -r[2][0], m[6] =  -r[2][1], m[10] =  r[2][2];
    }

    let filteredMovMatrix = _poseEstimation.matMov;
    if (poseFilter !== null){
      filteredMovMatrix = poseFilter.update(imgPointsPx,
        _three.trackersParent[handIndex], _three.camera, that.get_viewHeight(),
        _poseEstimation.matMov);
    }

    // move THREE follower object:
    _three.trackersParent[handIndex].matrix.copy(filteredMovMatrix);

    return true;
  }


  function inverse_facesIndexOrder(geom){
    if (geom.faces){
      // geometry
      geom.faces.forEach(function(face){
        // change rotation order:
        const b = face.b, c = face.c;
        face.c = b, face.b = c;
      });
    } else  {
      // buffer geometry
      const arr = geom.index.array;
      const facesCount = arr.length / 3;
      for (let i=0; i<facesCount; ++i){
        const b = arr[i*3 + 1], c = arr[i*3 + 2];
        arr[i*3 + 2] = b, arr[i*3 + 1] = c;
      }
    }
    geom.computeVertexNormals();
  }


  function init_poseFilters(poseFilter){
    const poseFilters = [];
    for (let i = 0; i < _spec.maxHandsDetected; ++i) {
      let poseFilterHand = null;
      if (poseFilter){
        poseFilterHand = (i === 0) ? poseFilter : poseFilter.clone();
      }
      poseFilters.push(poseFilterHand);
    }
    return poseFilters;
  }


  function init_landmarksStabilizers(landmarksStabilizerSpec){
    const stabilizers = [];
    for (let i = 0; i < _spec.maxHandsDetected; ++i) {
      stabilizers.push(WebARRocksLMStabilizer.instance(landmarksStabilizerSpec));
    }
    return stabilizers;
  }


  // public methods:
  const that = {
    init: function(spec){
      _spec = Object.assign({}, _defaultSpec, spec);

      // init landmarks stabilizers:
      _neuralNetworkIndices = [];
      for (let i = 0; i < _spec.maxHandsDetected; ++i) {
        _neuralNetworkIndices.push(-1);
      }

      _poseFilters = init_poseFilters(_spec.poseFilter);
      _landmarksStabilizers = init_landmarksStabilizers(_spec.landmarksStabilizerSpec);

      // enable post processing if temporal anti-aliasing:
      _spec.isPostProcessing = _spec.isPostProcessing || (_spec.taaLevel > 0);

      return new Promise(function(accept, reject){
        WEBARROCKSHAND.init({
          freeZRot: _spec.freeZRot,
          canvas: _spec.handTrackerCanvas,
          NNsPaths: _spec.NNsPaths,
          NNs: _spec.NNs,
          scanSettings: Object.assign({}, _spec.scanSettings, {
            //nDetectsPerLoop: 1,
            threshold: _spec.threshold
          }),
          maxHandsDetected: _spec.maxHandsDetected,
          videoSettings: spec.videoSettings || {
            facingMode: 'environment' // request the back camera (not the selfie one) by default
          },
          stabilizationSettings: _spec.stabilizationSettings,
          callbackReady: function(err, spec){
            if (err){
              console.log('AN ERROR HAPPENS. ERR =', err);
              reject(err);
              return;
            }
            console.log('INFO: WEBARROCKSHAND IS READY. spec =', spec);
            _gl = spec.GL;
            _glVideoTexture = spec.videoTexture;
            _videoTransformMat2 = spec.videoTransformMat2;
            _videoElement = spec.video;
            
            init_shps();
            init_three();
            init_poseEstimation();
            if (_spec.debugDisplayLandmarks){
              init_debugDisplayLandmarks();
            }
            that.update_threeCamera();
            update_focals();

            accept(Object.assign({}, _three));
          },
          callbackTrack: callbackTrack
        }); //end WEBARROCKSHAND.init
      }); //end returned promise
    }, // end init()


    update: function(specUpdated){
      // spec keys that can be updated: poseLandmarksLabels, poseFilter, NNsPaths, threshold
      Object.assign(_spec, specUpdated);
      
      return WEBARROCKSHAND.update({
        NNsPaths: _spec.NNsPaths,
        NNs: _spec.NNs,
        scanSettings: {
          threshold: _spec.threshold
        }
      }).then(function(){
        init_poseEstimation();

        // update stabilizer:
        if (typeof(specUpdated.landmarksStabilizerSpec) !== 'undefined'){
          _landmarksStabilizers = init_landmarksStabilizers(specUpdated.landmarksStabilizerSpec);
        }

        // update poseFilter:
        if (typeof(specUpdated.poseFilter) !== 'undefined'){
          _poseFilters = init_poseFilters(specUpdated.poseFilter);
        } else {
          _poseFilters.forEach(function(poseFilter){
            if (poseFilter){
              poseFilter.reset();
            }
          });
        }

      });
    },


    resize: function(w, h){
      if (_gl){
        // Fix a bug with IOS14.7 and WebGL2
        _gl.bindFramebuffer(_gl.FRAMEBUFFER, null);
      }
      
      // resize handTracker canvas:
      _spec.handTrackerCanvas.width = w;
      _spec.handTrackerCanvas.height = h;
      WEBARROCKSHAND.resize();
      
      // resize THREE renderer:
      _spec.VTOCanvas.width = w;
      _spec.VTOCanvas.height = h;
      that.update_threeCamera();
      update_focals();
    },


    get_sourceWidth: function(){
      return _videoElement.videoWidth;
    },


    get_sourceHeight: function(){
      return _videoElement.videoHeight;
    },


    get_viewWidth: function(){
      return _spec.VTOCanvas.width;
    },


    get_viewHeight: function(){
      return _spec.VTOCanvas.height;
    },


    add_threeOccluder: function(threeMesh){
      threeMesh.userData.isOccluder = true;
      threeMesh.material = _three.occluderMat;
      threeMesh.renderOrder = -1e12; // render first
      that.add_threeObject(threeMesh);
    },


    add_threeSoftOccluder: function(threeMesh, radius, dr, isDebug){
      if (!isDebug){
        // replace material:
        const vertexShaderSource = "varying float vRadius;\n\
        uniform float drv;\n\
        void main() {\n\
          // we work in the view ref, in a plane parallel to the view plane:\n\
          vec2 cylAxisPointProj0 = vec2(modelViewMatrix * vec4(0., 0., 0., 1.));\n\
          vec2 cylAxisPointProj1 = vec2(modelViewMatrix * vec4(0., position.y, 0., 1.));\n\
          vec2 pointProj = vec2(modelViewMatrix * vec4(position, 1.0));\n\
          // compute vRadius, the distance between pointProj and [cylAxisPointProj0, cylAxisPointProj1]:\n\
          float d = distance(cylAxisPointProj0, cylAxisPointProj1);\n\
          vec2 dc1 = cylAxisPointProj1 - cylAxisPointProj0;\n\
          vec2 dc0 = cylAxisPointProj0 - pointProj;\n\
          vRadius = abs(dc1.x * dc0.y - dc0.x * dc1.y) / d;\n\
          \n\
          vec3 transformed = vec3( position );\n\
          \n\
          vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );\n\
          vec4 glPositionOriginal = projectionMatrix * mvPosition;\n\
          // this factor depends on camera zMin and zFar - dirty tweak:\n\
          float zBufferOffset = -0.5 * drv / glPositionOriginal.w;\n\
          gl_Position = glPositionOriginal + vec4(0., 0., zBufferOffset, 0.);\n\
        }";

        threeMesh.material = new THREE.ShaderMaterial({
          vertexShader: vertexShaderSource,
          fragmentShader: "precision mediump float;\n\
            uniform float dr, radius;\n\
            varying float vRadius;\n\
            void main(void){\n\
              float alpha = smoothstep(radius, radius-dr, vRadius);\n\
              gl_FragColor = vec4(1.,1.,1.,alpha);\n\
              // DEBUG ZONE:\n\
              // gl_FragColor = vec4(0., 0., 0., 1.);\n\
              // gl_FragColor = vec4(alpha, 0., 0., 1.);\n\
            }",
          uniforms:{
            dr: {
              value: dr
            },
            drv: {
              value: dr
            },
            radius: {
              value: radius
            }
          },
          transparent: true,
          toneMapped: false,
          blending: THREE.CustomBlending,
          blendSrc: THREE.ZeroFactor,
          blendDst: THREE.OneMinusSrcAlphaFactor,
          colorWrite: true
        });
      }
      threeMesh.renderOrder = 1e12; // render last for good transparency compositing
      threeMesh.material.side = THREE.BackSide;
      threeMesh.userData.isOccluder = true;

      that.add_threeObject(threeMesh);
    },


    add_threeObject: function(threeObject){
      for (let i = 0; i < _spec.maxHandsDetected; ++i){
        if (_poseFilters[i]){
          _poseFilters[i].reset();
        }
      }

      const add_threeObjectToParent = function(threeParents, threeChild){
        for (let i = 0; i < _spec.maxHandsDetected; ++i){
          let isChildContainsSkinnedMesh = false;
          threeChild.traverse(function(threeStuff){
            isChildContainsSkinnedMesh = isChildContainsSkinnedMesh || threeStuff.isSkinnedMesh;
          });

          if (_spec.maxHandsDetected > 1 && isChildContainsSkinnedMesh){
            throw new Error('Multihands is not supported by the helper with skinned mesh.');
          }

          const threeChildCopy = (isChildContainsSkinnedMesh || !_spec.enableFlipObject) ? threeChild : threeChild.clone();
          threeParents[i].add(threeChildCopy);
        }
      }

      add_threeObjectToParent(_three.trackersRight, threeObject);
        
      if (!_spec.enableFlipObject){
        return;
      }

      // compute the left handed object by inverting X
      // we could just invert X scale but then the handyness of the transform would be inverted
      // and it would trigger culling and lighting error
      
      const inverse_ObjectRecursive = function(threeObject){
        threeObject.frustumCulled = false;
        threeObject.updateMatrixWorld(true);
        
        if (threeObject.isMesh){
          // compute matrix to apply to the geometry, K
          const M = threeObject.matrixWorld;
          const invXMatrix = new THREE.Matrix4().makeScale(-1, 1, 1);
          const K = new THREE.Matrix4().copy(M).invert().multiply(invXMatrix).multiply(M);

          // clone and invert the mesh:
          const threeMeshLeft = threeObject.clone();
          threeMeshLeft.geometry = threeObject.geometry.clone();
         
          threeMeshLeft.geometry.applyMatrix4(K);
          inverse_facesIndexOrder(threeMeshLeft.geometry);

          return threeMeshLeft;
        } else {
          const threeObjectLeft = threeObject.clone();
          threeObjectLeft.children.splice(0);
          for (let i=0; i<threeObject.children.length; ++i){
            const child = threeObject.children[i];
            threeObjectLeft.remove(child);
            threeObjectLeft.add(inverse_ObjectRecursive(child));
          }
          return threeObjectLeft;
        }
      }

      const threeObjectLeft = inverse_ObjectRecursive(threeObject);

      // add objects to trackers:
      add_threeObjectToParent(_three.trackersLeft, threeObjectLeft);
    },


    clear_threeObjects: function(clearOccluders){
      const clear_threeObject = function(threeObject){
        for (let i=threeObject.children.length-1; i>=0; --i){
          const child = threeObject.children[i];
          if (clearOccluders || !child.userData.isOccluder){
            threeObject.remove(threeObject.children[i]);
          }
        }
      }
      for (let i=0; i<_spec.maxHandsDetected; ++i){
        clear_threeObject(_three.trackersRight[i]);
        clear_threeObject(_three.trackersLeft[i]);
      }
    },


    update_threeCamera: function(){
      // compute aspectRatio:
      const cvw = that.get_viewWidth();
      const cvh = that.get_viewHeight();
      const canvasAspectRatio = cvw / cvh;

      // compute vertical field of view:
      const vw = that.get_sourceWidth();
      const vh = that.get_sourceHeight();
      const videoAspectRatio = vw / vh;
      let fovFactor = (vh > vw) ? (1.0 / videoAspectRatio) : 1.0;
      let fov = _spec.cameraMinVideoDimFov * fovFactor;
      
      if (canvasAspectRatio > videoAspectRatio) {
        const scale = cvw / vw;
        const cvhs = vh * scale;
        fov = 2 * Math.atan( (cvh / cvhs) * Math.tan(0.5 * fov * _deg2rad)) / _deg2rad;
      }

      fov = Math.min(Math.max(fov, _spec.cameraFovRange[0]), _spec.cameraFovRange[1]);
      
      _cameraFoVY = fov;
      console.log('INFO in update_threeCamera(): camera vertical estimated FoV is', fov, 'deg');

      // update projection matrix:
      _three.camera.aspect = canvasAspectRatio;
      _three.camera.zoom = _spec.cameraZoom;
      _three.camera.fov = fov;
      _three.camera.updateProjectionMatrix();

      // update drawing area:
      _three.renderer.setSize(cvw, cvh, false);
      _three.renderer.setViewport(0, 0, cvw, cvh);
      if (_spec.isPostProcessing){
        _three.composer.setSize(cvw, cvh);
      }
    },


    destroy: function(){
      return WEBARROCKSHAND.destroy().then(that.reset);
    },


    reset: function(){
      _landmarksStabilizers = null, _poseFilters = null;
      _gl = null, _glVideoTexture = null, _videoTransformMat2 = null, _videoElement = null;
      _spec.isPostProcessing = false;
      Object.assign(_three, {
        trackersRight: null,
        trackersLeft: null,
        trackersParent: null
      });
      return Promise.resolve();
    }
  }; //end that
  return that;
})(); 


// Export ES6 module:
try {
  module.exports = HandTrackerThreeHelper;
} catch(e){
  console.log('ES6 Module not exported');
}