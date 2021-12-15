const _settings = {
  NN: '../../neuralNets/NN_OBJMANIP_7.json',
  threshold: 0.9, // detection sensitivity, between 0 and 1

  model3DFullPath: 'assets/velociraptor.glb',
  model3DLoadingPath: 'assets/velociraptorLoading.glb',

  // loading mesh rendering:
  loadingAlpha: 0.5,
  loadingScale: 1.5,
  loadingRotationDuration: 3000, // in ms
  loadingBlinksCountPerRotation: 3,

  // to get this parameters, open /dev/models3D/handWithPlaceholders.blend
  // and look the pose of CubePalm mesh:
  scale: 2.2, 
  translation: [0, -9, -1.68],
  quaternion: [0.978, 0, 0, 0.207], // X,Y,Z,W

  // blob shadow:
  blobShadowSize: 3,
  blobShadowRadiusStart: 0.3, // between 0 (shadow gradient start at center of shadow) and 1
  blobShadowAlphaMax: 0.6,

  // hologram effect:
  hologramColor: 0x33bbff,
  hologramAlpha: 0.5,

  manualToHandTransitionDuration: 500, // in ms

  // debug flags:
  debugDisplayLandmarks: false
};


const _defaultThree = {
  renderer: null,
  scene: null,
  camera: null,
  loadingManager: null,
  tracker: null,
  containerObjectControls: null,
  fullObject: null,
  loadingObject: null,
  blobShadowUniforms: null,
  hologramAlphaDst: null,
  hologramUniforms: null,
  loadingMaterial: null
}
const _three = Object.assign({}, _defaultThree);

const _renderingStates = {
  hidden: 0,
  hiddenToLoadingToHidden: 1,
  full: 4,
  hiddenToFull: 5
}
const _controlsStates = {
  none: 0,
  hand: 1,
  handToManual: 2,
  manual: 3,
  manualToHand: 4
}
const _appStates = {
  notLoaded: -1,
  loading: 0,
  running: 1,
  busy: 2
}
const _defaultState = {
  app: _appStates.notLoaded,
  rendering: _renderingStates.hidden,
  controls: _controlsStates.none
}
const _state = Object.assign({}, _defaultState);


let _isSelfieCam = false;
let _animationMixer = null, _clock = null;
let _isInstructionsHidden = false;
let _previousIsDetected = false;


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


function is_renderingTransitionState(){
  return _state.rendering === _renderingStates.hiddenToLoading
    || _state.rendering === _renderingStates.hiddenToFull;
}


// entry point:
function main(){
  _state.app = _appStates.loading;

  const handTrackerCanvas = document.getElementById('handTrackerCanvas');
  const VTOCanvas = document.getElementById('ARCanvas');

  setFullScreen(handTrackerCanvas);
  setFullScreen(VTOCanvas);

  HandTrackerThreeHelper.init({
    poseLandmarksLabels: [
      'palmBaseThumb', 'palmSideIndex', 'palmIndexMiddle', 'palmMiddleRing', 'palmRingPinky', 'palmSidePinky',
      'palmWrist', 'palmMiddle', 'palmSide',
      'backMiddle', 'backWrist', 'backTop'
    ],
    cameraZoom: 1,
    cameraFovRange: [30, 60],
    objectPositionTweaker: function(pos, label){
      pos[0] *= 0.85;
      pos[1] *= 0.95;
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


function set_controlsFromManualToHand(){
  _state.controls = _controlsStates.manualToHand;
  WebARRocksHandThreeControls.to_hand().then(function(){
    _state.controls = _controlsStates.hand;
  });
}


function set_controlsFromHandToManual(){
  _state.controls = _controlsStates.handToManual;
  WebARRocksHandThreeControls.to_manual().then(function(){
    _state.controls = _controlsStates.manual;
  });
}


function init_controls(){
  // create controls:
  WebARRocksHandThreeControls.init({
    isEnabled: true,
    domElement: _three.renderer.domElement,
    threeCamera: _three.camera,
    mode0: (_state.controls === _controlsStates.manual) ? 'manual' : 'hand',
    isMirrorX: _isSelfieCam,
    transitionDuration: _settings.manualToHandTransitionDuration
  });
  WebARRocksHandThreeControls.attach(_three.containerObjectControls, _three.tracker.parent.parent.matrix);  
}


function callbackTrack(detectState){
  if (detectState.isDetected) {
    if (!_isInstructionsHidden){
      hide_DOMInstructions();
    }
    if (_state.rendering === _renderingStates.hidden){
      if (_three.fullObject) {
        trigger_poppingFullEffect();
      } else if (_three.loadingObject){
        trigger_poppingLoadingEffect();
      }
    } else if (_state.rendering === _renderingStates.full){
      if (_state.controls === _controlsStates.manual){
        set_controlsFromManualToHand();
      } else if (_state.controls === _controlsStates.none){
        _state.controls = _controlsStates.hand;
        init_controls();
      }
    }
  } else if (_state.rendering === _renderingStates.full){ // hand is not detected
    if (_state.controls === _controlsStates.none){
      _state.controls = _controlsStates.manual;
      init_controls();
    } else if (_state.controls === _controlsStates.hand){
      set_controlsFromHandToManual();
    }    
  }

  WebARRocksHandThreeControls.tick();
  TWEEN.update();

  if (_animationMixer){ // 3D mesh animation:
    _animationMixer.update(_clock.getDelta() * 0.5);
  }

  _previousIsDetected = detectState.isDetected;
}


function set_trackerPose(){
  // tweak position, scale and rotation:
  _three.tracker.scale.multiplyScalar(_settings.scale);
  const d = _settings.translation;
  const displacement = new THREE.Vector3(d[0], d[2], -d[1]); // inverse Y and Z
  _three.tracker.position.add(displacement);
  const q = _settings.quaternion;
  _three.tracker.quaternion.set(q[0], q[2], -q[1], q[3]);
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
  _three.scene = three.scene;
  _three.camera = three.camera;

  // set lighting:
  const hemiLight = new THREE.HemisphereLight( 0xffffbb, 0x080820, 2 );
  three.scene.add(hemiLight);

  // init the tracker, i.e. the object stuck at the palm of the hand:
  _three.tracker = new THREE.Object3D();
  _three.containerObjectControls = new THREE.Object3D();
  _three.tracker.add(_three.containerObjectControls);
  _clock = new THREE.Clock();

  // load the velociraptor loading 3D model:
  new THREE.GLTFLoader(three.loadingManager).load(_settings.model3DLoadingPath, function(gltf){
    if (_three.fullObject){
      return;
    }
    const loadingObjectContainer = gltf.scene.children[0];
    _three.loadingObject = loadingObjectContainer;
    loadingObjectContainer.scale.multiplyScalar(_settings.loadingScale);
    set_loadingMaterial(loadingObjectContainer);
    _three.containerObjectControls.add(loadingObjectContainer);
  });
  
  // load the velociraptor full 3D model:
  new THREE.GLTFLoader().load(_settings.model3DFullPath, function(gltf){
    const animatedObjectContainer = new THREE.Object3D();
    const animatedObject = gltf.scene;
    animatedObjectContainer.add(animatedObject);
    _three.fullObject = animatedObjectContainer;
    set_hologramMaterials(_three.fullObject);
    create_blobShadow();
    _three.containerObjectControls.add(animatedObjectContainer);
    
    // animate:
    const animationClip = gltf.animations[0];
    _animationMixer = new THREE.AnimationMixer(animatedObject);
    const animationAction = _animationMixer.clipAction( animationClip );
    animationAction.play();
  });

  set_trackerPose();
  
  three.loadingManager.onLoad = function(){
    console.log('INFO in main.js: Start hand tracking');
    hide_DOMLoading();

    HandTrackerThreeHelper.add_threeObject(_three.tracker);

    WEBARROCKSHAND.toggle_pause(false);
    _state.app = _appStates.running;
  }
} //end start()


function set_loadingMaterial(obj){
  const vertexShaderSource = '\n\
    varying vec3 vViewNormal;\n\
    void main() {\n\
      #include <beginnormal_vertex>\n\
      vViewNormal = ( modelViewMatrix * vec4(objectNormal, 0.) ).xyz;\n\
      // vertex projection and morphing:\n\
      #include <begin_vertex>\n\
      #include <project_vertex>\n\
    }';

  const fragmentShaderSource = '\n\
    uniform float alpha;\n\
    uniform vec3 hologramColor;\n\
    varying vec3 vViewNormal;\n\
    void main(){\n\
      float viewNormalZ = normalize(vViewNormal).z;\n\
      float hologramLighting = max(0.0, viewNormalZ);\n\
      gl_FragColor = vec4(hologramColor * hologramLighting, alpha * min(1., hologramLighting) );\n\
    }';

  const uniforms = {
    hologramColor: {
      value: new THREE.Color(_settings.hologramColor)
    },
    alpha: {
      value: 0
    }
  };

  const loadingMat = new THREE.ShaderMaterial({
    vertexShader: vertexShaderSource,
    fragmentShader: fragmentShaderSource,
    uniforms: uniforms,
    transparent: true,
    lights: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  _three.loadingMaterial = loadingMat;

  obj.traverse(function(threeStuff){
    if (threeStuff.isMesh){
      threeStuff.geometry.computeVertexNormals();
      threeStuff.material = loadingMat;
    }
  });
}


function set_hologramBlendingMode(obj){
  obj.onBeforeRender = function(){
    const gl = _three.renderer.getContext();
    gl.blendFunc(gl.SRC_ALPHA, gl.CONSTANT_ALPHA);
    gl.blendColor(0, 0, 0, _three.hologramAlphaDst.value);
  }
}


function set_hologramMaterials(obj){
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
  _three.hologramAlphaDst = {
    value: 1
  };

  obj.traverse(function(threeStuff){
    if (!threeStuff.isMesh) return;
    const mat = threeStuff.material;
    if (hologramMats.indexOf(mat) !== -1) return;

    // tweak material to change output color and opacity
    mat.transparent = true;
    mat.side = THREE.DoubleSide;
    
    const gl = _three.renderer.getContext();
    set_hologramBlendingMode(threeStuff);

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
}


function trigger_poppingLoadingEffect(){
  _state.rendering = _renderingStates.hiddenToLoadingToHidden;

  const obj3D = _three.loadingObject;
  obj3D.visible = true;

  const y0 = obj3D.rotation.y;
  const tweenRotation = new TWEEN.Tween(obj3D.rotation).to({
    y: y0 + 2 * Math.PI
  }, _settings.loadingRotationDuration).easing(function(t){
    // dirty hook:
    const alphaFactor = 0.5 - 0.5 * Math.cos(t * 2 * Math.PI * _settings.loadingBlinksCountPerRotation);
    _three.loadingMaterial.uniforms.alpha.value = _settings.loadingAlpha * alphaFactor;
    return t; // linear
  });
  
  tweenRotation.onComplete(function(){
    obj3D.rotation.y = y0;
    _state.rendering = _renderingStates.hidden;
    obj3D.visible = false;
  });
  tweenRotation.start();
}


function trigger_poppingFullEffect(){
  _state.rendering = _renderingStates.hiddenToFull;

  if (_three.loadingObject){
    _three.loadingObject.visible = false;
  }

  const obj3D = _three.fullObject;
  obj3D.visible = true;

  // increase scale:
  const scaleEnd = _settings.scale;
  const scaleBegin = (obj3D.scale.x === _settings.scale) ? 0.01 : obj3D.scale.x;
  obj3D.scale.set(scaleBegin, scaleBegin, scaleBegin);
  const tweenScale = new TWEEN.Tween(obj3D.scale)
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
  const tweenShadowColor = new TWEEN.Tween(blobShadowUniforms.blobShadowColor.value)
    .delay(colorDelay)
    .to({
      r: 0, g: 0, b:0
    }, colorDuration).easing(TWEEN.Easing.Cubic.Out);

  tweenRealColors.onComplete(function(){
    _state.rendering = _renderingStates.full;
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
    fragmentShader: fragmentShaderSource
  });

  const blobShadowMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(_settings.blobShadowSize, _settings.blobShadowSize),
    blobShadowMat);
  blobShadowMesh.rotateX(-Math.PI/2);
  _three.blobShadowUniforms = blobShadowUniforms;
  _three.fullObject.add(blobShadowMesh);
}


function hide_DOMLoading(){
  // remove loading:
  const domLoading = document.getElementById('loading');
  if (!domLoading){
    return;
  }
  domLoading.style.opacity = 0;
  setTimeout(function(){
    domLoading.parentNode.removeChild(domLoading);
  }, 800);
}


function mirror_canvases(isMirror){
  _isSelfieCam = isMirror;
  document.getElementById('canvases').style.transform = (isMirror) ? 'rotateY(180deg)' : '';
}


function flip_camera(){
  if (_state.app !== _appStates.running){
    return;
  }
  _state.app = _appStates.busy;
  WEBARROCKSHAND.update_videoSettings({
    facingMode: (_isSelfieCam) ? 'environment' : 'user'
  }).then(function(){
    _isSelfieCam = !_isSelfieCam;
    WebARRocksHandThreeControls.update({
      isMirrorX: _isSelfieCam
    });
    _state.app = _appStates.running;
    // mirror canvas using CSS in selfie cam mode:
    mirror_canvases(_isSelfieCam);
    console.log('INFO in main.js: Camera flipped successfully');
  }).catch(function(err){
    console.log('ERROR in main.js: Cannot flip camera -', err);
  });
}


function hide_DOMInstructions(){
  const domInstructions = document.getElementById('instructions');
  domInstructions.style.opacity = 0;
  _isInstructionsHidden = true;
  setTimeout(function(){
    if (!domInstructions.parentNode) {
      return;
    }
    domInstructions.parentNode.removeChild(domInstructions);
  }, 800);
  document.getElementById('flipButton').style.display = 'block';
}


function destroy(){
  return HandTrackerThreeHelper.destroy().then(function(){
    Object.assign(_state, _defaultState);
    Object.assign(_three, _defaultThree);
    _previousIsDetected = false;
    WebARRocksHandThreeControls.destroy();
  });
}


window.addEventListener('load', main);