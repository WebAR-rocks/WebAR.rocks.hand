/* eslint-disable */

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

import {
  BackSide,
  DoubleSide,
  CustomBlending,
  Matrix4,
  OneMinusSrcAlphaFactor,
  ShaderLib,
  ShaderMaterial,
  Vector3,
  ZeroFactor
} from 'three';
import WebARRocksLMStabilizer from './landmarksStabilizers/WebARRocksLMStabilizer2.js';

// import main script:
import WEBARROCKSHAND from '../dist/WebARRocksHand.module.js';


const HandTrackerThreeHelper = (function(){
  // private variables:
  const NNPath = '../../neuralNets/';
  const _defaultSpec = {
    handTrackerCanvas: null,

    threshold: 0.92, // detection threshold, in [0,1] 1 -> hard, 0 -> easy
    scanSettings: {},
    maxHandsDetected: 1,
    freeZRot: true,

    GLSLTweakVideoColor: '',

    NNs: null,

    cameraMinVideoDimFov: 40, // vertical camera FoV in degrees
    cameraFovRange: [30, 90], // vertical camera FoV range in degrees
    cameraZoom: 1.5,
    posePointLabels: [],
    poseFilter: null,
    
    poseLandmarksLabels: ["wristBack", "wristLeft", "wristRight", "wristPalm", "wristPalmTop", "wristBackTop"],
    isInverseYZObjectPosition: false,
    objectPositionTweaker: null,
    objectPointsPositionFactors: [1.0, 1.0, 1.0],

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
  let _spec = null, _landmarksStabilizerModule = null;
  let _landmarksStabilizers = null, _poseFilters = null, _neuralNetworkIndices = null;

  let _gl = null, _glVideoTexture = null, _videoTransformMat2 = null, _videoElement = null;
  
  const _previousSizing = {
    width: 1,
    height: -1
  };

  const _three = {
    camera: null,
    trackersParent: null,
    trackersRight: null,
    trackersLeft: null,
    superParent: null,
    occluderMat: null
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
    matMov: null
  };
  const _debugDisplayLandmarks = {
    LMLabels: null,
    vertices: null,
    glIndicesVBO: null,
    glVerticesVBO: null
  };

  const _deg2rad = Math.PI / 180;
  
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
    const mean = new Vector3();
    const landmarksInfo = WEBARROCKSHAND.get_LM();
    
    const points = poseLandmarksIndices.map(function(ind){
      const pos = tweak_landmarkObjectPosition(landmarksInfo[ind].position);
      if (isInvX){
        pos[0] *= -1;
      }
      const threePos = new Vector3().fromArray(pos);
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

    // init THREE stuffs:
    if (!_poseEstimation.matMov){
      _poseEstimation.matMov = new Matrix4();
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

    if (_three.trackersParent === null){
      return;
    }

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
        if (poseFilter !== null){
          poseFilter.reset();
        }
      }
    }

    if (_spec.callbackTrack !== null){
      _spec.callbackTrack(detectStatesArg);
    }
  }


  function update_focals(viewHeight, cameraFoVY){
    // COMPUTE CAMERA PARAMS (FOCAL LENGTH)
    // see https://docs.opencv.org/3.0-beta/modules/calib3d/doc/camera_calibration_and_3d_reconstruction.html?highlight=projectpoints
    // and http://ksimek.github.io/2013/08/13/intrinsic/

    const halfFovYRad = 0.5 * cameraFoVY * _deg2rad;
    
    // settings with EPnP:
    const fy = 0.5 * viewHeight / Math.tan(halfFovYRad);
    const fx = fy;

    console.log('INFO in HandTrackerThreeHelper - update_focals(): fy =', fy);
    
    const focals = _poseEstimation.focals;
    focals[0] = fx, focals[1] = fy;
  }


  function compute_pose(landmarks, isRightHand, poseFilter, handIndex){
    if (_three.camera === null || _three.trackersParent === null){
      return false;
    }

    // update image points:
    const imgPointsPx = _poseEstimation.imgPointsPx;
    const w2 = that.get_viewWidth() / 2;
    const h2 = that.get_viewHeight() / 2;

    _poseEstimation.poseLandmarksIndices.forEach(function(ind, i){
      const imgPointPx = imgPointsPx[i];
      imgPointPx[0] = - ( 1 / _spec.cameraZoom ) * landmarks[ind][0] * w2,  // X in pixels
      imgPointPx[1] = - ( 1 / _spec.cameraZoom ) * landmarks[ind][1] * h2;  // Y in pixels
    });

    // get right hand side object points:
    const objPoints = (isRightHand) ? _poseEstimation.objPointsRight : _poseEstimation.objPointsLeft;
    
    // compute pose:
    const focals = _poseEstimation.focals;
    const solved = WEBARROCKSHAND.compute_pose(objPoints.points, imgPointsPx, focals[0], focals[1]);

    const tracker = (isRightHand || !_spec.enableFlipObject) ? _three.trackersRight[handIndex] : _three.trackersLeft[handIndex];
    tracker.visible = true;
    tracker.position.copy(objPoints.mean).multiplyScalar(-1);

    // hide the other side:
    const trackerHidden = (tracker === _three.trackersRight[handIndex]) ? _three.trackersLeft[handIndex] : _three.trackersRight[handIndex];
    if (trackerHidden){
      trackerHidden.visible = false;
    }
  
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


  // compute the left handed object by inverting X
  // we could just invert X scale but then the handyness of the transform would be inverted
  // and it would trigger culling and lighting error  
  function inverse_ObjectRecursive(threeObject){
    threeObject.frustumCulled = false;
    threeObject.updateMatrixWorld(true);
    
    if (threeObject.isMesh){
      // compute matrix to apply to the geometry, K
      const M = threeObject.matrixWorld;
      const invXMatrix = new Matrix4().makeScale(-1, 1, 1);
      const K = M.clone().invert().multiply(invXMatrix).multiply(M);

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


  function extract_occluder(threeObj){
    if (_three.occluderMat === null){
      _three.occluderMat = new ShaderMaterial({
        vertexShader: ShaderLib.basic.vertexShader,
        fragmentShader: "precision lowp float;\n void main(void){\n gl_FragColor = vec4(1., 0., 0., 1.);\n }",
        uniforms: ShaderLib.basic.uniforms,
        side: DoubleSide,
        colorWrite: false,
        depthWrite: true
      });
    }

    threeObj.traverse(function(threeStuff){
      if (!threeStuff.isMesh) return;
      //threeStuff.userData.isOccluder = true;
      threeStuff.material = _three.occluderMat.clone();
    });
    
    threeObj.renderOrder = -1e12; // render first
    unlink_object(threeObj);
    return threeObj;
  }


  function extract_threeSoftOccluder(threeMesh, radius, dr, isDebug){
    if (!isDebug){     
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

      threeMesh.material = new ShaderMaterial({
        vertexShader: vertexShaderSource,
        fragmentShader: "precision mediump float;\n\
          uniform float dr, radius;\n\
          varying float vRadius;\n\
          void main(void){\n\
            float alpha = smoothstep(radius, radius-dr, vRadius);\n\
            gl_FragColor = vec4(1., 1., 1., alpha);\n\
            //gl_FragColor = vec4(1., 0., 0., 1.);\n\
          }",
        uniforms: {
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
        blending: CustomBlending,
        blendSrc: ZeroFactor,
        blendDst: OneMinusSrcAlphaFactor,
        colorWrite: true
      });      
    }

   
    threeMesh.renderOrder = 1e12; // render last for good transparency compositing
    threeMesh.material.side = BackSide;
    threeMesh.userData.isOccluder = true;

    unlink_object(threeMesh);
    return threeMesh;
  } //end set_threeSoftoccluder()


  function unlink_object(threeObj){
    threeObj.parent.remove(threeObj);
  }


  function add_threeObject(threeObject){
    const add_threeObjectToParent = function(threeParents, threeChild){
      for (let i = 0; i < _spec.maxHandsDetected; ++i){
        if (i >= threeParents.length) break;
        const threeChildCopy = threeChild.clone();
        threeParents[i].add(threeChildCopy);
      }
    }

    add_threeObjectToParent(_three.trackersRight, threeObject);

    if (!_spec.enableFlipObject){
      return;
    }

    const threeObjectLeft = inverse_ObjectRecursive(threeObject);

    // add objects to trackers:
    add_threeObjectToParent(_three.trackersLeft, threeObjectLeft);  
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
      stabilizers.push(_landmarksStabilizerModule.instance(landmarksStabilizerSpec));
    }
    return stabilizers;
  }


  // public methods:
  const that = {
    init: function(spec, stabilizerModule){
      _spec = Object.assign({}, _defaultSpec, spec);
      _landmarksStabilizerModule = stabilizerModule || WebARRocksLMStabilizer;

      Object.assign(_previousSizing, {
        width: -1, height: -1
      });
      Object.assign(_three, {
        occluderMat: null,
        camera: null,
        trackersParent: null,        
        trackersRight: null,
        trackersLeft: null
      });
      
      // init landmarks stabilizers:
      _neuralNetworkIndices = [];
      for (let i = 0; i < _spec.maxHandsDetected; ++i) {
        _neuralNetworkIndices.push(-1);
      }

      _poseFilters = init_poseFilters(_spec.poseFilter);
      _landmarksStabilizers = init_landmarksStabilizers(_spec.landmarksStabilizerSpec, _landmarksStabilizerModule);

      return new Promise(function(accept, reject){
        WEBARROCKSHAND.init({
          freeZRot: _spec.freeZRot,
          canvas: _spec.handTrackerCanvas,
          NNs: _spec.NNs,
          scanSettings: Object.assign({}, _spec.scanSettings, {
            //nDetectsPerLoop: 1,
            threshold: _spec.threshold
          }),
          maxHandsDetected: _spec.maxHandsDetected,
          videoSettings: {
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
            init_poseEstimation();
            if (_spec.debugDisplayLandmarks){
              init_debugDisplayLandmarks();
            }
            
            accept(Object.assign({}, _three));
          },
          callbackTrack: callbackTrack
        }); //end WEBARROCKSHAND.init
      }); //end returned promise
    }, // end init()


    update: function(specUpdated){
      if (!_spec) return Promise.reject();

      // spec keys that can be updated: poseLandmarksLabels, poseFilter, NNsPaths, threshold
      Object.assign(_spec, specUpdated);
      
      return WEBARROCKSHAND.update({
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
      WEBARROCKSHAND.resize();
    },


    get_sourceWidth: function(){
      return _videoElement.videoWidth;
    },


    get_sourceHeight: function(){
      return _videoElement.videoHeight;
    },


    get_viewWidth: function(){
      return _spec.handTrackerCanvas.width;
    },


    get_viewHeight: function(){
      return _spec.handTrackerCanvas.height;
    },


    set_handRightFollower: function(threeObjectParent0, threeObject0){
      that.clean();

      _three.superParent = threeObjectParent0.parent || _three.superParent;
      const childIndex = threeObjectParent0.children.indexOf(threeObject0);
      _three.superParent.remove(threeObjectParent0);

      _three.trackersParent = [];
      _three.trackersRight = [];
      _three.trackersLeft = [];

      for (let i = 0; i<_spec.maxHandsDetected; ++i){
        // test if contains skinned mesh to see if we can easily clone it or not:
        let isContainsSkinnedMesh = false;
        threeObjectParent0.traverse(function(threeStuff){
          isContainsSkinnedMesh = isContainsSkinnedMesh || threeStuff.isSkinnedMesh;
        });
        if (_spec.maxHandsDetected > 1 && isContainsSkinnedMesh){
          throw new Error('Multihands is not supported by the helper with skinned mesh.');
        }
        //isContainsSkinnedMesh = isContainsSkinnedMesh || (i===0);
        const threeObjectParent = (isContainsSkinnedMesh || !_spec.enableFlipObject) ? threeObjectParent0 : threeObjectParent0.clone();
        
        const threeObject = threeObjectParent.children[childIndex];
        _three.superParent.add(threeObjectParent);

        threeObjectParent.frustumCulled = false;
        threeObjectParent.matrixAutoUpdate = false;
        _three.trackersParent[i] = threeObjectParent;
        _three.trackersRight[i] = threeObject;

        // extract occluders and unlink them:
        const occluders = [];
        const softOccluders = [];
        threeObject.traverse(function(threeStuff){
          if (!threeStuff.userData) return;
          const ud = threeStuff.userData;
          if (ud.isSoftOccluder){
            const softOccluder = extract_threeSoftOccluder(threeStuff, ud.softOccluderRadius, ud.softOccluderDr, false);
            softOccluders.push(softOccluder);
          } else if (ud.isOccluder) {
            const occluder = extract_occluder(threeStuff);
            occluders.push(occluder);
          }
        });

        if (_poseFilters[i]){
          _poseFilters[i].reset();
        }

        if (_spec.enableFlipObject) {
          const trackersLeft = inverse_ObjectRecursive(threeObject);
          _three.trackersLeft[i] = trackersLeft;
          _three.trackersParent[i].add(trackersLeft);
        }

        // re-add occluders:
        occluders.forEach(add_threeObject);
        softOccluders.forEach(add_threeObject);

      } // end loop on detected hands
    },


    update_threeCamera: function(sizing, threeCamera){
      if (!_videoElement) return;

      if (_previousSizing.width === sizing.width && _previousSizing.height === sizing.height){       
        return; // nothing changed
      }
      Object.assign(_previousSizing, sizing); 

      // reset camera position:
      if (threeCamera.matrixAutoUpdate){
        threeCamera.far = 1000;
        threeCamera.near = 0.1;
        threeCamera.matrixAutoUpdate = false;
        threeCamera.position.set(0, 0, 0);
        threeCamera.updateMatrix();
        _three.camera = threeCamera;
      }

      // compute aspectRatio:
      const cvw = sizing.width;
      const cvh = sizing.height;
      const canvasAspectRatio = cvw / cvh;

      // compute vertical field of view:
      const vw = that.get_sourceWidth();
      const vh = that.get_sourceHeight();
      const videoAspectRatio = vw / vh;
      let fovFactor = (vh > vw) ? (1.0 / videoAspectRatio) : 1.0;
      let fov = _spec.cameraMinVideoDimFov * fovFactor;
      fov = Math.min(Math.max(fov, _spec.cameraFovRange[0]), _spec.cameraFovRange[1]);
      
      if (canvasAspectRatio > videoAspectRatio) {
        const scale = cvw / vw;
        const cvhs = vh * scale;
        fov = 2 * Math.atan( (cvh / cvhs) * Math.tan(0.5 * fov * _deg2rad)) / _deg2rad;
      }
      console.log('INFO in update_threeCamera(): camera vertical estimated FoV is', fov, 'deg');

      // update projection matrix:
      threeCamera.aspect = canvasAspectRatio;
      threeCamera.zoom = _spec.cameraZoom;
      threeCamera.fov = fov;
      threeCamera.updateProjectionMatrix();

      // update focals
      update_focals(sizing.height, fov);
    },


    clear_threeObjects: function(clearOccluders){
      if (!_spec) return;

      const clear_threeObject = function(threeObject){
        for (let i=threeObject.children.length-1; i>=0; --i){
          const child = threeObject.children[i];
          if (clearOccluders || !child.userData.isOccluder){
            threeObject.remove(threeObject.children[i]);
          }
        }
      }

      for (let i=0; i<_spec.maxHandsDetected; ++i){
        if (_three.trackersRight && _three.trackersRight[i]) {
          clear_threeObject(_three.trackersRight[i]);
        }
        if (_three.trackersLeft && _three.trackersLeft[i]){
          clear_threeObject(_three.trackersLeft[i]);
        }
      }
    },


    clean: function(){
      if (!_spec) return;
      if (_three.superParent && _three.trackersParent){
        _three.trackersParent.forEach(function(trackerParent){
          if (trackerParent){
            _three.superParent.remove(trackerParent);
          }
        });        
      }      
    },


    update_videoSettings: function(videoSettings){
      return WEBARROCKSHAND.update_videoSettings(videoSettings);
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


export default HandTrackerThreeHelper;