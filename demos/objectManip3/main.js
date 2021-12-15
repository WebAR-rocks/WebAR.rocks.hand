const _settings = {
  NN: '../../neuralNets/NN_OBJMANIP_7.json',
  threshold: 0.9, // detection sensitivity, between 0 and 1

  modelURL: 'assets/ghost.glb',
  animationSpeedFactor: 2,

  // to get this parameters, open /dev/models3D/handWithPlaceholders.blend
  // and look the pose of CubePalm mesh:
  scale: 0.6, 
  translation: [0, -9, -1.68],
  euler: [Math.PI/2 + Math.PI/4, 0, 0, "XYZ"], // X,Y,Z,W

  // blob shadow:
  blobShadowSize: 16,
  blobShadowRadiusStart: 0.2, // between 0 (shadow gradient start at center of shadow) and 1
  blobShadowAlphaMax: 0.6,
  blobShadowColor: 0x8888ff,
  blobShadowRotX: Math.PI/8,
  blobShadowOffset: [0,0,4],
  blobShadowAdditiveBlending: true,

  // hologram effect:
  hologramColor: 0x5588ff,
  hologramAlpha: 0.5,

  // debug flags:
  debugCube: false, // Add a cube
  debugDisplayLandmarks: false
};


const _three = {
  renderer: null,
  loadingManager: null,
  tracker: null,
  poppingObject: null,
  blobShadowUniforms: null,
  hologramAlphaDst: null,
  hologramUniforms: null
}

const _states = {
  notLoaded: -1,
  loading: 0,
  running: 1,
  busy: 2
};
let _state = _states.notLoaded;

const _poppingStates = {
  hidden: 0,
  popping: 1,
  visible: 2,
  unpopping: 3
};
let _poppingState = _poppingStates.hidden;

let _isSelfieCam = false;
let _animationMixer = null, _clock = null;
let _isInstructionsHidden = false;

function is_mobileOrTablet(){
  let check = false;
  // from https://stackoverflow.com/questions/3514784/what-is-the-best-way-to-detect-a-mobile-device
  if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|ipad|iris|kindle|Android|Silk|lge |maemo|midp|mmp|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(navigator.userAgent) 
      || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(navigator.userAgent.substr(0,4))) { 
      check = true;
  }
  return check;
}


function setFullScreen(cv){
  const dpr = window.devicePixelRatio || 1;
  cv.width = window.innerWidth * dpr;
  cv.height = window.innerHeight * dpr;
}


// entry point:
function main(){
  _state = _states.loading;

  const handTrackerCanvas = document.getElementById('handTrackerCanvas');
  const VTOCanvas = document.getElementById('ARCanvas');

  setFullScreen(handTrackerCanvas);
  setFullScreen(VTOCanvas);

  HandTrackerThreeHelper.init({
    poseLandmarksLabels: [
      'palmBaseThumb', 'palmSideIndex', 'palmIndexMiddle', 'palmMiddleRing', 'palmRingPinky', 'palmSidePinky',
      'palmWrist', 'palmMiddle', 'palmSide',
      'backMiddle', 'backWrist', 'backTop'//*/
      
      /*'backMiddle','palmBaseThumb', 'palmSideIndex', 'palmMiddleRing', 'palmRingPinky', 'palmSidePinky',
      'palmMiddle', 'palmSide',
      'backTop' //*/

      /*'palmBaseThumb', 'palmSideIndex', 'palmIndexMiddle', 'palmMiddleRing', 'palmRingPinky', 'palmSidePinky',
      'palmWrist' //*/
      /*'backWrist', 'palmSideIndex', 'palmMiddleRing', 'palmSidePinky',
      'backMiddle', 'backTop' //*/
    ],
    cameraZoom: 1,
    cameraFovRange: [30, 60],
    objectPositionTweaker: function(pos, label){
      pos[0] *= 0.85;
      pos[1] *= 0.95;
      //pos[2] *= 1.05;
    },

    GLSLTweakVideoColor: 'color = color * 0.9;', // dim a bit video brighness

    hideTrackerIfDetectionLost: false,
    poseFilter: PoseFlipFilter.instance({}),
    threshold: _settings.threshold,
    VTOCanvas: VTOCanvas,
    handTrackerCanvas: handTrackerCanvas,
    debugDisplayLandmarks: _settings.debugDisplayLandmarks,
    NNsPaths: [ _settings.NN ],
    callbackTrack: callbackTrack,
    enableFlipObject: false,
    stabilizationSettings: {
      NNSwitchMask: {
        isRightHand: false
      }
    }
  }).then(start).catch(function(errCode){
    alert('An init error happens. code = ' + errCode);
  });
} 


function callbackTrack(detectState){
  if (detectState.isDetected) {
    if (!_isInstructionsHidden){
      hide_instructions();
    }
    trigger_poppingEffect();
  } else {
    trigger_unpoppingEffect();
  }

  TWEEN.update();
  if (_animationMixer){
    _animationMixer.update(_clock.getDelta() * _settings.animationSpeedFactor);
  }
}


function start(three){
  // pause handtracker until 3D assets are not loaded
  WEBARROCKSHAND.toggle_pause(true);

  if (!is_mobileOrTablet()){
    // for desktop computer, hide Flip camera button and mirror canvas:
    document.getElementById('flipButton').style.display = 'none';
    mirror_canvases(true);
  }

  // set tonemapping:
  three.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  three.renderer.outputEncoding = THREE.sRGBEncoding;
  _three.renderer = three.renderer;

  // set lighting:
  //const hemiLight = new THREE.HemisphereLight( 0x000000, 0xffffff, 1 );
  //three.scene.add(hemiLight);
  const dirLight = new THREE.DirectionalLight(0x8888ff, 0.5);
  dirLight.position.set(0,-100, 0);
  three.scene.add(dirLight);

  const dirLight2 = new THREE.DirectionalLight(0xffcc99, 0.3);
  dirLight2.position.set(0, 0, 100);
  three.scene.add(dirLight2);

  // init the tracker, i.e. the object stuck at the palm of the hand:
  _three.tracker = new THREE.Object3D();
  
  // add a debug cube:
  if (_settings.debugCube){
    const s = 2;
    const cubeGeom = new THREE.BoxGeometry(s,s,s);
    // Move origin from center of the cube to the center of the Y = -1 face:
    const cubeMoveMatrix = new THREE.Matrix4().makeTranslation(0, 1, 0);
    cubeGeom.applyMatrix(cubeMoveMatrix);
    _three.tracker.add(
      new THREE.Mesh(cubeGeom,
      new THREE.MeshNormalMaterial())
    );
  }

  // load the ghost 3D model:
  new THREE.GLTFLoader(three.loadingManager).load(_settings.modelURL, function(gltf){
    const animatedObjectContainer = new THREE.Object3D();
    const animatedObject = gltf.scene;
    animatedObjectContainer.add(animatedObject);
    set_poppingObject(animatedObjectContainer);

    // tweak materials:
    animatedObject.traverse(function(threeStuff){
      if (!threeStuff.isMesh){
        return;
      }
      const mat = threeStuff.material;
      mat.side = THREE.FrontSide;
    });

    // add to the tracker:
    HandTrackerThreeHelper.add_threeObject(_three.tracker);

    // animate:
    const animationClip = gltf.animations[0];
    _animationMixer = new THREE.AnimationMixer(animatedObject);
    _clock = new THREE.Clock();
    const animationAction = _animationMixer.clipAction( animationClip );
    animationAction.play();
  });

  // tweak position, and rotation:
  const d = _settings.translation;
  const displacement = new THREE.Vector3(d[0], d[2], -d[1]); // inverse Y and Z
  _three.tracker.position.add(displacement);
  const euler = new THREE.Euler().fromArray(_settings.euler);
  _three.tracker.quaternion.setFromEuler(euler);

  three.loadingManager.onLoad = function(){
    console.log('INFO in main.js: Everything is loaded');
    hide_loading();
    WEBARROCKSHAND.toggle_pause(false);
    _state = _states.running;
  }
} //end start()


function set_poppingObject(obj){
  _three.poppingObject = obj;
  _three.poppingObject.visible = true;
  _three.tracker.add(_three.poppingObject); 

  setup_hologramEffect();
  create_blobShadow();
}


function setup_hologramEffect(){
  const hologramMats = [];
  const hologramUniforms = {
    hologramColor: {
      value: new THREE.Color(_settings.hologramColor)
    },
    hologramAlphaSrc: {
      value: 0
    },
    hologramTransitionColorCoeff: {
      value: 0
    }
  };
  const hologramAlphaDst = {
    value: 1
  };

  _three.poppingObject.traverse(function(threeStuff){
    if (!threeStuff.isMesh) return;
    const mat = threeStuff.material;
    if (hologramMats.indexOf(mat) !== -1) return;

    // tweak material to change output color and opacity
    mat.transparent = true;
    mat.side = THREE.DoubleSide;

    const gl = _three.renderer.getContext();
    threeStuff.onBeforeRender = function(){
      gl.blendFunc(gl.SRC_ALPHA, gl.CONSTANT_ALPHA);
      gl.blendColor(0,0,0,hologramAlphaDst.value);
    }

    mat.onBeforeCompile = function(shaders){
      let fragmentShaderSource = shaders.fragmentShader;

      const GLSLTweakOutputPars = '\n\
        uniform vec3 hologramColor;\n\
        uniform float hologramTransitionColorCoeff, hologramAlphaSrc;\n\
      \n';
      const GLSLTweakOutput = '\n\
        float hologramLighting = max(0.0, normal.z);\n\
        vec3 hologramMixedColor = mix(hologramColor * hologramLighting, gl_FragColor.rgb, hologramTransitionColorCoeff);\n\
        gl_FragColor = vec4(hologramMixedColor, hologramAlphaSrc);\n\
      \n';

      // insert GLSL code:
      const fragmentShaderSourceArr = fragmentShaderSource.split('\n');
      fragmentShaderSourceArr.unshift(GLSLTweakOutputPars);
      fragmentShaderSourceArr.pop(); // remove last }
      fragmentShaderSourceArr.push(GLSLTweakOutput, '}');
      fragmentShaderSource = fragmentShaderSourceArr.join('\n');

      // apply tweak:
      shaders.fragmentShader = fragmentShaderSource;
      Object.assign(shaders.uniforms, hologramUniforms);
    }

    hologramMats.push(mat);
  });

  _three.hologramUniforms = hologramUniforms;
  _three.hologramAlphaDst = hologramAlphaDst;
}


function trigger_poppingEffect(){
  if (_poppingState === _poppingStates.popping
    || _poppingState === _poppingStates.visible
    || !_three.poppingObject){
    return;
  }
  _poppingState = _poppingStates.popping;

  // stop current transitions:
  TWEEN.removeAll();
  
  _three.poppingObject.visible = true;

  // increase scale:
  const scaleEnd = _settings.scale;
  const scaleBegin = (_three.poppingObject.scale.x === _settings.scale) ? 0.01 : _three.poppingObject.scale.x;
  _three.poppingObject.scale.set(scaleBegin, scaleBegin, scaleBegin);
  const tweenScale = new TWEEN.Tween(_three.poppingObject.scale)
    .to({ 
      x: scaleEnd,
      y: scaleEnd,
      z: scaleEnd
     }, 1000)
    .easing(TWEEN.Easing.Back.Out);

  // hologram effects:
  const hologramUniforms = _three.hologramUniforms;
  const blobShadowUniforms = _three.blobShadowUniforms;
  const hologramAlphaDst = _three.hologramAlphaDst;
  
  // hologram opacity:
  const opacityDuration = 800;
  const tweenHologramAppear = new TWEEN.Tween(hologramUniforms.hologramAlphaSrc)
    .to({
      value: _settings.hologramAlpha
    }, opacityDuration).easing(TWEEN.Easing.Quadratic.Out);

  // shadow opacity:
  const tweenShadowAppear = new TWEEN.Tween(blobShadowUniforms.blobShadowAlphaMax)
    .to({
      value: _settings.blobShadowAlphaMax
    }, opacityDuration).easing(TWEEN.Easing.Quadratic.Out);

  // hologram color change:
  const colorDuration = 1000;
  const colorDelay = 1000;
  const tweenRealColors = new TWEEN.Tween(hologramUniforms.hologramTransitionColorCoeff)
    .delay(colorDelay)
    .to({
      value: 1
    }, colorDuration).easing(TWEEN.Easing.Quadratic.Out);

  // hologram fully opaque:
  const tweenHologramOpaque = new TWEEN.Tween(hologramUniforms.hologramAlphaSrc)
    .delay(colorDelay)
    .to({
      value: 1
    }, colorDuration).easing(TWEEN.Easing.Quadratic.Out);

  // hologram blend type change:
  const tweenBlendType = new TWEEN.Tween(hologramAlphaDst)
    .delay(colorDelay)
    .to({
      value: 0
    }, colorDuration).easing(TWEEN.Easing.Quadratic.Out);

  // shadow color change:
  blobShadowUniforms.blobShadowColor.value.setHex(_settings.hologramColor);
  const blobShadowColor = new THREE.Color(_settings.blobShadowColor);
  const tweenShadowColor = new TWEEN.Tween(blobShadowUniforms.blobShadowColor.value)
    .delay(colorDelay)
    .to(blobShadowColor, colorDuration).easing(TWEEN.Easing.Cubic.Out);

  tweenRealColors.onComplete(function(){
    _poppingState = _poppingStates.visible;
  });

  // coordinate and start tweens:
  tweenHologramAppear.onComplete(function(){
    tweenRealColors.start();
    tweenHologramOpaque.start();
    tweenShadowColor.start();
    tweenBlendType.start();
  });
  tweenScale.start();
  tweenHologramAppear.start();
  tweenShadowAppear.start();
}


function trigger_unpoppingEffect(){
  if (_poppingState === _poppingStates.unpopping
    || _poppingState === _poppingStates.hidden
    || !_three.poppingObject){
    return;
  }
  _poppingState = _poppingStates.unpopping;

  // stop current transitions:
  TWEEN.removeAll();

  const hologramUniforms = _three.hologramUniforms;
  const hologramAlphaDst = _three.hologramAlphaDst;
  const blobShadowUniforms = _three.blobShadowUniforms;
  
  const duration = 500;
  const tweenHologramDisappear = new TWEEN.Tween(hologramUniforms.hologramAlphaSrc)
    .to({
      value: 0
    }, duration).easing(TWEEN.Easing.Quadratic.In);


  const tweenHologramColors = new TWEEN.Tween(hologramUniforms.hologramTransitionColorCoeff)
    .to({
      value: 0
    }, duration/2).easing(TWEEN.Easing.Quadratic.In);

  const tweenBlendType = new TWEEN.Tween(hologramAlphaDst)
    .to({
      value: 1
    }, duration).easing(TWEEN.Easing.Quadratic.In);

  const tweenShadowDisappear = new TWEEN.Tween(blobShadowUniforms.blobShadowAlphaMax)
    .to({
      value: 0
    }, duration).easing(TWEEN.Easing.Quadratic.In);

  // coordinate and start tweens:
  tweenHologramDisappear.start();
  tweenHologramColors.start();
  tweenBlendType.start();
  tweenShadowDisappear.start();
  
  tweenHologramDisappear.onComplete(function(){
    _poppingState = _poppingStates.hidden;
    _three.poppingObject.visible = false;
  })
}


function create_blobShadow(){
  const vertexShaderSource = 'precision lowp float;\n\
    varying vec3 vPos;\n\
    void main(void){\n\
      vec3 transformed = vec3( position );\n\
      vec4 mvPosition = vec4( transformed, 1.0 );\n\
      mvPosition = modelViewMatrix * mvPosition;\n\
      gl_Position = projectionMatrix * mvPosition;\n\
      vPos = position;\n\
    }';
  const fragmentShaderSource = 'precision lowp float;\n\
    varying vec3 vPos;\n\
    uniform vec3 blobShadowColor;\n\
    uniform vec2 blobShadowRadiusRange;\n\
    uniform float blobShadowAlphaMax;\n\
    void main(void){\n\
      float radius = length(vPos);\n\
      float alpha = blobShadowAlphaMax * smoothstep(blobShadowRadiusRange.y, blobShadowRadiusRange.x, radius);\n\
      gl_FragColor = vec4(blobShadowColor, alpha);\n\
      //gl_FragColor = vec4(1., 0., 0., 1.);\n\
    }';
  const blobShadowUniforms = {
    blobShadowRadiusRange: {
      value: new THREE.Vector2(_settings.blobShadowRadiusStart, 1).multiplyScalar(_settings.blobShadowSize * 0.5)
    },
    blobShadowColor: {
      value: new THREE.Color()
    },
    blobShadowAlphaMax: {
      value: 0
    }
  };
  const blobShadowMat = new THREE.ShaderMaterial({
    transparent: true,
    lights: false,
    uniforms: blobShadowUniforms,
    vertexShader: vertexShaderSource,
    fragmentShader: fragmentShaderSource,
    blending: (_settings.blobShadowAdditiveBlending) ? THREE.AdditiveBlending : THREE.NormalBlending
  });

  const blobShadowMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(_settings.blobShadowSize, _settings.blobShadowSize),
    blobShadowMat);
  blobShadowMesh.rotateX(-Math.PI/2 + _settings.blobShadowRotX);
  blobShadowMesh.position.fromArray(_settings.blobShadowOffset);
  _three.blobShadowUniforms = blobShadowUniforms;
  _three.poppingObject.add(blobShadowMesh);
}


function hide_loading(){
  // remove loading:
  const domLoading = document.getElementById('loading');
  domLoading.style.opacity = 0;
  setTimeout(function(){
    domLoading.parentNode.removeChild(domLoading);
  }, 800);
}


function mirror_canvases(isMirror){
  document.getElementById('canvases').style.transform = (isMirror) ? 'rotateY(180deg)' : '';
}


function flip_camera(){
  if (_state !== _states.running){
    return;
  }
  _state = _states.busy;
  WEBARROCKSHAND.update_videoSettings({
    facingMode: (_isSelfieCam) ? 'environment' : 'user'
  }).then(function(){
    _isSelfieCam = !_isSelfieCam;
    _state = _states.running;
    // mirror canvas using CSS in selfie cam mode:
    mirror_canvases(_isSelfieCam);
    console.log('INFO in main.js: Camera flipped successfully');
  }).catch(function(err){
    console.log('ERROR in main.js: Cannot flip camera -', err);
  });
}


function hide_instructions(){
  const domInstructions = document.getElementById('instructions');
  domInstructions.style.opacity = 0;
  _isInstructionsHidden = true;
  setTimeout(function(){
    domInstructions.parentNode.removeChild(domInstructions);
  }, 800);
  document.getElementById('flipButton').style.display = 'block';
}


window.addEventListener('load', main);